"""
Monthly projection engine — core model.

Produces a list of month-by-month rows (index 0 = initial state, 1..N = months).
"""

from __future__ import annotations

from datetime import date
from dateutil.relativedelta import relativedelta

from .config import Config
from .sdlt import calc_sdlt
from .mortgage import calc_pmt, amortisation_schedule


def run_projection(cfg: Config) -> dict:
    """
    Run the full rent-vs-buy projection.

    Returns
    -------
    {
        "sdlt": float,
        "total_upfront": float,
        "monthly_pmt": float,
        "break_even_month": int | None,
        "months": list[dict],   # index 0..horizon_months
    }
    """
    # ── Fixed scalars ─────────────────────────────────────────────────────────
    sdlt = calc_sdlt(
        cfg.property_price,
        first_time_buyer=cfg.first_time_buyer,
        additional_property=cfg.additional_property_surcharge,
        non_uk_resident=cfg.non_uk_resident_surcharge,
    )
    total_upfront = (
        sdlt
        + cfg.legal_fees_purchase
        + cfg.survey_valuation
        + cfg.moving_misc_costs
        + cfg.mortgage_arrangement_fee
    )

    net_monthly_return = (1 + cfg.net_annual_return) ** (1 / 12) - 1

    # ── Mortgage schedule ──────────────────────────────────────────────────────
    schedule = amortisation_schedule(
        principal=cfg.mortgage_amount,
        annual_rate=cfg.mortgage_annual_rate,
        term_months=cfg.mortgage_term_months,
        mortgage_type=cfg.mortgage_type,
    )
    monthly_pmt = schedule[0]["payment"]

    # Extend schedule with zero-payment rows if horizon > term
    while len(schedule) < cfg.horizon_months:
        schedule.append({
            "month": len(schedule) + 1,
            "opening_balance": 0.0,
            "payment": 0.0,
            "interest": 0.0,
            "principal_repaid": 0.0,
            "closing_balance": 0.0,
            "cumulative_interest": schedule[-1]["cumulative_interest"],
        })

    # ── Owner running costs at month 1 (for budget derivation) ───────────────
    fixed_annual_running = (
        cfg.council_tax_annual + cfg.home_insurance_annual + cfg.service_charge_annual
    )
    # Maintenance month 1 is based on property_price (month 0 value)
    maintenance_month1 = cfg.property_price * cfg.maintenance_pct / 12
    fixed_running_month1 = fixed_annual_running / 12  # no inflation yet at month 1
    owner_running_month1 = maintenance_month1 + fixed_running_month1
    total_owner_out_month1 = monthly_pmt + owner_running_month1

    # ── Budget ────────────────────────────────────────────────────────────────
    if cfg.override_budget:
        budget_month1 = cfg.manual_monthly_budget
    else:
        budget_month1 = total_owner_out_month1

    # ── Month 0 (initial state) ───────────────────────────────────────────────
    rows: list[dict] = []
    buy_invest_bal = 0.0
    rent_invest_bal = cfg.deposit  # renter invests the deposit
    property_value_prev = cfg.property_price  # used for maintenance(t) = f(t-1)

    buy_net_worth_0 = cfg.property_price - cfg.mortgage_amount - total_upfront
    rent_net_worth_0 = rent_invest_bal

    rows.append({
        "month": 0,
        "date": cfg.start_date.isoformat(),
        "budget": 0.0,
        "rent": 0.0,
        "renter_costs": 0.0,
        "total_rent_outflow": 0.0,
        "rent_invest_contrib": 0.0,
        "rent_invest_bal": rent_invest_bal,
        "rent_net_worth": rent_net_worth_0,
        "mortgage_pmt": 0.0,
        "owner_running_costs": 0.0,
        "total_owner_outflow": 0.0,
        "buy_invest_contrib": 0.0,
        "buy_invest_bal": buy_invest_bal,
        "property_value": cfg.property_price,
        "mortgage_balance": cfg.mortgage_amount,
        "sale_costs": 0.0,
        "upfront_costs": total_upfront,
        "buy_net_worth": buy_net_worth_0,
        "diff_buy_minus_rent": buy_net_worth_0 - rent_net_worth_0,
        "buy_better": 1 if buy_net_worth_0 > rent_net_worth_0 else 0,
    })

    # ── Months 1..N ───────────────────────────────────────────────────────────
    N = cfg.horizon_months
    break_even_month: int | None = None

    for t in range(1, N + 1):
        month_date = cfg.start_date + relativedelta(months=t)

        # Shared budget
        budget_t = budget_month1 * (1 + cfg.budget_annual_growth) ** ((t - 1) / 12)

        # ── Rent strategy ─────────────────────────────────────────────────────
        rent_t = cfg.monthly_rent * (1 + cfg.rent_annual_inflation) ** ((t - 1) / 12)
        renter_costs_t = cfg.renter_monthly_costs * (1 + cfg.running_cost_inflation) ** ((t - 1) / 12)
        total_rent_out_t = rent_t + renter_costs_t
        rent_invest_contrib_t = budget_t - total_rent_out_t
        rent_invest_bal = rent_invest_bal * (1 + net_monthly_return) + rent_invest_contrib_t
        rent_net_worth_t = rent_invest_bal

        # ── Buy strategy ──────────────────────────────────────────────────────
        sched_row = schedule[t - 1]
        pmt_t = sched_row["payment"]
        mortgage_balance_t = sched_row["closing_balance"]

        maintenance_t = property_value_prev * cfg.maintenance_pct / 12
        fixed_running_t = fixed_annual_running * (1 + cfg.running_cost_inflation) ** ((t - 1) / 12) / 12
        owner_running_costs_t = maintenance_t + fixed_running_t
        total_owner_out_t = pmt_t + owner_running_costs_t

        buy_invest_contrib_t = budget_t - total_owner_out_t
        buy_invest_bal = buy_invest_bal * (1 + net_monthly_return) + buy_invest_contrib_t

        property_value_t = cfg.property_price * (1 + cfg.property_annual_appreciation) ** (t / 12)

        # Sale costs only deducted in final month if sell_at_end
        if t == N and cfg.sell_at_end:
            sale_costs_t = property_value_t * cfg.estate_agent_fee_pct + cfg.sale_legal_fixed_costs
        else:
            sale_costs_t = 0.0

        # For interest-only: on final month with sale, repay full mortgage from proceeds
        # (already captured via mortgage_balance_t staying at full principal)
        buy_net_worth_t = (
            property_value_t
            - mortgage_balance_t
            - sale_costs_t
            - total_upfront
            + buy_invest_bal
        )

        diff_t = buy_net_worth_t - rent_net_worth_t
        buy_better_t = 1 if diff_t > 0 else 0

        if buy_better_t == 1 and break_even_month is None:
            break_even_month = t

        rows.append({
            "month": t,
            "date": month_date.isoformat(),
            "budget": budget_t,
            "rent": rent_t,
            "renter_costs": renter_costs_t,
            "total_rent_outflow": total_rent_out_t,
            "rent_invest_contrib": rent_invest_contrib_t,
            "rent_invest_bal": rent_invest_bal,
            "rent_net_worth": rent_net_worth_t,
            "mortgage_pmt": pmt_t,
            "owner_running_costs": owner_running_costs_t,
            "total_owner_outflow": total_owner_out_t,
            "buy_invest_contrib": buy_invest_contrib_t,
            "buy_invest_bal": buy_invest_bal,
            "property_value": property_value_t,
            "mortgage_balance": mortgage_balance_t,
            "sale_costs": sale_costs_t,
            "upfront_costs": total_upfront,
            "buy_net_worth": buy_net_worth_t,
            "diff_buy_minus_rent": diff_t,
            "buy_better": buy_better_t,
        })

        property_value_prev = property_value_t

    return {
        "sdlt": sdlt,
        "total_upfront": total_upfront,
        "monthly_pmt": monthly_pmt,
        "break_even_month": break_even_month,
        "months": rows,
    }
