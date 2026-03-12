import pytest
from rent_vs_buy.sdlt import calc_sdlt


def test_sdlt_prd_validation():
    """PRD §7: SDLT on £2,500,000 (standard, no surcharges) = £213,750."""
    assert calc_sdlt(2_500_000) == 213_750.0


def test_sdlt_below_first_band():
    assert calc_sdlt(125_000) == 0.0


def test_sdlt_second_band():
    # £200k: 125k@0% + 75k@2% = £1,500
    assert calc_sdlt(200_000) == 1_500.0


def test_sdlt_ftb_under_500k():
    # FTB relief: zero SDLT if price <= £500k
    assert calc_sdlt(400_000, first_time_buyer=True) == 0.0


def test_sdlt_ftb_over_500k_standard_rates():
    # FTB with price > £500k → standard rates apply
    result = calc_sdlt(600_000, first_time_buyer=True)
    expected = calc_sdlt(600_000, first_time_buyer=False)
    assert result == expected


def test_sdlt_additional_surcharge():
    base = calc_sdlt(2_500_000)
    with_surcharge = calc_sdlt(2_500_000, additional_property=True)
    assert with_surcharge == pytest.approx(base + 0.05 * 2_500_000)


def test_sdlt_non_uk_surcharge():
    base = calc_sdlt(2_500_000)
    with_surcharge = calc_sdlt(2_500_000, non_uk_resident=True)
    assert with_surcharge == pytest.approx(base + 0.02 * 2_500_000)


def test_sdlt_all_surcharges():
    base = calc_sdlt(2_500_000)
    result = calc_sdlt(2_500_000, additional_property=True, non_uk_resident=True)
    assert result == pytest.approx(base + 0.07 * 2_500_000)
