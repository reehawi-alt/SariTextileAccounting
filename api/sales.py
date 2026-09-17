"""
Sales API endpoints
"""
from flask import Blueprint, request, jsonify, session, send_file
from flask_login import login_required
from models import db, Sale, SaleItem, SaleItemAllocation, Item, Company, Market, SafeTransaction, Payment
from decimal import Decimal
from datetime import datetime
import random
import pandas as pd
from io import BytesIO
from openpyxl.utils import get_column_letter
from sqlalchemy import exists, and_
from sqlalchemy.orm import joinedload

bp = Blueprint('sales', __name__)

def _serialize_sale_item_row(si):
    row = {
        'id': si.id,
        'item_id': si.item_id,
        'line_description': si.line_description,
        'quantity': float(si.quantity),
        'unit_price': float(si.unit_price),
        'total_price': float(si.total_price),
    }
    if si.item_id and getattr(si, 'item', None) is not None:
        row['item_code'] = si.item.code
        row['item_name'] = si.item.name
    else:
        row['item_code'] = '—'
        row['item_name'] = (si.line_description or '').strip() or '—'
    return row

def _parse_sale_line_payload(item_data):
    """Returns dict with item_id, line_description, quantity, unit_price, total_price or raises ValueError."""
    if 'quantity' not in item_data or 'unit_price' not in item_data:
        raise ValueError('Each line must have quantity and unit_price')
    qty = Decimal(str(item_data['quantity']))
    price = Decimal(str(item_data['unit_price']))
    if qty <= 0:
        raise ValueError('Quantity must be greater than 0')
    if price < 0:
        raise ValueError('Unit price cannot be negative')
    total = qty * price
    raw_id = item_data.get('item_id')
    line_desc_raw = item_data.get('line_description')
    line_desc = line_desc_raw.strip() if isinstance(line_desc_raw, str) else ''
    if raw_id is not None and str(raw_id).strip() != '':
        item_id = int(raw_id)
        return {'item_id': item_id, 'line_description': None, 'quantity': qty, 'unit_price': price, 'total_price': total}
    if line_desc:
        return {'item_id': None, 'line_description': line_desc, 'quantity': qty, 'unit_price': price, 'total_price': total}
    raise ValueError('Each line must have item_id or line_description')

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
    fast_only = request.args.get('fast_only') == '1'
    
    query = Sale.query.filter_by(market_id=market_id)
    
    if customer_id:
        query = query.filter_by(customer_id=customer_id)
    if supplier_id:
        query = query.filter_by(supplier_id=supplier_id)
    if start_date:
        query = query.filter(Sale.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        query = query.filter(Sale.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    if fast_only:
        query = query.filter(
            exists().where(and_(SaleItem.sale_id == Sale.id, SaleItem.item_id.is_(None)))
        )
    
    sales = query.options(joinedload(Sale.items)).order_by(Sale.date.desc(), Sale.invoice_number.desc()).all()
    
    # Get supplier names in bulk
    supplier_ids = [s.supplier_id for s in sales if s.supplier_id]
    suppliers = {sup.id: sup.name for sup in Company.query.filter(Company.id.in_(supplier_ids)).all()} if supplier_ids else {}
    
    # Calculate total amount and line quantities of filtered sales
    total_amount = sum(s.total_amount for s in sales)
    total_quantity = Decimal('0')
    for s in sales:
        for si in (s.items or []):
            total_quantity += Decimal(str(si.quantity))
    
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
            'notes': s.notes,
            'has_fast_lines': any(i.item_id is None for i in (s.items or []))
        } for s in sales],
        'total_amount': float(total_amount),
        'total_quantity': float(total_quantity),
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
        
        # Calculate total and validate lines (catalog item_id or fast line_description)
        total_amount = Decimal('0')
        line_payloads = []
        for item_data in data['items']:
            try:
                pl = _parse_sale_line_payload(item_data)
            except ValueError as e:
                db.session.rollback()
                return jsonify({'error': str(e)}), 400
            total_amount += pl['total_price']
            line_payloads.append(pl)
        
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
        for pl in line_payloads:
            if pl['item_id'] is not None:
                item = Item.query.get(pl['item_id'])
                if not item:
                    db.session.rollback()
                    return jsonify({'error': f'Item with id {pl["item_id"]} not found'}), 404
            sale_item = SaleItem(
                sale_id=sale.id,
                item_id=pl['item_id'],
                line_description=pl['line_description'],
                quantity=pl['quantity'],
                unit_price=pl['unit_price'],
                total_price=pl['total_price']
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
            
            # Record money collected in safe (initial payment): cash or credit with partial/full pay at invoice time
            # Collected Money report is driven by SafeTransaction Inflows, not Payment rows alone.
            # The balance (total_amount - paid_amount) remains as receivable and is not cashed until paid.
            if payment_amount > 0:
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
        from api.safe import recalc_safe_balances
        recalc_safe_balances(market_id)
        
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
    sale = Sale.query.options(
        joinedload(Sale.items).joinedload(SaleItem.item)
    ).filter_by(id=sale_id, market_id=market_id).first()
    
    if not sale:
        return jsonify({'error': 'Sale not found'}), 404
    
    items = [_serialize_sale_item_row(i) for i in sale.items]
    
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
        'customer_total_balance': float(sale.customer.get_balance(market_id)),
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
        old_item_ids = [x.id for x in SaleItem.query.filter_by(sale_id=sale_id).all()]
        if old_item_ids:
            SaleItemAllocation.query.filter(SaleItemAllocation.sale_item_id.in_(old_item_ids)).delete(synchronize_session=False)
        SaleItem.query.filter_by(sale_id=sale_id).delete()
        
        total_amount = Decimal('0')
        line_payloads = []
        for item_data in data['items']:
            try:
                pl = _parse_sale_line_payload(item_data)
            except ValueError as e:
                return jsonify({'error': str(e)}), 400
            total_amount += pl['total_price']
            line_payloads.append(pl)
        
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
    
    if 'items' in data:
        for pl in line_payloads:
            if pl['item_id'] is not None:
                cit = Item.query.get(pl['item_id'])
                if not cit:
                    return jsonify({'error': f'Item with id {pl["item_id"]} not found'}), 404
            db.session.add(SaleItem(
                sale_id=sale.id,
                item_id=pl['item_id'],
                line_description=pl['line_description'],
                quantity=pl['quantity'],
                unit_price=pl['unit_price'],
                total_price=pl['total_price']
            ))
    
    # Update SafeTransaction when date, total, or paid amount changes (cash or credit with initial collection)
    date_changed = sale.date != old_date
    total_changed = sale.total_amount != old_total
    paid_changed = sale.paid_amount != old_paid
    
    db.session.flush()
    db.session.refresh(sale)
    initial_payment = next((p for p in sale.payments if 'Initial payment' in (p.notes or '')), None)
    
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
    
    elif sale.payment_type == 'Credit' and initial_payment and sale.paid_amount > 0:
        safe_transaction = SafeTransaction.query.filter_by(payment_id=initial_payment.id).first()
        market = Market.query.get(market_id)
        currency = initial_payment.currency or (market.base_currency if market else 'USD')
        base_amt = initial_payment.amount_base_currency
        if safe_transaction:
            if date_changed:
                safe_transaction.date = sale.date
            if paid_changed or total_changed:
                safe_transaction.amount = initial_payment.amount
                safe_transaction.currency = currency
                safe_transaction.exchange_rate = initial_payment.exchange_rate
                safe_transaction.amount_base_currency_stored = base_amt
                safe_transaction.description = (
                    f'Sale {sale.invoice_number} (Collected: {sale.paid_amount}, Balance: {sale.balance})'
                )
                prev_transaction = SafeTransaction.query.filter(
                    SafeTransaction.market_id == market_id,
                    (SafeTransaction.date < sale.date)
                    | ((SafeTransaction.date == sale.date) & (SafeTransaction.id < safe_transaction.id))
                ).order_by(SafeTransaction.date.desc(), SafeTransaction.id.desc()).first()
                balance_before = prev_transaction.balance_after if prev_transaction else Decimal('0')
                safe_transaction.balance_after = balance_before + base_amt
        else:
            last_transaction = SafeTransaction.query.filter_by(market_id=market_id).order_by(
                SafeTransaction.date.desc(), SafeTransaction.id.desc()
            ).first()
            balance_before = last_transaction.balance_after if last_transaction else Decimal('0')
            balance_after = balance_before + base_amt
            safe_transaction = SafeTransaction(
                market_id=market_id,
                transaction_type='Inflow',
                amount=initial_payment.amount,
                currency=currency,
                exchange_rate=initial_payment.exchange_rate,
                amount_base_currency_stored=base_amt,
                date=sale.date,
                description=f'Sale {sale.invoice_number} (Collected: {sale.paid_amount}, Balance: {sale.balance})',
                sale_id=sale.id,
                payment_id=initial_payment.id,
                balance_after=balance_after
            )
            db.session.add(safe_transaction)
    
    db.session.flush()
    
    # Recalculate safe balances after date or amount change
    # This ensures transactions are sorted correctly by date and balances are recalculated
    if date_changed or total_changed or paid_changed:
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
    
    out = []
    for si, sale in results:
        if si.item_id and si.item:
            code, name = si.item.code, si.item.name
        else:
            code, name = '—', (si.line_description or '').strip() or '—'
        out.append({
            'date': sale.date.isoformat(),
            'invoice_number': sale.invoice_number,
            'customer_name': sale.customer.name,
            'item_code': code,
            'item_name': name,
            'quantity': float(si.quantity),
            'unit_price': float(si.unit_price),
            'total_price': float(si.total_price),
            'payment_type': sale.payment_type,
            'status': sale.status
        })
    return jsonify(out)


def _persist_imported_sale_with_items(market_id, sale_date, customer, supplier_id, notes, sale_items_payload):
    """Create Sale, SaleItems (dicts with keys item_id, line_description, quantity, unit_price, total_price), Payment + Safe for cash. Commits transaction."""
    invoice_number = generate_invoice_number(market_id)
    total_amount = sum(Decimal(str(x['total_price'])) for x in sale_items_payload)
    payment_type = customer.payment_type if customer else 'Cash'
    if payment_type == 'Cash':
        paid_amount = total_amount
        status = 'Paid'
    else:
        paid_amount = Decimal('0')
        status = 'Unpaid'
    balance = total_amount - paid_amount

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
        notes=notes or ''
    )
    db.session.add(sale)
    db.session.flush()

    for sp in sale_items_payload:
        db.session.add(SaleItem(
            sale_id=sale.id,
            item_id=sp.get('item_id'),
            line_description=sp.get('line_description'),
            quantity=Decimal(str(sp['quantity'])),
            unit_price=Decimal(str(sp['unit_price'])),
            total_price=Decimal(str(sp['total_price']))
        ))

    if paid_amount > 0 or payment_type == 'Cash':
        payment_amount = paid_amount if paid_amount > 0 else total_amount
        market = Market.query.get(market_id)
        payment_currency = customer.currency or (market.base_currency if market else 'USD')
        exchange_rate = Decimal('1')
        amount_base_currency = payment_amount
        payment = Payment(
            market_id=market_id,
            company_id=customer.id,
            sale_id=sale.id,
            payment_type='In',
            amount=payment_amount,
            currency=payment_currency,
            exchange_rate=exchange_rate,
            amount_base_currency_stored=amount_base_currency,
            date=sale.date,
            notes=f'Initial payment for invoice {invoice_number}',
            loan=False
        )
        db.session.add(payment)
        db.session.flush()

        if payment_amount > 0:
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
                description=f'Sale {invoice_number} (Collected: {payment_amount}, Balance: {balance})',
                sale_id=sale.id,
                payment_id=payment.id,
                balance_after=balance_after
            )
            db.session.add(safe_transaction)

    db.session.commit()
    from api.safe import recalc_safe_balances
    recalc_safe_balances(market_id)

    market = Market.query.get(market_id)
    if market and getattr(market, 'calculation_method', 'Average') == 'FIFO':
        from api.fifo_calculations import allocate_sale_item_fifo
        sale_ref = Sale.query.get(sale.id)
        for sale_item in sale_ref.items:
            if sale_item.item_id is None:
                continue
            try:
                allocate_sale_item_fifo(sale_item)
            except Exception as e:
                print(f"Warning: Could not allocate FIFO for sale item {sale_item.id}: {e}")


@bp.route('/import-fast', methods=['POST'])
@login_required
def import_fast_sales():
    """Import fast (non-catalog) sales: Date, Customer, LineDescription, Quantity, UnitPrice; optional Supplier, Notes."""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    file = request.files['file']
    if not file or file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    if not (file.filename.endswith('.xlsx') or file.filename.endswith('.xls')):
        return jsonify({'error': 'Invalid file type. Use .xlsx or .xls'}), 400

    try:
        file_content = file.read()
        if file.filename.endswith('.xlsx'):
            df = pd.read_excel(BytesIO(file_content), engine='openpyxl')
        else:
            df = pd.read_excel(BytesIO(file_content))
    except Exception as e:
        return jsonify({'error': f'Error reading Excel: {str(e)}'}), 400

    if df.empty:
        return jsonify({'error': 'Excel file is empty'}), 400

    df.columns = df.columns.str.strip()
    if 'ItemCode' in df.columns and df['ItemCode'].notna().any() and (df['ItemCode'].astype(str).str.strip() != '').any():
        return jsonify({'error': 'Fast import must not use ItemCode. Use the Sales page import for catalog items.'}), 400

    required = ['Date', 'Customer', 'LineDescription', 'Quantity', 'UnitPrice']
    missing = [c for c in required if c not in df.columns]
    if missing:
        return jsonify({'error': f'Missing columns: {", ".join(missing)}'}), 400

    customers_by_name = {c.name: c for c in Company.query.filter_by(market_id=market_id, category='Customer').all()}
    suppliers_by_name = {s.name: s for s in Company.query.filter_by(market_id=market_id, category='Supplier').all()}

    df['Date'] = pd.to_datetime(df['Date']).dt.date

    def norm_supplier(v):
        if pd.isna(v) or str(v).strip() == '' or str(v).lower() == 'nan':
           return ''
        return str(v).strip()

    df['_Sup'] = ''
    if 'Supplier' in df.columns:
        df['_Sup'] = df['Supplier'].apply(norm_supplier)
    grouped = df.groupby(['Date', 'Customer', '_Sup'], dropna=False)

    errors = []
    sales_created = 0
    items_created = 0

    for group_key, group in grouped:
        sale_date, customer_name, sup_key = group_key
        customer_name = str(customer_name).strip()
        customer = customers_by_name.get(customer_name)
        if not customer:
            errors.append(f'Date {sale_date}, Customer "{customer_name}": Customer not found')
            continue

        supplier_id = None
        if sup_key:
            sup = suppliers_by_name.get(sup_key)
            if not sup:
                errors.append(f'Date {sale_date}, Customer "{customer_name}": Supplier "{sup_key}" not found')
                continue
            supplier_id = sup.id

        sale_items_payload = []
        for idx, row in group.iterrows():
            desc = row['LineDescription']
            if pd.isna(desc) or str(desc).strip() == '':
                errors.append(f'Date {sale_date}, Customer "{customer_name}": LineDescription required (row {idx + 2})')
                continue
            desc = str(desc).strip()

            if pd.isna(row['Quantity']) or pd.isna(row['UnitPrice']):
                errors.append(f'Date {sale_date}, Customer "{customer_name}": Missing quantity or price (row {idx + 2})')
                continue
            try:
                qty = Decimal(str(row['Quantity']).strip())
                price = Decimal(str(row['UnitPrice']).strip())
            except Exception:
                errors.append(f'Date {sale_date}, Customer "{customer_name}": Invalid quantity/price (row {idx + 2})')
                continue
            if qty <= 0:
                errors.append(f'Date {sale_date}, Customer "{customer_name}": Quantity must be > 0 (row {idx + 2})')
                continue
            if price < 0:
                errors.append(f'Date {sale_date}, Customer "{customer_name}": Price cannot be negative (row {idx + 2})')
                continue

            tp = qty * price
            sale_items_payload.append({
                'item_id': None,
                'line_description': desc,
                'quantity': qty,
                'unit_price': price,
                'total_price': tp
            })

        if not sale_items_payload:
            errors.append(f'Date {sale_date}, Customer "{customer_name}": No valid lines')
            continue

        notes = ''
        if 'Notes' in group.columns:
            nl = group['Notes'].dropna().unique()
            if len(nl) > 0:
                ns = str(nl[0])
                if ns and ns.lower() != 'nan':
                    notes = ns.strip()

        try:
            _persist_imported_sale_with_items(
                market_id, sale_date, customer, supplier_id, notes, sale_items_payload
            )
            sales_created += 1
            items_created += len(sale_items_payload)
        except Exception as e:
            db.session.rollback()
            errors.append(f'Date {sale_date}, Customer "{customer_name}": {str(e)}')

    return jsonify({
        'success': True,
        'sales_created': sales_created,
        'items_created': items_created,
        'errors': errors
    })


@bp.route('/export', methods=['GET'])
@login_required
def export_sales_excel():
    """Line-level export. fast_only=1 limits to non-catalog lines; columns match fast import template when fast_only."""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400

    customer_id = request.args.get('customer_id', type=int)
    supplier_id = request.args.get('supplier_id', type=int)
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    fast_only = request.args.get('fast_only') == '1'

    q = db.session.query(SaleItem, Sale).options(joinedload(SaleItem.item)).join(
        Sale, SaleItem.sale_id == Sale.id
    ).filter(Sale.market_id == market_id)
    if fast_only:
        q = q.filter(SaleItem.item_id.is_(None))
    if customer_id:
        q = q.filter(Sale.customer_id == customer_id)
    if supplier_id:
        q = q.filter(Sale.supplier_id == supplier_id)
    if start_date:
        q = q.filter(Sale.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        q = q.filter(Sale.date <= datetime.strptime(end_date, '%Y-%m-%d').date())

    rows = q.order_by(Sale.date.asc(), Sale.id.asc(), SaleItem.id.asc()).all()
    sup_ids = list({s.supplier_id for _, s in rows if s.supplier_id})
    sup_map = {c.id: c.name for c in Company.query.filter(Company.id.in_(sup_ids)).all()} if sup_ids else {}

    export_data = []
    for si, sale in rows:
        supplier_name = sup_map.get(sale.supplier_id, '') if sale.supplier_id else ''
        export_data.append({
            'Date': sale.date.isoformat(),
            'Customer': sale.customer.name if sale.customer else '',
            'Supplier': supplier_name,
            'ItemCode': si.item.code if si.item_id and si.item else '',
            'LineDescription': (si.line_description or '') if not si.item_id else '',
            'Quantity': float(si.quantity),
            'UnitPrice': float(si.unit_price),
            'Notes': sale.notes or '',
        })

    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df = pd.DataFrame(export_data)
        sheet = 'Fast Sales' if fast_only else 'Sales Lines'
        df.to_excel(writer, index=False, sheet_name=sheet)
        worksheet = writer.sheets[sheet]
        for idx, col in enumerate(df.columns):
            max_length = max(df[col].astype(str).apply(len).max(), len(str(col))) if len(df) else len(str(col))
            worksheet.column_dimensions[get_column_letter(idx + 1)].width = min(max_length + 2, 50)

    output.seek(0)
    name = f'fast_sales_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx' if fast_only else f'sales_lines_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx'
    return send_file(output, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                     as_attachment=True, download_name=name)


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
                    line_description=None,
                    quantity=item_data['quantity'],
                    unit_price=item_data['unit_price'],
                    total_price=item_data['total_price']
                )
                db.session.add(sale_item)
                items_created += 1

            # Create Payment record for any initial payment (paid_amount > 0)
            # For cash sales, this ensures the payment appears in the customer statement
            # For credit sales with partial payment, this tracks the payment
            payment = None
            if paid_amount > 0 or payment_type == 'Cash':
                payment_amount = paid_amount if paid_amount > 0 else total_amount
                market = Market.query.get(market_id)
                payment_currency = customer.currency or (market.base_currency if market else 'USD')
                exchange_rate = Decimal('1')
                amount_base_currency = payment_amount

                payment = Payment(
                    market_id=market_id,
                    company_id=customer.id,
                    sale_id=sale.id,
                    payment_type='In',
                    amount=payment_amount,
                    currency=payment_currency,
                    exchange_rate=exchange_rate,
                    amount_base_currency_stored=amount_base_currency,
                    date=sale.date,
                    notes=f'Initial payment for invoice {invoice_number}',
                    loan=False
                )
                db.session.add(payment)
                db.session.flush()

            # Record in safe whenever there is an initial Payment row (cash, incl. full pay when file shows 0 paid, or credit partial)
            if payment is not None:
                market = Market.query.get(market_id)
                last_transaction = SafeTransaction.query.filter_by(market_id=market_id).order_by(
                    SafeTransaction.date.desc(), SafeTransaction.id.desc()
                ).first()
                
                balance_before = last_transaction.balance_after if last_transaction else Decimal('0')
                exact_base_amount = payment.amount_base_currency
                balance_after = balance_before + exact_base_amount
                
                safe_exchange_rate = (
                    exact_base_amount / payment.amount if payment.amount > 0 else payment.exchange_rate
                )
                safe_transaction = SafeTransaction(
                    market_id=market_id,
                    transaction_type='Inflow',
                    amount=payment.amount,
                    currency=payment.currency,
                    exchange_rate=safe_exchange_rate,
                    amount_base_currency_stored=exact_base_amount,
                    date=sale.date,
                    description=f'Sale {invoice_number} (Collected: {payment.amount}, Balance: {balance})',
                    sale_id=sale.id,
                    payment_id=payment.id,
                    balance_after=balance_after
                )
                db.session.add(safe_transaction)

        db.session.commit()
        from api.safe import recalc_safe_balances
        recalc_safe_balances(market_id)

        return jsonify({
            'success': True,
            'sales_created': sales_created,
            'items_created': items_created,
            'errors': errors
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Import failed: {str(e)}'}), 400

