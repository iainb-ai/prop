from dataclasses import dataclass, field
from datetime import date


@dataclass
class Config:
    # ── Scenario ──────────────────────────────────────────────────────────────
    property_price: float = 2_500_000.0
    deposit: float = 1_100_000.0
    horizon_years: int = 13
    start_date: date = field(default_factory=lambda: date(2026, 3, 1))
    sell_at_end: bool = True

    # ── Mortgage ──────────────────────────────────────────────────────────────
    mortgage_term_years: int = 21
    mortgage_annual_rate: float = 0.0355
    mortgage_type: str = "repayment"          # "repayment" or "interest_only"
    mortgage_arrangement_fee: float = 999.0

    # ── Rent assumptions ─────────────────────────────────────────────────────
    monthly_rent: float = 6_520.0
    rent_annual_inflation: float = 0.03
    renter_monthly_costs: float = 75.0

    # ── Property / owner running costs ───────────────────────────────────────
    property_annual_appreciation: float = 0.021
    maintenance_pct: float = 0.01
    council_tax_annual: float = 3_000.0
    home_insurance_annual: float = 1_500.0
    service_charge_annual: float = 15_000.0
    running_cost_inflation: float = 0.03

    # ── Investment assumptions ────────────────────────────────────────────────
    investment_gross_annual_return: float = 0.07
    investment_annual_fees: float = 0.0025
    investment_tax_drag: float = 0.0

    # ── Transaction costs ─────────────────────────────────────────────────────
    first_time_buyer: bool = False
    additional_property_surcharge: bool = False
    non_uk_resident_surcharge: bool = False
    legal_fees_purchase: float = 7_500.0
    survey_valuation: float = 1_500.0
    moving_misc_costs: float = 3_000.0
    estate_agent_fee_pct: float = 0.015
    sale_legal_fixed_costs: float = 2_000.0

    # ── Budget / cashflow normalisation ──────────────────────────────────────
    override_budget: bool = False
    manual_monthly_budget: float = 0.0
    budget_annual_growth: float = 0.03

    # ── Derived (read-only helpers) ───────────────────────────────────────────
    @property
    def mortgage_amount(self) -> float:
        return self.property_price - self.deposit

    @property
    def mortgage_term_months(self) -> int:
        return self.mortgage_term_years * 12

    @property
    def horizon_months(self) -> int:
        return self.horizon_years * 12

    @property
    def net_annual_return(self) -> float:
        return self.investment_gross_annual_return - self.investment_annual_fees - self.investment_tax_drag
