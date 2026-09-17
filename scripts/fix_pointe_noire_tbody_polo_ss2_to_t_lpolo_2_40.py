"""
CALL OPERATION RECORD EDIT 369 — POINTE NOIRE (JAMIL).

Repoint T-BODY & POLO SS #2(40) (one catalog line; not separate T-BODY / POLO SS)
purchases/sales and related inventory rows to T-L.POLO #2(40), then remove the duplicate item.

Usage:
  python scripts/fix_pointe_noire_tbody_polo_ss2_to_t_lpolo_2_40.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import func  # noqa: E402

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

MARKET_NAME = "POINTE NOIRE (JAMIL)"
# Exact `items.code` in POINTE NOIRE (JAMIL); was misread earlier as two separate codes.
OLD_CODES = ("T-BODY & POLO SS #2(40)",)
NEW_CODE = "T-L.POLO #2(40)"


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
        m = (
            Market.query.filter(func.lower(Market.name) == MARKET_NAME.lower())
            .order_by(Market.id)
            .first()
        )
        if not m:
            m = Market.query.filter(
                Market.name.ilike("%POINTE NOIRE%"),
                Market.name.ilike("%JAMIL%"),
            ).order_by(Market.id).first()
        if not m:
            print(f"Market {MARKET_NAME!r} not found.")
            return 1

        new_item = Item.query.filter_by(market_id=m.id, code=NEW_CODE).first()
        if not new_item:
            print(f"Target {NEW_CODE!r} missing in market id={m.id} ({m.name!r}).")
            return 1

        any_done = False
        for code in OLD_CODES:
            old_item = Item.query.filter_by(market_id=m.id, code=code).first()
            if not old_item:
                print(f"Skip {code!r}: not in market (already merged or never existed).")
                continue

            if old_item.supplier_id != new_item.supplier_id:
                print(
                    f"Refusing {code!r}: supplier_id {old_item.supplier_id} != "
                    f"target {new_item.supplier_id} for {NEW_CODE!r}."
                )
                return 1

            oid = old_item.id
            nid = new_item.id
            p, b, s, a = _repoint_item_rows(oid, nid)
            db.session.delete(old_item)
            db.session.commit()
            any_done = True
            print(
                f"{code!r} -> {NEW_CODE!r}: purchase_lines={p}, batches={b}, "
                f"sale_lines={s}, inventory_adjustments={a}; removed item_id={oid}"
            )

        if not any_done:
            print("Nothing to do (no source items in this market).")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
