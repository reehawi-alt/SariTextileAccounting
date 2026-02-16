"""
Companies API endpoints
"""
from flask import Blueprint, request, jsonify, session, send_file
from flask_login import login_required
from models import db, Company, Market, Payment, PurchaseContainer, Sale
from datetime import datetime
from decimal import Decimal
from sqlalchemy import or_
import pandas as pd
from io import BytesIO

bp = Blueprint('companies', __name__)

@bp.route('', methods=['GET'])
@login_required
def get_companies():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    category = request.args.get('category')
    query = Company.query.filter_by(market_id=market_id)
    
    if category:
        query = query.filter_by(category=category)
    
    companies = query.all()
    return jsonify([{
        'id': c.id,
        'name': c.name,
        'address': c.address,
        'category': c.category,
        'payment_type': c.payment_type,
        'currency': c.currency,
        'balance': float(c.get_balance(market_id))
    } for c in companies])

@bp.route('', methods=['POST'])
@login_required
def create_company():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    data = request.json
    company = Company(
        market_id=market_id,
        name=data['name'],
        address=data.get('address', ''),
        category=data['category'],
        payment_type=data.get('payment_type'),
        currency=data['currency']
    )
    
    db.session.add(company)
    db.session.commit()
    
    return jsonify({
        'id': company.id,
        'name': company.name,
        'address': company.address,
        'category': company.category,
        'payment_type': company.payment_type,
        'currency': company.currency,
        'balance': 0
    }), 201

@bp.route('/<int:company_id>', methods=['GET'])
@login_required
def get_company(company_id):
    market_id = session.get('current_market_id')
    company = Company.query.filter_by(id=company_id, market_id=market_id).first()
    
    if not company:
        return jsonify({'error': 'Company not found'}), 404
    
    return jsonify({
        'id': company.id,
        'name': company.name,
        'address': company.address,
        'category': company.category,
        'payment_type': company.payment_type,
        'currency': company.currency,
        'balance': float(company.get_balance(market_id))
    })

@bp.route('/<int:company_id>', methods=['PUT'])
@login_required
def update_company(company_id):
    market_id = session.get('current_market_id')
    company = Company.query.filter_by(id=company_id, market_id=market_id).first()
    
    if not company:
        return jsonify({'error': 'Company not found'}), 404
    
    data = request.json
    company.name = data.get('name', company.name)
    company.address = data.get('address', company.address)
    company.category = data.get('category', company.category)
    company.payment_type = data.get('payment_type', company.payment_type)
    company.currency = data.get('currency', company.currency)
    
    db.session.commit()
    
    return jsonify({
        'id': company.id,
        'name': company.name,
        'address': company.address,
        'category': company.category,
        'payment_type': company.payment_type,
        'currency': company.currency,
        'balance': float(company.get_balance(market_id))
    })

@bp.route('/<int:company_id>', methods=['DELETE'])
@login_required
def delete_company(company_id):
    market_id = session.get('current_market_id')
    company = Company.query.filter_by(id=company_id, market_id=market_id).first()
    
    if not company:
        return jsonify({'error': 'Company not found'}), 404
    
    # Check if company has transactions
    has_purchases = PurchaseContainer.query.filter_by(supplier_id=company_id).first()
    has_sales = Sale.query.filter_by(customer_id=company_id).first()
    has_payments = Payment.query.filter_by(company_id=company_id).first()
    
    if has_purchases or has_sales or has_payments:
        return jsonify({'error': 'Cannot delete company with existing transactions'}), 400
    
    db.session.delete(company)
    db.session.commit()
    
    return jsonify({'success': True})

@bp.route('/<int:company_id>/statement', methods=['GET'])
@login_required
def get_statement(company_id):
    market_id = session.get('current_market_id')
    company = Company.query.filter_by(id=company_id, market_id=market_id).first()
    
    if not company:
        return jsonify({'error': 'Company not found'}), 404
    
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    statement = []
    
    # Calculate opening balance if start_date is provided
    opening_balance = Decimal('0')
    if start_date:
        start_date_obj = datetime.strptime(start_date, '%Y-%m-%d').date()
        
        if company.category == 'Supplier':
            # Calculate balance from purchases and payments before start_date
            purchases_before = PurchaseContainer.query.filter_by(
                supplier_id=company_id, market_id=market_id
            ).filter(PurchaseContainer.date < start_date_obj).all()
            
            total_debit = sum(p.total_amount for p in purchases_before)
            # Expense1 is always in container currency (same as supplier currency), use amount directly
            total_debit += sum(p.expense1_amount for p in purchases_before if p.expense1_amount and p.expense1_amount > 0)
            
            # IMPORTANT: Include both 'Out' payments and loans (which can be 'In' or 'Out')
            payments_before = Payment.query.filter_by(
                company_id=company_id, market_id=market_id
            ).filter(
                or_(
                    Payment.payment_type == 'Out',  # Regular payments
                    Payment.loan.is_(True)  # Loan payments
                )
            ).filter(Payment.date < start_date_obj).all()
            
            # Use original currency amounts for opening balance (NOT base currency)
            # Regular payments are credit, loans are debit
            total_credit = sum(p.amount for p in payments_before if p.loan is not True)
            total_loan_debit = sum(p.amount for p in payments_before if p.loan is True)
            opening_balance = total_debit + total_loan_debit - total_credit
            
        elif company.category == 'Service Company':
            # Calculate balance from expense2 and payments before start_date
            purchases_before = PurchaseContainer.query.filter_by(
                expense2_service_company_id=company_id, market_id=market_id
            ).filter(PurchaseContainer.date < start_date_obj).all()
            
            total_debit = sum(p.expense2_base_currency for p in purchases_before if p.expense2_amount and p.expense2_amount > 0)
            
            # IMPORTANT: Include both 'Out' payments and loans (which can be 'In' or 'Out')
            payments_before = Payment.query.filter_by(
                company_id=company_id, market_id=market_id
            ).filter(
                or_(
                    Payment.payment_type == 'Out',  # Regular payments
                    Payment.loan.is_(True)  # Loan payments
                )
            ).filter(Payment.date < start_date_obj).all()
            
            # Use original currency amounts for opening balance (NOT base currency)
            # Regular payments are credit, loans are debit
            total_credit = sum(p.amount for p in payments_before if p.loan is not True)
            total_loan_debit = sum(p.amount for p in payments_before if p.loan is True)
            opening_balance = total_debit + total_loan_debit - total_credit
            
        else:  # Customer
            # Calculate balance from sales and payments before start_date
            sales_before = Sale.query.filter_by(
                customer_id=company_id, market_id=market_id
            ).filter(Sale.date < start_date_obj).all()
            
            total_debit = sum(s.total_amount for s in sales_before)
            
            # Get all payments (both In and Out) before start_date
            payments_before = Payment.query.filter_by(
                company_id=company_id, market_id=market_id
            ).filter(Payment.date < start_date_obj).all()
            
            # Use original currency amounts for opening balance (NOT base currency)
            # In payments = credit (reduces balance), Out payments = debit (increases balance)
            total_credit = sum(p.amount for p in payments_before if p.payment_type == 'In')
            total_debit_from_payments = sum(p.amount for p in payments_before if p.payment_type == 'Out')
            opening_balance = total_debit + total_debit_from_payments - total_credit
        
        # Add opening balance row at the beginning
        statement.append({
            'date': start_date,
            'type': 'Opening Balance',
            'description': f'Balance as of {start_date}',
            'debit': float(opening_balance) if opening_balance > 0 else 0,
            'credit': float(-opening_balance) if opening_balance < 0 else 0,
            'currency': company.currency,
            'affect_balance': True,
            'balance': float(opening_balance)
        })
    
    if company.category == 'Supplier':
        # Purchases (debit) - includes expense1
        purchases = PurchaseContainer.query.filter_by(supplier_id=company_id, market_id=market_id)
        if start_date:
            purchases = purchases.filter(PurchaseContainer.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
        if end_date:
            purchases = purchases.filter(PurchaseContainer.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
        
        for p in purchases.all():
            statement.append({
                'date': p.date.isoformat(),
                'type': 'Purchase',
                'description': f'Container {p.container_number}',
                'debit': float(p.total_amount),  # Items only (excludes expense1, which is shown separately)
                'credit': 0,
                'currency': p.currency,
                'affect_balance': True
            })
            
            # Add expense1 separately if exists (affects balance)
            if p.expense1_amount and p.expense1_amount > 0:
                # Expense1 is always in container currency (same as supplier currency), use amount directly
                statement.append({
                    'date': p.date.isoformat(),
                    'type': 'Expense 1',
                    'description': f'Container {p.container_number} - Expense 1',
                    'debit': float(p.expense1_amount),
                    'credit': 0,
                    'currency': p.expense1_currency or p.currency,
                    'affect_balance': True  # Include in balance calculation
                })
        
        # Payments (credit) and Loans (debit)
        # IMPORTANT: Loan payments have payment_type='In' but should be shown as debit in supplier statement
        # So we need to query for both 'Out' (regular payments) and loans (which can be 'In' or 'Out')
        payments = Payment.query.filter_by(company_id=company_id, market_id=market_id).filter(
            or_(
                Payment.payment_type == 'Out',  # Regular payments to supplier
                Payment.loan.is_(True)  # Loan payments (can be 'In' or 'Out')
            )
        )
        if start_date:
            payments = payments.filter(Payment.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
        if end_date:
            payments = payments.filter(Payment.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
        
        for p in payments.all():
            # Check if this is a loan payment (explicitly check for True)
            if p.loan is True:
                # Loan from supplier = debit (you owe them)
                # Use original currency amount for both display and balance calculation
                statement.append({
                    'date': p.date.isoformat(),
                    'type': 'Loan',
                    'description': p.notes or 'Loan from supplier',
                    'debit': float(p.amount),  # Original currency amount (NOT multiplied by rate)
                    'credit': 0,
                    'currency': p.currency,
                    'affect_balance': True
                })
            else:
                # Regular payment = credit (you paid them)
                # Use original currency amount for both display and balance calculation
                statement.append({
                    'date': p.date.isoformat(),
                    'type': 'Payment',
                    'description': p.notes or 'Payment to supplier',
                    'debit': 0,
                    'credit': float(p.amount),  # Original currency amount (NOT multiplied by rate)
                    'currency': p.currency,
                    'affect_balance': True
                })
    
    elif company.category == 'Service Company':
        # Expense2 (debit) from purchase containers
        purchases = PurchaseContainer.query.filter_by(expense2_service_company_id=company_id, market_id=market_id)
        if start_date:
            purchases = purchases.filter(PurchaseContainer.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
        if end_date:
            purchases = purchases.filter(PurchaseContainer.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
        
        for p in purchases.all():
            if p.expense2_amount and p.expense2_amount > 0:
                statement.append({
                    'date': p.date.isoformat(),
                    'type': 'Expense 2',
                    'description': f'Container {p.container_number} - Expense 2',
                    'debit': float(p.expense2_base_currency),
                    'credit': 0,
                    'currency': p.expense2_currency or p.currency,
                    'affect_balance': True
                })
        
        # Payments (credit) and Loans (debit)
        # IMPORTANT: Loan payments have payment_type='In' but should be shown as debit in service company statement
        payments = Payment.query.filter_by(company_id=company_id, market_id=market_id).filter(
            or_(
                Payment.payment_type == 'Out',  # Regular payments to service company
                Payment.loan.is_(True)  # Loan payments (can be 'In' or 'Out')
            )
        )
        if start_date:
            payments = payments.filter(Payment.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
        if end_date:
            payments = payments.filter(Payment.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
        
        for p in payments.all():
            if p.loan is True:
                # Loan from service company = debit (you owe them)
                # Use original currency amount for both display and balance calculation
                statement.append({
                    'date': p.date.isoformat(),
                    'type': 'Loan',
                    'description': p.notes or 'Loan from service company',
                    'debit': float(p.amount),  # Original currency amount (NOT multiplied by rate)
                    'credit': 0,
                    'currency': p.currency,
                    'affect_balance': True
                })
            else:
                # Regular payment = credit (you paid them)
                # Use original currency amount for both display and balance calculation
                statement.append({
                    'date': p.date.isoformat(),
                    'type': 'Payment',
                    'description': p.notes or 'Payment to service company',
                    'debit': 0,
                    'credit': float(p.amount),  # Original currency amount (NOT multiplied by rate)
                    'currency': p.currency,
                    'affect_balance': True
                })
    
    else:  # Customer
        # Sales (debit) - use total_amount since payments are tracked separately
        sales = Sale.query.filter_by(customer_id=company_id, market_id=market_id)
        if start_date:
            sales = sales.filter(Sale.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
        if end_date:
            sales = sales.filter(Sale.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
        
        for s in sales.all():
            statement.append({
                'date': s.date.isoformat(),
                'type': 'Sale',
                'description': f'Invoice {s.invoice_number}',
                'debit': float(s.total_amount),  # Use total_amount, not balance
                'credit': 0,
                'currency': company.currency,
                'affect_balance': True
            })
        
        # Payments - both In (credit) and Out (debit)
        payments = Payment.query.filter_by(company_id=company_id, market_id=market_id)
        if start_date:
            payments = payments.filter(Payment.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
        if end_date:
            payments = payments.filter(Payment.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
        
        for p in payments.all():
            if p.payment_type == 'In':
                # In payment = credit (reduces customer balance)
                statement.append({
                    'date': p.date.isoformat(),
                    'type': 'Payment (In)',
                    'description': p.notes or 'Payment from customer',
                    'debit': 0,
                    'credit': float(p.amount),
                    'currency': p.currency,
                    'affect_balance': True
                })
            elif p.payment_type == 'Out':
                # Out payment = debit (increases customer balance - refund, return, etc.)
                statement.append({
                    'date': p.date.isoformat(),
                    'type': 'Payment (Out)',
                    'description': p.notes or 'Payment to customer',
                    'debit': float(p.amount),
                    'credit': 0,
                    'currency': p.currency,
                    'affect_balance': True
                })
    
    # Sort by date
    statement.sort(key=lambda x: x['date'])
    
    # Calculate running balance (excluding entries marked as not affecting balance)
    # Start from opening balance if it exists, otherwise start from 0
    balance = float(opening_balance) if start_date else 0
    total_debit = 0
    total_credit = 0
    
    for entry in statement:
        # Skip opening balance entry in calculation (it's already set)
        if entry.get('type') == 'Opening Balance':
            # Include opening balance in totals
            total_debit += entry.get('debit', 0)
            total_credit += entry.get('credit', 0)
            continue
        # Only add to balance if affect_balance is not False
        if entry.get('affect_balance', True):
            # Use original currency amounts for balance calculation (NOT base currency)
            # Base currency is only used for safe movements, not for company statement balance
            balance += entry.get('debit', 0) - entry.get('credit', 0)
            total_debit += entry.get('debit', 0)
            total_credit += entry.get('credit', 0)
        entry['balance'] = balance
    
    # Add totals row at the end
    statement.append({
        'date': '',
        'type': 'Total',
        'description': 'Total Debit and Credit',
        'debit': total_debit,
        'credit': total_credit,
        'currency': company.currency,
        'affect_balance': False,  # Don't affect balance calculation
        'balance': balance
    })
    
    return jsonify({
        'company': {
            'id': company.id,
            'name': company.name,
            'category': company.category,
            'currency': company.currency
        },
        'statement': statement,
        'current_balance': float(company.get_balance(market_id))
    })

@bp.route('/<int:company_id>/statement/export', methods=['GET'])
@login_required
def export_statement(company_id):
    market_id = session.get('current_market_id')
    company = Company.query.filter_by(id=company_id, market_id=market_id).first()
    
    if not company:
        return jsonify({'error': 'Company not found'}), 404
    
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    statement = []
    
    # Calculate opening balance if start_date is provided
    opening_balance = Decimal('0')
    if start_date:
        start_date_obj = datetime.strptime(start_date, '%Y-%m-%d').date()
        
        if company.category == 'Supplier':
            # Calculate balance from purchases and payments before start_date
            purchases_before = PurchaseContainer.query.filter_by(
                supplier_id=company_id, market_id=market_id
            ).filter(PurchaseContainer.date < start_date_obj).all()
            
            total_debit = sum(p.total_amount for p in purchases_before)
            # Expense1 is always in container currency (same as supplier currency), use amount directly
            total_debit += sum(p.expense1_amount for p in purchases_before if p.expense1_amount and p.expense1_amount > 0)
            
            # IMPORTANT: Include both 'Out' payments and loans (which can be 'In' or 'Out')
            payments_before = Payment.query.filter_by(
                company_id=company_id, market_id=market_id
            ).filter(
                or_(
                    Payment.payment_type == 'Out',  # Regular payments
                    Payment.loan.is_(True)  # Loan payments
                )
            ).filter(Payment.date < start_date_obj).all()
            
            # Use original currency amounts for opening balance (NOT base currency)
            # Regular payments are credit, loans are debit
            total_credit = sum(p.amount for p in payments_before if p.loan is not True)
            total_loan_debit = sum(p.amount for p in payments_before if p.loan is True)
            opening_balance = total_debit + total_loan_debit - total_credit
            
        elif company.category == 'Service Company':
            # Calculate balance from expense2 and payments before start_date
            purchases_before = PurchaseContainer.query.filter_by(
                expense2_service_company_id=company_id, market_id=market_id
            ).filter(PurchaseContainer.date < start_date_obj).all()
            
            total_debit = sum(p.expense2_base_currency for p in purchases_before if p.expense2_amount and p.expense2_amount > 0)
            
            # IMPORTANT: Include both 'Out' payments and loans (which can be 'In' or 'Out')
            payments_before = Payment.query.filter_by(
                company_id=company_id, market_id=market_id
            ).filter(
                or_(
                    Payment.payment_type == 'Out',  # Regular payments
                    Payment.loan.is_(True)  # Loan payments
                )
            ).filter(Payment.date < start_date_obj).all()
            
            # Use original currency amounts for opening balance (NOT base currency)
            # Regular payments are credit, loans are debit
            total_credit = sum(p.amount for p in payments_before if p.loan is not True)
            total_loan_debit = sum(p.amount for p in payments_before if p.loan is True)
            opening_balance = total_debit + total_loan_debit - total_credit
            
        else:  # Customer
            # Calculate balance from sales and payments before start_date
            sales_before = Sale.query.filter_by(
                customer_id=company_id, market_id=market_id
            ).filter(Sale.date < start_date_obj).all()
            
            total_debit = sum(s.total_amount for s in sales_before)
            
            # Get all payments (both In and Out) before start_date
            payments_before = Payment.query.filter_by(
                company_id=company_id, market_id=market_id
            ).filter(Payment.date < start_date_obj).all()
            
            # Use original currency amounts for opening balance (NOT base currency)
            # In payments = credit (reduces balance), Out payments = debit (increases balance)
            total_credit = sum(p.amount for p in payments_before if p.payment_type == 'In')
            total_debit_from_payments = sum(p.amount for p in payments_before if p.payment_type == 'Out')
            opening_balance = total_debit + total_debit_from_payments - total_credit
        
        # Add opening balance row at the beginning
        statement.append({
            'Date': start_date,
            'Type': 'Opening Balance',
            'Description': f'Balance as of {start_date}',
            'Debit': float(opening_balance) if opening_balance > 0 else 0,
            'Credit': float(-opening_balance) if opening_balance < 0 else 0,
            'Balance': float(opening_balance),
            'affect_balance': True
        })
    
    if company.category == 'Supplier':
        purchases = PurchaseContainer.query.filter_by(supplier_id=company_id, market_id=market_id)
        if start_date:
            purchases = purchases.filter(PurchaseContainer.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
        if end_date:
            purchases = purchases.filter(PurchaseContainer.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
        
        for p in purchases.all():
            statement.append({
                'Date': p.date.isoformat(),
                'Type': 'Purchase',
                'Description': f'Container {p.container_number}',
                'Debit': float(p.total_amount),
                'Credit': 0,
                'Balance': 0,
                'affect_balance': True
            })
            
            # Add expense1 separately if exists (affects balance)
            if p.expense1_amount and p.expense1_amount > 0:
                # Expense1 is always in container currency (same as supplier currency), use amount directly
                statement.append({
                    'Date': p.date.isoformat(),
                    'Type': 'Expense 1',
                    'Description': f'Container {p.container_number} - Expense 1',
                    'Debit': float(p.expense1_amount),
                    'Credit': 0,
                    'Balance': 0,
                    'affect_balance': True  # Include in balance calculation
                })
        
        # IMPORTANT: Loan payments have payment_type='In' but should be shown as debit in supplier statement
        payments = Payment.query.filter_by(company_id=company_id, market_id=market_id).filter(
            or_(
                Payment.payment_type == 'Out',  # Regular payments to supplier
                Payment.loan.is_(True)  # Loan payments (can be 'In' or 'Out')
            )
        )
        if start_date:
            payments = payments.filter(Payment.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
        if end_date:
            payments = payments.filter(Payment.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
        
        for p in payments.all():
            if p.loan is True:
                # Loan from supplier = debit (you owe them)
                # Use original currency amount for both display and balance calculation
                statement.append({
                    'Date': p.date.isoformat(),
                    'Type': 'Loan',
                    'Description': p.notes or 'Loan from supplier',
                    'Debit': float(p.amount),  # Original currency amount (NOT multiplied by rate)
                    'Credit': 0,
                    'Balance': 0,
                    'affect_balance': True
                })
            else:
                # Regular payment = credit (you paid them)
                # Use original currency amount for both display and balance calculation
                statement.append({
                    'Date': p.date.isoformat(),
                    'Type': 'Payment',
                    'Description': p.notes or 'Payment to supplier',
                    'Debit': 0,
                    'Credit': float(p.amount),  # Original currency amount (NOT multiplied by rate)
                    'Balance': 0,
                    'affect_balance': True
                })
    elif company.category == 'Service Company':
        # Expense2 (debit) from purchase containers
        purchases = PurchaseContainer.query.filter_by(expense2_service_company_id=company_id, market_id=market_id)
        if start_date:
            purchases = purchases.filter(PurchaseContainer.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
        if end_date:
            purchases = purchases.filter(PurchaseContainer.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
        
        for p in purchases.all():
            if p.expense2_amount and p.expense2_amount > 0:
                statement.append({
                    'Date': p.date.isoformat(),
                    'Type': 'Expense 2',
                    'Description': f'Container {p.container_number} - Expense 2',
                    'Debit': float(p.expense2_base_currency),
                    'Credit': 0,
                    'Balance': 0,
                    'affect_balance': True
                })
        
        # Payments (credit) and Loans (debit)
        # IMPORTANT: Loan payments have payment_type='In' but should be shown as debit in service company statement
        payments = Payment.query.filter_by(company_id=company_id, market_id=market_id).filter(
            or_(
                Payment.payment_type == 'Out',  # Regular payments to service company
                Payment.loan.is_(True)  # Loan payments (can be 'In' or 'Out')
            )
        )
        if start_date:
            payments = payments.filter(Payment.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
        if end_date:
            payments = payments.filter(Payment.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
        
        for p in payments.all():
            if p.loan is True:
                # Loan from service company = debit (you owe them)
                # Use original currency amount for both display and balance calculation
                statement.append({
                    'Date': p.date.isoformat(),
                    'Type': 'Loan',
                    'Description': p.notes or 'Loan from service company',
                    'Debit': float(p.amount),  # Original currency amount (NOT multiplied by rate)
                    'Credit': 0,
                    'Balance': 0,
                    'affect_balance': True
                })
            else:
                # Regular payment = credit (you paid them)
                # Use original currency amount for both display and balance calculation
                statement.append({
                    'Date': p.date.isoformat(),
                    'Type': 'Payment',
                    'Description': p.notes or 'Payment to service company',
                    'Debit': 0,
                    'Credit': float(p.amount),  # Original currency amount (NOT multiplied by rate)
                    'Balance': 0,
                    'affect_balance': True
                })
    else:
        sales = Sale.query.filter_by(customer_id=company_id, market_id=market_id)
        if start_date:
            sales = sales.filter(Sale.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
        if end_date:
            sales = sales.filter(Sale.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
        
        for s in sales.all():
            statement.append({
                'Date': s.date.isoformat(),
                'Type': 'Sale',
                'Description': f'Invoice {s.invoice_number}',
                'Debit': float(s.total_amount),
                'Credit': 0,
                'Balance': 0,
                'affect_balance': True
            })
        
        payments = Payment.query.filter_by(company_id=company_id, market_id=market_id, payment_type='In')
        if start_date:
            payments = payments.filter(Payment.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
        if end_date:
            payments = payments.filter(Payment.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
        
        for p in payments.all():
            statement.append({
                'Date': p.date.isoformat(),
                'Type': 'Payment',
                'Description': p.notes or 'Payment from customer',
                'Debit': 0,
                'Credit': float(p.amount),
                'Balance': 0,
                'affect_balance': True
            })
    
    statement.sort(key=lambda x: x['Date'])
    
    # Calculate running balance (excluding entries marked as not affecting balance)
    # Start from opening balance if it exists, otherwise start from 0
    balance = float(opening_balance) if start_date else 0
    total_debit = 0
    total_credit = 0
    
    for entry in statement:
        # Skip opening balance entry in calculation (it's already set)
        if entry.get('Type') == 'Opening Balance':
            # Include opening balance in totals
            total_debit += entry.get('Debit', 0)
            total_credit += entry.get('Credit', 0)
            continue
        # Only add to balance if affect_balance is not False
        if entry.get('affect_balance', True):
            # Use original currency amounts for balance calculation (NOT base currency)
            # Base currency is only used for safe movements, not for company statement balance
            balance += entry.get('Debit', 0) - entry.get('Credit', 0)
            total_debit += entry.get('Debit', 0)
            total_credit += entry.get('Credit', 0)
        entry['Balance'] = balance
    
    # Add totals row at the end
    statement.append({
        'Date': '',
        'Type': 'Total',
        'Description': 'Total Debit and Credit',
        'Debit': total_debit,
        'Credit': total_credit,
        'Balance': balance,
        'affect_balance': False  # Don't affect balance calculation
    })
    
    df = pd.DataFrame(statement)
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name='Statement', index=False)
    
    output.seek(0)
    filename = f'statement_{company.name.replace(" ", "_")}_{start_date or "all"}_{end_date or "all"}.xlsx'
    return send_file(output, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    as_attachment=True, download_name=filename)

