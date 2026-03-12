"""
Optional matplotlib chart: buy_net_worth vs rent_net_worth over the projection.
"""

from __future__ import annotations


def plot_net_worth(
    months: list[dict],
    break_even_month: int | None = None,
    output_path: str | None = None,
) -> None:
    import matplotlib.pyplot as plt

    xs = [r["month"] for r in months]
    buy_nw = [r["buy_net_worth"] / 1_000 for r in months]
    rent_nw = [r["rent_net_worth"] / 1_000 for r in months]

    fig, ax = plt.subplots(figsize=(12, 6))
    ax.plot(xs, buy_nw,  label="Buy strategy",    color="#2563eb", linewidth=2)
    ax.plot(xs, rent_nw, label="Rent + Invest",   color="#16a34a", linewidth=2)

    if break_even_month is not None:
        ax.axvline(x=break_even_month, color="#dc2626", linestyle="--", linewidth=1,
                   label=f"Break-even (month {break_even_month})")

    ax.set_xlabel("Month")
    ax.set_ylabel("Net Worth (£k)")
    ax.set_title("Rent vs Buy — Net Worth Projection")
    ax.legend()
    ax.grid(True, alpha=0.3)

    # Format y-axis as £k
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"£{v:,.0f}k"))

    plt.tight_layout()
    if output_path:
        plt.savefig(output_path, dpi=150)
    else:
        plt.show()
    plt.close(fig)
