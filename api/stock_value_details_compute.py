"""
Shared stock value calculation for Stock Value Details API and Excel export.
Keeps on-screen report and export numerically aligned (Average + FIFO).
"""
from decimal import Decimal

from sqlalchemy import func, case

from models import (
    db,
    SaleItem,
    PurchaseItem,
    Sale,
    PurchaseContainer,
    InventoryAdjustment,
    InventoryBatch,
)


def historic_weighted_landed_cost_per_unit(market_id, item):
    """
    Weighted average landed cost (unit_price + COG) over all purchase lines for the item.
    Uses the same container expense split (50% qty / 50% weight) as Stock Value Details.
    Mixed container currencies are summed as stored (same limitation as average purchase on Inventory Stock).
    Returns Decimal 0 if there are no purchases.
    """
    purchase_items = PurchaseItem.query.join(
        PurchaseContainer, PurchaseItem.container_id == PurchaseContainer.id
    ).filter(
        PurchaseContainer.market_id == market_id,
        PurchaseItem.item_id == item.id,
    ).all()

    if not purchase_items:
        return Decimal('0')

    total_cost_all_containers = Decimal('0')
    total_quantity_all_containers = Decimal('0')
    container_ids = set(pi.container_id for pi in purchase_items)

    for container_id in container_ids:
        container = PurchaseContainer.query.get(container_id)
        if not container:
            continue

        all_container_items = PurchaseItem.query.filter_by(container_id=container_id).all()
        item_pi = next((pi for pi in purchase_items if pi.container_id == container_id), None)
        if not item_pi:
            continue

        expense1_in_container_currency = Decimal('0')
        if container.expense1_amount and container.expense1_amount > 0:
            if container.expense1_currency == container.currency:
                expense1_in_container_currency = container.expense1_amount
            else:
                expense1_base = container.expense1_amount * (container.expense1_exchange_rate or 1)
                container_rate = container.exchange_rate or 1
                if container_rate > 0:
                    expense1_in_container_currency = expense1_base / container_rate

        expense2_in_container_currency = Decimal('0')
        if container.expense2_amount and container.expense2_amount > 0:
            if container.expense2_currency == container.currency:
                expense2_in_container_currency = container.expense2_amount
            else:
                expense2_base = container.expense2_amount * (container.expense2_exchange_rate or 1)
                container_rate = container.exchange_rate or 1
                if container_rate > 0:
                    expense2_in_container_currency = expense2_base / container_rate

        expense3_in_container_currency = Decimal('0')
        if container.expense3_amount and container.expense3_amount > 0:
            if container.expense3_currency == container.currency:
                expense3_in_container_currency = container.expense3_amount
            else:
                expense3_base = container.expense3_amount * (container.expense3_exchange_rate or 1)
                container_rate = container.exchange_rate or 1
                if container_rate > 0:
                    expense3_in_container_currency = expense3_base / container_rate

        sum_expenses = (
            expense1_in_container_currency
            + expense2_in_container_currency
            + expense3_in_container_currency
        )

        total_qty_container = sum(pi.quantity for pi in all_container_items)
        total_weight_container = sum(
            (pi.item.weight or Decimal('0')) * pi.quantity for pi in all_container_items
        )
        item_weight = item.weight or Decimal('0')

        if total_qty_container > 0 and total_weight_container > 0:
            cog_per_unit = (sum_expenses / Decimal('2') / total_qty_container) + (
                sum_expenses / Decimal('2') / total_weight_container * item_weight
            )
        elif total_qty_container > 0:
            cog_per_unit = sum_expenses / total_qty_container
        else:
            cog_per_unit = Decimal('0')

        item_cost_per_unit = item_pi.unit_price + cog_per_unit
        total_cost = item_cost_per_unit * item_pi.quantity

        total_cost_all_containers += total_cost
        total_quantity_all_containers += item_pi.quantity

    if total_quantity_all_containers > 0:
        return total_cost_all_containers / total_quantity_all_containers
    return Decimal('0')


def build_stock_value_item_row(market_id, supplier, item, calculation_method):
    """
    Build one item dict matching get_stock_value_details / UI (same numbers as JSON).
    supplier: Company (Supplier); item: Item.
    """
    # Get purchased quantity
    purchased_qty = db.session.query(func.coalesce(func.sum(PurchaseItem.quantity), 0)).join(
        PurchaseContainer, PurchaseItem.container_id == PurchaseContainer.id
    ).filter(
        PurchaseContainer.market_id == market_id,
        PurchaseItem.item_id == item.id
    ).scalar() or Decimal('0')

    # Get sold quantity
    sold_qty = db.session.query(func.coalesce(func.sum(SaleItem.quantity), 0)).join(
        Sale, SaleItem.sale_id == Sale.id
    ).filter(
        Sale.market_id == market_id,
        SaleItem.item_id == item.id
    ).scalar() or Decimal('0')

    # Get inventory adjustments
    adjustment_qty = db.session.query(func.sum(
        case(
            (InventoryAdjustment.adjustment_type == 'Increase', InventoryAdjustment.quantity),
            else_=-InventoryAdjustment.quantity
        )
    )).filter(
        InventoryAdjustment.market_id == market_id,
        InventoryAdjustment.item_id == item.id
    ).scalar() or Decimal('0')

    available_qty = purchased_qty - sold_qty + adjustment_qty

    # Get containers for this item
    purchase_items = PurchaseItem.query.join(
        PurchaseContainer, PurchaseItem.container_id == PurchaseContainer.id
    ).filter(
        PurchaseContainer.market_id == market_id,
        PurchaseItem.item_id == item.id
    ).all()

    containers_data = []
    total_cost_all_containers = Decimal('0')
    total_quantity_all_containers = Decimal('0')

    container_ids = set(pi.container_id for pi in purchase_items)

    for container_id in container_ids:
        container = PurchaseContainer.query.get(container_id)
        if not container:
            continue

        all_container_items = PurchaseItem.query.filter_by(container_id=container_id).all()

        item_pi = next((pi for pi in purchase_items if pi.container_id == container_id), None)
        if not item_pi:
            continue

        expense1_in_container_currency = Decimal('0')
        expense1_original = Decimal('0')
        expense1_currency = container.currency
        if container.expense1_amount and container.expense1_amount > 0:
            expense1_original = container.expense1_amount
            expense1_currency = container.expense1_currency
            if container.expense1_currency == container.currency:
                expense1_in_container_currency = container.expense1_amount
            else:
                expense1_base = container.expense1_amount * (container.expense1_exchange_rate or 1)
                container_rate = container.exchange_rate or 1
                if container_rate > 0:
                    expense1_in_container_currency = expense1_base / container_rate

        expense2_in_container_currency = Decimal('0')
        expense2_original = Decimal('0')
        expense2_currency = container.currency
        if container.expense2_amount and container.expense2_amount > 0:
            expense2_original = container.expense2_amount
            expense2_currency = container.expense2_currency
            if container.expense2_currency == container.currency:
                expense2_in_container_currency = container.expense2_amount
            else:
                expense2_base = container.expense2_amount * (container.expense2_exchange_rate or 1)
                container_rate = container.exchange_rate or 1
                if container_rate > 0:
                    expense2_in_container_currency = expense2_base / container_rate

        expense3_in_container_currency = Decimal('0')
        expense3_original = Decimal('0')
        expense3_currency = container.currency
        if container.expense3_amount and container.expense3_amount > 0:
            expense3_original = container.expense3_amount
            expense3_currency = container.expense3_currency
            if container.expense3_currency == container.currency:
                expense3_in_container_currency = container.expense3_amount
            else:
                expense3_base = container.expense3_amount * (container.expense3_exchange_rate or 1)
                container_rate = container.exchange_rate or 1
                if container_rate > 0:
                    expense3_in_container_currency = expense3_base / container_rate

        sum_expenses = expense1_in_container_currency + expense2_in_container_currency + expense3_in_container_currency

        total_qty_container = sum(pi.quantity for pi in all_container_items)
        total_weight_container = sum((pi.item.weight or Decimal('0')) * pi.quantity for pi in all_container_items)

        item_weight = item.weight or Decimal('0')

        if total_qty_container > 0 and total_weight_container > 0:
            cog_per_unit = (sum_expenses / Decimal('2') / total_qty_container) + (
                sum_expenses / Decimal('2') / total_weight_container * item_weight
            )
        elif total_qty_container > 0:
            cog_per_unit = sum_expenses / total_qty_container
        else:
            cog_per_unit = Decimal('0')

        item_cost_per_unit = item_pi.unit_price + cog_per_unit
        total_cost = item_cost_per_unit * item_pi.quantity

        containers_data.append({
            'container_number': container.container_number,
            'container_date': container.date.isoformat() if container.date else None,
            'container_currency': container.currency,
            'quantity': float(item_pi.quantity),
            'unit_price': float(item_pi.unit_price),
            'expense1_original': float(expense1_original),
            'expense1_currency': expense1_currency,
            'expense1_in_container_currency': float(expense1_in_container_currency),
            'expense2_original': float(expense2_original),
            'expense2_currency': expense2_currency,
            'expense2_in_container_currency': float(expense2_in_container_currency),
            'expense3_original': float(expense3_original),
            'expense3_currency': expense3_currency,
            'expense3_in_container_currency': float(expense3_in_container_currency),
            'total_expenses_in_container_currency': float(sum_expenses),
            'cog_per_unit': float(cog_per_unit),
            'item_cost_per_unit': float(item_cost_per_unit),
            'total_cost': float(total_cost)
        })

        total_cost_all_containers += total_cost
        total_quantity_all_containers += item_pi.quantity

    average_cost_per_unit = Decimal('0')
    if total_quantity_all_containers > 0:
        average_cost_per_unit = total_cost_all_containers / total_quantity_all_containers

    if calculation_method == 'FIFO':
        batches = InventoryBatch.query.filter_by(
            market_id=market_id,
            item_id=item.id
        ).filter(
            InventoryBatch.available_quantity > 0
        ).all()

        stock_value = sum(batch.available_quantity * batch.cost_per_unit for batch in batches)

        if adjustment_qty != 0:
            last_batch = InventoryBatch.query.filter_by(
                market_id=market_id,
                item_id=item.id
            ).order_by(
                InventoryBatch.purchase_date.desc(),
                InventoryBatch.id.desc()
            ).first()
            if last_batch:
                stock_value += adjustment_qty * last_batch.cost_per_unit

        containers_data = []
        for batch in batches:
            container = batch.container
            if not container:
                continue

            expense1_in_container_currency = Decimal('0')
            expense1_original = Decimal('0')
            expense1_currency = container.currency
            if container.expense1_amount and container.expense1_amount > 0:
                expense1_original = container.expense1_amount
                expense1_currency = container.expense1_currency
                if container.expense1_currency == container.currency:
                    expense1_in_container_currency = container.expense1_amount
                else:
                    expense1_base = container.expense1_amount * (container.expense1_exchange_rate or 1)
                    container_rate = container.exchange_rate or 1
                    if container_rate > 0:
                        expense1_in_container_currency = expense1_base / container_rate

            expense2_in_container_currency = Decimal('0')
            expense2_original = Decimal('0')
            expense2_currency = container.currency
            if container.expense2_amount and container.expense2_amount > 0:
                expense2_original = container.expense2_amount
                expense2_currency = container.expense2_currency
                if container.expense2_currency == container.currency:
                    expense2_in_container_currency = container.expense2_amount
                else:
                    expense2_base = container.expense2_amount * (container.expense2_exchange_rate or 1)
                    container_rate = container.exchange_rate or 1
                    if container_rate > 0:
                        expense2_in_container_currency = expense2_base / container_rate

            expense3_in_container_currency = Decimal('0')
            expense3_original = Decimal('0')
            expense3_currency = container.currency
            if container.expense3_amount and container.expense3_amount > 0:
                expense3_original = container.expense3_amount
                expense3_currency = container.expense3_currency
                if container.expense3_currency == container.currency:
                    expense3_in_container_currency = container.expense3_amount
                else:
                    expense3_base = container.expense3_amount * (container.expense3_exchange_rate or 1)
                    container_rate = container.exchange_rate or 1
                    if container_rate > 0:
                        expense3_in_container_currency = expense3_base / container_rate

            sum_expenses = expense1_in_container_currency + expense2_in_container_currency + expense3_in_container_currency

            containers_data.append({
                'container_number': container.container_number,
                'container_date': container.date.isoformat() if container.date else None,
                'container_currency': batch.currency,
                'quantity': float(batch.available_quantity),
                'unit_price': float(batch.unit_price),
                'expense1_original': float(expense1_original),
                'expense1_currency': expense1_currency,
                'expense1_in_container_currency': float(expense1_in_container_currency),
                'expense2_original': float(expense2_original),
                'expense2_currency': expense2_currency,
                'expense2_in_container_currency': float(expense2_in_container_currency),
                'expense3_original': float(expense3_original),
                'expense3_currency': expense3_currency,
                'expense3_in_container_currency': float(expense3_in_container_currency),
                'total_expenses_in_container_currency': float(sum_expenses),
                'cog_per_unit': float(batch.cog_per_unit),
                'item_cost_per_unit': float(batch.cost_per_unit),
                'total_cost': float(batch.available_quantity * batch.cost_per_unit)
            })

        total_cost_all_containers = sum(batch.available_quantity * batch.cost_per_unit for batch in batches)
        total_quantity_all_containers = sum(batch.available_quantity for batch in batches)
        if total_quantity_all_containers > 0:
            average_cost_per_unit = total_cost_all_containers / total_quantity_all_containers
    else:
        stock_value = available_qty * average_cost_per_unit

    return {
        'item_code': item.code,
        'item_name': item.name,
        'item_weight': float(item.weight) if item.weight else 0.0,
        'currency': supplier.currency,
        'purchased_quantity': float(purchased_qty),
        'sold_quantity': float(sold_qty),
        'available_quantity': float(available_qty),
        'containers': containers_data,
        'total_cost_all_containers': float(total_cost_all_containers),
        'total_quantity_all_containers': float(total_quantity_all_containers),
        'average_cost_per_unit': float(average_cost_per_unit),
        'stock_value': float(stock_value)
    }
