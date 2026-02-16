"""
Sales API endpoints
"""
from flask import Blueprint, request, jsonify, session
from flask_login import login_required
from models import db, Sale, SaleItem, Item, Company, Market, SafeTransaction, Payment
from decimal import Decimal
from datetime import datetime
import random
import pandas as pd
from io import BytesIO

bp = Blueprint('sales', __name__)

def generate_invoice_number(market_id):
    """Generate unique invoice number: SAL-YYYYMMDD-XXX"""
    today = datetime.now().strftime('%Y%m%d')
    prefix = f'SAL-{today}-'
    
    # Find existing invoices with same prefix
    existing = Sale.query.filter(Sale.invoice_number.like(f'{prefix}%')).all()
    if existing:
        numbers = [int(s.invoice_number.split('-')[-1]) for s in existing]
        next_num = max(numbers) + 1
    else:
        next_num = 1
    
    return f'{prefix}{next_num:03d}'

@bp.route('', methods=['GET'])
@login_required
def get_sales():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    customer_id = request.args.get('customer_id', type=int)
    supplier_id = request.args.get('supplier_id', type=int)
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    query = Sale.query.filter_by(market_id=market_id)
    
    if customer_id:
        query = query.filter_by(customer_id=customer_id)
    if supplier_id:
        query = query.filter_by(supplier_id=supplier_id)
    if start_date:
        query = query.filter(Sale.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        query = query.filter(Sale.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    
    sales = query.order_by(Sale.date.desc(), Sale.invoice_number.desc()).all()
    
    # Get supplier names in bulk
    supplier_ids = [s.supplier_id for s in sales if s.supplier_id]
    suppliers = {sup.id: sup.name for sup in Company.query.filter(Company.id.in_(supplier_ids)).all()} if supplier_ids else {}
    
    # Calculate total amount of filtered sales
    total_amount = sum(s.total_amount for s in sales)
    
    return jsonify({
        'sales': [{
            'id': s.id,
            'invoice_number': s.invoice_number,
            'date': s.date.isoformat(),
            'customer_id': s.customer_id,
            'customer_name': s.customer.name,
            'supplier_id': s.supplier_id,
            'supplier_name': suppliers.get(s.supplier_id) if s.supplier_id else None,
            'total_amount': float(s.total_amount),
            'paid_amount': float(s.paid_amount),
            'balance': float(s.balance),
            'payment_type': s.payment_type,
            'status': s.status,
            'notes': s.notes
        } for s in sales],
        'total_amount': float(total_amount),
        'count': len(sales)
    })

@bp.route('', methods=['POST'])
@login_required
def create_sale():
    try:
        market_id = session.get('current_market_id')
        if not market_id:
            return jsonify({'error': 'No market selected'}), 400
        
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Validate required fields
        if 'customer_id' not in data or not data['customer_id']:
            return jsonify({'error': 'Customer is required'}), 400
        
        if 'items' not in data or not data['items'] or len(data['items']) == 0:
            return jsonify({'error': 'At least one item is required'}), 400
        
        if 'date' not in data or not data['date']:
            return jsonify({'error': 'Date is required'}), 400
        
        # Generate invoice number
        invoice_number = generate_invoice_number(market_id)
        
        # Calculate total
        total_amount = Decimal('0')
        for item_data in data['items']:
            if 'quantity' not in item_data or 'unit_price' not in item_data:
                return jsonify({'error': 'Each item must have quantity and unit_price'}), 400
            total_amount += Decimal(str(item_data['quantity'])) * Decimal(str(item_data['unit_price']))
        
        # Get customer and validate
        customer = Company.query.get(data['customer_id'])
        if not customer:
            return jsonify({'error': 'Customer not found'}), 404
        
        payment_type = customer.payment_type if customer else 'Cash'
        
        # Use provided paid_amount if available, otherwise use default logic
        if 'paid_amount' in data and data['paid_amount'] is not None:
            paid_amount = Decimal(str(data['paid_amount']))
        elif payment_type == 'Cash':
            # For cash sales, default to full payment if not specified
            paid_amount = total_amount
        else:
            paid_amount = Decimal('0')
        
        # Ensure cash sales always have a payment record created
        # If it's a cash sale and paid_amount is 0, set it to total_amount
        if payment_type == 'Cash' and paid_amount == 0:
            paid_amount = total_amount
        
        # Update status based on paid amount
        if paid_amount >= total_amount:
            status = 'Paid'
        elif paid_amount > 0:
            status = 'Partial'
        else:
            status = 'Unpaid'
        
        # Parse date
        try:
            sale_date = datetime.strptime(data['date'], '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
        
        sale = Sale(
            market_id=market_id,
            invoice_number=invoice_number,
            customer_id=data['customer_id'],
            supplier_id=data.get('supplier_id'),
            date=sale_date,
            total_amount=total_amount,
            paid_amount=paid_amount,
            balance=total_amount - paid_amount,
            payment_type=payment_type,
            status=status,
            notes=data.get('notes', '')
        )
        
        db.session.add(sale)
        db.session.flush()
        
        # Add items
        for item_data in data['items']:
            if 'item_id' not in item_data:
                db.session.rollback()
                return jsonify({'error': 'Each item must have item_id'}), 400
            
            # Validate item exists
            item = Item.query.get(item_data['item_id'])
            if not item:
                db.session.rollback()
                return jsonify({'error': f'Item with id {item_data["item_id"]} not found'}), 404
            
            sale_item = SaleItem(
                sale_id=sale.id,
                item_id=item_data['item_id'],
                quantity=Decimal(str(item_data['quantity'])),
                unit_price=Decimal(str(item_data['unit_price'])),
                total_price=Decimal(str(item_data['quantity'])) * Decimal(str(item_data['unit_price']))
            )
            db.session.add(sale_item)
        
        # Create a Payment record for any initial payment (paid_amount > 0)
        # For cash sales, this ensures the payment appears in the customer statement
        # For credit sales with partial payment, this tracks the payment
        # IMPORTANT: For cash sales, paid_amount should always be > 0 (set above), but we check anyway
        if paid_amount > 0 or payment_type == 'Cash':
            # If it's a cash sale but paid_amount is somehow 0, use total_amount
            payment_amount = paid_amount if paid_amount > 0 else total_amount
            
            market = Market.query.get(market_id)
            if not market:
                db.session.rollback()
                return jsonify({'error': 'Market not found'}), 404
            
            # Determine payment currency and exchange rate
            payment_currency = customer.currency or market.base_currency
            # If customer currency matches market base currency, rate is 1
            if payment_currency == market.base_currency:
                exchange_rate = Decimal('1')
                amount_base_currency = payment_amount
            else:
                # For different currencies, we'll use exchange_rate = 1 for now
                # This can be enhanced later to use actual exchange rates
                exchange_rate = Decimal('1')
                amount_base_currency = payment_amount
            
            # Create payment record for the initial payment
            payment = Payment(
                market_id=market_id,
                company_id=customer.id,
                sale_id=sale.id,
                payment_type='In',  # Payment received from customer
                amount=payment_amount,
                currency=payment_currency,
                exchange_rate=exchange_rate,
                amount_base_currency_stored=amount_base_currency,
                date=sale.date,
                notes=f'Initial payment for invoice {invoice_number}',
                loan=False
            )
            db.session.add(payment)
            db.session.flush()  # Flush to get payment.id if needed
            
            # Update sale.paid_amount if we had to adjust it for cash sale
            if payment_type == 'Cash' and paid_amount == 0:
                sale.paid_amount = payment_amount
                sale.balance = total_amount - payment_amount
                sale.status = 'Paid' if payment_amount >= total_amount else 'Partial'
            
            # If cash sale, also record in safe (only the paid_amount, not the total_amount)
            # The balance (total_amount - paid_amount) remains as receivable and doesn't go into safe
            if payment_type == 'Cash':
                # Get last safe balance
                last_transaction = SafeTransaction.query.filter_by(market_id=market_id).order_by(
                    SafeTransaction.date.desc(), SafeTransaction.id.desc()
                ).first()
                
                balance_before = last_transaction.balance_after if last_transaction else Decimal('0')
                balance_after = balance_before + amount_base_currency
                
                safe_transaction = SafeTransaction(
                    market_id=market_id,
                    transaction_type='Inflow',
                    amount=payment_amount,
                    currency=payment_currency,
                    exchange_rate=exchange_rate,
                    amount_base_currency_stored=amount_base_currency,
                    date=sale.date,
                    description=f'Sale {invoice_number} (Collected: {payment_amount}, Balance: {total_amount - payment_amount})',
                    sale_id=sale.id,
                    payment_id=payment.id,  # Link to the payment record
                    balance_after=balance_after
                )
                db.session.add(safe_transaction)
        
        db.session.commit()
        
        # Allocate batches if FIFO is active
        market = Market.query.get(market_id)
        if market and getattr(market, 'calculation_method', 'Average') == 'FIFO':
            from api.fifo_calculations import allocate_sale_item_fifo
            for sale_item in sale.items:
                try:
                    allocate_sale_item_fifo(sale_item)
                except Exception as e:
                    # Log error but don't fail the sale creation
                    print(f"Warning: Could not allocate FIFO for sale item {sale_item.id}: {e}")
        
        # Get supplier name safely
        supplier_name = None
        if sale.supplier_id:
            supplier = Company.query.get(sale.supplier_id)
            supplier_name = supplier.name if supplier else None
        
        return jsonify({
            'id': sale.id,
            'invoice_number': sale.invoice_number,
            'date': sale.date.isoformat(),
            'customer_id': sale.customer_id,
            'customer_name': sale.customer.name,
            'supplier_id': sale.supplier_id,
            'supplier_name': supplier_name,
            'total_amount': float(sale.total_amount),
            'paid_amount': float(sale.paid_amount),
            'balance': float(sale.balance),
            'payment_type': sale.payment_type,
            'status': sale.status,
            'notes': sale.notes
        }), 201
    
    except Exception as e:
        db.session.rollback()
        print(f"Error creating sale: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Error creating sale: {str(e)}'}), 500

@bp.route('/<int:sale_id>', methods=['GET'])
@login_required
def get_sale(sale_id):
    market_id = session.get('current_market_id')
    sale = Sale.query.filter_by(id=sale_id, market_id=market_id).first()
    
    if not sale:
        return jsonify({'error': 'Sale not found'}), 404
    
    items = [{
        'id': i.id,
        'item_id': i.item_id,
        'item_code': i.item.code,
        'item_name': i.item.name,
        'quantity': float(i.quantity),
        'unit_price': float(i.unit_price),
        'total_price': float(i.total_price)
    } for i in sale.items]
    
    # Get supplier name safely
    supplier_name = None
    if sale.supplier_id:
        try:
            supplier = Company.query.get(sale.supplier_id)
            supplier_name = supplier.name if supplier else None
        except Exception:
            supplier_name = None
    
    return jsonify({
        'id': sale.id,
        'invoice_number': sale.invoice_number,
        'date': sale.date.isoformat(),
        'customer_id': sale.customer_id,
        'customer_name': sale.customer.name,
        'supplier_id': sale.supplier_id,
        'supplier_name': supplier_name,
        'total_amount': float(sale.total_amount),
        'paid_amount': float(sale.paid_amount),
        'balance': float(sale.balance),
        'payment_type': sale.payment_type,
        'status': sale.status,
        'notes': sale.notes,
        'items': items
    })

@bp.route('/<int:sale_id>', methods=['PUT'])
@login_required
def update_sale(sale_id):
    market_id = session.get('current_market_id')
    sale = Sale.query.filter_by(id=sale_id, market_id=market_id).first()
    
    if not sale:
        return jsonify({'error': 'Sale not found'}), 404
    
    data = request.json
    
    old_date = sale.date
    old_total = sale.total_amount
    old_paid = sale.paid_amount
    
    # Find initial payment if it exists
    initial_payment = next((p for p in sale.payments if 'Initial payment' in (p.notes or '')), None)
    
    # Check if sale has payments other than initial payment
    if sale.payments and len(sale.payments) > (1 if initial_payment else 0):
        return jsonify({'error': 'Cannot edit sale with additional payments beyond initial payment'}), 400
    sale.customer_id = data.get('customer_id', sale.customer_id)
    sale.supplier_id = data.get('supplier_id', sale.supplier_id)
    sale.date = datetime.strptime(data['date'], '%Y-%m-%d').date() if data.get('date') else sale.date
    sale.notes = data.get('notes', sale.notes)
    
    # Update paid_amount if provided
    if 'paid_amount' in data:
        sale.paid_amount = Decimal(str(data['paid_amount']))
    
    # Update items if provided
    if 'items' in data:
        # Delete existing items
        SaleItem.query.filter_by(sale_id=sale_id).delete()
        
        # Calculate new total
        total_amount = Decimal('0')
        for item_data in data['items']:
            total_amount += Decimal(str(item_data['quantity'])) * Decimal(str(item_data['unit_price']))
        
        sale.total_amount = total_amount
    
    # Recalculate balance and update status
    sale.balance = sale.total_amount - sale.paid_amount
    sale.update_status()
    
    # Update or create initial payment record if paid_amount changed
    paid_changed = sale.paid_amount != old_paid
    if paid_changed:
        market = Market.query.get(market_id)
        customer = Company.query.get(sale.customer_id)
        payment_currency = customer.currency if customer else (market.base_currency if market else 'USD')
        
        if sale.paid_amount > 0:
            # Determine exchange rate (simplified - can be enhanced)
            exchange_rate = Decimal('1')
            amount_base_currency = sale.paid_amount
            
            if initial_payment:
                # Update existing initial payment
                initial_payment.amount = sale.paid_amount
                initial_payment.amount_base_currency_stored = amount_base_currency
                initial_payment.exchange_rate = exchange_rate
                initial_payment.date = sale.date
            else:
                # Create new initial payment
                initial_payment = Payment(
                    market_id=market_id,
                    company_id=sale.customer_id,
                    sale_id=sale.id,
                    payment_type='In',
                    amount=sale.paid_amount,
                    currency=payment_currency,
                    exchange_rate=exchange_rate,
                    amount_base_currency_stored=amount_base_currency,
                    date=sale.date,
                    notes=f'Initial payment for invoice {sale.invoice_number}',
                    loan=False
                )
                db.session.add(initial_payment)
        elif initial_payment:
            # If paid_amount is now 0, delete the initial payment
            # Also delete associated safe transaction if exists
            SafeTransaction.query.filter_by(payment_id=initial_payment.id).delete()
            db.session.delete(initial_payment)
    
    # Add new items if items were updated
    if 'items' in data:
        for item_data in data['items']:
            item = SaleItem(
                sale_id=sale.id,
                item_id=item_data['item_id'],
                quantity=Decimal(str(item_data['quantity'])),
                unit_price=Decimal(str(item_data['unit_price'])),
                total_price=Decimal(str(item_data['quantity'])) * Decimal(str(item_data['unit_price']))
            )
            db.session.add(item)
    
    # Update SafeTransaction if it's a cash sale and (date, total, or paid_amount changed)
    date_changed = sale.date != old_date
    total_changed = sale.total_amount != old_total
    paid_changed = sale.paid_amount != old_paid
    
    if sale.payment_type == 'Cash':
        safe_transaction = SafeTransaction.query.filter_by(sale_id=sale_id).first()
        if safe_transaction:
            # Update date if changed
            if date_changed:
                safe_transaction.date = sale.date
            
            # Update amount to reflect paid_amount (not total_amount)
            # Only update if paid_amount changed or total changed (which affects the description)
            if paid_changed or total_changed:
                safe_transaction.amount = sale.paid_amount
                safe_transaction.amount_base_currency_stored = sale.paid_amount
                # Update description to show collected amount and balance
                safe_transaction.description = f'Sale {sale.invoice_number} (Collected: {sale.paid_amount}, Balance: {sale.balance})'
                
                # Recalculate balance_after for this transaction
                prev_transaction = SafeTransaction.query.filter(
                    SafeTransaction.market_id == market_id,
                    (SafeTransaction.date < sale.date) | 
                    ((SafeTransaction.date == sale.date) & (SafeTransaction.id < safe_transaction.id))
                ).order_by(SafeTransaction.date.desc(), SafeTransaction.id.desc()).first()
                balance_before = prev_transaction.balance_after if prev_transaction else Decimal('0')
                safe_transaction.balance_after = balance_before + sale.paid_amount
        elif sale.paid_amount > 0:
            # If no safe transaction exists but paid_amount > 0, create one
            last_transaction = SafeTransaction.query.filter_by(market_id=market_id).order_by(
                SafeTransaction.date.desc(), SafeTransaction.id.desc()
            ).first()
            balance_before = last_transaction.balance_after if last_transaction else Decimal('0')
            balance_after = balance_before + sale.paid_amount
            
            safe_transaction = SafeTransaction(
                market_id=market_id,
                transaction_type='Inflow',
                amount=sale.paid_amount,
                currency=sale.customer.currency,
                exchange_rate=Decimal('1'),
                amount_base_currency_stored=sale.paid_amount,
                date=sale.date,
                description=f'Sale {sale.invoice_number} (Collected: {sale.paid_amount}, Balance: {sale.balance})',
                sale_id=sale.id,
                balance_after=balance_after
            )
            db.session.add(safe_transaction)
    
    db.session.flush()
    
    # Recalculate safe balances after date or amount change
    # This ensures transactions are sorted correctly by date and balances are recalculated
    if date_changed or total_changed:
        from api.safe import recalc_safe_balances
        recalc_safe_balances(market_id)
    else:
        db.session.commit()
    
    return jsonify({
        'id': sale.id,
        'invoice_number': sale.invoice_number,
        'date': sale.date.isoformat(),
        'customer_id': sale.customer_id,
        'customer_name': sale.customer.name,
        'total_amount': float(sale.total_amount),
        'paid_amount': float(sale.paid_amount),
        'balance': float(sale.balance),
        'payment_type': sale.payment_type,
        'status': sale.status,
        'notes': sale.notes
    })

@bp.route('/<int:sale_id>', methods=['DELETE'])
@login_required
def delete_sale(sale_id):
    market_id = session.get('current_market_id')
    sale = Sale.query.filter_by(id=sale_id, market_id=market_id).first()
    
    if not sale:
        return jsonify({'error': 'Sale not found'}), 404
    
    # Check for dependent records
    if sale.payments:
        return jsonify({'error': 'Cannot delete sale with existing payments'}), 400
    
    # Delete related safe transaction if cash sale
    SafeTransaction.query.filter_by(sale_id=sale_id).delete()
    
    db.session.delete(sale)
    db.session.commit()
    
    return jsonify({'success': True})

@bp.route('/by-item', methods=['GET'])
@login_required
def get_sales_by_item():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    item_id = request.args.get('item_id', type=int)
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    query = db.session.query(SaleItem, Sale).join(
        Sale, SaleItem.sale_id == Sale.id
    ).filter(Sale.market_id == market_id)
    
    if item_id:
        query = query.filter(SaleItem.item_id == item_id)
    if start_date:
        query = query.filter(Sale.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        query = query.filter(Sale.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    
    results = query.order_by(Sale.date.desc(), Sale.id.desc()).all()
    
    return jsonify([{
        'date': sale.date.isoformat(),
        'invoice_number': sale.invoice_number,
        'customer_name': sale.customer.name,
        'item_code': item.item.code,
        'item_name': item.item.name,
        'quantity': float(item.quantity),
        'unit_price': float(item.unit_price),
        'total_price': float(item.total_price),
        'payment_type': sale.payment_type,
        'status': sale.status
    } for item, sale in results])

@bp.route('/import', methods=['POST'])
@login_required
def import_sales():
    """Import sales from Excel.
    Expected columns (case sensitive):
    - Date (YYYY-MM-DD)
    - Customer (name)
    - Supplier (name) - REQUIRED
    - ItemCode
    - Quantity
    - UnitPrice
    - Notes (optional)
    
    Sales are grouped by Date, Customer, and Supplier.
    All items must belong to the specified supplier.
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
        # Read file content into BytesIO
        file_content = file.read()
        
        try:
            if file.filename.endswith('.xlsx'):
                df = pd.read_excel(BytesIO(file_content), engine='openpyxl')
            else:
                df = pd.read_excel(BytesIO(file_content))
        except Exception as e:
            return jsonify({'error': f'Error reading Excel file: {str(e)}'}), 400

        if df.empty:
            return jsonify({'error': 'Excel file is empty'}), 400

        df.columns = df.columns.str.strip()
        required_cols = ['Date', 'Customer', 'Supplier', 'ItemCode', 'Quantity', 'UnitPrice']
        missing = [c for c in required_cols if c not in df.columns]
        if missing:
            return jsonify({'error': f'Missing columns: {", ".join(missing)}. Found: {", ".join(df.columns.tolist())}'}), 400

        errors = []
        sales_created = 0
        items_created = 0

        # Cache lookups
        customers_by_name = {c.name: c for c in Company.query.filter_by(market_id=market_id, category='Customer').all()}
        suppliers_by_name = {s.name: s for s in Company.query.filter_by(market_id=market_id, category='Supplier').all()}
        
        # Group rows by Date, Customer, and Supplier
        df['Date'] = pd.to_datetime(df['Date']).dt.date
        grouped = df.groupby(['Date', 'Customer', 'Supplier'])

        for group_key, group in grouped:
            sale_date, customer_name, supplier_name = group_key
            supplier_name = str(supplier_name).strip() if pd.notna(supplier_name) else None
            customer_name = str(customer_name).strip()
            
            customer = customers_by_name.get(customer_name)
            if not customer:
                errors.append(f'Date {sale_date}, Customer "{customer_name}": Customer not found')
                continue
            
            # Get supplier (required)
            if not supplier_name:
                errors.append(f'Date {sale_date}, Customer "{customer_name}": Supplier is required but missing')
                continue
            
            supplier = suppliers_by_name.get(supplier_name)
            if not supplier:
                errors.append(f'Date {sale_date}, Customer "{customer_name}": Supplier "{supplier_name}" not found')
                continue
            
            supplier_id = supplier.id
            
            # Get items filtered by supplier
            items_query = Item.query.filter_by(market_id=market_id, supplier_id=supplier_id)
            items_by_code = {i.code: i for i in items_query.all()}

            # Generate invoice number
            invoice_number = generate_invoice_number(market_id)

            # Calculate total
            total_amount = Decimal('0')
            sale_items = []
            
            for idx, row in group.iterrows():
                code = str(row['ItemCode']).strip()
                item = items_by_code.get(code)
                if not item:
                    errors.append(f'Date {sale_date}, Customer "{customer_name}", Supplier "{supplier_name}": Item code "{code}" not found (row {idx + 2})')
                    continue
                
                # Verify item belongs to the specified supplier
                if item.supplier_id != supplier_id:
                    errors.append(f'Date {sale_date}, Customer "{customer_name}": Item code "{code}" does not belong to supplier "{supplier_name}" (row {idx + 2})')
                    continue

                try:
                    # Check for NaN values before converting to Decimal
                    if pd.isna(row['Quantity']) or pd.isna(row['UnitPrice']):
                        errors.append(f'Date {sale_date}, Customer "{customer_name}", Supplier "{supplier_name}": Missing quantity or price for item {code} (row {idx + 2})')
                        continue
                    
                    # Convert to string first, then to Decimal to handle various numeric formats
                    qty_str = str(row['Quantity']).strip()
                    price_str = str(row['UnitPrice']).strip()
                    
                    # Check for empty strings or 'nan' string
                    if not qty_str or qty_str.lower() == 'nan' or qty_str == '':
                        errors.append(f'Date {sale_date}, Customer "{customer_name}", Supplier "{supplier_name}": Invalid quantity for item {code} (row {idx + 2}): empty or NaN')
                        continue
                    
                    if not price_str or price_str.lower() == 'nan' or price_str == '':
                        errors.append(f'Date {sale_date}, Customer "{customer_name}", Supplier "{supplier_name}": Invalid price for item {code} (row {idx + 2}): empty or NaN')
                        continue
                    
                    qty = Decimal(qty_str)
                    price = Decimal(price_str)
                    
                    # Validate that values are positive numbers
                    if qty <= 0:
                        errors.append(f'Date {sale_date}, Customer "{customer_name}", Supplier "{supplier_name}": Quantity must be greater than 0 for item {code} (row {idx + 2})')
                        continue
                    
                    if price < 0:
                        errors.append(f'Date {sale_date}, Customer "{customer_name}", Supplier "{supplier_name}": Price cannot be negative for item {code} (row {idx + 2})')
                        continue
                    
                    total_price = qty * price
                    total_amount += total_price
                    
                    sale_items.append({
                        'item_id': item.id,
                        'quantity': qty,
                        'unit_price': price,
                        'total_price': total_price
                    })
                except (ValueError, TypeError, Exception) as e:
                    errors.append(f'Date {sale_date}, Customer "{customer_name}", Supplier "{supplier_name}": Invalid quantity/price for item {code} (row {idx + 2}): {str(e)}')
                    continue

            if not sale_items:
                errors.append(f'Date {sale_date}, Customer "{customer_name}", Supplier "{supplier_name}": No valid items found')
                continue

            # Validate total_amount is valid (not NaN or invalid)
            # Check if total_amount is NaN by comparing it to itself (NaN != NaN)
            if total_amount != total_amount or pd.isna(total_amount) or total_amount is None:
                errors.append(f'Date {sale_date}, Customer "{customer_name}", Supplier "{supplier_name}": Invalid total amount calculated (NaN or invalid)')
                continue
            
            # Ensure total_amount is a valid Decimal
            try:
                total_amount = Decimal(str(total_amount))
                if total_amount <= 0:
                    errors.append(f'Date {sale_date}, Customer "{customer_name}", Supplier "{supplier_name}": Total amount must be greater than 0')
                    continue
            except (ValueError, TypeError):
                errors.append(f'Date {sale_date}, Customer "{customer_name}", Supplier "{supplier_name}": Invalid total amount format')
                continue

            # Determine payment type and initial paid amount
            payment_type = customer.payment_type if customer else 'Cash'
            
            if payment_type == 'Cash':
                paid_amount = total_amount
                status = 'Paid'
            else:
                paid_amount = Decimal('0')
                status = 'Unpaid'
            
            # Validate paid_amount and balance
            try:
                paid_amount = Decimal(str(paid_amount))
                balance = total_amount - paid_amount
                balance = Decimal(str(balance))
            except (ValueError, TypeError):
                errors.append(f'Date {sale_date}, Customer "{customer_name}", Supplier "{supplier_name}": Error calculating paid amount or balance')
                continue

            # Get notes if available
            notes = ''
            if 'Notes' in group.columns:
                notes_list = group['Notes'].dropna().unique()
                if len(notes_list) > 0:
                    notes_str = str(notes_list[0])
                    if notes_str and notes_str.lower() != 'nan':
                        notes = notes_str.strip()

            # Create sale
            sale = Sale(
                market_id=market_id,
                invoice_number=invoice_number,
                customer_id=customer.id,
                supplier_id=supplier_id,
                date=sale_date,
                total_amount=total_amount,
                paid_amount=paid_amount,
                balance=balance,
                payment_type=payment_type,
                status=status,
                notes=notes
            )
            
            db.session.add(sale)
            db.session.flush()
            sales_created += 1

            # Add items
            for item_data in sale_items:
                sale_item = SaleItem(
                    sale_id=sale.id,
                    item_id=item_data['item_id'],
                    quantity=item_data['quantity'],
                    unit_price=item_data['unit_price'],
                    total_price=item_data['total_price']
                )
                db.session.add(sale_item)
                items_created += 1

            # If cash sale, record in safe (only the paid_amount, not the total_amount)
            # The balance (total_amount - paid_amount) remains as receivable and doesn't go into safe
            if payment_type == 'Cash' and paid_amount > 0:
                market = Market.query.get(market_id)
                # Get last safe balance
                last_transaction = SafeTransaction.query.filter_by(market_id=market_id).order_by(
                    SafeTransaction.date.desc(), SafeTransaction.id.desc()
                ).first()
                
                balance_before = last_transaction.balance_after if last_transaction else Decimal('0')
                balance_after = balance_before + paid_amount
                
                # Calculate exact base currency amount (same as paid_amount for same currency)
                exact_base_amount = paid_amount
                
                safe_transaction = SafeTransaction(
                    market_id=market_id,
                    transaction_type='Inflow',
                    amount=paid_amount,
                    currency=customer.currency,
                    exchange_rate=Decimal('1'),  # Same currency
                    amount_base_currency_stored=exact_base_amount,  # Store exact value directly
                    date=sale.date,
                    description=f'Sale {invoice_number} (Collected: {paid_amount}, Balance: {balance})',
                    sale_id=sale.id,
                    balance_after=balance_after
                )
                db.session.add(safe_transaction)

        db.session.commit()

        return jsonify({
            'success': True,
            'sales_created': sales_created,
            'items_created': items_created,
            'errors': errors
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Import failed: {str(e)}'}), 400

