"""One-off: repoint 45 specific HARD TOYS 20 KGS sale lines to 15 KG per user screenshot."""
import os
import sys
from decimal import Decimal

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from app import app
from models import db, Sale, SaleItem

MARKET_ID = 7
OLD_IID = 1052
NEW_IID = 1051
OLD_CODE = "HARD TOYS 20 KGS(20)"
NEW_CODE = "HARD TOYS 15 KG(15)"

# (invoice, qty, total_price) — 45 rows from screenshot; totals: qty 104, TZS 14,815,000
EXPECTED = [
    ("SAL-20260112-211", Decimal("1"), Decimal("80000")),
    ("SAL-20260112-077", Decimal("2"), Decimal("180000")),
    ("SAL-20260112-023", Decimal("4"), Decimal("480000")),
    ("SAL-20260112-346", Decimal("19"), Decimal("2470000")),
    ("SAL-20260112-042", Decimal("1"), Decimal("140000")),
    ("SAL-20260112-170", Decimal("1"), Decimal("140000")),
    ("SAL-20260112-276", Decimal("6"), Decimal("850000")),
    ("SAL-20260112-373", Decimal("3"), Decimal("430000")),
    ("SAL-20260112-112", Decimal("2"), Decimal("295000")),
    ("SAL-20260112-003", Decimal("1"), Decimal("150000")),
    ("SAL-20260112-122", Decimal("1"), Decimal("150000")),
    ("SAL-20260112-140", Decimal("1"), Decimal("150000")),
    ("SAL-20260112-158", Decimal("3"), Decimal("450000")),
    ("SAL-20260112-162", Decimal("3"), Decimal("450000")),
    ("SAL-20260112-207", Decimal("3"), Decimal("450000")),
    ("SAL-20260112-208", Decimal("1"), Decimal("150000")),
    ("SAL-20260112-223", Decimal("4"), Decimal("600000")),
    ("SAL-20260112-244", Decimal("1"), Decimal("150000")),
    ("SAL-20260112-258", Decimal("5"), Decimal("750000")),
    ("SAL-20260112-260", Decimal("4"), Decimal("600000")),
    ("SAL-20260112-262", Decimal("1"), Decimal("150000")),
    ("SAL-20260112-264", Decimal("1"), Decimal("150000")),
    ("SAL-20260112-265", Decimal("1"), Decimal("150000")),
    ("SAL-20260112-274", Decimal("5"), Decimal("750000")),
    ("SAL-20260112-275", Decimal("1"), Decimal("150000")),
    ("SAL-20260112-284", Decimal("1"), Decimal("150000")),
    ("SAL-20260112-285", Decimal("1"), Decimal("150000")),
    ("SAL-20260112-291", Decimal("6"), Decimal("900000")),
    ("SAL-20260112-306", Decimal("1"), Decimal("150000")),
    ("SAL-20260112-311", Decimal("2"), Decimal("300000")),
    ("SAL-20260112-312", Decimal("1"), Decimal("150000")),
    ("SAL-20260112-314", Decimal("2"), Decimal("300000")),
    ("SAL-20260112-315", Decimal("2"), Decimal("300000")),
    ("SAL-20260112-317", Decimal("1"), Decimal("150000")),
    ("SAL-20260112-322", Decimal("1"), Decimal("150000")),
    ("SAL-20260112-325", Decimal("1"), Decimal("150000")),
    ("SAL-20260112-333", Decimal("1"), Decimal("150000")),
    ("SAL-20260112-334", Decimal("1"), Decimal("150000")),
    ("SAL-20260112-335", Decimal("1"), Decimal("150000")),
    ("SAL-20260112-336", Decimal("1"), Decimal("150000")),
    ("SAL-20260112-354", Decimal("1"), Decimal("150000")),
    ("SAL-20260112-364", Decimal("2"), Decimal("300000")),
    ("SAL-20260119-002", Decimal("1"), Decimal("150000")),
    ("SAL-20260218-005", Decimal("1"), Decimal("150000")),
    ("SAL-20260309-002", Decimal("1"), Decimal("150000")),
]


def _money_eq(a: Decimal, b: Decimal) -> bool:
    return abs(a - b) <= Decimal("0.5")


def main():
    assert len(EXPECTED) == 45
    assert sum(t[1] for t in EXPECTED) == 104
    assert sum(t[2] for t in EXPECTED) == Decimal("14815000")

    with app.app_context():
        updated = 0
        errors = []
        for inv, eq, et in EXPECTED:
            sale = Sale.query.filter_by(market_id=MARKET_ID, invoice_number=inv).first()
            if not sale:
                errors.append(("NO_SALE", inv))
                continue
            candidates = [li for li in sale.items if li.item_id == OLD_IID]
            if not candidates:
                candidates = [
                    li
                    for li in sale.items
                    if li.item_id is None and OLD_CODE in (li.line_description or "")
                ]
            hit = None
            for li in candidates:
                if li.quantity == eq and li.total_price == et:
                    hit = li
                    break
            if hit is None and len(candidates) == 1:
                li = candidates[0]
                if _money_eq(Decimal(str(li.quantity)), eq) and _money_eq(
                    Decimal(str(li.total_price)), et
                ):
                    hit = li
            if hit is None:
                errors.append(
                    (
                        "NO_MATCH",
                        inv,
                        [(li.item_id, li.quantity, li.total_price) for li in sale.items],
                    )
                )
                continue
            hit.item_id = NEW_IID
            if hit.line_description and OLD_CODE in hit.line_description:
                hit.line_description = hit.line_description.replace(OLD_CODE, NEW_CODE)
            updated += 1

        if errors:
            print("ERRORS", len(errors))
            for e in errors:
                print(e)
            raise SystemExit(1)
        db.session.commit()
        print("OK updated", updated, "lines (expected 45)")


if __name__ == "__main__":
    main()
