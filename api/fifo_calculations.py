"""
FIFO Calculation Engine
Separate module for FIFO (First In First Out) inventory costing calculations
"""
from flask import session
from models import db, Item, SaleItem, PurchaseItem, Sale, PurchaseContainer, Company, InventoryBatch, SaleItemAllocation, InventoryAdjustment
from decimal import Decimal
from datetime import datetime
from sqlalchemy import func, case
from sqlalchemy.orm import joinedload


def create_inventory_batches_for_container(container_id):
    """Create inventory batches when a container is added (for FIFO)"""
    container = PurchaseContainer.query.get(container_id)
    if not container:
        return
    
    # Check if batches already exist for this container
    existing_batches = InventoryBatch.query.filter_by(container_id=container_id).first()
    if existing_batches:
        return  # Already created
    
    # Calculate expenses in container's original currency (same logic as Average method)
    # Convert each expense to container currency if needed
    expense1_in_container_currency = Decimal('0')
    if container.expense1_amount and container.expense1_amount > 0:
        if container.expense1_currency == container.currency:
            expense1_in_container_currency = container.expense1_amount
        else:
            # Convert to base currency first, then to container currency
            expense1_base = container.expense1_amount * (container.expense1_exchange_rate or 1)
            container_rate = container.exchange_rate or 1
            if container_rate > 0:
                expense1_in_container_currency = expense1_base / container_rate
    
    expense2_in_container_currency = Decimal('0')
    if container.expense2_amount and container.expense2_amount > 0:
        if container.expense2_currency == container.currency:
            expense2_in_container_currency = container.expense2_amount
        else:
            # Convert to base currency first, then to container currency
            expense2_base = container.expense2_amount * (container.expense2_exchange_rate or 1)
            container_rate = container.exchange_rate or 1
            if container_rate > 0:
                expense2_in_container_currency = expense2_base / container_rate
    
    expense3_in_container_currency = Decimal('0')
    if container.expense3_amount and container.expense3_amount > 0:
        if container.expense3_currency == container.currency:
            expense3_in_container_currency = container.expense3_amount
        else:
            # Convert to base currency first, then to container currency
            expense3_base = container.expense3_amount * (container.expense3_exchange_rate or 1)
            container_rate = container.exchange_rate or 1
            if container_rate > 0:
                expense3_in_container_currency = expense3_base / container_rate
    
    # Total expenses in container currency
    sum_expenses = expense1_in_container_currency + expense2_in_container_currency + expense3_in_container_currency
    
    # Calculate total quantity and total weight for the container
    total_quantity = sum(item.quantity for item in container.items)
    total_weight = sum((item.item.weight or Decimal('0')) * item.quantity 
                      for item in container.items)
    
    for purchase_item in container.items:
        item = purchase_item.item
        item_weight = item.weight or Decimal('0')
        
        # Calculate COG per unit using the exact formula:
        # COG Per Unit = (Total Expenses ÷ 2 ÷ Total Container Quantity) + (Total Expenses ÷ 2 ÷ Total Container Weight × Item Weight)
        if total_quantity > 0 and total_weight > 0:
            cog_per_unit = (sum_expenses / Decimal('2') / total_quantity) + \
                          (sum_expenses / Decimal('2') / total_weight * item_weight)
        elif total_quantity > 0:
            # If no weight, distribute by quantity only
            cog_per_unit = sum_expenses / total_quantity
        else:
            cog_per_unit = Decimal('0')
        
        # Cost per unit = Unit Purchase Price + COG Per Unit
        cost_per_unit = purchase_item.unit_price + cog_per_unit
        
        # Create inventory batch (batch code = container number)
        batch = InventoryBatch(
            market_id=container.market_id,
            item_id=purchase_item.item_id,
            purchase_item_id=purchase_item.id,
            container_id=container_id,
            purchase_date=container.date,
            original_quantity=purchase_item.quantity,
            available_quantity=purchase_item.quantity,
            unit_price=purchase_item.unit_price,
            cog_per_unit=cog_per_unit,  # Already in container currency
            cost_per_unit=cost_per_unit,  # Unit Price + COG Per Unit
            currency=container.currency,
            exchange_rate=container.exchange_rate
        )
        db.session.add(batch)
    
    db.session.commit()


def allocate_sale_item_fifo(sale_item):
    """Allocate sale item to oldest inventory batches (FIFO)"""
    item_id = sale_item.item_id
    quantity_needed = sale_item.quantity
    sale_date = sale_item.sale.date
    
    # Get available batches ordered by purchase date (oldest first)
    batches = InventoryBatch.query.filter_by(
        market_id=sale_item.sale.market_id,
        item_id=item_id
    ).filter(
        InventoryBatch.available_quantity > 0
    ).order_by(
        InventoryBatch.purchase_date.asc(),
        InventoryBatch.id.asc()  # For batches on same date
    ).all()
    
    remaining_quantity = quantity_needed
    total_cost = Decimal('0')
    
    for batch in batches:
        if remaining_quantity <= 0:
            break
        
        # Calculate how much to take from this batch
        quantity_from_batch = min(remaining_quantity, batch.available_quantity)
        
        # Convert cost to base currency
        # Cost Per Unit (Base) = Cost Per Unit (Container Currency) × Exchange Rate
        # Cost Per Unit = Unit Purchase Price + COG Per Unit
        # Exchange Rate: 1 unit of container currency = exchange_rate units of base currency
        if batch.exchange_rate and batch.exchange_rate > 0:
            cost_per_unit_base = batch.cost_per_unit * batch.exchange_rate
        else:
            cost_per_unit_base = batch.cost_per_unit
        total_cost_batch = cost_per_unit_base * quantity_from_batch
        
        # Create allocation record
        allocation = SaleItemAllocation(
            sale_item_id=sale_item.id,
            batch_id=batch.id,
            quantity=quantity_from_batch,
            cost_per_unit=cost_per_unit_base,
            total_cost=total_cost_batch
        )
        db.session.add(allocation)
        
        # Update batch available quantity
        batch.available_quantity -= quantity_from_batch
        
        remaining_quantity -= quantity_from_batch
        total_cost += total_cost_batch
    
    if remaining_quantity > 0:
        # Not enough inventory - this should be handled by validation before sale creation
        # For now, we'll log it but continue
        print(f"Warning: Insufficient inventory for item {sale_item.item.code}. "
              f"Needed: {quantity_needed}, Available: {quantity_needed - remaining_quantity}")
    
    db.session.commit()
    return total_cost


def calculate_profit_loss_fifo(market_id, start_date=None, end_date=None, item_id=None):
    """Calculate profit/loss using FIFO method"""
    # Get sales
    sales_query = db.session.query(SaleItem, Sale).join(
        Sale, SaleItem.sale_id == Sale.id
    ).filter(Sale.market_id == market_id)
    
    if item_id:
        sales_query = sales_query.filter(SaleItem.item_id == item_id)
    if start_date:
        sales_query = sales_query.filter(Sale.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        sales_query = sales_query.filter(Sale.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    
    sales = sales_query.all()
    
    # Calculate profit per item
    profit_data = {}
    
    # Initialize with sales
    for sale_item, sale in sales:
        item_id = sale_item.item_id
        if item_id not in profit_data:
            profit_data[item_id] = {
                'item_id': item_id,
                'item_code': sale_item.item.code,
                'item_name': sale_item.item.name,
                'total_sales': Decimal('0'),
                'total_cost': Decimal('0'),
                'quantity_sold': Decimal('0'),
                'batch_details': []  # Store batch information for each sale
            }
        
        profit_data[item_id]['total_sales'] += sale_item.total_price
        profit_data[item_id]['quantity_sold'] += sale_item.quantity
        
        # Get actual cost from allocations (FIFO) with batch details
        allocations = SaleItemAllocation.query.filter_by(
            sale_item_id=sale_item.id
        ).all()
        
        total_cost = Decimal('0')
        for alloc in allocations:
            total_cost += alloc.total_cost
            # Get batch information
            batch = alloc.batch
            container = batch.container if batch else None
            batch_code = container.container_number if container else ''
            
            profit_data[item_id]['batch_details'].append({
                'sale_date': sale.date.isoformat(),
                'invoice_number': sale.invoice_number,
                'batch_code': batch_code,
                'purchase_date': batch.purchase_date.isoformat() if batch else '',
                'quantity': float(alloc.quantity),
                'cost_per_unit': float(alloc.cost_per_unit),
                'total_cost': float(alloc.total_cost),
                'currency': batch.currency if batch else ''
            })
        
        profit_data[item_id]['total_cost'] += total_cost
    
    # Calculate profit
    for item_id, data in profit_data.items():
        data['profit'] = data['total_sales'] - data['total_cost']
        data['profit_margin'] = (data['profit'] / data['total_sales'] * 100) if data['total_sales'] > 0 else 0
        data['cog'] = float(data['total_cost'])  # COG is the total cost
        data['average_purchase_price'] = 0.0  # Not applicable for FIFO
        # Sort batch details by sale date for display
        data['batch_details'].sort(key=lambda x: (x['sale_date'], x['invoice_number']))
    
    # Convert to list
    result = list(profit_data.values())
    
    # Calculate totals
    total_sales = sum(Decimal(str(r['total_sales'])) for r in result)
    total_cost = sum(Decimal(str(r['total_cost'])) for r in result)
    total_profit = total_sales - total_cost
    total_cog = total_cost
    
    return result, total_sales, total_cost, total_profit, total_cog


def calculate_stock_value_details_fifo(market_id, item_id=None):
    """Calculate detailed stock value using FIFO method"""
    from sqlalchemy import func
    from sqlalchemy.orm import joinedload
    
    # Get items
    items_query = Item.query.filter_by(market_id=market_id)
    if item_id:
        items_query = items_query.filter_by(id=item_id)
    
    items = items_query.all()
    
    if not items:
        return {
            'items': [],
            'total_stock_value': 0.0,
            'total_quantity': 0.0,
            'total_weight': 0.0
        }
    
    detailed_data = []
    total_stock_value = Decimal('0')
    total_quantity = Decimal('0')
    total_weight = Decimal('0')
    
    for item in items:
        # Get available batches for this item
        batches = InventoryBatch.query.filter_by(
            market_id=market_id,
            item_id=item.id
        ).filter(
            InventoryBatch.available_quantity > 0
        ).order_by(
            InventoryBatch.purchase_date.asc(),
            InventoryBatch.id.asc()
        ).all()
        
        # Get inventory adjustments
        adjustments = InventoryAdjustment.query.filter_by(
            market_id=market_id,
            item_id=item.id
        ).all()
        
        adjustment_qty = sum(
            adj.quantity if adj.adjustment_type == 'Increase' else -adj.quantity
            for adj in adjustments
        )
        
        # Calculate available quantity from batches
        batch_quantity = sum(batch.available_quantity for batch in batches)
        available_quantity = batch_quantity + adjustment_qty
        
        # Calculate stock value from batches (FIFO - oldest batches)
        item_stock_value = Decimal('0')
        batch_details = []
        
        for batch in batches:
            # Stock Value = Available Quantity × Cost Per Unit (in container currency)
            # Cost Per Unit = Unit Purchase Price + COG Per Unit
            # Note: Stock value is calculated in container currency (supplier currency), not base currency
            # Exchange rate is only used when converting to base currency, but here we display in supplier currency
            batch_value = batch.available_quantity * batch.cost_per_unit
            item_stock_value += batch_value
            
            # Batch code = container number
            batch_code = batch.container.container_number if batch.container else ''
            
            batch_details.append({
                'batch_code': batch_code,  # Container number as batch code
                'container_number': batch_code,  # Also include for compatibility
                'purchase_date': batch.purchase_date.isoformat(),
                'quantity': float(batch.available_quantity),
                'unit_price': float(batch.unit_price),  # Unit Purchase Price
                'cog_per_unit': float(batch.cog_per_unit),  # COG Per Unit
                'cost_per_unit': float(batch.cost_per_unit),  # Unit Price + COG Per Unit
                'currency': batch.currency,
                'exchange_rate': float(batch.exchange_rate),
                'batch_value': float(batch_value)  # Quantity × Cost Per Unit (in container currency)
            })

        # Apply inventory adjustments using last batch cost (most recent batch)
        if adjustment_qty != 0:
            last_batch = InventoryBatch.query.filter_by(
                market_id=market_id,
                item_id=item.id
            ).order_by(
                InventoryBatch.purchase_date.desc(),
                InventoryBatch.id.desc()
            ).first()
            if last_batch:
                adjustment_value = adjustment_qty * last_batch.cost_per_unit
                item_stock_value += adjustment_value
        
        total_stock_value += item_stock_value
        total_quantity += available_quantity
        total_weight += available_quantity * (item.weight or Decimal('0'))
        
        detailed_data.append({
            'item_id': item.id,
            'item_code': item.code,
            'item_name': item.name,
            'supplier_id': item.supplier_id,
            'supplier_name': item.supplier.name if item.supplier else None,
            'available_quantity': float(available_quantity),
            'weight': float(item.weight) if item.weight else 0.0,
            'stock_value': float(item_stock_value),
            'batches': batch_details
        })
    
    return {
        'items': detailed_data,
        'total_stock_value': float(total_stock_value),
        'total_quantity': float(total_quantity),
        'total_weight': float(total_weight)
    }


def get_stock_by_supplier_fifo(market_id):
    """Get stock by supplier using FIFO method"""
    suppliers = Company.query.filter_by(market_id=market_id, category='Supplier').all()
    
    supplier_stock = []
    total_quantity = Decimal('0')
    total_weight = Decimal('0')
    
    for supplier in suppliers:
        # Get all items for this supplier
        items = Item.query.filter_by(market_id=market_id, supplier_id=supplier.id).all()
        item_ids = [i.id for i in items]
        
        if not item_ids:
            continue
        
        supplier_quantity = Decimal('0')
        supplier_weight = Decimal('0')
        supplier_stock_value = Decimal('0')
        
        for item in items:
            # Get available batches
            batches = InventoryBatch.query.filter_by(
                market_id=market_id,
                item_id=item.id
            ).filter(
                InventoryBatch.available_quantity > 0
            ).all()
            
            # Get inventory adjustments
            adjustments = InventoryAdjustment.query.filter_by(
                market_id=market_id,
                item_id=item.id
            ).all()
            
            adjustment_qty = sum(
                adj.quantity if adj.adjustment_type == 'Increase' else -adj.quantity
                for adj in adjustments
            )
            
            # Calculate from batches
            batch_quantity = sum(batch.available_quantity for batch in batches)
            available_qty = batch_quantity + adjustment_qty
            
            # Calculate stock value from batches using FIFO
            # Stock Value = Sum of (Available Quantity × Cost Per Unit) for each batch (in container currency)
            # Cost Per Unit = Unit Purchase Price + COG Per Unit
            # COG Per Unit = (Total Expenses ÷ 2 ÷ Total Container Quantity) + (Total Expenses ÷ 2 ÷ Total Container Weight × Item Weight)
            # Note: Stock value is calculated in container currency (supplier currency), not base currency
            item_stock_value = sum(
                batch.available_quantity * batch.cost_per_unit
                for batch in batches
            )

            # Apply inventory adjustments using last batch cost (most recent batch)
            if adjustment_qty != 0:
                last_batch = InventoryBatch.query.filter_by(
                    market_id=market_id,
                    item_id=item.id
                ).order_by(
                    InventoryBatch.purchase_date.desc(),
                    InventoryBatch.id.desc()
                ).first()
                if last_batch:
                    adjustment_value = adjustment_qty * last_batch.cost_per_unit
                    item_stock_value += adjustment_value
            
            supplier_quantity += available_qty
            supplier_weight += available_qty * (item.weight or Decimal('0'))
            supplier_stock_value += item_stock_value
        
        supplier_stock.append({
            'supplier_id': supplier.id,
            'supplier_name': supplier.name,
            'quantity': float(supplier_quantity),
            'weight': float(supplier_weight),
            'stock_value': float(supplier_stock_value),
            'currency': supplier.currency
        })
        total_quantity += supplier_quantity
        total_weight += supplier_weight
    
    return {
        'suppliers': supplier_stock,
        'total': {
            'quantity': float(total_quantity),
            'weight': float(total_weight)
        }
    }


def backfill_fifo_batches(market_id):
    """Create batches for all existing purchases (historical data backfill)"""
    containers = PurchaseContainer.query.filter_by(market_id=market_id).all()
    
    created_count = 0
    for container in containers:
        # Check if batches already exist
        existing = InventoryBatch.query.filter_by(container_id=container.id).first()
        if not existing:
            create_inventory_batches_for_container(container.id)
            created_count += 1
    
    return created_count

def backfill_fifo_allocations(market_id):
    """Allocate all existing sales to inventory batches (historical data backfill)"""
    from models import Sale, SaleItem
    
    # First, reset all batch available quantities to original quantities
    batches = InventoryBatch.query.filter_by(market_id=market_id).all()
    for batch in batches:
        batch.available_quantity = batch.original_quantity
    
    db.session.commit()
    
    # Delete all existing allocations to start fresh
    # Use a safer delete approach
    allocations_to_delete = db.session.query(SaleItemAllocation).join(
        SaleItem, SaleItemAllocation.sale_item_id == SaleItem.id
    ).join(
        Sale, SaleItem.sale_id == Sale.id
    ).filter(Sale.market_id == market_id).all()
    
    for allocation in allocations_to_delete:
        db.session.delete(allocation)
    
    db.session.commit()
    
    # Get all sales for this market, ordered by date (chronological order is critical for FIFO)
    sales = Sale.query.filter_by(market_id=market_id).order_by(Sale.date.asc(), Sale.id.asc()).all()
    
    allocated_count = 0
    for sale in sales:
        for sale_item in sale.items:
            # Allocate this sale item using simplified allocation (no duplicate check needed in backfill)
            try:
                item_id = sale_item.item_id
                quantity_needed = sale_item.quantity
                
                # Get available batches ordered by purchase date (oldest first)
                batches = InventoryBatch.query.filter_by(
                    market_id=market_id,
                    item_id=item_id
                ).filter(
                    InventoryBatch.available_quantity > 0
                ).order_by(
                    InventoryBatch.purchase_date.asc(),
                    InventoryBatch.id.asc()
                ).all()
                
                remaining_quantity = quantity_needed
                
                for batch in batches:
                    if remaining_quantity <= 0:
                        break
                    
                    quantity_from_batch = min(remaining_quantity, batch.available_quantity)
                    
                    # Convert cost to base currency
                    # Exchange Rate: 1 unit of container currency = exchange_rate units of base currency
                    if batch.exchange_rate and batch.exchange_rate > 0:
                        cost_per_unit_base = batch.cost_per_unit * batch.exchange_rate
                    else:
                        cost_per_unit_base = batch.cost_per_unit
                    total_cost_batch = cost_per_unit_base * quantity_from_batch
                    
                    # Create allocation record
                    allocation = SaleItemAllocation(
                        sale_item_id=sale_item.id,
                        batch_id=batch.id,
                        quantity=quantity_from_batch,
                        cost_per_unit=cost_per_unit_base,
                        total_cost=total_cost_batch
                    )
                    db.session.add(allocation)
                    
                    # Update batch available quantity
                    batch.available_quantity -= quantity_from_batch
                    
                    remaining_quantity -= quantity_from_batch
                
                if remaining_quantity > 0:
                    print(f"Warning: Insufficient inventory for sale item {sale_item.id}. "
                          f"Needed: {quantity_needed}, Allocated: {quantity_needed - remaining_quantity}")
                
                allocated_count += 1
            except Exception as e:
                print(f"Warning: Could not allocate sale item {sale_item.id}: {e}")
                continue
    
    db.session.commit()
    print(f"DEBUG backfill_fifo_allocations: Completed. Created {allocated_count} new allocations")
    return allocated_count

