import { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import { RentVsBuyRequest, RentVsBuyResponse, RentVsBuyMonthRow } from '../types';
import { formatGBP } from '../utils/format';

interface Props {
  initialPropertyGrowth: number | null;
  onClose: () => void;
}

// ─── Collapsible section ──────────────────────────────────────────────────────

function Section({
  id, title, open, onToggle, children,
}: {
  id: string; title: string; open: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-700 transition-colors"
      >
        {title}
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-4 py-4 grid grid-cols-2 gap-x-6 gap-y-3">{children}</div>}
    </div>
  );
}

// ─── Field helpers ────────────────────────────────────────────────────────────

function Field({
  label, value, onChange, type = 'text', hint,
}: {
  label: string; value: string;
  onChange: (v: string) => void;
  type?: string; hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-lr-green focus:ring-1 focus:ring-lr-green"
      />
      {hint && <span className="text-xs text-gray-400">{hint}</span>}
    </label>
  );
}

function CheckField({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer col-span-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="rounded border-gray-300 text-lr-green focus:ring-lr-green"
      />
      {label}
    </label>
  );
}

// ─── Stat box ─────────────────────────────────────────────────────────────────

function StatBox({ label, value, sub, positive }: {
  label: string; value: string; sub?: string; positive?: boolean;
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${
        positive === undefined ? 'text-gray-900'
        : positive ? 'text-green-700' : 'text-red-600'
      }`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Projection table ─────────────────────────────────────────────────────────

const PAGE_SIZE = 24;

function ProjectionTable({ months }: { months: RentVsBuyMonthRow[] }) {
  const [page, setPage] = useState(0);
  const total = months.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const slice = months.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">
          Showing months {page * PAGE_SIZE}–{Math.min((page + 1) * PAGE_SIZE - 1, total - 1)} of {total - 1}
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
          >Prev</button>
          <span className="px-2 py-1 text-xs text-gray-500">{page + 1}/{totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-2 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
          >Next</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[900px]">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-200">
              <th className="pb-2 font-medium">Mo.</th>
              <th className="pb-2 font-medium">Date</th>
              <th className="pb-2 font-medium text-right">Budget</th>
              <th className="pb-2 font-medium text-right">Rent</th>
              <th className="pb-2 font-medium text-right">Buy Costs</th>
              <th className="pb-2 font-medium text-right">Buy Invest</th>
              <th className="pb-2 font-medium text-right">Rent Invest</th>
              <th className="pb-2 font-medium text-right">Buy NW</th>
              <th className="pb-2 font-medium text-right">Rent NW</th>
              <th className="pb-2 font-medium text-right">Diff</th>
            </tr>
          </thead>
          <tbody>
            {slice.map(row => (
              <tr
                key={row.month}
                className={`border-t border-gray-50 hover:bg-gray-50 ${
                  row.buyBetter ? 'bg-green-50/30' : ''
                }`}
              >
                <td className="py-1.5 text-gray-500">{row.month}</td>
                <td className="py-1.5 text-gray-500">{row.date.slice(0, 7)}</td>
                <td className="py-1.5 text-right">{row.budget > 0 ? formatGBP(row.budget) : '—'}</td>
                <td className="py-1.5 text-right">{row.rent > 0 ? formatGBP(row.rent) : '—'}</td>
                <td className="py-1.5 text-right">{row.totalOwnerOutflow > 0 ? formatGBP(row.totalOwnerOutflow) : '—'}</td>
                <td className="py-1.5 text-right">{formatGBP(row.buyInvestBal)}</td>
                <td className="py-1.5 text-right">{formatGBP(row.rentInvestBal)}</td>
                <td className={`py-1.5 text-right font-medium ${row.buyBetter ? 'text-green-700' : ''}`}>
                  {formatGBP(row.buyNetWorth)}
                </td>
                <td className={`py-1.5 text-right font-medium ${!row.buyBetter && row.month > 0 ? 'text-green-700' : ''}`}>
                  {formatGBP(row.rentNetWorth)}
                </td>
                <td className={`py-1.5 text-right ${row.diffBuyMinusRent > 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {row.diffBuyMinusRent >= 0 ? '+' : ''}{formatGBP(row.diffBuyMinusRent)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const DEFAULTS = {
  purchasePrice: '2500000',
  deposit: '1100000',
  horizonYears: '13',
  mortgageType: 'repayment',
  annualRate: '3.55',
  termYears: '21',
  mortgageArrangementFee: '999',
  monthlyRent: '6520',
  rentAnnualInflation: '3',
  renterMonthlyCosts: '75',
  annualPropertyGrowth: '2.1',
  maintenancePct: '1',
  councilTaxAnnual: '3000',
  homeInsuranceAnnual: '1500',
  serviceChargeAnnual: '15000',
  runningCostInflation: '3',
  investmentGrossAnnualReturn: '7',
  investmentAnnualFees: '0.25',
  investmentTaxDrag: '0',
  legalFeesPurchase: '7500',
  surveyValuation: '1500',
  movingMiscCosts: '3000',
  estateAgentFeePct: '1.5',
  saleLegalFixedCosts: '2000',
  budgetAnnualGrowth: '3',
  manualMonthlyBudget: '0',
};

export default function RentVsBuyPage({ initialPropertyGrowth, onClose }: Props) {
  // ── Form state ──────────────────────────────────────────────────────────────
  const [purchasePrice, setPurchasePrice]   = useState(DEFAULTS.purchasePrice);
  const [deposit, setDeposit]               = useState(DEFAULTS.deposit);
  const [horizonYears, setHorizonYears]     = useState(DEFAULTS.horizonYears);
  const [sellAtEnd, setSellAtEnd]           = useState(true);

  const [mortgageType, setMortgageType]     = useState<'repayment' | 'interest_only'>('repayment');
  const [annualRate, setAnnualRate]         = useState(DEFAULTS.annualRate);
  const [termYears, setTermYears]           = useState(DEFAULTS.termYears);
  const [arrangementFee, setArrangementFee] = useState(DEFAULTS.mortgageArrangementFee);

  const [monthlyRent, setMonthlyRent]             = useState(DEFAULTS.monthlyRent);
  const [rentInflation, setRentInflation]         = useState(DEFAULTS.rentAnnualInflation);
  const [renterCosts, setRenterCosts]             = useState(DEFAULTS.renterMonthlyCosts);

  const [propGrowth, setPropGrowth]               = useState(DEFAULTS.annualPropertyGrowth);
  const [maintenancePct, setMaintenancePct]       = useState(DEFAULTS.maintenancePct);
  const [councilTax, setCouncilTax]               = useState(DEFAULTS.councilTaxAnnual);
  const [homeInsurance, setHomeInsurance]         = useState(DEFAULTS.homeInsuranceAnnual);
  const [serviceCharge, setServiceCharge]         = useState(DEFAULTS.serviceChargeAnnual);
  const [runningInflation, setRunningInflation]   = useState(DEFAULTS.runningCostInflation);

  const [grossReturn, setGrossReturn]             = useState(DEFAULTS.investmentGrossAnnualReturn);
  const [investFees, setInvestFees]               = useState(DEFAULTS.investmentAnnualFees);
  const [taxDrag, setTaxDrag]                     = useState(DEFAULTS.investmentTaxDrag);

  const [ftb, setFtb]                     = useState(false);
  const [additional, setAdditional]       = useState(false);
  const [nonUk, setNonUk]                 = useState(false);
  const [legalFees, setLegalFees]         = useState(DEFAULTS.legalFeesPurchase);
  const [survey, setSurvey]               = useState(DEFAULTS.surveyValuation);
  const [moving, setMoving]               = useState(DEFAULTS.movingMiscCosts);
  const [agentFee, setAgentFee]           = useState(DEFAULTS.estateAgentFeePct);
  const [saleLegal, setSaleLegal]         = useState(DEFAULTS.saleLegalFixedCosts);

  const [overrideBudget, setOverrideBudget]     = useState(false);
  const [manualBudget, setManualBudget]         = useState(DEFAULTS.manualMonthlyBudget);
  const [budgetGrowth, setBudgetGrowth]         = useState(DEFAULTS.budgetAnnualGrowth);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(['scenario', 'mortgage']),
  );
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [result, setResult]     = useState<RentVsBuyResponse | null>(null);
  const [cagrNotice, setCagrNotice] = useState<string | null>(null);

  // ── Pre-fill from CAGR ──────────────────────────────────────────────────────
  useEffect(() => {
    if (initialPropertyGrowth !== null) {
      const pct = (initialPropertyGrowth * 100).toFixed(2);
      setPropGrowth(pct);
      setCagrNotice(`Property growth pre-filled from CAGR: ${pct}%`);
      setOpenSections(s => new Set([...s, 'propertyCosts']));
    }
  }, [initialPropertyGrowth]);

  const toggleSection = useCallback((id: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const body: RentVsBuyRequest = {
      purchasePrice:             parseFloat(purchasePrice),
      deposit:                   parseFloat(deposit),
      horizonMonths:             parseInt(horizonYears) * 12,
      sellAtEnd,
      mortgageType,
      annualRate:                parseFloat(annualRate) / 100,
      termMonths:                parseInt(termYears) * 12,
      mortgageArrangementFee:    parseFloat(arrangementFee),
      monthlyRent:               parseFloat(monthlyRent),
      rentAnnualInflation:       parseFloat(rentInflation) / 100,
      renterMonthlyCosts:        parseFloat(renterCosts),
      annualPropertyGrowth:      parseFloat(propGrowth) / 100,
      maintenancePct:            parseFloat(maintenancePct) / 100,
      councilTaxAnnual:          parseFloat(councilTax),
      homeInsuranceAnnual:       parseFloat(homeInsurance),
      serviceChargeAnnual:       parseFloat(serviceCharge),
      runningCostInflation:      parseFloat(runningInflation) / 100,
      investmentGrossAnnualReturn: parseFloat(grossReturn) / 100,
      investmentAnnualFees:      parseFloat(investFees) / 100,
      investmentTaxDrag:         parseFloat(taxDrag) / 100,
      firstTimeBuyer:            ftb,
      additionalPropertySurcharge: additional,
      nonUkResidentSurcharge:    nonUk,
      legalFeesPurchase:         parseFloat(legalFees),
      surveyValuation:           parseFloat(survey),
      movingMiscCosts:           parseFloat(moving),
      estateAgentFeePct:         parseFloat(agentFee) / 100,
      saleLegalFixedCosts:       parseFloat(saleLegal),
      overrideBudget,
      manualMonthlyBudget:       parseFloat(manualBudget),
      budgetAnnualGrowth:        parseFloat(budgetGrowth) / 100,
    };

    try {
      const res = await fetch('/api/rent-vs-buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data: RentVsBuyResponse = await res.json();
      setResult(data);
      // Scroll to results
      setTimeout(() => {
        document.getElementById('rvb-results')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Calculation failed');
    } finally {
      setLoading(false);
    }
  }

  // ── Chart data ───────────────────────────────────────────────────────────────
  const chartData = result
    ? result.months.map(r => ({
        month: r.month,
        'Buy strategy': Math.round(r.buyNetWorth),
        'Rent + Invest': Math.round(r.rentNetWorth),
      }))
    : [];

  const horizonMonths = parseInt(horizonYears) * 12;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          ← Back
        </button>
        <h2 className="text-xl font-semibold text-gray-900">Rent vs Buy Calculator</h2>
      </div>

      {/* CAGR notice */}
      {cagrNotice && (
        <div className="flex items-center gap-2 bg-lr-green/10 border border-lr-green/30 rounded-lg px-4 py-2.5 text-sm text-gray-700">
          <span className="text-lr-green font-medium">✓</span>
          {cagrNotice}
          <button
            onClick={() => setCagrNotice(null)}
            className="ml-auto text-gray-400 hover:text-gray-600 text-xs"
          >✕</button>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <Section id="scenario" title="Scenario" open={openSections.has('scenario')} onToggle={toggleSection}>
          <Field label="Purchase price (£)" value={purchasePrice} onChange={setPurchasePrice} type="number" />
          <Field label="Deposit (£)" value={deposit} onChange={setDeposit} type="number" />
          <Field label="Horizon (years)" value={horizonYears} onChange={setHorizonYears} type="number" />
          <CheckField label="Sell at end of horizon" checked={sellAtEnd} onChange={setSellAtEnd} />
        </Section>

        <Section id="mortgage" title="Mortgage" open={openSections.has('mortgage')} onToggle={toggleSection}>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Mortgage type</span>
            <select
              value={mortgageType}
              onChange={e => setMortgageType(e.target.value as 'repayment' | 'interest_only')}
              className="border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-lr-green"
            >
              <option value="repayment">Repayment</option>
              <option value="interest_only">Interest only</option>
            </select>
          </label>
          <Field label="Annual rate (%)" value={annualRate} onChange={setAnnualRate} type="number" hint="e.g. 3.55 for 3.55%" />
          <Field label="Term (years)" value={termYears} onChange={setTermYears} type="number" />
          <Field label="Arrangement fee (£)" value={arrangementFee} onChange={setArrangementFee} type="number" />
        </Section>

        <Section id="rent" title="Rent" open={openSections.has('rent')} onToggle={toggleSection}>
          <Field label="Monthly rent — month 1 (£)" value={monthlyRent} onChange={setMonthlyRent} type="number" />
          <Field label="Annual rent inflation (%)" value={rentInflation} onChange={setRentInflation} type="number" hint="e.g. 3" />
          <Field label="Renter monthly costs (£)" value={renterCosts} onChange={setRenterCosts} type="number" hint="Insurance, misc" />
        </Section>

        <Section id="propertyCosts" title="Property costs" open={openSections.has('propertyCosts')} onToggle={toggleSection}>
          <Field label="Annual property growth (%)" value={propGrowth} onChange={setPropGrowth} type="number" hint="From Market Trends CAGR" />
          <Field label="Maintenance (% of value p.a.)" value={maintenancePct} onChange={setMaintenancePct} type="number" hint="e.g. 1" />
          <Field label="Council tax p.a. (£)" value={councilTax} onChange={setCouncilTax} type="number" />
          <Field label="Home insurance p.a. (£)" value={homeInsurance} onChange={setHomeInsurance} type="number" />
          <Field label="Service charge p.a. (£)" value={serviceCharge} onChange={setServiceCharge} type="number" />
          <Field label="Running cost inflation (%)" value={runningInflation} onChange={setRunningInflation} type="number" hint="e.g. 3" />
        </Section>

        <Section id="investment" title="Investment" open={openSections.has('investment')} onToggle={toggleSection}>
          <Field label="Gross annual return (%)" value={grossReturn} onChange={setGrossReturn} type="number" hint="e.g. 7" />
          <Field label="Annual fees (%)" value={investFees} onChange={setInvestFees} type="number" hint="e.g. 0.25" />
          <Field label="Tax drag (%)" value={taxDrag} onChange={setTaxDrag} type="number" hint="0 for ISA-sheltered" />
        </Section>

        <Section id="transactionCosts" title="Transaction costs" open={openSections.has('transactionCosts')} onToggle={toggleSection}>
          <Field label="Legal fees — purchase (£)" value={legalFees} onChange={setLegalFees} type="number" />
          <Field label="Survey / valuation (£)" value={survey} onChange={setSurvey} type="number" />
          <Field label="Moving / misc (£)" value={moving} onChange={setMoving} type="number" />
          <Field label="Estate agent fee (%)" value={agentFee} onChange={setAgentFee} type="number" hint="e.g. 1.5" />
          <Field label="Sale legal / fixed costs (£)" value={saleLegal} onChange={setSaleLegal} type="number" />
          <CheckField label="First-time buyer" checked={ftb} onChange={setFtb} />
          <CheckField label="Additional property surcharge" checked={additional} onChange={setAdditional} />
          <CheckField label="Non-UK resident surcharge" checked={nonUk} onChange={setNonUk} />
        </Section>

        <Section id="budget" title="Budget" open={openSections.has('budget')} onToggle={toggleSection}>
          <CheckField label="Override budget (manual)" checked={overrideBudget} onChange={setOverrideBudget} />
          {overrideBudget && (
            <Field label="Manual monthly budget (£)" value={manualBudget} onChange={setManualBudget} type="number" />
          )}
          <Field label="Budget annual growth (%)" value={budgetGrowth} onChange={setBudgetGrowth} type="number" hint="e.g. 3" />
        </Section>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-lr-green text-white font-medium py-3 rounded-lg hover:bg-lr-green/90 disabled:opacity-60 transition-colors"
        >
          {loading ? 'Calculating…' : 'Calculate'}
        </button>
      </form>

      {/* Results */}
      {result && (
        <div id="rvb-results" className="space-y-6">
          <hr className="border-gray-200" />
          <h3 className="font-semibold text-gray-900 text-lg">Results</h3>

          {/* Summary stat boxes */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatBox label="SDLT" value={formatGBP(result.sdlt)} />
            <StatBox label="Total upfront" value={formatGBP(result.totalUpfront)} />
            <StatBox label="Monthly payment" value={formatGBP(result.monthlyPmt, 2)} sub="Mortgage PMT" />
            <StatBox
              label="Break-even"
              value={result.breakEvenMonth !== null ? `Month ${result.breakEvenMonth}` : 'Never'}
              positive={result.breakEvenMonth !== null && result.breakEvenMonth <= horizonMonths}
            />
          </div>

          {/* Net worth comparison */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className={`rounded-lg p-5 border-2 ${
              result.finalBuyNetWorth > result.finalRentNetWorth
                ? 'border-green-400 bg-green-50'
                : 'border-gray-200 bg-gray-50'
            }`}>
              <div className="text-sm text-gray-500 mb-1">Buy strategy — net worth at year {horizonYears}</div>
              <div className={`text-2xl font-bold ${
                result.finalBuyNetWorth > result.finalRentNetWorth ? 'text-green-700' : 'text-gray-800'
              }`}>
                {formatGBP(result.finalBuyNetWorth)}
              </div>
              {result.finalBuyNetWorth > result.finalRentNetWorth && (
                <div className="text-xs text-green-600 mt-1 font-medium">WINNER</div>
              )}
            </div>
            <div className={`rounded-lg p-5 border-2 ${
              result.finalRentNetWorth > result.finalBuyNetWorth
                ? 'border-green-400 bg-green-50'
                : 'border-gray-200 bg-gray-50'
            }`}>
              <div className="text-sm text-gray-500 mb-1">Rent + Invest — net worth at year {horizonYears}</div>
              <div className={`text-2xl font-bold ${
                result.finalRentNetWorth > result.finalBuyNetWorth ? 'text-green-700' : 'text-gray-800'
              }`}>
                {formatGBP(result.finalRentNetWorth)}
              </div>
              {result.finalRentNetWorth > result.finalBuyNetWorth && (
                <div className="text-xs text-green-600 mt-1 font-medium">WINNER</div>
              )}
            </div>
          </div>

          <div className="text-sm text-gray-600 text-center">
            Difference (Buy − Rent): <span className={`font-semibold ${
              result.finalBuyNetWorth - result.finalRentNetWorth >= 0 ? 'text-green-700' : 'text-red-600'
            }`}>
              {result.finalBuyNetWorth - result.finalRentNetWorth >= 0 ? '+' : ''}
              {formatGBP(result.finalBuyNetWorth - result.finalRentNetWorth)}
            </span>
          </div>

          {/* Chart */}
          <div className="card">
            <h4 className="font-medium text-gray-800 mb-4 text-sm">Net Worth Over Time</h4>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11 }}
                  label={{ value: 'Month', position: 'insideBottom', offset: -4, fontSize: 11 }}
                />
                <YAxis
                  tickFormatter={v => `£${Math.round(v / 1000)}k`}
                  tick={{ fontSize: 11 }}
                  width={64}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [formatGBP(value), name]}
                  labelFormatter={m => `Month ${m}`}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {result.breakEvenMonth !== null && (
                  <ReferenceLine
                    x={result.breakEvenMonth}
                    stroke="#dc2626"
                    strokeDasharray="4 2"
                    label={{ value: `Break-even`, position: 'top', fontSize: 10, fill: '#dc2626' }}
                  />
                )}
                <Line type="monotone" dataKey="Buy strategy"  stroke="#2563eb" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                <Line type="monotone" dataKey="Rent + Invest" stroke="#006e39" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Monthly projection table */}
          <div className="card space-y-3">
            <h4 className="font-medium text-gray-800 text-sm">Monthly Projection</h4>
            <ProjectionTable months={result.months} />
          </div>
        </div>
      )}
    </div>
  );
}
