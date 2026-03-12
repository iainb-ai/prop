import pytest
from rent_vs_buy.mortgage import calc_pmt, amortisation_schedule


# PRD §5.2: £1,400,000 @ 3.55% over 21 years → PMT = £7,889.18
PRD_PRINCIPAL = 1_400_000.0
PRD_RATE = 0.0355
PRD_TERM = 252  # 21 * 12


def test_pmt_prd_validation():
    pmt = calc_pmt(PRD_PRINCIPAL, PRD_RATE, PRD_TERM)
    assert round(pmt, 2) == 7_889.18


def test_amortisation_month1_interest():
    schedule = amortisation_schedule(PRD_PRINCIPAL, PRD_RATE, PRD_TERM)
    row = schedule[0]
    expected_interest = PRD_PRINCIPAL * (PRD_RATE / 12)
    assert row["interest"] == pytest.approx(expected_interest, rel=1e-9)


def test_amortisation_month1_principal_repaid():
    schedule = amortisation_schedule(PRD_PRINCIPAL, PRD_RATE, PRD_TERM)
    row = schedule[0]
    assert row["principal_repaid"] == pytest.approx(row["payment"] - row["interest"], rel=1e-9)


def test_amortisation_length():
    schedule = amortisation_schedule(PRD_PRINCIPAL, PRD_RATE, PRD_TERM)
    assert len(schedule) == PRD_TERM


def test_amortisation_balance_reaches_zero():
    schedule = amortisation_schedule(PRD_PRINCIPAL, PRD_RATE, PRD_TERM)
    assert schedule[-1]["closing_balance"] == pytest.approx(0.0, abs=0.01)


def test_interest_only_constant_balance():
    schedule = amortisation_schedule(PRD_PRINCIPAL, PRD_RATE, PRD_TERM, mortgage_type="interest_only")
    # Balance should never reduce
    for row in schedule:
        assert row["closing_balance"] == pytest.approx(PRD_PRINCIPAL, rel=1e-9)


def test_interest_only_payment():
    schedule = amortisation_schedule(PRD_PRINCIPAL, PRD_RATE, PRD_TERM, mortgage_type="interest_only")
    expected_pmt = PRD_PRINCIPAL * (PRD_RATE / 12)
    for row in schedule:
        assert row["payment"] == pytest.approx(expected_pmt, rel=1e-9)
