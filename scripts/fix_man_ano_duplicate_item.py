"""
Merge duplicate MAN ANO #3(40) into M.ANO #3(40) (same market + supplier).

In TANZANYA (YASSER), legacy item used code "MAN ANO #3(40)" while the canonical
row is "M.ANO #3(40)". This moves all purchase_items, inventory_batches, and
sale_items from the old item to the canonical item and deletes the duplicate.

Idempotent: if the old code does not exist, exits OK.

Usage:
  python scripts/fix_man_ano_duplicate_item.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app  # noqa: E402
from models import db, Market, Item, PurchaseItem, SaleItem, InventoryBatch  # noqa: E402

OLD_CODE = "MAN ANO #3(40)"
NEW_CODE = "M.ANO #3(40)"


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
            print("No market matching TANZANYA + YASSER; trying global lookup by code.")
            old_items = Item.query.filter_by(code=OLD_CODE).all()
            new_items = Item.query.filter_by(code=NEW_CODE).all()
            if not old_items:
                print(f"No item with code {OLD_CODE!r}. Already merged or missing.")
                return 0
            if not new_items:
                print(f"Canonical {NEW_CODE!r} not found.")
                return 1
            pairs = []
            for o in old_items:
                for n in new_items:
                    if n.market_id == o.market_id and n.supplier_id == o.supplier_id:
                        pairs.append((o, n))
                        break
            if len(pairs) != 1:
                print("Ambiguous or no single pair; refine script for your DB.")
                return 1
            old_item, new_item = pairs[0]
        else:
            m = markets[0]
            old_item = Item.query.filter_by(market_id=m.id, code=OLD_CODE).first()
            new_item = Item.query.filter_by(market_id=m.id, code=NEW_CODE).first()
            if not new_item:
                print(f"Canonical {NEW_CODE!r} not in market {m.id}.")
                return 1
            if not old_item:
                print(f"{OLD_CODE!r} not in market {m.id}. OK.")
                return 0

        if old_item.supplier_id != new_item.supplier_id:
            print("supplier_id mismatch; refusing.")
            return 1

        oid, nid = old_item.id, new_item.id
        p = PurchaseItem.query.filter_by(item_id=oid).update(
            {PurchaseItem.item_id: nid}, synchronize_session=False
        )
        b = InventoryBatch.query.filter_by(item_id=oid).update(
            {InventoryBatch.item_id: nid}, synchronize_session=False
        )
        s = SaleItem.query.filter_by(item_id=oid).update(
            {SaleItem.item_id: nid}, synchronize_session=False
        )
        db.session.delete(old_item)
        db.session.commit()
        print(f"Moved purchase_lines={p}, batches={b}, sale_lines={s}; deleted item id={oid}")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
