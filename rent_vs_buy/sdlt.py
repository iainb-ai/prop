"""
SDLT (Stamp Duty Land Tax) calculator for England & Northern Ireland.

Bands as per PRD §3.1 (pre-2022 standard residential thresholds):
  £0 – £125,000       @ 0%
  £125,001 – £250,000 @ 2%
  £250,001 – £925,000 @ 5%
  £925,001 – £1.5m    @ 10%
  £1.5m+              @ 12%

Surcharges (flat rate on full purchase price):
  additional_property: +5%
  non_uk_resident:     +2%

FTB relief: zero SDLT only if price <= £500,000; otherwise standard rates apply.
"""

_BANDS = [
    (125_000,   0.00),
    (250_000,   0.02),
    (925_000,   0.05),
    (1_500_000, 0.10),
    (float("inf"), 0.12),
]


def calc_sdlt(
    price: float,
    first_time_buyer: bool = False,
    additional_property: bool = False,
    non_uk_resident: bool = False,
) -> float:
    """Return the SDLT payable on a residential purchase at *price*."""

    # FTB relief: zero SDLT if price <= £500k
    if first_time_buyer and price <= 500_000:
        standard = 0.0
    else:
        standard = _calc_standard(price)

    surcharge = 0.0
    if additional_property:
        surcharge += 0.05 * price
    if non_uk_resident:
        surcharge += 0.02 * price

    return standard + surcharge


def _calc_standard(price: float) -> float:
    tax = 0.0
    prev_threshold = 0.0
    for threshold, rate in _BANDS:
        band_top = min(price, threshold)
        if band_top <= prev_threshold:
            break
        tax += (band_top - prev_threshold) * rate
        prev_threshold = threshold
        if price <= threshold:
            break
    return tax
