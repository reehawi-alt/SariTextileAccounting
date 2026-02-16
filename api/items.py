"""
Items API endpoints
"""
from flask import Blueprint, request, jsonify, session, send_file
from flask_login import login_required
from models import db, Item, Market, PurchaseItem, SaleItem, PurchaseContainer, Sale
from decimal import Decimal
import pandas as pd
from io import BytesIO
from sqlalchemy import func, or_, case

bp = Blueprint('items', __name__)

@bp.route('', methods=['GET'])
@login_required
def get_items():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    supplier_id = request.args.get('supplier_id', type=int)
    include_all = request.args.get('include_all', type=bool, default=False)
    # For sales: if True, include items without supplier_id when a supplier is selected
    include_no_supplier = request.args.get('include_no_supplier', type=bool, default=False)
    
    query = Item.query.filter_by(market_id=market_id)
    if supplier_id is not None and not include_all:
        # If supplier_id is provided and not 0, filter by it
        # If supplier_id is 0 or None and include_all is False, show only items with NULL supplier_id
        if supplier_id == 0:
            query = query.filter(Item.supplier_id.is_(None))
        else:
            # Show items with this supplier_id, and optionally items with no supplier_id
            if include_no_supplier:
                query = query.filter(or_(Item.supplier_id == supplier_id, Item.supplier_id.is_(None)))
            else:
                query = query.filter_by(supplier_id=supplier_id)
    
    items = query.all()
    return jsonify([{
        'id': i.id,
        'code': i.code,
        'name': i.name,
        'weight': float(i.weight),
        'grade': i.grade,
        'category1': i.category1,
        'category2': i.category2,
        'supplier_id': i.supplier_id
    } for i in items])

@bp.route('/summary', methods=['GET'])
@login_required
def get_items_summary():
    """Return items with aggregated purchases/sales and available quantity."""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400

    supplier_id = request.args.get('supplier_id', type=int)
    
    query = Item.query.filter_by(market_id=market_id)
    # Handle supplier filtering properly
    if supplier_id is not None:
        if supplier_id == 0:
            # Show items with NULL supplier_id (no supplier assigned)
            query = query.filter(Item.supplier_id.is_(None))
        else:
            # Show items for specific supplier
            query = query.filter_by(supplier_id=supplier_id)
    # If supplier_id is None/empty, show all items
    
    items = query.all()

    # Purchases qty per item
    purchase_q = db.session.query(
        PurchaseItem.item_id,
        func.coalesce(func.sum(PurchaseItem.quantity), 0)
    ).join(PurchaseContainer, PurchaseItem.container_id == PurchaseContainer.id) \
     .filter(PurchaseContainer.market_id == market_id) \
     .group_by(PurchaseItem.item_id).all()
    purchase_map = {item_id: qty for item_id, qty in purchase_q}

    # Sales qty per item
    sales_q = db.session.query(
        SaleItem.item_id,
        func.coalesce(func.sum(SaleItem.quantity), 0)
    ).join(Sale, SaleItem.sale_id == Sale.id) \
     .filter(Sale.market_id == market_id) \
     .group_by(SaleItem.item_id).all()
    sales_map = {item_id: qty for item_id, qty in sales_q}

    # Get inventory adjustments per item
    from models import InventoryAdjustment
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
        ).filter(InventoryAdjustment.market_id == market_id) \
         .group_by(InventoryAdjustment.item_id).all()
        adjustments_map = {item_id: float(qty) for item_id, qty in adjustments_q}
    except Exception as e:
        # If table doesn't exist or query fails, just use empty map
        # This allows the page to load even if adjustments table hasn't been created yet
        print(f"Warning: Could not load inventory adjustments: {e}")
        adjustments_map = {}

    result = []
    for i in items:
        purchases_qty = float(purchase_map.get(i.id, 0))
        sales_qty = float(sales_map.get(i.id, 0))
        adjustment_qty = adjustments_map.get(i.id, 0)
        available = purchases_qty - sales_qty + adjustment_qty
        result.append({
            'id': i.id,
            'code': i.code,
            'name': i.name,
            'weight': float(i.weight),
            'grade': i.grade,
            'category1': i.category1,
            'category2': i.category2,
            'supplier_id': i.supplier_id,
            'total_purchases': purchases_qty,
            'total_sales': sales_qty,
            'available_quantity': available
        })

    return jsonify(result)

@bp.route('', methods=['POST'])
@login_required
def create_item():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    data = request.json
    
    # Check if code already exists
    existing = Item.query.filter_by(market_id=market_id, code=data['code']).first()
    if existing:
        return jsonify({'error': 'Item code already exists'}), 400
    
    item = Item(
        market_id=market_id,
        code=data['code'],
        name=data['name'],
        weight=Decimal(str(data['weight'])),
        grade=data.get('grade'),
        category1=data.get('category1'),
        category2=data.get('category2')
    )
    
    db.session.add(item)
    db.session.commit()
    
    return jsonify({
        'id': item.id,
        'code': item.code,
        'name': item.name,
        'weight': float(item.weight),
        'grade': item.grade,
        'category1': item.category1,
        'category2': item.category2
    }), 201

@bp.route('/<int:item_id>', methods=['GET'])
@login_required
def get_item(item_id):
    market_id = session.get('current_market_id')
    item = Item.query.filter_by(id=item_id, market_id=market_id).first()
    
    if not item:
        return jsonify({'error': 'Item not found'}), 404
    
    return jsonify({
        'id': item.id,
        'code': item.code,
        'name': item.name,
        'weight': float(item.weight),
        'grade': item.grade,
        'category1': item.category1,
        'category2': item.category2
    })

@bp.route('/<int:item_id>', methods=['PUT'])
@login_required
def update_item(item_id):
    market_id = session.get('current_market_id')
    item = Item.query.filter_by(id=item_id, market_id=market_id).first()
    
    if not item:
        return jsonify({'error': 'Item not found'}), 404
    
    data = request.json
    
    # Check code uniqueness if changed
    if data.get('code') and data['code'] != item.code:
        existing = Item.query.filter_by(market_id=market_id, code=data['code']).first()
        if existing:
            return jsonify({'error': 'Item code already exists'}), 400
        item.code = data['code']
    
    item.name = data.get('name', item.name)
    item.weight = Decimal(str(data.get('weight', item.weight)))
    item.grade = data.get('grade', item.grade)
    item.category1 = data.get('category1', item.category1)
    item.category2 = data.get('category2', item.category2)
    
    db.session.commit()
    
    return jsonify({
        'id': item.id,
        'code': item.code,
        'name': item.name,
        'weight': float(item.weight),
        'grade': item.grade,
        'category1': item.category1,
        'category2': item.category2
    })

@bp.route('/<int:item_id>', methods=['DELETE'])
@login_required
def delete_item(item_id):
    market_id = session.get('current_market_id')
    item = Item.query.filter_by(id=item_id, market_id=market_id).first()
    
    if not item:
        return jsonify({'error': 'Item not found'}), 404
    
    # Check if item has transactions
    has_purchases = PurchaseItem.query.filter_by(item_id=item_id).first()
    has_sales = SaleItem.query.filter_by(item_id=item_id).first()
    
    if has_purchases or has_sales:
        return jsonify({'error': 'Cannot delete item with existing transactions'}), 400
    
    db.session.delete(item)
    db.session.commit()
    
    return jsonify({'success': True})

@bp.route('/import', methods=['POST'])
@login_required
def import_items():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if not file or file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    # Check file extension
    if not (file.filename.endswith('.xlsx') or file.filename.endswith('.xls')):
        return jsonify({'error': 'Invalid file type. Please upload an Excel file (.xlsx or .xls)'}), 400
    
    try:
        # Read the Excel file
        try:
            # Try openpyxl first (for .xlsx)
            if file.filename.endswith('.xlsx'):
                df = pd.read_excel(file, engine='openpyxl')
            else:
                # For .xls, try without engine first, then with xlrd if available
                try:
                    df = pd.read_excel(file)
                except:
                    df = pd.read_excel(file, engine='xlrd')
        except Exception as e:
            return jsonify({'error': f'Error reading Excel file: {str(e)}. Please ensure the file is a valid Excel file (.xlsx or .xls)'}), 400
        
        # Check if dataframe is empty
        if df.empty:
            return jsonify({'error': 'Excel file is empty'}), 400
        
        # Validate required columns (case-insensitive)
        df.columns = df.columns.str.strip()
        required_cols = ['Code', 'Name', 'Weight']
        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            return jsonify({'error': f'Missing columns: {", ".join(missing_cols)}. Found columns: {", ".join(df.columns.tolist())}'}), 400
        
        errors = []
        imported = []
        codes_seen_in_file = {}  # Track codes we've seen in this import to detect duplicates within file
        
        # Process each row
        for idx, row in df.iterrows():
            code = str(row['Code']).strip()
            name = str(row['Name']).strip()
            weight = row['Weight']
            
            if not code or not name:
                errors.append(f'Row {idx + 2}: Missing code or name')
                continue
            
            # Check for duplicate codes within the Excel file itself
            if code in codes_seen_in_file:
                errors.append(f'Row {idx + 2}: Duplicate code "{code}" in Excel file (first seen at row {codes_seen_in_file[code]})')
                continue
            codes_seen_in_file[code] = idx + 2  # Store row number (Excel row, not 0-indexed)
            
            try:
                # Get supplier_id from Excel if provided, otherwise None
                supplier_id = None
                if 'Supplier' in df.columns and pd.notna(row.get('Supplier')):
                    supplier_name = str(row.get('Supplier')).strip()
                    # Try to find supplier by name
                    from models import Company
                    supplier = Company.query.filter_by(market_id=market_id, name=supplier_name, category='Supplier').first()
                    if supplier:
                        supplier_id = supplier.id
                    else:
                        errors.append(f'Row {idx + 2}: Supplier "{supplier_name}" not found')
                        continue
                
                # Check if item with this code and supplier_id already exists
                # The unique constraint is on (market_id, supplier_id, code)
                # Need to handle NULL supplier_id correctly
                query = Item.query.filter_by(market_id=market_id, code=code)
                if supplier_id is None:
                    # Use IS NULL for NULL supplier_id
                    query = query.filter(Item.supplier_id.is_(None))
                else:
                    query = query.filter_by(supplier_id=supplier_id)
                
                existing = query.first()
                
                if existing:
                    # Skip if item already exists (don't create duplicates)
                    supplier_info = f"supplier_id={existing.supplier_id}" if existing.supplier_id else "no supplier"
                    errors.append(f'Row {idx + 2}: Item with code "{code}" already exists ({supplier_info})')
                    continue
                
                # Create new item
                item = Item(
                    market_id=market_id,
                    code=code,
                    name=name,
                    weight=Decimal(str(weight)),
                    supplier_id=supplier_id,
                    grade=str(row.get('Grade', '')).strip() if pd.notna(row.get('Grade')) else None,
                    category1=str(row.get('Category1', '')).strip() if pd.notna(row.get('Category1')) else None,
                    category2=str(row.get('Category2', '')).strip() if pd.notna(row.get('Category2')) else None
                )
                db.session.add(item)
                imported.append(code)
            except Exception as e:
                # Check if it's a unique constraint violation
                error_msg = str(e)
                if 'unique' in error_msg.lower() or 'duplicate' in error_msg.lower():
                    errors.append(f'Row {idx + 2}: Item with code "{code}" already exists (duplicate)')
                else:
                    errors.append(f'Row {idx + 2}: {error_msg}')
        
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': f'Error committing to database: {str(e)}'}), 400
        
        return jsonify({
            'success': True,
            'imported': len(imported),
            'errors': errors,
            'imported_codes': imported
        })
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Error reading file: {str(e)}'}), 400

@bp.route('/stock-movement', methods=['GET'])
@login_required
def get_stock_movement():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    item_id = request.args.get('item_id', type=int)
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    movement_type = request.args.get('type')  # 'purchases', 'sales', 'both'
    
    from datetime import datetime
    from models import PurchaseItem, SaleItem, PurchaseContainer, Sale
    
    movements = []
    
    # Purchases
    if movement_type in [None, 'purchases', 'both']:
        query = db.session.query(PurchaseItem, PurchaseContainer).join(
            PurchaseContainer, PurchaseItem.container_id == PurchaseContainer.id
        ).filter(PurchaseContainer.market_id == market_id)
        
        if item_id:
            query = query.filter(PurchaseItem.item_id == item_id)
        if start_date:
            query = query.filter(PurchaseContainer.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
        if end_date:
            query = query.filter(PurchaseContainer.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
        
        for item, container in query.all():
            movements.append({
                'date': container.date.isoformat(),
                'type': 'Purchase',
                'item_code': item.item.code,
                'item_name': item.item.name,
                'quantity': float(item.quantity),
                'unit_price': float(item.unit_price),
                'total_price': float(item.total_price),
                'container_number': container.container_number,
                'container_id': container.id,
                'currency': container.currency
            })
    
    # Sales
    if movement_type in [None, 'sales', 'both']:
        query = db.session.query(SaleItem, Sale).join(
            Sale, SaleItem.sale_id == Sale.id
        ).filter(Sale.market_id == market_id)
        
        if item_id:
            query = query.filter(SaleItem.item_id == item_id)
        if start_date:
            query = query.filter(Sale.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
        if end_date:
            query = query.filter(Sale.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
        
        for item, sale in query.all():
            movements.append({
                'date': sale.date.isoformat(),
                'type': 'Sale',
                'item_code': item.item.code,
                'item_name': item.item.name,
                'quantity': float(item.quantity),
                'unit_price': float(item.unit_price),
                'total_price': float(item.total_price),
                'invoice_number': sale.invoice_number,
                'sale_id': sale.id,
                'currency': sale.customer.currency
            })
    
    # Sort by date
    movements.sort(key=lambda x: x['date'])
    
    return jsonify(movements)

@bp.route('/<int:item_id>/price-breakdown', methods=['GET'])
@login_required
def get_item_price_breakdown(item_id):
    """Get unique purchase and sales prices breakdown for an item"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    from datetime import datetime
    
    # Verify item belongs to market
    item = Item.query.filter_by(id=item_id, market_id=market_id).first()
    if not item:
        return jsonify({'error': 'Item not found'}), 404
    
    # Get purchase prices breakdown
    purchase_query = db.session.query(
        PurchaseItem.unit_price,
        PurchaseContainer.currency,
        func.sum(PurchaseItem.quantity).label('total_quantity'),
        func.sum(PurchaseItem.total_price).label('total_amount')
    ).join(
        PurchaseContainer, PurchaseItem.container_id == PurchaseContainer.id
    ).filter(
        PurchaseContainer.market_id == market_id,
        PurchaseItem.item_id == item_id
    )
    
    if start_date:
        purchase_query = purchase_query.filter(
            PurchaseContainer.date >= datetime.strptime(start_date, '%Y-%m-%d').date()
        )
    if end_date:
        purchase_query = purchase_query.filter(
            PurchaseContainer.date <= datetime.strptime(end_date, '%Y-%m-%d').date()
        )
    
    purchase_prices = purchase_query.group_by(
        PurchaseItem.unit_price, PurchaseContainer.currency
    ).all()
    
    # Get sales prices breakdown
    from models import Company
    sales_query = db.session.query(
        SaleItem.unit_price,
        Company.currency,
        func.sum(SaleItem.quantity).label('total_quantity'),
        func.sum(SaleItem.total_price).label('total_amount')
    ).join(
        Sale, SaleItem.sale_id == Sale.id
    ).join(
        Company, Sale.customer_id == Company.id
    ).filter(
        Sale.market_id == market_id,
        SaleItem.item_id == item_id
    )
    
    if start_date:
        sales_query = sales_query.filter(
            Sale.date >= datetime.strptime(start_date, '%Y-%m-%d').date()
        )
    if end_date:
        sales_query = sales_query.filter(
            Sale.date <= datetime.strptime(end_date, '%Y-%m-%d').date()
        )
    
    sales_prices = sales_query.group_by(
        SaleItem.unit_price, Company.currency
    ).all()
    
    purchase_prices_list = [{
        'unit_price': float(price),
        'currency': currency,
        'total_quantity': float(qty),
        'total_amount': float(amount)
    } for price, currency, qty, amount in purchase_prices]
    
    sales_prices_list = [{
        'unit_price': float(price),
        'currency': currency,
        'total_quantity': float(qty),
        'total_amount': float(amount)
    } for price, currency, qty, amount in sales_prices]
    
    # Sort by unit price
    purchase_prices_list.sort(key=lambda x: x['unit_price'])
    sales_prices_list.sort(key=lambda x: x['unit_price'])
    
    return jsonify({
        'purchase_prices': purchase_prices_list,
        'sales_prices': sales_prices_list
    })

@bp.route('/stock-movement/export', methods=['GET'])
@login_required
def export_stock_movement():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    item_id = request.args.get('item_id', type=int)
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    movement_type = request.args.get('type')
    
    from datetime import datetime
    from models import PurchaseItem, SaleItem, PurchaseContainer, Sale
    
    movements = []
    
    if movement_type in [None, 'purchases', 'both']:
        query = db.session.query(PurchaseItem, PurchaseContainer).join(
            PurchaseContainer, PurchaseItem.container_id == PurchaseContainer.id
        ).filter(PurchaseContainer.market_id == market_id)
        
        if item_id:
            query = query.filter(PurchaseItem.item_id == item_id)
        if start_date:
            query = query.filter(PurchaseContainer.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
        if end_date:
            query = query.filter(PurchaseContainer.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
        
        for item, container in query.all():
            movements.append({
                'Date': container.date.isoformat(),
                'Type': 'Purchase',
                'Item Code': item.item.code,
                'Item Name': item.item.name,
                'Quantity': float(item.quantity),
                'Unit Price': float(item.unit_price),
                'Total Price': float(item.total_price),
                'Container Number': container.container_number,
                'Currency': container.currency
            })
    
    if movement_type in [None, 'sales', 'both']:
        query = db.session.query(SaleItem, Sale).join(
            Sale, SaleItem.sale_id == Sale.id
        ).filter(Sale.market_id == market_id)
        
        if item_id:
            query = query.filter(SaleItem.item_id == item_id)
        if start_date:
            query = query.filter(Sale.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
        if end_date:
            query = query.filter(Sale.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
        
        for item, sale in query.all():
            movements.append({
                'Date': sale.date.isoformat(),
                'Type': 'Sale',
                'Item Code': item.item.code,
                'Item Name': item.item.name,
                'Quantity': float(item.quantity),
                'Unit Price': float(item.unit_price),
                'Total Price': float(item.total_price),
                'Invoice Number': sale.invoice_number,
                'Currency': sale.customer.currency
            })
    
    movements.sort(key=lambda x: x['Date'])
    
    df = pd.DataFrame(movements)
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name='Stock Movement', index=False)
    
    output.seek(0)
    filename = f'inventory_movement_{start_date or "all"}_{end_date or "all"}.xlsx'
    return send_file(output, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    as_attachment=True, download_name=filename)

@bp.route('/export', methods=['GET'])
@login_required
def export_items():
    """Export items summary to Excel"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    supplier_id = request.args.get('supplier_id', type=int)
    
    # Get items summary (same logic as get_items_summary)
    query = Item.query.filter_by(market_id=market_id)
    if supplier_id is not None:
        if supplier_id == 0:
            query = query.filter(Item.supplier_id.is_(None))
        else:
            query = query.filter_by(supplier_id=supplier_id)
    
    items = query.all()
    
    # Get supplier names
    from models import Company
    supplier_ids = [i.supplier_id for i in items if i.supplier_id]
    suppliers = {s.id: s.name for s in Company.query.filter(Company.id.in_(supplier_ids)).all()} if supplier_ids else {}
    
    # Purchases qty per item
    purchase_q = db.session.query(
        PurchaseItem.item_id,
        func.coalesce(func.sum(PurchaseItem.quantity), 0)
    ).join(PurchaseContainer, PurchaseItem.container_id == PurchaseContainer.id) \
     .filter(PurchaseContainer.market_id == market_id) \
     .group_by(PurchaseItem.item_id).all()
    purchase_map = {item_id: qty for item_id, qty in purchase_q}
    
    # Sales qty per item
    sales_q = db.session.query(
        SaleItem.item_id,
        func.coalesce(func.sum(SaleItem.quantity), 0)
    ).join(Sale, SaleItem.sale_id == Sale.id) \
     .filter(Sale.market_id == market_id) \
     .group_by(SaleItem.item_id).all()
    sales_map = {item_id: qty for item_id, qty in sales_q}
    
    # Get inventory adjustments per item
    from models import InventoryAdjustment
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
        ).filter(InventoryAdjustment.market_id == market_id) \
         .group_by(InventoryAdjustment.item_id).all()
        adjustments_map = {item_id: float(qty) for item_id, qty in adjustments_q}
    except Exception:
        adjustments_map = {}
    
    # Prepare Excel data
    export_rows = []
    for item in items:
        purchases_qty = float(purchase_map.get(item.id, 0))
        sales_qty = float(sales_map.get(item.id, 0))
        adjustment_qty = adjustments_map.get(item.id, 0)
        available = purchases_qty - sales_qty + adjustment_qty
        
        export_rows.append({
            'Code': item.code,
            'Name': item.name,
            'Supplier': suppliers.get(item.supplier_id, '') if item.supplier_id else '',
            'Weight': float(item.weight),
            'Grade': item.grade or '',
            'Category 1': item.category1 or '',
            'Category 2': item.category2 or '',
            'Total Purchases': purchases_qty,
            'Total Sales': sales_qty,
            'Available Quantity': available
        })
    
    # Create Excel file
    output = BytesIO()
    
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        if export_rows:
            df = pd.DataFrame(export_rows)
            df.to_excel(writer, index=False, sheet_name='Items')
            
            # Format the sheet
            from openpyxl.utils import get_column_letter
            worksheet = writer.sheets['Items']
            for idx, col in enumerate(df.columns):
                max_length = max(
                    df[col].astype(str).apply(len).max(),
                    len(str(col))
                )
                worksheet.column_dimensions[get_column_letter(idx + 1)].width = min(max_length + 2, 50)
    
    output.seek(0)
    from datetime import datetime
    filename = f'items_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx'
    
    return send_file(
        output,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name=filename
    )
