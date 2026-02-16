"""
Inventory Adjustments API endpoints
"""
from flask import Blueprint, request, jsonify, session
from flask_login import login_required
from models import db, InventoryAdjustment, Item, Market
from decimal import Decimal
from datetime import datetime
import pandas as pd
from io import BytesIO

bp = Blueprint('inventory', __name__)

@bp.route('/adjustments', methods=['GET'])
@login_required
def get_adjustments():
    """Get all inventory adjustments"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    item_id = request.args.get('item_id', type=int)
    
    query = InventoryAdjustment.query.filter_by(market_id=market_id)
    if item_id:
        query = query.filter_by(item_id=item_id)
    
    adjustments = query.order_by(InventoryAdjustment.date.desc(), InventoryAdjustment.id.desc()).all()
    
    return jsonify([{
        'id': adj.id,
        'item_id': adj.item_id,
        'item_code': adj.item.code,
        'item_name': adj.item.name,
        'adjustment_type': adj.adjustment_type,
        'quantity': float(adj.quantity),
        'date': adj.date.isoformat(),
        'reason': adj.reason,
        'notes': adj.notes,
        'created_at': adj.created_at.isoformat() if adj.created_at else None
    } for adj in adjustments])

@bp.route('/adjustments', methods=['POST'])
@login_required
def create_adjustment():
    """Create a new inventory adjustment"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    data = request.get_json()
    
    item_id = data.get('item_id')
    adjustment_type = data.get('adjustment_type')
    quantity = data.get('quantity')
    date = data.get('date')
    reason = data.get('reason', '')
    notes = data.get('notes', '')
    
    if not item_id or not adjustment_type or not quantity or not date:
        return jsonify({'error': 'Missing required fields'}), 400
    
    if adjustment_type not in ['Increase', 'Decrease']:
        return jsonify({'error': 'Invalid adjustment_type. Must be "Increase" or "Decrease"'}), 400
    
    if quantity <= 0:
        return jsonify({'error': 'Quantity must be greater than zero'}), 400
    
    # Verify item belongs to market
    item = Item.query.filter_by(id=item_id, market_id=market_id).first()
    if not item:
        return jsonify({'error': 'Item not found'}), 404
    
    try:
        adjustment = InventoryAdjustment(
            market_id=market_id,
            item_id=item_id,
            adjustment_type=adjustment_type,
            quantity=Decimal(str(quantity)),
            date=datetime.strptime(date, '%Y-%m-%d').date(),
            reason=reason,
            notes=notes
        )
        
        db.session.add(adjustment)
        db.session.commit()
        
        return jsonify({
            'id': adjustment.id,
            'item_id': adjustment.item_id,
            'item_code': adjustment.item.code,
            'item_name': adjustment.item.name,
            'adjustment_type': adjustment.adjustment_type,
            'quantity': float(adjustment.quantity),
            'date': adjustment.date.isoformat(),
            'reason': adjustment.reason,
            'notes': adjustment.notes
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@bp.route('/adjustments/<int:adjustment_id>', methods=['GET'])
@login_required
def get_adjustment(adjustment_id):
    """Get a single inventory adjustment"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    adjustment = InventoryAdjustment.query.filter_by(
        id=adjustment_id,
        market_id=market_id
    ).first()
    
    if not adjustment:
        return jsonify({'error': 'Adjustment not found'}), 404
    
    return jsonify({
        'id': adjustment.id,
        'item_id': adjustment.item_id,
        'item_code': adjustment.item.code,
        'item_name': adjustment.item.name,
        'adjustment_type': adjustment.adjustment_type,
        'quantity': float(adjustment.quantity),
        'date': adjustment.date.isoformat(),
        'reason': adjustment.reason,
        'notes': adjustment.notes,
        'created_at': adjustment.created_at.isoformat() if adjustment.created_at else None
    })

@bp.route('/adjustments/<int:adjustment_id>', methods=['PUT'])
@login_required
def update_adjustment(adjustment_id):
    """Update an inventory adjustment"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    adjustment = InventoryAdjustment.query.filter_by(
        id=adjustment_id,
        market_id=market_id
    ).first()
    
    if not adjustment:
        return jsonify({'error': 'Adjustment not found'}), 404
    
    data = request.get_json()
    
    adjustment_type = data.get('adjustment_type')
    quantity = data.get('quantity')
    date = data.get('date')
    reason = data.get('reason')
    notes = data.get('notes')
    
    if adjustment_type and adjustment_type not in ['Increase', 'Decrease']:
        return jsonify({'error': 'Invalid adjustment_type. Must be "Increase" or "Decrease"'}), 400
    
    if quantity is not None and quantity <= 0:
        return jsonify({'error': 'Quantity must be greater than zero'}), 400
    
    try:
        if adjustment_type:
            adjustment.adjustment_type = adjustment_type
        if quantity is not None:
            adjustment.quantity = Decimal(str(quantity))
        if date:
            adjustment.date = datetime.strptime(date, '%Y-%m-%d').date()
        if reason is not None:
            adjustment.reason = reason
        if notes is not None:
            adjustment.notes = notes
        
        db.session.commit()
        
        return jsonify({
            'id': adjustment.id,
            'item_id': adjustment.item_id,
            'item_code': adjustment.item.code,
            'item_name': adjustment.item.name,
            'adjustment_type': adjustment.adjustment_type,
            'quantity': float(adjustment.quantity),
            'date': adjustment.date.isoformat(),
            'reason': adjustment.reason,
            'notes': adjustment.notes
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@bp.route('/adjustments/<int:adjustment_id>', methods=['DELETE'])
@login_required
def delete_adjustment(adjustment_id):
    """Delete an inventory adjustment"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    adjustment = InventoryAdjustment.query.filter_by(
        id=adjustment_id,
        market_id=market_id
    ).first()
    
    if not adjustment:
        return jsonify({'error': 'Adjustment not found'}), 404
    
    try:
        db.session.delete(adjustment)
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@bp.route('/adjustments/net-quantity/<int:item_id>', methods=['GET'])
@login_required
def get_net_adjustment_quantity(item_id):
    """Get net adjustment quantity for an item (sum of increases minus decreases)"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    # Verify item belongs to market
    item = Item.query.filter_by(id=item_id, market_id=market_id).first()
    if not item:
        return jsonify({'error': 'Item not found'}), 404
    
    adjustments = InventoryAdjustment.query.filter_by(
        market_id=market_id,
        item_id=item_id
    ).all()
    
    net_quantity = Decimal('0')
    for adj in adjustments:
        if adj.adjustment_type == 'Increase':
            net_quantity += adj.quantity
        elif adj.adjustment_type == 'Decrease':
            net_quantity -= adj.quantity
    
    return jsonify({
        'item_id': item_id,
        'net_adjustment_quantity': float(net_quantity)
    })

@bp.route('/adjustments/physical-count', methods=['POST'])
@login_required
def process_physical_count():
    """Process physical inventory count file and automatically adjust inventory to match real counts.
    
    Expected Excel columns:
    - ItemCode: Item code
    - Quantity: Real counted quantity
    - Date: Count date (YYYY-MM-DD)
    
    The system will:
    1. Calculate current inventory for each item (purchases - sales + adjustments)
    2. Calculate difference: real_count - current_inventory
    3. Automatically create Increase or Decrease adjustments to match real count
    """
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if not file or file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not (file.filename.endswith('.xlsx') or file.filename.endswith('.xls')):
        return jsonify({'error': 'Invalid file type. Please upload an Excel file (.xlsx or .xls)'}), 400
    
    try:
        # Read Excel file
        if file.filename.endswith('.xlsx'):
            df = pd.read_excel(file, engine='openpyxl')
        else:
            df = pd.read_excel(file)
        
        if df.empty:
            return jsonify({'error': 'Excel file is empty'}), 400
        
        # Validate required columns
        df.columns = df.columns.str.strip()
        required_cols = ['ItemCode', 'Quantity', 'Date']
        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            return jsonify({'error': f'Missing columns: {", ".join(missing_cols)}. Found columns: {", ".join(df.columns.tolist())}'}), 400
        
        # Get all items for this market
        items = Item.query.filter_by(market_id=market_id).all()
        items_by_code = {item.code: item for item in items}
        
        # Calculate inventory for all items (by snapshot date)
        from models import PurchaseItem, SaleItem, PurchaseContainer, Sale
        from sqlalchemy import func, case
        
        # Parse and normalize count dates up front
        df['__count_date'] = pd.to_datetime(df['Date']).dt.date
        unique_dates = sorted(df['__count_date'].dropna().unique())
        
        # Only consider items included in the file
        item_codes = [str(code).strip() for code in df['ItemCode'].tolist()]
        item_ids = [items_by_code[code].id for code in item_codes if code in items_by_code]
        
        # Build inventory snapshots per date (purchases - sales + adjustments up to date)
        inventory_by_date = {}
        for snapshot_date in unique_dates:
            # Get purchases per item up to snapshot date
            purchase_q = db.session.query(
                PurchaseItem.item_id,
                func.coalesce(func.sum(PurchaseItem.quantity), 0).label('total_purchases')
            ).join(PurchaseContainer, PurchaseItem.container_id == PurchaseContainer.id) \
             .filter(
                PurchaseContainer.market_id == market_id,
                PurchaseContainer.date <= snapshot_date,
                PurchaseItem.item_id.in_(item_ids) if item_ids else True
            ) \
             .group_by(PurchaseItem.item_id).all()
            purchase_map = {item_id: Decimal(str(qty)) for item_id, qty in purchase_q}
            
            # Get sales per item up to snapshot date
            sales_q = db.session.query(
                SaleItem.item_id,
                func.coalesce(func.sum(SaleItem.quantity), 0).label('total_sales')
            ).join(Sale, SaleItem.sale_id == Sale.id) \
             .filter(
                Sale.market_id == market_id,
                Sale.date <= snapshot_date,
                SaleItem.item_id.in_(item_ids) if item_ids else True
            ) \
             .group_by(SaleItem.item_id).all()
            sales_map = {item_id: Decimal(str(qty)) for item_id, qty in sales_q}
            
            # Get adjustments per item up to snapshot date
            adjustments_q = db.session.query(
                InventoryAdjustment.item_id,
                func.sum(
                    case(
                        (InventoryAdjustment.adjustment_type == 'Increase', InventoryAdjustment.quantity),
                        else_=-InventoryAdjustment.quantity
                    )
                ).label('net_adjustments')
            ).filter(
                InventoryAdjustment.market_id == market_id,
                InventoryAdjustment.date <= snapshot_date,
                InventoryAdjustment.item_id.in_(item_ids) if item_ids else True
            ) \
             .group_by(InventoryAdjustment.item_id).all()
            adjustments_map = {item_id: Decimal(str(qty)) if qty else Decimal('0') for item_id, qty in adjustments_q}
            
            inventory_by_date[snapshot_date] = {
                'purchase_map': purchase_map,
                'sales_map': sales_map,
                'adjustments_map': adjustments_map
            }
        
        # Process each row
        results = []
        errors = []
        adjustments_created = 0
        
        for idx, row in df.iterrows():
            try:
                item_code = str(row['ItemCode']).strip()
                real_count = Decimal(str(row['Quantity']))
                count_date = row['__count_date']
                if pd.isna(count_date):
                    errors.append(f'Row {idx + 2}: Date is invalid')
                    continue
                
                # Validate data
                if not item_code:
                    errors.append(f'Row {idx + 2}: ItemCode is empty')
                    continue
                
                if real_count < 0:
                    errors.append(f'Row {idx + 2}: Quantity cannot be negative')
                    continue
                
                # Find item
                item = items_by_code.get(item_code)
                if not item:
                    errors.append(f'Row {idx + 2}: Item code "{item_code}" not found')
                    continue
                
                # Calculate current inventory
                snapshot_maps = inventory_by_date.get(count_date)
                if not snapshot_maps:
                    errors.append(f'Row {idx + 2}: No inventory snapshot for date {count_date}')
                    continue
                
                purchases_qty = snapshot_maps['purchase_map'].get(item.id, Decimal('0'))
                sales_qty = snapshot_maps['sales_map'].get(item.id, Decimal('0'))
                adjustment_qty = snapshot_maps['adjustments_map'].get(item.id, Decimal('0'))
                current_inventory = purchases_qty - sales_qty + adjustment_qty
                
                # Calculate difference
                difference = real_count - current_inventory
                
                # Create adjustment if there's a difference
                if abs(difference) > Decimal('0.01'):  # Only adjust if difference is significant (> 0.01)
                    if difference > 0:
                        adjustment_type = 'Increase'
                        adjustment_qty = difference
                    else:
                        adjustment_type = 'Decrease'
                        adjustment_qty = abs(difference)
                    
                    # Create adjustment
                    adjustment = InventoryAdjustment(
                        market_id=market_id,
                        item_id=item.id,
                        adjustment_type=adjustment_type,
                        quantity=adjustment_qty,
                        date=count_date,
                        reason=f'Physical count adjustment (Count: {real_count}, System: {current_inventory})',
                        notes=f'Auto-adjusted from physical count on {count_date.isoformat()}'
                    )
                    
                    db.session.add(adjustment)
                    adjustments_created += 1
                    
                    results.append({
                        'item_code': item_code,
                        'item_name': item.name,
                        'current_inventory': float(current_inventory),
                        'real_count': float(real_count),
                        'difference': float(difference),
                        'adjustment_type': adjustment_type,
                        'adjustment_quantity': float(adjustment_qty),
                        'status': 'Adjusted'
                    })
                else:
                    # No adjustment needed
                    results.append({
                        'item_code': item_code,
                        'item_name': item.name,
                        'current_inventory': float(current_inventory),
                        'real_count': float(real_count),
                        'difference': float(difference),
                        'adjustment_type': None,
                        'adjustment_quantity': 0,
                        'status': 'No adjustment needed'
                    })
                
            except Exception as e:
                errors.append(f'Row {idx + 2}: {str(e)}')
                continue
        
        # Commit all adjustments
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': f'Error saving adjustments: {str(e)}'}), 400
        
        return jsonify({
            'success': True,
            'adjustments_created': adjustments_created,
            'items_processed': len(results),
            'results': results,
            'errors': errors
        })
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Error processing file: {str(e)}'}), 400

