"""
Safe (Cashbox) API endpoints
"""
from flask import Blueprint, request, jsonify, session, send_file
from flask_login import login_required
from models import db, SafeTransaction, Market, Payment, Sale, Company
from decimal import Decimal
from datetime import datetime
import pandas as pd
from io import BytesIO
from openpyxl.utils import get_column_letter
from api.expenses import _get_currency_rates_for_dates, _resolve_usd_rate, _approx_usd_amount

bp = Blueprint('safe', __name__)

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

@bp.route('/transactions', methods=['GET'])
@login_required
def get_transactions():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    transaction_type = request.args.get('transaction_type')  # Opening, Inflow, Outflow
    
    query = SafeTransaction.query.filter_by(market_id=market_id)
    
    if transaction_type:
        query = query.filter_by(transaction_type=transaction_type)
    if start_date:
        query = query.filter(SafeTransaction.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        query = query.filter(SafeTransaction.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    
    transactions = query.order_by(SafeTransaction.date.desc(), SafeTransaction.id.desc()).all()
    
    return jsonify([{
        'id': t.id,
        'transaction_type': t.transaction_type,
        'amount': float(t.amount),
        'currency': t.currency,
        'exchange_rate': float(t.exchange_rate),
        'amount_base_currency': float(t.amount_base_currency),
        'date': t.date.isoformat(),
        'description': t.description,
        'balance_after': float(t.balance_after),
        'payment_id': t.payment_id,
        'sale_id': t.sale_id,
        'general_expense_id': t.general_expense_id,
        'partner_drawing_id': t.partner_drawing_id,
        'is_editable': not (t.payment_id or t.sale_id or t.general_expense_id or t.partner_drawing_id)
    } for t in transactions])

@bp.route('/balance', methods=['GET'])
@login_required
def get_current_balance():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    last_transaction = SafeTransaction.query.filter_by(market_id=market_id).order_by(
        SafeTransaction.date.desc(), SafeTransaction.id.desc()
    ).first()
    
    balance = last_transaction.balance_after if last_transaction else Decimal('0')
    
    market = Market.query.get(market_id)
    
    return jsonify({
        'balance': float(balance),
        'currency': market.base_currency if market else 'USD',
        'last_transaction_date': last_transaction.date.isoformat() if last_transaction else None
    })

@bp.route('/adjustment', methods=['POST'])
@login_required
def create_adjustment():
    """Create a manual adjustment transaction (inflow or outflow)"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    data = request.json
    
    transaction_type = data.get('transaction_type')  # 'Inflow' or 'Outflow'
    if transaction_type not in ['Inflow', 'Outflow']:
        return jsonify({'error': 'Transaction type must be Inflow or Outflow'}), 400
    
    amount = Decimal(str(data['amount']))
    if amount <= 0:
        return jsonify({'error': 'Amount must be greater than zero'}), 400
    
    currency = data.get('currency', 'CFA')  # Default to market base currency
    exchange_rate = Decimal(str(data.get('exchange_rate', 1)))
    
    # Calculate exact base currency amount
    exact_base_amount = amount * exchange_rate
    
    # Get last safe balance
    last_transaction = SafeTransaction.query.filter_by(market_id=market_id).order_by(
        SafeTransaction.date.desc(), SafeTransaction.id.desc()
    ).first()
    
    balance_before = last_transaction.balance_after if last_transaction else Decimal('0')
    
    if transaction_type == 'Inflow':
        balance_after = balance_before + exact_base_amount
    else:  # Outflow
        balance_after = balance_before - exact_base_amount
    
    description = data.get('description', f'Manual Adjustment - {transaction_type}')
    
    transaction = SafeTransaction(
        market_id=market_id,
        transaction_type=transaction_type,
        amount=amount,
        currency=currency,
        exchange_rate=exchange_rate,
        amount_base_currency_stored=exact_base_amount,
        date=datetime.strptime(data['date'], '%Y-%m-%d').date(),
        description=description,
        balance_after=balance_after
    )
    
    db.session.add(transaction)
    db.session.commit()
    
    # Recalculate all balances to ensure consistency
    recalc_safe_balances(market_id)
    
    return jsonify({
        'id': transaction.id,
        'transaction_type': transaction.transaction_type,
        'amount': float(transaction.amount),
        'currency': transaction.currency,
        'exchange_rate': float(transaction.exchange_rate),
        'amount_base_currency': float(transaction.amount_base_currency),
        'date': transaction.date.isoformat(),
        'description': transaction.description,
        'balance_after': float(transaction.balance_after)
    }), 201

@bp.route('/adjustment/<int:transaction_id>', methods=['GET'])
@login_required
def get_adjustment(transaction_id):
    """Get a single adjustment transaction"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    transaction = SafeTransaction.query.filter_by(
        id=transaction_id,
        market_id=market_id
    ).first()
    
    if not transaction:
        return jsonify({'error': 'Transaction not found'}), 404
    
    # Only manual adjustments (not linked to payment, sale, expense, or partner drawing)
    if transaction.payment_id or transaction.sale_id or transaction.general_expense_id or transaction.partner_drawing_id:
        return jsonify({'error': 'This transaction cannot be edited (it is linked to a payment, sale, expense, or partner drawing)'}), 400
    
    return jsonify({
        'id': transaction.id,
        'transaction_type': transaction.transaction_type,
        'amount': float(transaction.amount),
        'currency': transaction.currency,
        'exchange_rate': float(transaction.exchange_rate),
        'amount_base_currency': float(transaction.amount_base_currency),
        'date': transaction.date.isoformat(),
        'description': transaction.description,
        'balance_after': float(transaction.balance_after)
    })

@bp.route('/adjustment/<int:transaction_id>', methods=['PUT'])
@login_required
def update_adjustment(transaction_id):
    """Update a manual adjustment transaction"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    transaction = SafeTransaction.query.filter_by(
        id=transaction_id,
        market_id=market_id
    ).first()
    
    if not transaction:
        return jsonify({'error': 'Transaction not found'}), 404
    
    if transaction.payment_id or transaction.sale_id or transaction.general_expense_id or transaction.partner_drawing_id:
        return jsonify({'error': 'This transaction cannot be edited (it is linked to a payment, sale, expense, or partner drawing)'}), 400
    
    data = request.json
    
    transaction_type = data.get('transaction_type')
    if transaction_type not in ['Inflow', 'Outflow']:
        return jsonify({'error': 'Transaction type must be Inflow or Outflow'}), 400
    
    amount = Decimal(str(data['amount']))
    if amount <= 0:
        return jsonify({'error': 'Amount must be greater than zero'}), 400
    
    currency = data.get('currency', 'CFA')
    exchange_rate = Decimal(str(data.get('exchange_rate', 1)))
    
    # Calculate exact base currency amount
    exact_base_amount = amount * exchange_rate
    
    # Update transaction
    transaction.transaction_type = transaction_type
    transaction.amount = amount
    transaction.currency = currency
    transaction.exchange_rate = exchange_rate
    transaction.amount_base_currency_stored = exact_base_amount
    transaction.date = datetime.strptime(data['date'], '%Y-%m-%d').date()
    transaction.description = data.get('description', f'Manual Adjustment - {transaction_type}')
    
    db.session.commit()
    
    # Recalculate all balances to ensure consistency
    recalc_safe_balances(market_id)
    
    # Refresh transaction to get updated balance_after
    db.session.refresh(transaction)
    
    return jsonify({
        'id': transaction.id,
        'transaction_type': transaction.transaction_type,
        'amount': float(transaction.amount),
        'currency': transaction.currency,
        'exchange_rate': float(transaction.exchange_rate),
        'amount_base_currency': float(transaction.amount_base_currency),
        'date': transaction.date.isoformat(),
        'description': transaction.description,
        'balance_after': float(transaction.balance_after)
    })

@bp.route('/adjustment/<int:transaction_id>', methods=['DELETE'])
@login_required
def delete_adjustment(transaction_id):
    """Delete a manual adjustment transaction"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    transaction = SafeTransaction.query.filter_by(
        id=transaction_id,
        market_id=market_id
    ).first()
    
    if not transaction:
        return jsonify({'error': 'Transaction not found'}), 404
    
    if transaction.payment_id or transaction.sale_id or transaction.general_expense_id or transaction.partner_drawing_id:
        return jsonify({'error': 'This transaction cannot be deleted (it is linked to a payment, sale, expense, or partner drawing)'}), 400
    
    db.session.delete(transaction)
    db.session.commit()
    
    # Recalculate all balances to ensure consistency
    recalc_safe_balances(market_id)
    
    return jsonify({'success': True})

@bp.route('/opening-balance', methods=['POST'])
@login_required
def set_opening_balance():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    data = request.json
    
    # Check if opening balance already exists
    existing = SafeTransaction.query.filter_by(
        market_id=market_id,
        transaction_type='Opening'
    ).first()
    
    if existing:
        return jsonify({'error': 'Opening balance already set'}), 400
    
    opening_balance = Decimal(str(data['amount']))
    
    # Calculate exact base currency amount
    exchange_rate = Decimal(str(data['exchange_rate']))
    exact_base_amount = opening_balance * exchange_rate
    
    transaction = SafeTransaction(
        market_id=market_id,
        transaction_type='Opening',
        amount=opening_balance,
        currency=data['currency'],
        exchange_rate=exchange_rate,
        amount_base_currency_stored=exact_base_amount,  # Store exact value directly
        date=datetime.strptime(data['date'], '%Y-%m-%d').date(),
        description='Opening Balance',
        balance_after=exact_base_amount
    )
    
    db.session.add(transaction)
    db.session.commit()
    
    return jsonify({
        'id': transaction.id,
        'transaction_type': transaction.transaction_type,
        'amount': float(transaction.amount),
        'currency': transaction.currency,
        'exchange_rate': float(transaction.exchange_rate),
        'amount_base_currency': float(transaction.amount_base_currency),
        'date': transaction.date.isoformat(),
        'description': transaction.description,
        'balance_after': float(transaction.balance_after)
    }), 201

@bp.route('/movement-report', methods=['GET'])
@login_required
def get_movement_report():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    transaction_type_filter = request.args.get('transaction_type')  # In, Out, or All
    
    query = SafeTransaction.query.filter_by(market_id=market_id)
    
    if start_date:
        query = query.filter(SafeTransaction.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        query = query.filter(SafeTransaction.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    
    # Filter by transaction type
    if transaction_type_filter == 'In':
        query = query.filter(SafeTransaction.transaction_type.in_(['Opening', 'Inflow']))
    elif transaction_type_filter == 'Out':
        query = query.filter(SafeTransaction.transaction_type == 'Outflow')
    # If 'All' or not specified, show all types
    
    transactions = query.order_by(SafeTransaction.date.asc(), SafeTransaction.id.asc()).all()
    
    # Get opening balance before start date
    if start_date:
        opening_query = SafeTransaction.query.filter_by(market_id=market_id).filter(
            SafeTransaction.date < datetime.strptime(start_date, '%Y-%m-%d').date()
        ).order_by(SafeTransaction.date.desc(), SafeTransaction.id.desc())
        opening_transaction = opening_query.first()
        opening_balance = opening_transaction.balance_after if opening_transaction else Decimal('0')
    else:
        opening_balance = Decimal('0')
    
    # Calculate totals
    total_inflow = sum(t.amount_base_currency for t in transactions if t.transaction_type == 'Inflow')
    total_outflow = sum(t.amount_base_currency for t in transactions if t.transaction_type == 'Outflow')
    closing_balance = opening_balance + total_inflow - total_outflow
    
    return jsonify({
        'opening_balance': float(opening_balance),
        'total_inflow': float(total_inflow),
            'total_outflow': float(total_outflow),
            'closing_balance': float(closing_balance),
            'transactions': [{
                'date': t.date.isoformat(),
                'type': t.transaction_type,
                'description': t.description,
                'amount': float(t.amount_base_currency),
                'balance_after': float(t.balance_after)
            } for t in transactions]
        })

@bp.route('/movement-report/export', methods=['GET'])
@login_required
def export_safe_report():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    query = SafeTransaction.query.filter_by(market_id=market_id)
    if start_date:
        query = query.filter(SafeTransaction.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        query = query.filter(SafeTransaction.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    
    transactions = query.order_by(SafeTransaction.date.asc(), SafeTransaction.id.asc()).all()
    
    if start_date:
        opening_query = SafeTransaction.query.filter_by(market_id=market_id).filter(
            SafeTransaction.date < datetime.strptime(start_date, '%Y-%m-%d').date()
        ).order_by(SafeTransaction.date.desc(), SafeTransaction.id.desc())
        opening_transaction = opening_query.first()
        opening_balance = opening_transaction.balance_after if opening_transaction else Decimal('0')
    else:
        opening_balance = Decimal('0')
    
    total_inflow = sum(t.amount_base_currency for t in transactions if t.transaction_type == 'Inflow')
    total_outflow = sum(t.amount_base_currency for t in transactions if t.transaction_type == 'Outflow')
    closing_balance = opening_balance + total_inflow - total_outflow
    
    # Create summary sheet
    summary_data = [{
        'Opening Balance': float(opening_balance),
        'Total Inflow': float(total_inflow),
        'Total Outflow': float(total_outflow),
        'Closing Balance': float(closing_balance)
    }]
    
    # Create transactions sheet
    transactions_data = [{
        'Date': t.date.isoformat(),
        'Type': t.transaction_type,
        'Description': t.description,
        'Amount': float(t.amount_base_currency),
        'Balance After': float(t.balance_after)
    } for t in transactions]
    
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        pd.DataFrame(summary_data).to_excel(writer, sheet_name='Summary', index=False)
        pd.DataFrame(transactions_data).to_excel(writer, sheet_name='Transactions', index=False)
    
    output.seek(0)
    filename = f'safe_movement_{start_date or "all"}_{end_date or "all"}.xlsx'
    return send_file(output, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    as_attachment=True, download_name=filename)

def _resolve_customer_payment_type(txn):
    """Return customer payment_type ('Cash' or 'Credit') or None for non-customer inflows."""
    customer = None
    if txn.payment_id:
        payment = Payment.query.get(txn.payment_id)
        if payment:
            if payment.company and payment.company.category == 'Customer':
                customer = payment.company
            elif payment.sale_id:
                sale = Sale.query.get(payment.sale_id)
                if sale and sale.customer:
                    customer = sale.customer
    elif txn.sale_id:
        sale = Sale.query.get(txn.sale_id)
        if sale and sale.customer:
            customer = sale.customer
    if customer:
        return customer.payment_type or 'Cash'
    return None


def _build_collected_money_entry(txn):
    """Serialize one safe inflow for the collected money report."""
    source_type = 'Other'
    source_name = None
    invoice_number = None
    customer_name = None

    if txn.payment_id:
        payment = Payment.query.get(txn.payment_id)
        if payment:
            if payment.loan:
                source_type = 'Loan'
                source_name = payment.company.name if payment.company else 'Unknown'
            else:
                source_type = 'Payment'
                source_name = payment.company.name if payment.company else 'Unknown'
                if payment.sale_id:
                    sale = Sale.query.get(payment.sale_id)
                    if sale:
                        invoice_number = sale.invoice_number
                        customer_name = sale.customer.name if sale.customer else None
    elif txn.sale_id:
        sale = Sale.query.get(txn.sale_id)
        if sale:
            source_type = 'Cash Sale'
            source_name = sale.customer.name if sale.customer else 'Unknown'
            invoice_number = sale.invoice_number
            customer_name = sale.customer.name if sale.customer else None

    amount = txn.amount_base_currency_stored if txn.amount_base_currency_stored else txn.amount_base_currency

    return {
        'date': txn.date.isoformat(),
        'source_type': source_type,
        'source_name': source_name or 'Unknown',
        'customer_name': customer_name,
        'invoice_number': invoice_number,
        'description': txn.description or '',
        'amount': float(amount),
        'currency': txn.currency,
        'exchange_rate': float(txn.exchange_rate),
        'customer_payment_type': _resolve_customer_payment_type(txn),
    }


def _filter_collected_money_by_customer_type(collected_money, customer_type):
    """Filter inflows by customer payment type: both, cash, or credit (debit customers)."""
    if not customer_type or customer_type == 'both':
        return collected_money
    if customer_type == 'cash':
        return [item for item in collected_money if item.get('customer_payment_type') == 'Cash']
    if customer_type == 'credit':
        return [item for item in collected_money if item.get('customer_payment_type') == 'Credit']
    return collected_money


def _fetch_collected_money(market_id, start_date, end_date, customer_type='both'):
    query = SafeTransaction.query.filter_by(
        market_id=market_id,
        transaction_type='Inflow'
    )
    if start_date:
        query = query.filter(SafeTransaction.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        query = query.filter(SafeTransaction.date <= datetime.strptime(end_date, '%Y-%m-%d').date())

    transactions = query.order_by(SafeTransaction.date.asc(), SafeTransaction.id.asc()).all()
    collected_money = [_build_collected_money_entry(txn) for txn in transactions]
    return _filter_collected_money_by_customer_type(collected_money, customer_type)


def _compute_collected_money_usd_total(collected_money, market_id):
    """Approximate USD total using Safe Statement rates per transaction date."""
    if not collected_money:
        return 0.0
    dates = [
        datetime.strptime(item['date'], '%Y-%m-%d').date()
        for item in collected_money
    ]
    rates_map = _get_currency_rates_for_dates(market_id, dates)
    total_usd = Decimal('0')
    for item in collected_money:
        usd_rate, _ = _resolve_usd_rate(item['date'], rates_map)
        total_usd += Decimal(str(_approx_usd_amount(item['amount'], usd_rate)))
    return float(total_usd)


def _group_collected_money(collected_money, group_by):
    total_collected = sum(Decimal(str(item['amount'])) for item in collected_money)

    if group_by == 'date':
        grouped = {}
        for item in collected_money:
            date = item['date']
            if date not in grouped:
                grouped[date] = {'date': date, 'items': [], 'total': Decimal('0')}
            grouped[date]['items'].append(item)
            grouped[date]['total'] += Decimal(str(item['amount']))

        grouped_list = [
            {'date': data['date'], 'total': float(data['total']), 'items': data['items']}
            for date in sorted(grouped.keys())
            for data in [grouped[date]]
        ]
        return {
            'total_collected': float(total_collected),
            'grouped_by': 'date',
            'data': grouped_list,
        }

    if group_by == 'customer':
        grouped = {}
        for item in collected_money:
            customer = item['customer_name'] or item['source_name'] or 'Unknown'
            if customer not in grouped:
                grouped[customer] = {'customer_name': customer, 'items': [], 'total': Decimal('0')}
            grouped[customer]['items'].append(item)
            grouped[customer]['total'] += Decimal(str(item['amount']))

        grouped_list = [
            {'customer_name': data['customer_name'], 'total': float(data['total']), 'items': data['items']}
            for customer in sorted(grouped.keys())
            for data in [grouped[customer]]
        ]
        return {
            'total_collected': float(total_collected),
            'grouped_by': 'customer',
            'data': grouped_list,
        }

    return {
        'total_collected': float(total_collected),
        'grouped_by': 'none',
        'data': collected_money,
    }


@bp.route('/collected-money-report', methods=['GET'])
@login_required
def get_collected_money_report():
    """Get collected money report - all inflow transactions with details"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    group_by = request.args.get('group_by', 'date')  # 'date', 'customer', or 'none'
    customer_type = request.args.get('customer_type', 'both')  # 'both', 'cash', or 'credit'

    collected_money = _fetch_collected_money(market_id, start_date, end_date, customer_type)
    result = _group_collected_money(collected_money, group_by)
    result['total_usd_amount'] = _compute_collected_money_usd_total(collected_money, market_id)
    return jsonify(result)

@bp.route('/collected-money-report/export', methods=['GET'])
@login_required
def export_collected_money_report():
    """Export collected money report to Excel"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    customer_type = request.args.get('customer_type', 'both')

    collected_money = _fetch_collected_money(market_id, start_date, end_date, customer_type)
    export_data = [
        {
            'Date': item['date'],
            'Source Type': item['source_type'],
            'Source/Customer': item['source_name'] or item['customer_name'] or 'Unknown',
            'Invoice Number': item['invoice_number'] or '',
            'Description': item['description'],
            'Amount': item['amount'],
            'Currency': item['currency'],
            'Exchange Rate': item['exchange_rate'],
        }
        for item in collected_money
    ]
    
    # Create Excel file
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df = pd.DataFrame(export_data)
        df.to_excel(writer, index=False, sheet_name='Collected Money')
        
        # Auto-adjust column widths
        worksheet = writer.sheets['Collected Money']
        for idx, col in enumerate(df.columns):
            max_length = max(
                df[col].astype(str).apply(len).max(),
                len(str(col))
            )
            worksheet.column_dimensions[get_column_letter(idx + 1)].width = min(max_length + 2, 50)
    
    output.seek(0)
    filename = f'collected_money_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx'
    return send_file(output, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    as_attachment=True, download_name=filename)
