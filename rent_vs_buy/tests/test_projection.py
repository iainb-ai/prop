import pytest
from rent_vs_buy.config import Config
from rent_vs_buy.projection import run_projection

# PRD default config exactly — produces the §7 validation numbers
PRD_CFG = Config()


def _result():
    return run_projection(PRD_CFG)


def test_sdlt():
    assert _result()["sdlt"] == 213_750.0


def test_total_upfront():
    assert _result()["total_upfront"] == 226_749.0


def test_monthly_pmt():
    assert round(_result()["monthly_pmt"], 2) == 7_889.18


def test_month0_buy_net_worth():
    m0 = _result()["months"][0]
    assert round(m0["buy_net_worth"], 2) == 873_251.0


def test_month0_rent_net_worth():
    m0 = _result()["months"][0]
    assert round(m0["rent_net_worth"], 2) == 1_100_000.0


def test_month1_buy_net_worth():
    m1 = _result()["months"][1]
    assert round(m1["buy_net_worth"], 2) == 881_331.96


def test_month1_rent_net_worth():
    m1 = _result()["months"][1]
    assert round(m1["rent_net_worth"], 2) == 1_111_006.46


def test_month156_buy_net_worth():
    m156 = _result()["months"][156]
    assert round(m156["buy_net_worth"], 2) == 2_727_978.88


def test_month156_rent_net_worth():
    m156 = _result()["months"][156]
    assert round(m156["rent_net_worth"], 2) == 4_024_658.21


def test_break_even_never():
    assert _result()["break_even_month"] is None
