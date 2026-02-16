"""
Report script to show unallocated sales (sales that couldn't be allocated to batches)
This helps identify oversold items and data integrity issues
"""

from app import app, db
from models import Market, Item, Sale, SaleItem, SaleItemAllocation, Company
from sqlalchemy import func
from decimal import Decimal
import csv
from datetime import datetime

def generate_unallocated_sales_report(market_name=None, market_id=None, output_format='console'):
    """Generate a report of unallocated sales"""
    
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
        
        print("=" * 100)
        print(f"UNALLOCATED SALES REPORT FOR MARKET: {market.name} (ID: {market.id})")
        print(f"Calculation Method: {market.calculation_method}")
        print("=" * 100)
        print()
        
        if market.calculation_method != 'FIFO':
            print(f"[WARNING] Market is not using FIFO method. Current method: {market.calculation_method}")
            print("This report is only relevant for FIFO markets.")
            print()
        
        # Get all sale items
        sale_items = db.session.query(SaleItem, Sale).join(
            Sale, SaleItem.sale_id == Sale.id
        ).filter(Sale.market_id == market.id).order_by(
            Sale.date.asc(), Sale.id.asc()
        ).all()
        
        # Get all allocations
        allocations = db.session.query(SaleItemAllocation).join(
            SaleItem, SaleItemAllocation.sale_item_id == SaleItem.id
        ).join(
            Sale, SaleItem.sale_id == Sale.id
        ).filter(Sale.market_id == market.id).all()
        
        # Create a map of allocated quantities per sale item
        allocated_qty_map = {}
        for allocation in allocations:
            sale_item_id = allocation.sale_item_id
            if sale_item_id not in allocated_qty_map:
                allocated_qty_map[sale_item_id] = 0
            allocated_qty_map[sale_item_id] += float(allocation.quantity)
        
        # Find ALL sale items with unallocated quantities (including partially allocated)
        unallocated_sales = []
        for sale_item, sale in sale_items:
            # Calculate how much was allocated (0 if no allocations exist)
            allocated_qty = allocated_qty_map.get(sale_item.id, 0)
            unallocated_qty = float(sale_item.quantity) - allocated_qty
            
            # Only include if there's an unallocated quantity
            if unallocated_qty > 0.01:  # More than 0.01 to account for rounding
                # Get item details
                item = Item.query.get(sale_item.item_id)
                
                # Get customer details
                customer = Company.query.get(sale.customer_id)
                
                # Get supplier details
                supplier = Company.query.get(sale.supplier_id) if sale.supplier_id else None
                
                # Get purchase quantity for this item
                from models import PurchaseItem, PurchaseContainer
                purchase_qty = db.session.query(
                    func.coalesce(func.sum(PurchaseItem.quantity), 0)
                ).join(
                    PurchaseContainer, PurchaseItem.container_id == PurchaseContainer.id
                ).filter(
                    PurchaseContainer.market_id == market.id,
                    PurchaseItem.item_id == sale_item.item_id
                ).scalar() or 0
                
                # Get total sales quantity for this item
                total_sales_qty = db.session.query(
                    func.coalesce(func.sum(SaleItem.quantity), 0)
                ).join(
                    Sale, SaleItem.sale_id == Sale.id
                ).filter(
                    Sale.market_id == market.id,
                    SaleItem.item_id == sale_item.item_id
                ).scalar() or 0
                
                unallocated_sales.append({
                    'sale_id': sale.id,
                    'invoice_number': sale.invoice_number,
                    'sale_date': sale.date.isoformat(),
                    'item_id': sale_item.item_id,
                    'item_code': item.code if item else 'N/A',
                    'item_name': item.name if item else 'N/A',
                    'quantity': float(sale_item.quantity),
                    'unit_price': float(sale_item.unit_price),
                    'total_price': float(sale_item.total_price),
                    'allocated_quantity': allocated_qty,
                    'unallocated_quantity': unallocated_qty,
                    'customer_id': sale.customer_id,
                    'customer_name': customer.name if customer else 'N/A',
                    'supplier_id': sale.supplier_id,
                    'supplier_name': supplier.name if supplier else 'N/A',
                    'purchase_quantity': float(purchase_qty),
                    'total_sales_quantity': float(total_sales_qty),
                    'oversold_by': float(total_sales_qty) - float(purchase_qty)
                })
        
        print(f"Total Sale Items: {len(sale_items)}")
        print(f"Unallocated Sale Items: {len(unallocated_sales)}")
        print(f"Total Unallocated Quantity: {sum(s['unallocated_quantity'] for s in unallocated_sales):,.2f}")
        print()
        
        if not unallocated_sales:
            print("[OK] No unallocated sales found!")
            return
        
        # Group by item to show summary
        item_summary = {}
        for sale in unallocated_sales:
            item_id = sale['item_id']
            if item_id not in item_summary:
                item_summary[item_id] = {
                    'item_code': sale['item_code'],
                    'item_name': sale['item_name'],
                    'purchase_quantity': sale['purchase_quantity'],
                    'total_sales_quantity': sale['total_sales_quantity'],
                    'oversold_by': sale['oversold_by'],
                    'unallocated_count': 0,
                    'unallocated_quantity': 0
                }
            item_summary[item_id]['unallocated_count'] += 1
            item_summary[item_id]['unallocated_quantity'] += sale['unallocated_quantity']
        
        print("SUMMARY BY ITEM:")
        print("-" * 100)
        print(f"{'Item Code':<20} {'Item Name':<40} {'Purchased':>12} {'Sold':>12} {'Oversold':>12} {'Unalloc Qty':>12} {'Count':>8}")
        print("-" * 100)
        
        # Sort by oversold quantity (largest first)
        sorted_items = sorted(item_summary.items(), key=lambda x: x[1]['oversold_by'], reverse=True)
        
        for item_id, summary in sorted_items:
            print(f"{summary['item_code']:<20} {summary['item_name'][:38]:<40} "
                  f"{summary['purchase_quantity']:>12,.2f} {summary['total_sales_quantity']:>12,.2f} "
                  f"{summary['oversold_by']:>12,.2f} {summary['unallocated_quantity']:>12,.2f} "
                  f"{summary['unallocated_count']:>8}")
        print()
        
        # Detailed report
        print("DETAILED UNALLOCATED SALES:")
        print("-" * 100)
        print(f"{'Invoice':<20} {'Date':<12} {'Item Code':<20} {'Item Name':<30} {'Qty':>8} {'Price':>12} {'Customer':<30}")
        print("-" * 100)
        
        # Sort by date, then invoice number
        unallocated_sales.sort(key=lambda x: (x['sale_date'], x['invoice_number']))
        
        for sale in unallocated_sales:
            print(f"{sale['invoice_number']:<20} {sale['sale_date']:<12} "
                  f"{sale['item_code']:<20} {sale['item_name'][:28]:<30} "
                  f"{sale['unallocated_quantity']:>8,.2f} {sale['unit_price']:>12,.2f} "
                  f"{sale['customer_name'][:28]:<30}")
        
        print()
        print("=" * 100)
        
        # Export to CSV if requested
        if output_format == 'csv':
            filename = f"unallocated_sales_{market.name.replace(' ', '_')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
                fieldnames = [
                    'sale_id', 'invoice_number', 'sale_date', 'item_id', 'item_code', 'item_name',
                    'quantity', 'unit_price', 'total_price', 'allocated_quantity',
                    'unallocated_quantity', 'customer_id', 'customer_name', 
                    'supplier_id', 'supplier_name',
                    'purchase_quantity', 'total_sales_quantity', 'oversold_by'
                ]
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                writer.writeheader()
                for sale in unallocated_sales:
                    writer.writerow(sale)
            print(f"[OK] Report exported to: {filename}")
        
        return unallocated_sales

if __name__ == '__main__':
    import sys
    
    output_format = 'console'
    if len(sys.argv) > 2 and sys.argv[2].lower() == 'csv':
        output_format = 'csv'
    
    if len(sys.argv) > 1:
        market_name = sys.argv[1]
        generate_unallocated_sales_report(market_name=market_name, output_format=output_format)
    else:
        # Default: Tanzania (Yasser) market
        generate_unallocated_sales_report(market_name='TANZANYA ( YASSER ) ', output_format=output_format)
