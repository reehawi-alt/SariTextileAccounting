"""
TANZANYA (YASSER) — fix duplicate "M. SHORT #2(40)" vs "M.SHORT #2(40)" catalog item.

Older data used item code/name with a space after "M." (item id varies by DB).
Canonical row uses M.SHORT #2(40) (no space). This script:

1. Finds market whose name contains TANZANYA and YASSER.
2. Finds two items in that market with codes "M. SHORT #2(40)" and "M.SHORT #2(40)"
   (same supplier must match on both).
3. Moves all sale_items from the spaced-code item to the canonical item and deletes
   the duplicate item.

Safe to re-run: if the spaced item is already gone, exits with a message.

"CALL OPERATION RECORD EDIT 369" is an external ops reference only (not stored in DB).

Usage:
  python scripts/fix_tanzanya_m_short_sales.py

  set DATABASE_URL=...  (if not using default sqlite)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app  # noqa: E402
from models import db, Market, Item, SaleItem  # noqa: E402

OLD_CODE = "M. SHORT #2(40)"
NEW_CODE = "M.SHORT #2(40)"


def main():
    with app.app_context():
        markets = (
            Market.query.filter(
                Market.name.ilike("%TANZANYA%"),
                Market.name.ilike("%YASSER%"),
            )
            .order_by(Market.id)
            .all()
        )
        if not markets:
            print("No market found matching TANZANYA and YASSER in name.")
            return 1
        m = markets[0]
        if len(markets) > 1:
            print(f"Note: {len(markets)} markets matched; using id={m.id} {m.name!r}")
        else:
            print(f"Market: id={m.id} name={m.name!r}")

        old_item = Item.query.filter_by(market_id=m.id, code=OLD_CODE).first()
        new_item = Item.query.filter_by(market_id=m.id, code=NEW_CODE).first()

        if not new_item:
            print(f"Canonical item with code {NEW_CODE!r} not found. Nothing to do.")
            return 1

        if not old_item:
            print(f"Spaced item {OLD_CODE!r} not found (already merged or never existed). OK.")
            return 0

        if old_item.supplier_id != new_item.supplier_id:
            print(
                "Refusing: supplier_id mismatch "
                f"old={old_item.supplier_id} new={new_item.supplier_id}"
            )
            return 1

        n = SaleItem.query.filter_by(item_id=old_item.id).update(
            {SaleItem.item_id: new_item.id},
            synchronize_session=False,
        )
        db.session.delete(old_item)
        db.session.commit()
        print(f"Moved {n} sale line(s) from item id={old_item.id} to id={new_item.id}.")
        print(f"Deleted duplicate item {OLD_CODE!r}.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
