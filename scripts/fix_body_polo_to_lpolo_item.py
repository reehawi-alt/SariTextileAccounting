"""
Merge BODY & L.POLO S/S #1(40) into L.POLO S/S #1(40) (TANZANYA YASSER).

Moves purchase_items, inventory_batches, sale_items; deletes duplicate.

Usage:
  python scripts/fix_body_polo_to_lpolo_item.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app  # noqa: E402
from models import db, Market, Item, PurchaseItem, SaleItem, InventoryBatch  # noqa: E402

OLD_CODE = "BODY & L.POLO S/S #1(40)"
NEW_CODE = "L.POLO S/S #1(40)"


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
            olds = Item.query.filter_by(code=OLD_CODE).all()
            news = Item.query.filter_by(code=NEW_CODE).all()
            if not olds:
                print(f"No {OLD_CODE!r}. OK.")
                return 0
            if not news:
                print(f"No {NEW_CODE!r}.")
                return 1
            pair = None
            for o in olds:
                for n in news:
                    if o.market_id == n.market_id and o.supplier_id == n.supplier_id:
                        pair = (o, n)
                        break
                if pair:
                    break
            if not pair:
                print("No single market+supplier pair.")
                return 1
            old_item, new_item = pair
        else:
            m = markets[0]
            old_item = Item.query.filter_by(market_id=m.id, code=OLD_CODE).first()
            new_item = Item.query.filter_by(market_id=m.id, code=NEW_CODE).first()
            if not new_item:
                print(f"{NEW_CODE!r} missing in market {m.id}.")
                return 1
            if not old_item:
                print(f"{OLD_CODE!r} already merged. OK.")
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
        print(f"purchase_lines={p}, batches={b}, sale_lines={s}; deleted item id={oid}")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
