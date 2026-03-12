"""
Formats and prints the Rent vs Buy summary dashboard.
"""

from .config import Config


def print_summary(result: dict, cfg: Config) -> None:
    months = result["months"]
    m0 = months[0]
    m1 = months[1]
    final = months[cfg.horizon_months]

    bep = result["break_even_month"]
    break_even_str = f"Month {bep}" if bep is not None else "Never"

    winner = "Buy" if final["buy_net_worth"] > final["rent_net_worth"] else "Rent + Invest"
    diff = final["buy_net_worth"] - final["rent_net_worth"]

    print("=" * 60)
    print("Rent vs. Buy Model — Summary")
    print(f"Horizon: {cfg.horizon_years} years ({cfg.horizon_months} months)")
    print()
    print("Net worth at end of horizon:")
    print(f"  Buy strategy:      £{final['buy_net_worth']:>14,.2f}")
    print(f"  Rent + Invest:     £{final['rent_net_worth']:>14,.2f}")
    print(f"  Difference (B–R):  £{diff:>14,.2f}")
    print()
    print(f"Break-even: {break_even_str}")
    print()
    print("Key assumptions:")
    print(f"  Property price:    £{cfg.property_price:>14,.0f}")
    print(f"  Deposit:           £{cfg.deposit:>14,.0f}")
    print(f"  Mortgage:          £{cfg.mortgage_amount:>14,.0f} @ {cfg.mortgage_annual_rate*100:.2f}% "
          f"over {cfg.mortgage_term_years} years ({cfg.mortgage_type})")
    print(f"  Rent (month 1):    £{cfg.monthly_rent:>14,.0f}/month "
          f"({cfg.rent_annual_inflation*100:.1f}% annual inflation)")
    print(f"  Investment return: {cfg.net_annual_return*100:.2f}% net annual")
    print(f"  SDLT:              £{result['sdlt']:>14,.0f}")
    print(f"  Total up-front:    £{result['total_upfront']:>14,.0f}")
    print(f"  Monthly PMT:       £{result['monthly_pmt']:>14,.2f}")
    print()
    print(f"Month 0  — Buy NW: £{m0['buy_net_worth']:>14,.2f}  |  Rent NW: £{m0['rent_net_worth']:>14,.2f}")
    print(f"Month 1  — Buy NW: £{m1['buy_net_worth']:>14,.2f}  |  Rent NW: £{m1['rent_net_worth']:>14,.2f}")
    print(f"Month {cfg.horizon_months:<3} — Buy NW: £{final['buy_net_worth']:>14,.2f}  |  Rent NW: £{final['rent_net_worth']:>14,.2f}")
    print()
    print(f"Verdict: {winner} wins by £{abs(diff):,.2f}")
    print("=" * 60)
