"""
Diagnostic script to check FIFO allocations for a market
Checks:
1. Total purchases vs total batches created
2. Total sales vs total allocations created
3. Which items have discrepancies between FIFO calculated quantity and actual quantity
"""

from app import app, db
from models import Market, Item, PurchaseContainer, PurchaseItem, Sale, SaleItem, InventoryBatch, SaleItemAllocation, InventoryAdjustment
from sqlalchemy import func, case
from decimal import Decimal

def diagnose_fifo_allocations(market_name=None, market_id=None):
    """Diagnose FIFO allocations for a specific market"""
    
    with app.app_context():
        # Find market
        if market_id:
            market = Market.query.get(market_id)
        elif market_name:
            market = Market.query.filter_by(name=market_name).first()
        else:
            print("Error: Please provide either market_name or market_id")
            return
        
        if not market:
            print(f"Error: Market not found")
            return
        
        print("=" * 80)
        print(f"FIFO DIAGNOSTIC REPORT FOR MARKET: {market.name} (ID: {market.id})")
        print(f"Calculation Method: {market.calculation_method}")
        print("=" * 80)
        print()
        
        # 1. CHECK PURCHASES VS BATCHES
        print("1. PURCHASES VS BATCHES")
        print("-" * 80)
        
        # Get all purchase items
        purchase_items = db.session.query(PurchaseItem, PurchaseContainer).join(
            PurchaseContainer, PurchaseItem.container_id == PurchaseContainer.id
        ).filter(PurchaseContainer.market_id == market.id).all()
        
        total_purchase_items = len(purchase_items)
        total_purchase_quantity = sum(float(pi.quantity) for pi, pc in purchase_items)
        
        # Get all batches
        batches = InventoryBatch.query.filter_by(market_id=market.id).all()
        total_batches = len(batches)
        total_batch_original_quantity = sum(float(b.original_quantity) for b in batches)
        total_batch_available_quantity = sum(float(b.available_quantity) for b in batches)
        
        print(f"Total Purchase Items: {total_purchase_items}")
        print(f"Total Purchase Quantity: {total_purchase_quantity:,.2f}")
        print(f"Total Batches Created: {total_batches}")
        print(f"Total Batch Original Quantity: {total_batch_original_quantity:,.2f}")
        print(f"Total Batch Available Quantity: {total_batch_available_quantity:,.2f}")
        print()
        
        # Check which purchase items don't have batches
        purchase_items_without_batches = []
        for purchase_item, container in purchase_items:
            batch = InventoryBatch.query.filter_by(
                market_id=market.id,
                purchase_item_id=purchase_item.id
            ).first()
            if not batch:
                purchase_items_without_batches.append({
                    'item_id': purchase_item.item_id,
                    'item_code': purchase_item.item.code if purchase_item.item else 'N/A',
                    'container_id': container.id,
                    'container_number': container.container_number,
                    'quantity': float(purchase_item.quantity)
                })
        
            if purchase_items_without_batches:
                print(f"[WARNING] {len(purchase_items_without_batches)} purchase items without batches:")
            for pi in purchase_items_without_batches[:10]:  # Show first 10
                print(f"   - Item {pi['item_code']} (ID: {pi['item_id']}) in Container {pi['container_number']}: {pi['quantity']:,.2f}")
            if len(purchase_items_without_batches) > 10:
                print(f"   ... and {len(purchase_items_without_batches) - 10} more")
        else:
            print("[OK] All purchase items have batches")
        print()
        
        # 2. CHECK SALES VS ALLOCATIONS
        print("2. SALES VS ALLOCATIONS")
        print("-" * 80)
        
        # Get all sale items
        sale_items = db.session.query(SaleItem, Sale).join(
            Sale, SaleItem.sale_id == Sale.id
        ).filter(Sale.market_id == market.id).all()
        
        total_sale_items = len(sale_items)
        total_sale_quantity = sum(float(si.quantity) for si, s in sale_items)
        
        # Get all allocations
        allocations = db.session.query(SaleItemAllocation).join(
            SaleItem, SaleItemAllocation.sale_item_id == SaleItem.id
        ).join(
            Sale, SaleItem.sale_id == Sale.id
        ).filter(Sale.market_id == market.id).all()
        
        total_allocations = len(allocations)
        total_allocated_quantity = sum(float(a.quantity) for a in allocations)
        
        print(f"Total Sale Items: {total_sale_items}")
        print(f"Total Sale Quantity: {total_sale_quantity:,.2f}")
        print(f"Total Allocations Created: {total_allocations}")
        print(f"Total Allocated Quantity: {total_allocated_quantity:,.2f}")
        print()
        
        # Check which sale items don't have allocations
        sale_items_without_allocations = []
        for sale_item, sale in sale_items:
            allocation = SaleItemAllocation.query.filter_by(sale_item_id=sale_item.id).first()
            if not allocation:
                sale_items_without_allocations.append({
                    'sale_item_id': sale_item.id,
                    'item_id': sale_item.item_id,
                    'item_code': sale_item.item.code if sale_item.item else 'N/A',
                    'invoice_number': sale.invoice_number,
                    'sale_date': sale.date.isoformat(),
                    'quantity': float(sale_item.quantity)
                })
        
        if sale_items_without_allocations:
            print(f"[WARNING] {len(sale_items_without_allocations)} sale items without allocations:")
            for si in sale_items_without_allocations[:10]:  # Show first 10
                print(f"   - Item {si['item_code']} (ID: {si['item_id']}) in Sale {si['invoice_number']} ({si['sale_date']}): {si['quantity']:,.2f}")
            if len(sale_items_without_allocations) > 10:
                print(f"   ... and {len(sale_items_without_allocations) - 10} more")
        else:
            print("[OK] All sale items have allocations")
        print()
        
        # 3. CHECK ITEM-LEVEL DISCREPANCIES
        print("3. ITEM-LEVEL DISCREPANCIES")
        print("-" * 80)
        
        # Get all items
        items = Item.query.filter_by(market_id=market.id).all()
        
        # Get purchases per item
        purchase_totals = dict(db.session.query(
            PurchaseItem.item_id,
            func.coalesce(func.sum(PurchaseItem.quantity), 0)
        ).join(PurchaseContainer, PurchaseItem.container_id == PurchaseContainer.id).filter(
            PurchaseContainer.market_id == market.id
        ).group_by(PurchaseItem.item_id).all())
        
        # Get sales per item
        sale_totals = dict(db.session.query(
            SaleItem.item_id,
            func.coalesce(func.sum(SaleItem.quantity), 0)
        ).join(Sale, SaleItem.sale_id == Sale.id).filter(
            Sale.market_id == market.id
        ).group_by(SaleItem.item_id).all())
        
        # Get adjustments per item
        adjustments_map = {}
        try:
            adjustments_q = db.session.query(
                InventoryAdjustment.item_id,
                func.sum(
                    case(
                        (InventoryAdjustment.adjustment_type == 'Increase', InventoryAdjustment.quantity),
                        else_=-InventoryAdjustment.quantity
                    )
                )
            ).filter(InventoryAdjustment.market_id == market.id).group_by(
                InventoryAdjustment.item_id
            ).all()
            adjustments_map = {item_id: float(qty) for item_id, qty in adjustments_q}
        except Exception as e:
            print(f"Warning: Could not load inventory adjustments: {e}")
        
        # Get FIFO calculated quantity (from batches)
        fifo_quantities = {}
        for item in items:
            batches = InventoryBatch.query.filter_by(
                market_id=market.id,
                item_id=item.id
            ).filter(InventoryBatch.available_quantity > 0).all()
            
            batch_qty = sum(float(b.available_quantity) for b in batches)
            
            # Add adjustments
            adjustment_qty = adjustments_map.get(item.id, 0)
            fifo_qty = batch_qty + adjustment_qty
            fifo_quantities[item.id] = fifo_qty
        
        # Calculate actual quantity (purchases - sales + adjustments)
        discrepancies = []
        total_fifo_qty = 0
        total_actual_qty = 0
        
        for item in items:
            purchases_qty = float(purchase_totals.get(item.id, 0))
            sales_qty = float(sale_totals.get(item.id, 0))
            adjustment_qty = adjustments_map.get(item.id, 0)
            actual_qty = purchases_qty - sales_qty + adjustment_qty
            
            fifo_qty = fifo_quantities.get(item.id, 0)
            difference = fifo_qty - actual_qty
            
            total_fifo_qty += fifo_qty
            total_actual_qty += actual_qty
            
            if abs(difference) > 0.01:  # More than 0.01 difference
                discrepancies.append({
                    'item_id': item.id,
                    'item_code': item.code,
                    'item_name': item.name,
                    'purchases': purchases_qty,
                    'sales': sales_qty,
                    'adjustments': adjustment_qty,
                    'actual_qty': actual_qty,
                    'fifo_qty': fifo_qty,
                    'difference': difference
                })
        
        print(f"Total Items: {len(items)}")
        print(f"Total FIFO Quantity (from batches): {total_fifo_qty:,.2f}")
        print(f"Total Actual Quantity (purchases - sales + adjustments): {total_actual_qty:,.2f}")
        print(f"Overall Difference: {total_fifo_qty - total_actual_qty:,.2f}")
        print()
        
        if discrepancies:
            print(f"[WARNING] FOUND {len(discrepancies)} ITEMS WITH DISCREPANCIES:")
            print()
            print(f"{'Item Code':<15} {'Item Name':<30} {'Purchases':>12} {'Sales':>12} {'Adj':>8} {'Actual':>12} {'FIFO':>12} {'Diff':>12}")
            print("-" * 120)
            
            # Sort by absolute difference (largest first)
            discrepancies.sort(key=lambda x: abs(x['difference']), reverse=True)
            
            for disc in discrepancies:
                print(f"{disc['item_code']:<15} {disc['item_name'][:28]:<30} "
                      f"{disc['purchases']:>12,.2f} {disc['sales']:>12,.2f} "
                      f"{disc['adjustments']:>8,.2f} {disc['actual_qty']:>12,.2f} "
                      f"{disc['fifo_qty']:>12,.2f} {disc['difference']:>12,.2f}")
        else:
            print("[OK] No discrepancies found - all items match!")
        print()
        
        # 4. SUMMARY AND RECOMMENDATIONS
        print("4. SUMMARY AND RECOMMENDATIONS")
        print("-" * 80)
        
        issues_found = []
        
        if purchase_items_without_batches:
            issues_found.append(f"{len(purchase_items_without_batches)} purchase items without batches")
        
        if sale_items_without_allocations:
            issues_found.append(f"{len(sale_items_without_allocations)} sale items without allocations")
        
        if discrepancies:
            issues_found.append(f"{len(discrepancies)} items with quantity discrepancies")
        
        if abs(total_fifo_qty - total_actual_qty) > 0.01:
            issues_found.append(f"Overall quantity mismatch: {total_fifo_qty - total_actual_qty:,.2f}")
        
        if issues_found:
            print("[WARNING] ISSUES FOUND:")
            for issue in issues_found:
                print(f"   - {issue}")
            print()
            print("RECOMMENDED ACTIONS:")
            print("   1. Run 'backfill_fifo_batches' to create batches for all purchases")
            print("   2. Run 'backfill_fifo_allocations' to recalculate all sales allocations")
            print("   3. Verify inventory adjustments are correct")
        else:
            print("[OK] No issues found - FIFO allocations are correct!")
        
        print()
        print("=" * 80)

if __name__ == '__main__':
    import sys
    
    if len(sys.argv) > 1:
        # Try as market name first
        market_name = sys.argv[1]
        diagnose_fifo_allocations(market_name=market_name)
    else:
        # Default: check Tanzania (Yasser) market
        diagnose_fifo_allocations(market_name='Tanzania')
