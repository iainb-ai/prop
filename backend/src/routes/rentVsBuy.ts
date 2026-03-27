import { Router, Request, Response } from 'express';
import { RentVsBuyRequest } from '../types';
import { runProjection } from '../services/rentVsBuy';

const router = Router();

router.post('/', (req: Request, res: Response) => {
  const body = req.body as RentVsBuyRequest;

  // Validation
  const errors: string[] = [];

  function requireFinitePositive(val: unknown, name: string) {
    if (!Number.isFinite(val) || (val as number) <= 0) errors.push(`${name} must be a positive number`);
  }
  function requireFiniteNonNeg(val: unknown, name: string) {
    if (!Number.isFinite(val) || (val as number) < 0) errors.push(`${name} must be a non-negative number`);
  }

  requireFinitePositive(body.purchasePrice, 'purchasePrice');
  requireFinitePositive(body.deposit, 'deposit');
  if (Number.isFinite(body.deposit) && Number.isFinite(body.purchasePrice) && body.deposit >= body.purchasePrice)
    errors.push('deposit must be less than purchasePrice');
  requireFinitePositive(body.horizonMonths, 'horizonMonths');
  requireFinitePositive(body.termMonths, 'termMonths');
  if (!Number.isFinite(body.annualRate) || body.annualRate <= 0 || body.annualRate >= 1)
    errors.push('annualRate must be between 0 and 1 exclusive');
  requireFinitePositive(body.monthlyRent, 'monthlyRent');
  requireFiniteNonNeg(body.rentAnnualInflation, 'rentAnnualInflation');
  requireFiniteNonNeg(body.renterMonthlyCosts, 'renterMonthlyCosts');
  requireFiniteNonNeg(body.annualPropertyGrowth, 'annualPropertyGrowth');
  if (!Number.isFinite(body.maintenancePct) || body.maintenancePct < 0 || body.maintenancePct > 0.5)
    errors.push('maintenancePct must be between 0 and 0.5');
  requireFiniteNonNeg(body.councilTaxAnnual, 'councilTaxAnnual');
  requireFiniteNonNeg(body.homeInsuranceAnnual, 'homeInsuranceAnnual');
  requireFiniteNonNeg(body.serviceChargeAnnual, 'serviceChargeAnnual');
  requireFiniteNonNeg(body.runningCostInflation, 'runningCostInflation');
  requireFinitePositive(body.investmentGrossAnnualReturn, 'investmentGrossAnnualReturn');
  requireFiniteNonNeg(body.investmentAnnualFees, 'investmentAnnualFees');
  requireFiniteNonNeg(body.investmentTaxDrag, 'investmentTaxDrag');
  const netReturn = body.investmentGrossAnnualReturn - body.investmentAnnualFees - body.investmentTaxDrag;
  if (Number.isFinite(netReturn) && netReturn <= -1)
    errors.push('net investment return (gross - fees - tax drag) must be > -100%');
  if (!Number.isFinite(body.estateAgentFeePct) || body.estateAgentFeePct < 0 || body.estateAgentFeePct > 0.5)
    errors.push('estateAgentFeePct must be between 0 and 0.5');
  requireFiniteNonNeg(body.legalFeesPurchase, 'legalFeesPurchase');
  requireFiniteNonNeg(body.surveyValuation, 'surveyValuation');
  requireFiniteNonNeg(body.movingMiscCosts, 'movingMiscCosts');
  requireFiniteNonNeg(body.saleLegalFixedCosts, 'saleLegalFixedCosts');
  requireFiniteNonNeg(body.budgetAnnualGrowth, 'budgetAnnualGrowth');
  if (body.overrideBudget) requireFinitePositive(body.manualMonthlyBudget, 'manualMonthlyBudget');

  if (errors.length > 0) {
    res.status(400).json({ error: errors.join('; ') });
    return;
  }

  try {
    const result = runProjection(body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Calculation failed' });
  }
});

export default router;
