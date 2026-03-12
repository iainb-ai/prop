"""
Rent vs Buy CLI entry point.

Usage examples:
  python -m rent_vs_buy.main
  python -m rent_vs_buy.main --property-price 500000 --deposit 100000 --annual-rate 0.045
  python -m rent_vs_buy.main --no-chart --output-csv projection.csv
"""

import argparse
import csv
import sys
from datetime import date

from .config import Config
from .projection import run_projection
from .summary import print_summary


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Rent vs Buy financial model")

    # Scenario
    p.add_argument("--property-price",   type=float, default=None)
    p.add_argument("--deposit",          type=float, default=None)
    p.add_argument("--horizon-years",    type=int,   default=None)
    p.add_argument("--sell-at-end",      action="store_true", default=None)
    p.add_argument("--no-sell-at-end",   dest="sell_at_end", action="store_false")

    # Mortgage
    p.add_argument("--mortgage-type",        choices=["repayment", "interest_only"], default=None)
    p.add_argument("--annual-rate",          type=float, default=None)
    p.add_argument("--mortgage-term-years",  type=int,   default=None)
    p.add_argument("--arrangement-fee",      type=float, default=None)

    # Rent
    p.add_argument("--monthly-rent",       type=float, default=None)
    p.add_argument("--rent-inflation",     type=float, default=None)
    p.add_argument("--renter-costs",       type=float, default=None)

    # Property growth
    p.add_argument("--property-growth",    type=float, default=None,
                   help="Annual property appreciation (decimal, e.g. 0.021 for 2.1%%)")

    # Investment
    p.add_argument("--gross-return",  type=float, default=None)
    p.add_argument("--invest-fees",   type=float, default=None)
    p.add_argument("--tax-drag",      type=float, default=None)

    # Budget
    p.add_argument("--budget-growth", type=float, default=None)

    # Output
    p.add_argument("--no-chart",    action="store_true")
    p.add_argument("--output-csv",  type=str,  default=None)

    return p.parse_args()


def build_config(args: argparse.Namespace) -> Config:
    defaults = Config()
    kwargs = {}
    mapping = {
        "property_price":             args.property_price,
        "deposit":                    args.deposit,
        "horizon_years":              args.horizon_years,
        "sell_at_end":                args.sell_at_end,
        "mortgage_type":              args.mortgage_type,
        "mortgage_annual_rate":       args.annual_rate,
        "mortgage_term_years":        args.mortgage_term_years,
        "mortgage_arrangement_fee":   args.arrangement_fee,
        "monthly_rent":               args.monthly_rent,
        "rent_annual_inflation":      args.rent_inflation,
        "renter_monthly_costs":       args.renter_costs,
        "property_annual_appreciation": args.property_growth,
        "investment_gross_annual_return": args.gross_return,
        "investment_annual_fees":     args.invest_fees,
        "investment_tax_drag":        args.tax_drag,
        "budget_annual_growth":       args.budget_growth,
    }
    for field, val in mapping.items():
        if val is not None:
            kwargs[field] = val
    return Config(**kwargs)


def write_csv(months: list[dict], path: str) -> None:
    if not months:
        return
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=months[0].keys())
        writer.writeheader()
        writer.writerows(months)
    print(f"Projection written to {path}")


def main() -> None:
    args = parse_args()
    cfg = build_config(args)
    result = run_projection(cfg)
    print_summary(result, cfg)

    if args.output_csv:
        write_csv(result["months"], args.output_csv)

    if not args.no_chart:
        try:
            from .chart import plot_net_worth
            plot_net_worth(result["months"], result["break_even_month"])
        except ImportError:
            print("matplotlib not installed — skipping chart", file=sys.stderr)


if __name__ == "__main__":
    main()
