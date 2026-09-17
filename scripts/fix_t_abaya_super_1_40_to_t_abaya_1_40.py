"""
Repoint T-ABAYA SUPER #1(40) to T-ABAYA #1(40) per market (purchases, batches, sales, adjustments).

Runs for every market where both catalog lines exist and supplier_id matches.

Usage:
  python scripts/fix_t_abaya_super_1_40_to_t_abaya_1_40.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app  # noqa: E402
from models import (  # noqa: E402
    db,
    Market,
    Item,
    PurchaseItem,
    SaleItem,
    InventoryBatch,
    InventoryAdjustment,
)

OLD_CODE = "T-ABAYA SUPER #1(40)"
NEW_CODE = "T-ABAYA #1(40)"


def _repoint_item_rows(old_id, new_id):
    p = PurchaseItem.query.filter_by(item_id=old_id).update(
        {PurchaseItem.item_id: new_id}, synchronize_session=False
    )
    b = InventoryBatch.query.filter_by(item_id=old_id).update(
        {InventoryBatch.item_id: new_id}, synchronize_session=False
    )
    s = SaleItem.query.filter_by(item_id=old_id).update(
        {SaleItem.item_id: new_id}, synchronize_session=False
    )
    a = InventoryAdjustment.query.filter_by(item_id=old_id).update(
        {InventoryAdjustment.item_id: new_id}, synchronize_session=False
    )
    return p, b, s, a


def main():
    with app.app_context():
        olds = Item.query.filter_by(code=OLD_CODE).order_by(Item.market_id).all()
        if not olds:
            print(f"No {OLD_CODE!r} items. Nothing to do.")
            return 0

        any_done = False
        exit_code = 0
        for old_item in olds:
            m = db.session.get(Market, old_item.market_id)
            mname = m.name if m else f"market_id={old_item.market_id}"

            new_item = Item.query.filter_by(
                market_id=old_item.market_id, code=NEW_CODE
            ).first()
            if not new_item:
                print(f"Skip {mname!r}: {NEW_CODE!r} not in this market.")
                exit_code = 1
                continue

            if old_item.supplier_id != new_item.supplier_id:
                print(
                    f"Refusing {mname!r}: supplier_id {old_item.supplier_id} != "
                    f"{new_item.supplier_id} for {NEW_CODE!r}."
                )
                exit_code = 1
                continue

            oid, nid = old_item.id, new_item.id
            p, b, s, a = _repoint_item_rows(oid, nid)
            db.session.delete(old_item)
            db.session.commit()
            any_done = True
            print(
                f"{mname}: {OLD_CODE!r} -> {NEW_CODE!r} | "
                f"purchase_lines={p}, batches={b}, sale_lines={s}, "
                f"inventory_adjustments={a}; removed item_id={oid}"
            )

        if not any_done and exit_code == 0:
            print("Nothing merged.")
        return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
