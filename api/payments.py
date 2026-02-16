"""
Payments API endpoints
"""
from flask import Blueprint, request, jsonify, session, send_file
from flask_login import login_required
from models import db, Payment, Sale, Company, Market, SafeTransaction
from decimal import Decimal
from datetime import datetime
import pandas as pd
from io import BytesIO
from openpyxl.utils import get_column_letter

bp = Blueprint('payments', __name__)


def recalc_safe_balances(market_id):
    """Recalculate balance_after for all safe transactions in order."""
    txns = SafeTransaction.query.filter_by(market_id=market_id).order_by(
        SafeTransaction.date.asc(), SafeTransaction.id.asc()
    ).all()
    balance = Decimal('0')
    for t in txns:
        if t.transaction_type in ['Opening', 'Inflow']:
            balance += t.amount_base_currency
        elif t.transaction_type == 'Outflow':
            balance -= t.amount_base_currency
        t.balance_after = balance
    db.session.commit()


def derive_payment_type(company, provided_type, is_loan=False):
    """Determine payment type based on company category, but allow manual override."""
    # Loans are always 'In' (money received)
    if is_loan:
        return 'In'
    
    # If payment_type is explicitly provided and valid, use it (allows manual override)
    if provided_type and provided_type.strip() in ['In', 'Out']:
        return provided_type.strip()
    
    # Default behavior based on company category
    if company.category in ['Supplier', 'Service Company']:
        return 'Out'
    if company.category == 'Customer':
        return 'In'
    return provided_type or 'Out'

@bp.route('', methods=['GET'])
@login_required
def get_payments():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    company_id = request.args.get('company_id', type=int)
    payment_type = request.args.get('payment_type')  # In, Out
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    query = Payment.query.filter_by(market_id=market_id)
    
    if company_id:
        query = query.filter_by(company_id=company_id)
    if payment_type:
        # Normalize payment_type to handle case variations
        payment_type_normalized = payment_type.strip().capitalize()
        if payment_type_normalized in ['In', 'Out']:
            query = query.filter(Payment.payment_type == payment_type_normalized)
    if start_date:
        query = query.filter(Payment.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        query = query.filter(Payment.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    
    payments = query.order_by(Payment.date.desc(), Payment.id.desc()).all()
    
    return jsonify([{
        'id': p.id,
        'company_id': p.company_id,
        'company_name': p.company.name,
        'sale_id': p.sale_id,
        'invoice_number': p.sale.invoice_number if p.sale else None,
        'payment_type': 'In' if p.loan else (p.payment_type if p.payment_type in ['In', 'Out'] else derive_payment_type(p.company, p.payment_type or 'Out', is_loan=False)),
        'loan': p.loan,
        'amount': float(p.amount),
        'currency': p.currency,
        'exchange_rate': float(p.exchange_rate),
        'amount_base_currency': float(p.amount_base_currency),
        'date': p.date.isoformat(),
        'notes': p.notes
    } for p in payments])

@bp.route('/<int:payment_id>', methods=['GET'])
@login_required
def get_payment(payment_id):
    market_id = session.get('current_market_id')
    payment = Payment.query.filter_by(id=payment_id, market_id=market_id).first()
    if not payment:
        return jsonify({'error': 'Payment not found'}), 404
    return jsonify({
        'id': payment.id,
        'company_id': payment.company_id,
        'company_name': payment.company.name,
        'sale_id': payment.sale_id,
        'invoice_number': payment.sale.invoice_number if payment.sale else None,
        'payment_type': payment.payment_type,
        'loan': payment.loan,
        'amount': float(payment.amount),
        'currency': payment.currency,
        'exchange_rate': float(payment.exchange_rate),
        'amount_base_currency': float(payment.amount_base_currency),
        'date': payment.date.isoformat(),
        'notes': payment.notes
    })

@bp.route('', methods=['POST'])
@login_required
def create_payment():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    data = request.json
    company = Company.query.filter_by(id=data['company_id'], market_id=market_id).first()
    if not company:
        return jsonify({'error': 'Company not found'}), 404
    
    is_loan = data.get('loan', False)
    payment_type = derive_payment_type(company, data.get('payment_type'), is_loan=is_loan)
    
    # Get amounts - support both new format (amount_base_currency) and old format (exchange_rate)
    amount = Decimal(str(data['amount']))
    
    if 'amount_base_currency' in data:
        # New format: amount_base_currency is provided directly
        amount_base_currency = Decimal(str(data['amount_base_currency']))
        if amount <= 0:
            return jsonify({'error': 'Amount must be greater than zero'}), 400
        if amount_base_currency <= 0:
            return jsonify({'error': 'Amount in base currency must be greater than zero'}), 400
        # Calculate exchange rate: rate = base_amount / original_amount
        exchange_rate = amount_base_currency / amount
    else:
        # Backward compatibility: if exchange_rate is provided, use it
        exchange_rate = Decimal(str(data.get('exchange_rate', 1)))
        amount_base_currency = amount * exchange_rate
    
    payment = Payment(
        market_id=market_id,
        company_id=company.id,
        sale_id=data.get('sale_id'),
        payment_type=payment_type,  # In or Out
        amount=amount,
        currency=data['currency'],
        exchange_rate=exchange_rate,
        amount_base_currency_stored=amount_base_currency,  # Store exact value entered
        date=datetime.strptime(data['date'], '%Y-%m-%d').date(),
        notes=data.get('notes', ''),
        loan=data.get('loan', False)  # True if this is a loan/borrowing
    )
    
    db.session.add(payment)
    
    # Update sale if linked (only for In payments - Out payments are refunds/returns, not payments on sales)
    if payment.sale_id and payment.payment_type == 'In':
        sale = Sale.query.get(payment.sale_id)
        if sale:
            sale.paid_amount += payment.amount_base_currency
            sale.update_status()
    
    # Record in safe
    market = Market.query.get(market_id)
    last_transaction = SafeTransaction.query.filter_by(market_id=market_id).order_by(
        SafeTransaction.date.desc(), SafeTransaction.id.desc()
    ).first()
    
    balance_before = last_transaction.balance_after if last_transaction else Decimal('0')
    
    # Get exact base currency amount from payment (stored value)
    exact_base_amount = payment.amount_base_currency
    
    # Handle loans: all loans are inflows (money received)
    if payment.loan:
        balance_after = balance_before + exact_base_amount
        transaction_type = 'Inflow'
        description = f'Loan from {payment.company.name}'
    elif payment.payment_type == 'In':
        balance_after = balance_before + exact_base_amount
        transaction_type = 'Inflow'
        description = f'Payment from {payment.company.name}'
    else:
        balance_after = balance_before - exact_base_amount
        transaction_type = 'Outflow'
        description = f'Payment to {payment.company.name}'
    
    if payment.sale:
        description += f' - Invoice {payment.sale.invoice_number}'
    
    # Store exact base currency amount directly in SafeTransaction
    safe_exchange_rate = exact_base_amount / payment.amount if payment.amount > 0 else payment.exchange_rate
    
    safe_transaction = SafeTransaction(
        market_id=market_id,
        transaction_type=transaction_type,
        amount=payment.amount,
        currency=payment.currency,
        exchange_rate=safe_exchange_rate,  # For display/reference
        amount_base_currency_stored=exact_base_amount,  # Store exact value directly
        date=payment.date,
        description=description,
        payment_id=payment.id,
        sale_id=payment.sale_id,
        balance_after=balance_after
    )
    db.session.add(safe_transaction)
    
    db.session.commit()
    recalc_safe_balances(market_id)
    
    return jsonify({
        'id': payment.id,
        'company_id': payment.company_id,
        'company_name': payment.company.name,
        'sale_id': payment.sale_id,
        'invoice_number': payment.sale.invoice_number if payment.sale else None,
        'payment_type': payment.payment_type,
        'amount': float(payment.amount),
        'currency': payment.currency,
        'exchange_rate': float(payment.exchange_rate),
        'amount_base_currency': float(payment.amount_base_currency),
        'date': payment.date.isoformat(),
        'notes': payment.notes
    }), 201

@bp.route('/<int:payment_id>', methods=['DELETE'])
@login_required
def delete_payment(payment_id):
    market_id = session.get('current_market_id')
    payment = Payment.query.filter_by(id=payment_id, market_id=market_id).first()
    
    if not payment:
        return jsonify({'error': 'Payment not found'}), 404
    
    # Update sale if linked (only for In payments - Out payments are refunds/returns)
    if payment.sale_id and payment.payment_type == 'In':
        sale = Sale.query.get(payment.sale_id)
        if sale:
            sale.paid_amount -= payment.amount_base_currency
            sale.update_status()
    
    # Delete safe transaction
    SafeTransaction.query.filter_by(payment_id=payment_id).delete()
    
    db.session.delete(payment)
    db.session.commit()
    recalc_safe_balances(market_id)
    
    return jsonify({'success': True})

@bp.route('/<int:payment_id>', methods=['PUT'])
@login_required
def update_payment(payment_id):
    market_id = session.get('current_market_id')
    payment = Payment.query.filter_by(id=payment_id, market_id=market_id).first()
    
    if not payment:
        return jsonify({'error': 'Payment not found'}), 404
    
    data = request.json
    company = Company.query.filter_by(id=data.get('company_id', payment.company_id), market_id=market_id).first()
    if not company:
        return jsonify({'error': 'Company not found'}), 404
    
    old_amount_base = payment.amount_base_currency
    old_sale_id = payment.sale_id
    old_payment_type = payment.payment_type
    
    # Get amounts - support both new format (amount_base_currency) and old format (exchange_rate)
    amount = Decimal(str(data.get('amount', payment.amount)))
    if 'amount_base_currency' in data:
        amount_base_currency = Decimal(str(data['amount_base_currency']))
        if amount <= 0:
            return jsonify({'error': 'Amount must be greater than zero'}), 400
        if amount_base_currency <= 0:
            return jsonify({'error': 'Amount in base currency must be greater than zero'}), 400
        exchange_rate = amount_base_currency / amount
    else:
        # Backward compatibility: if exchange_rate is provided, use it
        exchange_rate = Decimal(str(data.get('exchange_rate', payment.exchange_rate)))
        amount_base_currency = amount * exchange_rate
    
    payment.company_id = company.id
    payment.sale_id = data.get('sale_id')
    is_loan = data.get('loan', payment.loan)
    payment.payment_type = derive_payment_type(company, data.get('payment_type', payment.payment_type), is_loan=is_loan)
    payment.amount = amount
    payment.currency = data.get('currency', payment.currency)
    payment.exchange_rate = exchange_rate
    payment.amount_base_currency_stored = amount_base_currency  # Store exact value entered
    payment.date = datetime.strptime(data.get('date', payment.date.isoformat()), '%Y-%m-%d').date()
    payment.notes = data.get('notes', payment.notes)
    payment.loan = data.get('loan', payment.loan)
    
    # Update sale linkage (only for In payments - Out payments are refunds/returns)
    if old_sale_id and old_sale_id != payment.sale_id:
        sale_old = Sale.query.get(old_sale_id)
        if sale_old and old_payment_type == 'In':  # Only adjust if it was an In payment
            sale_old.paid_amount -= old_amount_base
            sale_old.update_status()
    if payment.sale_id and payment.payment_type == 'In':  # Only update if it's an In payment
        sale_new = Sale.query.get(payment.sale_id)
        if sale_new:
            sale_new.paid_amount += payment.amount_base_currency
            sale_new.update_status()
    
    # Get exact base currency amount from payment (stored value)
    exact_base_amount = payment.amount_base_currency
    
    # Calculate exchange_rate for SafeTransaction (for display/reference)
    safe_exchange_rate = exact_base_amount / payment.amount if payment.amount > 0 else payment.exchange_rate
    
    # Update safe transaction linked to this payment
    safe_txn = SafeTransaction.query.filter_by(payment_id=payment.id).first()
    if safe_txn:
        safe_txn.amount = payment.amount
        safe_txn.currency = payment.currency
        safe_txn.exchange_rate = safe_exchange_rate  # For display/reference
        safe_txn.amount_base_currency_stored = exact_base_amount  # Store exact value directly
        safe_txn.date = payment.date
        # Handle loans: all loans are inflows
        if payment.loan:
            safe_txn.transaction_type = 'Inflow'
            description = f'Loan from {payment.company.name}'
        else:
            safe_txn.transaction_type = 'Inflow' if payment.payment_type == 'In' else 'Outflow'
            description = f"Payment {'from' if payment.payment_type == 'In' else 'to'} {payment.company.name}"
        if payment.sale:
            description += f" - Invoice {payment.sale.invoice_number}"
        safe_txn.description = description
    else:
        # Handle loans: all loans are inflows
        if payment.loan:
            txn_type = 'Inflow'
            description = f'Loan from {payment.company.name}'
        else:
            txn_type = 'Inflow' if payment.payment_type == 'In' else 'Outflow'
            description = f"Payment {'from' if payment.payment_type == 'In' else 'to'} {payment.company.name}"
        if payment.sale:
            description += f" - Invoice {payment.sale.invoice_number}"
        
        last_transaction = SafeTransaction.query.filter_by(market_id=market_id).order_by(
            SafeTransaction.date.desc(), SafeTransaction.id.desc()
        ).first()
        balance_before = last_transaction.balance_after if last_transaction else Decimal('0')
        
        if txn_type == 'Inflow':
            balance_after = balance_before + exact_base_amount
        else:
            balance_after = balance_before - exact_base_amount
        
        safe_txn = SafeTransaction(
            market_id=market_id,
            transaction_type=txn_type,
            amount=payment.amount,
            currency=payment.currency,
            exchange_rate=safe_exchange_rate,  # For display/reference
            amount_base_currency_stored=exact_base_amount,  # Store exact value directly
            date=payment.date,
            description=description,
            payment_id=payment.id,
            sale_id=payment.sale_id,
            balance_after=balance_after
        )
        db.session.add(safe_txn)
    
    db.session.commit()
    recalc_safe_balances(market_id)
    
    return jsonify({
        'id': payment.id,
        'company_id': payment.company_id,
        'company_name': payment.company.name,
        'sale_id': payment.sale_id,
        'invoice_number': payment.sale.invoice_number if payment.sale else None,
        'payment_type': payment.payment_type,
        'amount': float(payment.amount),
        'currency': payment.currency,
        'exchange_rate': float(payment.exchange_rate),
        'amount_base_currency': float(payment.amount_base_currency),
        'date': payment.date.isoformat(),
        'notes': payment.notes
    })

@bp.route('/import', methods=['POST'])
@login_required
def import_payments():
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
        if file.filename.endswith('.xlsx'):
            df = pd.read_excel(file, engine='openpyxl')
        else:
            try:
                df = pd.read_excel(file)
            except:
                df = pd.read_excel(file, engine='xlrd')
        
        if df.empty:
            return jsonify({'error': 'Excel file is empty'}), 400
        
        df.columns = df.columns.str.strip()
        # Support both new format (AmountBaseCurrency) and old format (ExchangeRate)
        has_base_currency = 'AmountBaseCurrency' in df.columns
        has_exchange_rate = 'ExchangeRate' in df.columns
        
        required_cols = ['Date', 'Company', 'PaymentType', 'Amount', 'Currency']
        if not has_base_currency and not has_exchange_rate:
            required_cols.append('AmountBaseCurrency or ExchangeRate')
        
        missing_cols = [col for col in required_cols if col not in df.columns and not col.endswith(' or ExchangeRate')]
        if missing_cols:
            return jsonify({'error': f'Missing columns: {", ".join(missing_cols)}. Found: {", ".join(df.columns.tolist())}. Required: AmountBaseCurrency (preferred) or ExchangeRate (backward compatible)'}), 400
        
        companies = Company.query.filter_by(market_id=market_id).all()
        companies_by_name = {c.name.strip().lower(): c for c in companies}
        
        errors = []
        created_payments = 0
        
        for idx, row in df.iterrows():
            company_name = str(row['Company']).strip()
            company = companies_by_name.get(company_name.lower())
            if not company:
                errors.append(f'Row {idx + 2}: Company "{company_name}" not found')
                continue
            
            provided_type = str(row['PaymentType']).strip().capitalize()
            if provided_type not in ['In', 'Out']:
                errors.append(f'Row {idx + 2}: PaymentType must be "In" or "Out" (got "{row["PaymentType"]}")')
                continue
            
            try:
                date_val = pd.to_datetime(row['Date']).date()
                amount = Decimal(str(row['Amount']))
                currency = str(row['Currency']).strip()
                
                # Support both new format (AmountBaseCurrency) and old format (ExchangeRate)
                if 'AmountBaseCurrency' in df.columns and pd.notna(row.get('AmountBaseCurrency')):
                    # New format: AmountBaseCurrency is provided directly
                    amount_base_currency = Decimal(str(row['AmountBaseCurrency']))
                    if amount <= 0:
                        errors.append(f'Row {idx + 2}: Amount must be greater than zero')
                        continue
                    if amount_base_currency <= 0:
                        errors.append(f'Row {idx + 2}: AmountBaseCurrency must be greater than zero')
                        continue
                    exchange_rate = amount_base_currency / amount
                elif 'ExchangeRate' in df.columns and pd.notna(row.get('ExchangeRate')):
                    # Backward compatibility: ExchangeRate is provided
                    exchange_rate = Decimal(str(row['ExchangeRate']))
                    amount_base_currency = amount * exchange_rate
                else:
                    errors.append(f'Row {idx + 2}: Either AmountBaseCurrency or ExchangeRate must be provided')
                    continue
                
                sale_id = None
                
                # Optional invoice link
                if 'InvoiceNumber' in df.columns and pd.notna(row.get('InvoiceNumber')):
                    invoice_number = str(row['InvoiceNumber']).strip()
                    sale = Sale.query.filter_by(market_id=market_id, invoice_number=invoice_number).first()
                    if sale:
                        sale_id = sale.id
                
                notes = str(row.get('Notes', '')).strip() if 'Notes' in df.columns and pd.notna(row.get('Notes')) else ''
                
                # Check if this is a loan payment
                is_loan = False
                if 'Loan' in df.columns and pd.notna(row.get('Loan')):
                    loan_value = str(row['Loan']).strip().lower()
                    is_loan = loan_value in ['true', '1', 'yes', 'y']
                
                payment_type = derive_payment_type(company, provided_type, is_loan=is_loan)
                payment = Payment(
                    market_id=market_id,
                    company_id=company.id,
                    sale_id=sale_id,
                    payment_type=payment_type,
                    amount=amount,
                    currency=currency,
                    exchange_rate=exchange_rate,
                    amount_base_currency_stored=amount_base_currency,  # Store exact value entered
                    date=date_val,
                    notes=notes,
                    loan=is_loan
                )
                db.session.add(payment)
                
                # Update sale if linked
                if sale_id:
                    sale = Sale.query.get(sale_id)
                    if sale:
                        sale.paid_amount += payment.amount_base_currency
                        sale.update_status()
                
                # Record in safe
                # Get exact base currency amount from payment (stored value)
                exact_base_amount = payment.amount_base_currency
                
                # Calculate exchange_rate for SafeTransaction (for display/reference)
                safe_exchange_rate = exact_base_amount / payment.amount if payment.amount > 0 else payment.exchange_rate
                
                last_transaction = SafeTransaction.query.filter_by(market_id=market_id).order_by(
                    SafeTransaction.date.desc(), SafeTransaction.id.desc()
                ).first()
                
                balance_before = last_transaction.balance_after if last_transaction else Decimal('0')
                
                # Handle loans: all loans are inflows
                if payment.loan:
                    balance_after = balance_before + exact_base_amount
                    transaction_type = 'Inflow'
                    description = f'Loan from {payment.company.name}'
                elif payment.payment_type == 'In':
                    balance_after = balance_before + exact_base_amount
                    transaction_type = 'Inflow'
                    description = f'Payment from {payment.company.name}'
                else:
                    balance_after = balance_before - exact_base_amount
                    transaction_type = 'Outflow'
                    description = f'Payment to {payment.company.name}'
                
                if sale_id and sale:
                    description += f' - Invoice {sale.invoice_number}'
                
                safe_transaction = SafeTransaction(
                    market_id=market_id,
                    transaction_type=transaction_type,
                    amount=payment.amount,
                    currency=payment.currency,
                    exchange_rate=safe_exchange_rate,  # For display/reference
                    amount_base_currency_stored=exact_base_amount,  # Store exact value directly
                    date=payment.date,
                    description=description,
                    payment_id=payment.id,
                    sale_id=payment.sale_id,
                    balance_after=balance_after
                )
                db.session.add(safe_transaction)
                created_payments += 1
            
            except Exception as e:
                errors.append(f'Row {idx + 2}: {str(e)}')
                continue
        
        db.session.commit()
        recalc_safe_balances(market_id)
        
        return jsonify({
            'success': True,
            'payments_created': created_payments,
            'errors': errors
        })
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Import failed: {str(e)}'}), 400

@bp.route('/export', methods=['GET'])
@login_required
def export_payments():
    """Export payments to Excel - formatted for import to another market
    Format matches import requirements: Date, Company, PaymentType, Amount, Currency, AmountBaseCurrency
    Optional: InvoiceNumber, Notes, Loan
    """
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    company_id = request.args.get('company_id', type=int)
    payment_type = request.args.get('payment_type')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    # Build query (same as get_payments)
    query = Payment.query.filter_by(market_id=market_id)
    
    if company_id:
        query = query.filter_by(company_id=company_id)
    if payment_type:
        payment_type_normalized = payment_type.strip().capitalize()
        if payment_type_normalized in ['In', 'Out']:
            query = query.filter(Payment.payment_type == payment_type_normalized)
    if start_date:
        query = query.filter(Payment.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        query = query.filter(Payment.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    
    payments = query.order_by(Payment.date.asc(), Payment.id.asc()).all()
    
    # Prepare Excel data in import format
    export_rows = []
    
    for payment in payments:
        # Determine PaymentType: loans are always 'In', otherwise use payment_type
        payment_type_export = 'In' if payment.loan else (payment.payment_type if payment.payment_type in ['In', 'Out'] else 'Out')
        
        row = {
            'Date': payment.date.strftime('%Y-%m-%d'),
            'Company': payment.company.name,
            'PaymentType': payment_type_export,
            'Amount': float(payment.amount),
            'Currency': payment.currency,
            'AmountBaseCurrency': float(payment.amount_base_currency)
        }
        
        # Optional fields
        if payment.sale:
            row['InvoiceNumber'] = payment.sale.invoice_number
        if payment.notes:
            row['Notes'] = payment.notes
        if payment.loan:
            row['Loan'] = True
        
        export_rows.append(row)
    
    # Create Excel file
    output = BytesIO()
    
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        if export_rows:
            df = pd.DataFrame(export_rows)
            df.to_excel(writer, index=False, sheet_name='Payments')
            
            # Format the sheet
            worksheet = writer.sheets['Payments']
            for idx, col in enumerate(df.columns):
                max_length = max(
                    df[col].astype(str).apply(len).max(),
                    len(str(col))
                )
                worksheet.column_dimensions[get_column_letter(idx + 1)].width = min(max_length + 2, 50)
    
    output.seek(0)
    filename = f'payments_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx'
    
    return send_file(
        output,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name=filename
    )

