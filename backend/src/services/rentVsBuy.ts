/**
 * Rent vs Buy calculation service — TypeScript port of the Python rent_vs_buy module.
 * Pure functions, no Express dependencies.
 */

import { RentVsBuyRequest, RentVsBuyMonthRow, RentVsBuyResponse } from '../types';

// ─── SDLT ─────────────────────────────────────────────────────────────────────

const SDLT_BANDS: Array<[number, number]> = [
  [125_000,        0.00],
  [250_000,        0.02],
  [925_000,        0.05],
  [1_500_000,      0.10],
  [Infinity,       0.12],
];

export function calcSdlt(
  price: number,
  firstTimeBuyer: boolean,
  additionalProperty: boolean,
  nonUkResident: boolean,
): number {
  let standard: number;
  if (firstTimeBuyer && price <= 500_000) {
    standard = 0;
  } else {
    standard = calcStandardSdlt(price);
  }
  let surcharge = 0;
  if (additionalProperty) surcharge += 0.05 * price;
  if (nonUkResident)      surcharge += 0.02 * price;
  return standard + surcharge;
}

function calcStandardSdlt(price: number): number {
  let tax = 0;
  let prevThreshold = 0;
  for (const [threshold, rate] of SDLT_BANDS) {
    const bandTop = Math.min(price, threshold);
    if (bandTop <= prevThreshold) break;
    tax += (bandTop - prevThreshold) * rate;
    prevThreshold = threshold;
    if (price <= threshold) break;
  }
  return tax;
}

// ─── Mortgage ─────────────────────────────────────────────────────────────────

export function calcPmt(principal: number, annualRate: number, termMonths: number): number {
  const r = annualRate / 12;
  return principal * r / (1 - Math.pow(1 + r, -termMonths));
}

interface MortgageRow {
  closingBalance: number;
  payment: number;
}

function buildAmortisationSchedule(
  principal: number,
  annualRate: number,
  termMonths: number,
  mortgageType: 'repayment' | 'interest_only',
): MortgageRow[] {
  const r = annualRate / 12;
  const pmt = mortgageType === 'repayment'
    ? calcPmt(principal, annualRate, termMonths)
    : principal * r;

  const rows: MortgageRow[] = [];
  let balance = principal;

  for (let m = 0; m < termMonths; m++) {
    const interest = balance * r;
    const principalRepaid = mortgageType === 'repayment' ? pmt - interest : 0;
    let closing = balance - principalRepaid;
    if (closing < 1e-6) closing = 0;
    rows.push({ closingBalance: closing, payment: pmt });
    balance = closing;
  }
  return rows;
}

// ─── Projection ───────────────────────────────────────────────────────────────

export function runProjection(req: RentVsBuyRequest): RentVsBuyResponse {
  const sdlt = calcSdlt(
    req.purchasePrice,
    req.firstTimeBuyer,
    req.additionalPropertySurcharge,
    req.nonUkResidentSurcharge,
  );

  const totalUpfront =
    sdlt +
    req.legalFeesPurchase +
    req.surveyValuation +
    req.movingMiscCosts +
    req.mortgageArrangementFee;

  const netAnnualReturn =
    req.investmentGrossAnnualReturn - req.investmentAnnualFees - req.investmentTaxDrag;
  const netMonthlyReturn = Math.pow(1 + netAnnualReturn, 1 / 12) - 1;

  const mortgageAmount = req.purchasePrice - req.deposit;

  // Build amortisation schedule, extend to horizon if needed
  const schedule = buildAmortisationSchedule(
    mortgageAmount,
    req.annualRate,
    req.termMonths,
    req.mortgageType,
  );
  while (schedule.length < req.horizonMonths) {
    schedule.push({ closingBalance: 0, payment: 0 });
  }

  const monthlyPmt = schedule[0]?.payment ?? 0;

  // Owner running costs at month 1 (for budget derivation)
  const fixedAnnualRunning = req.councilTaxAnnual + req.homeInsuranceAnnual + req.serviceChargeAnnual;
  const maintenanceMonth1 = req.purchasePrice * req.maintenancePct / 12;
  const fixedRunningMonth1 = fixedAnnualRunning / 12;
  const ownerRunningMonth1 = maintenanceMonth1 + fixedRunningMonth1;
  const totalOwnerOutMonth1 = monthlyPmt + ownerRunningMonth1;

  const budgetMonth1 = req.overrideBudget ? req.manualMonthlyBudget : totalOwnerOutMonth1;

  // Month 0
  let buyInvestBal = 0;
  let rentInvestBal = req.deposit;
  let propertyValuePrev = req.purchasePrice;

  const buyNetWorth0 = req.purchasePrice - mortgageAmount - totalUpfront;
  const rentNetWorth0 = rentInvestBal;

  const startDate = new Date();  // Month 0 = today
  const months: RentVsBuyMonthRow[] = [];

  months.push({
    month: 0,
    date: isoMonth(startDate, 0),
    budget: 0,
    rent: 0,
    renterCosts: 0,
    totalRentOutflow: 0,
    rentInvestContrib: 0,
    rentInvestBal,
    rentNetWorth: rentNetWorth0,
    mortgagePmt: 0,
    ownerRunningCosts: 0,
    totalOwnerOutflow: 0,
    buyInvestContrib: 0,
    buyInvestBal,
    propertyValue: req.purchasePrice,
    mortgageBalance: mortgageAmount,
    saleCosts: 0,
    upfrontCosts: totalUpfront,
    buyNetWorth: buyNetWorth0,
    diffBuyMinusRent: buyNetWorth0 - rentNetWorth0,
    buyBetter: buyNetWorth0 > rentNetWorth0 ? 1 : 0,
  });

  let breakEvenMonth: number | null = null;

  for (let t = 1; t <= req.horizonMonths; t++) {
    const budgetT = budgetMonth1 * Math.pow(1 + req.budgetAnnualGrowth, (t - 1) / 12);

    // Rent strategy
    const rentT = req.monthlyRent * Math.pow(1 + req.rentAnnualInflation, (t - 1) / 12);
    const renterCostsT = req.renterMonthlyCosts * Math.pow(1 + req.runningCostInflation, (t - 1) / 12);
    const totalRentOutT = rentT + renterCostsT;
    const rentInvestContribT = budgetT - totalRentOutT;
    rentInvestBal = rentInvestBal * (1 + netMonthlyReturn) + rentInvestContribT;
    const rentNetWorthT = rentInvestBal;

    // Buy strategy
    const schedRow = schedule[t - 1];
    const pmtT = schedRow.payment;
    const mortgageBalanceT = schedRow.closingBalance;

    const maintenanceT = propertyValuePrev * req.maintenancePct / 12;
    const fixedRunningT = fixedAnnualRunning * Math.pow(1 + req.runningCostInflation, (t - 1) / 12) / 12;
    const ownerRunningCostsT = maintenanceT + fixedRunningT;
    const totalOwnerOutT = pmtT + ownerRunningCostsT;

    const buyInvestContribT = budgetT - totalOwnerOutT;
    buyInvestBal = buyInvestBal * (1 + netMonthlyReturn) + buyInvestContribT;

    const propertyValueT = req.purchasePrice * Math.pow(1 + req.annualPropertyGrowth, t / 12);

    const saleCostsT =
      t === req.horizonMonths && req.sellAtEnd
        ? propertyValueT * req.estateAgentFeePct + req.saleLegalFixedCosts
        : 0;

    const buyNetWorthT = propertyValueT - mortgageBalanceT - saleCostsT - totalUpfront + buyInvestBal;
    const diffT = buyNetWorthT - rentNetWorthT;
    const buyBetterT: 0 | 1 = diffT > 0 ? 1 : 0;

    if (buyBetterT === 1 && breakEvenMonth === null) breakEvenMonth = t;

    months.push({
      month: t,
      date: isoMonth(startDate, t),
      budget: budgetT,
      rent: rentT,
      renterCosts: renterCostsT,
      totalRentOutflow: totalRentOutT,
      rentInvestContrib: rentInvestContribT,
      rentInvestBal,
      rentNetWorth: rentNetWorthT,
      mortgagePmt: pmtT,
      ownerRunningCosts: ownerRunningCostsT,
      totalOwnerOutflow: totalOwnerOutT,
      buyInvestContrib: buyInvestContribT,
      buyInvestBal,
      propertyValue: propertyValueT,
      mortgageBalance: mortgageBalanceT,
      saleCosts: saleCostsT,
      upfrontCosts: totalUpfront,
      buyNetWorth: buyNetWorthT,
      diffBuyMinusRent: diffT,
      buyBetter: buyBetterT,
    });

    propertyValuePrev = propertyValueT;
  }

  const finalRow = months[months.length - 1];

  return {
    sdlt,
    totalUpfront,
    monthlyPmt,
    breakEvenMonth,
    finalBuyNetWorth: finalRow.buyNetWorth,
    finalRentNetWorth: finalRow.rentNetWorth,
    months,
  };
}

function isoMonth(base: Date, offsetMonths: number): string {
  const d = new Date(base.getFullYear(), base.getMonth() + offsetMonths, 1);
  return d.toISOString().slice(0, 10);
}
