"""
Mortgage payment calculator and amortisation schedule generator.
"""

from __future__ import annotations


def calc_pmt(principal: float, annual_rate: float, term_months: int) -> float:
    """Monthly repayment payment using the standard PMT formula."""
    r = annual_rate / 12
    return principal * r / (1 - (1 + r) ** -term_months)


def amortisation_schedule(
    principal: float,
    annual_rate: float,
    term_months: int,
    mortgage_type: str = "repayment",
) -> list[dict]:
    """
    Return a list of dicts, one per month (1-indexed), with keys:
        month, opening_balance, payment, interest, principal_repaid,
        closing_balance, cumulative_interest
    """
    r = annual_rate / 12

    if mortgage_type == "repayment":
        pmt = calc_pmt(principal, annual_rate, term_months)
    else:  # interest_only
        pmt = principal * r

    rows: list[dict] = []
    balance = principal
    cum_interest = 0.0

    for m in range(1, term_months + 1):
        opening = balance
        interest = opening * r
        if mortgage_type == "repayment":
            principal_repaid = pmt - interest
        else:
            principal_repaid = 0.0
        closing = opening - principal_repaid
        # Guard against floating-point drift below zero on final payment
        if closing < 1e-6:
            closing = 0.0
        cum_interest += interest
        rows.append({
            "month": m,
            "opening_balance": opening,
            "payment": pmt,
            "interest": interest,
            "principal_repaid": principal_repaid,
            "closing_balance": closing,
            "cumulative_interest": cum_interest,
        })
        balance = closing

    return rows
