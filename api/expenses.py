"""
General Expenses API endpoints
"""
from flask import Blueprint, request, jsonify, session, send_file
from flask_login import login_required
from models import db, GeneralExpense, SafeTransaction, Market
from decimal import Decimal
from datetime import datetime
import pandas as pd
from io import BytesIO
from openpyxl.utils import get_column_letter

bp = Blueprint('expenses', __name__)

@bp.route('', methods=['GET'])
@login_required
def get_expenses():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    category = request.args.get('category')
    
    query = GeneralExpense.query.filter_by(market_id=market_id)
    
    if category:
        query = query.filter_by(category=category)
    if start_date:
        query = query.filter(GeneralExpense.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        query = query.filter(GeneralExpense.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    
    expenses = query.order_by(GeneralExpense.date.desc(), GeneralExpense.id.desc()).all()
    
    # Calculate total in base currency
    total_base_currency = sum(e.amount_base_currency for e in expenses)
    
    return jsonify({
        'expenses': [{
            'id': e.id,
            'date': e.date.isoformat(),
            'description': e.description,
            'category': e.category,
            'amount': float(e.amount),
            'currency': e.currency,
            'exchange_rate': float(e.exchange_rate),
            'amount_base_currency': float(e.amount_base_currency)
        } for e in expenses],
        'total_base_currency': float(total_base_currency),
        'count': len(expenses)
    })

@bp.route('/categories', methods=['GET'])
@login_required
def get_categories():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    # Get all unique categories
    categories = db.session.query(GeneralExpense.category).filter_by(
        market_id=market_id
    ).distinct().all()
    
    return jsonify([cat[0] for cat in categories])

@bp.route('', methods=['POST'])
@login_required
def create_expense():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    data = request.json
    market = Market.query.get(market_id)
    
    expense = GeneralExpense(
        market_id=market_id,
        date=datetime.strptime(data['date'], '%Y-%m-%d').date(),
        description=data['description'],
        category=data['category'],
        amount=Decimal(str(data['amount'])),
        currency=data.get('currency', market.base_currency),
        exchange_rate=Decimal(str(data.get('exchange_rate', 1)))
    )
    
    db.session.add(expense)
    db.session.flush()
    
    # Create safe transaction (outflow)
    last_transaction = SafeTransaction.query.filter_by(market_id=market_id).order_by(
        SafeTransaction.date.desc(), SafeTransaction.id.desc()
    ).first()
    
    balance_before = last_transaction.balance_after if last_transaction else Decimal('0')
    balance_after = balance_before - expense.amount_base_currency
    
    # Calculate exact base currency amount
    exact_base_amount = expense.amount * expense.exchange_rate
    
    safe_transaction = SafeTransaction(
        market_id=market_id,
        transaction_type='Outflow',
        amount=expense.amount,
        currency=expense.currency,
        exchange_rate=expense.exchange_rate,
        amount_base_currency_stored=exact_base_amount,  # Store exact value directly
        date=expense.date,
        description=f'General Expense - {expense.category}: {expense.description}',
        general_expense_id=expense.id,
        balance_after=balance_after
    )
    
    db.session.add(safe_transaction)
    db.session.commit()
    
    # Recalculate balances
    from api.safe import recalc_safe_balances
    recalc_safe_balances(market_id)
    
    return jsonify({
        'id': expense.id,
        'date': expense.date.isoformat(),
        'description': expense.description,
        'category': expense.category,
        'amount': float(expense.amount),
        'currency': expense.currency,
        'exchange_rate': float(expense.exchange_rate),
        'amount_base_currency': float(expense.amount_base_currency)
    }), 201

@bp.route('/<int:expense_id>', methods=['GET'])
@login_required
def get_expense(expense_id):
    market_id = session.get('current_market_id')
    expense = GeneralExpense.query.filter_by(id=expense_id, market_id=market_id).first()
    
    if not expense:
        return jsonify({'error': 'Expense not found'}), 404
    
    return jsonify({
        'id': expense.id,
        'date': expense.date.isoformat(),
        'description': expense.description,
        'category': expense.category,
        'amount': float(expense.amount),
        'currency': expense.currency,
        'exchange_rate': float(expense.exchange_rate),
        'amount_base_currency': float(expense.amount_base_currency)
    })

@bp.route('/<int:expense_id>', methods=['PUT'])
@login_required
def update_expense(expense_id):
    market_id = session.get('current_market_id')
    expense = GeneralExpense.query.filter_by(id=expense_id, market_id=market_id).first()
    
    if not expense:
        return jsonify({'error': 'Expense not found'}), 404
    
    data = request.json
    old_amount_base = expense.amount_base_currency
    
    expense.date = datetime.strptime(data['date'], '%Y-%m-%d').date()
    expense.description = data['description']
    expense.category = data['category']
    expense.amount = Decimal(str(data['amount']))
    expense.currency = data.get('currency', expense.currency)
    expense.exchange_rate = Decimal(str(data.get('exchange_rate', expense.exchange_rate)))
    
    # Update safe transaction
    safe_txn = SafeTransaction.query.filter_by(general_expense_id=expense.id).first()
    if safe_txn:
        # Calculate exact base currency amount
        exact_base_amount = expense.amount * expense.exchange_rate
        
        safe_txn.amount = expense.amount
        safe_txn.currency = expense.currency
        safe_txn.exchange_rate = expense.exchange_rate
        safe_txn.amount_base_currency_stored = exact_base_amount  # Store exact value directly
        safe_txn.date = expense.date  # Update date
        safe_txn.description = f'General Expense - {expense.category}: {expense.description}'
    
    db.session.commit()
    
    # Recalculate balances (this will re-sort by date and recalculate)
    from api.safe import recalc_safe_balances
    recalc_safe_balances(market_id)
    
    return jsonify({
        'id': expense.id,
        'date': expense.date.isoformat(),
        'description': expense.description,
        'category': expense.category,
        'amount': float(expense.amount),
        'currency': expense.currency,
        'exchange_rate': float(expense.exchange_rate),
        'amount_base_currency': float(expense.amount_base_currency)
    })

@bp.route('/<int:expense_id>', methods=['DELETE'])
@login_required
def delete_expense(expense_id):
    market_id = session.get('current_market_id')
    expense = GeneralExpense.query.filter_by(id=expense_id, market_id=market_id).first()
    
    if not expense:
        return jsonify({'error': 'Expense not found'}), 404
    
    # Delete associated safe transaction
    safe_txn = SafeTransaction.query.filter_by(general_expense_id=expense.id).first()
    if safe_txn:
        db.session.delete(safe_txn)
    
    db.session.delete(expense)
    db.session.commit()
    
    # Recalculate balances
    from api.safe import recalc_safe_balances
    recalc_safe_balances(market_id)
    
    return jsonify({'success': True})

@bp.route('/import', methods=['POST'])
@login_required
def import_expenses():
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
        required_cols = ['Date', 'Description', 'Category', 'Amount', 'Currency', 'ExchangeRate']
        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            return jsonify({'error': f'Missing columns: {", ".join(missing_cols)}. Found: {", ".join(df.columns.tolist())}'}), 400
        
        market = Market.query.get(market_id)
        errors = []
        created_expenses = 0
        
        for idx, row in df.iterrows():
            try:
                date_val = pd.to_datetime(row['Date']).date()
                description = str(row['Description']).strip()
                category = str(row['Category']).strip()
                amount = Decimal(str(row['Amount']))
                currency = str(row['Currency']).strip()
                exchange_rate = Decimal(str(row['ExchangeRate']))
                
                if not description:
                    errors.append(f'Row {idx + 2}: Description is required')
                    continue
                
                if not category:
                    errors.append(f'Row {idx + 2}: Category is required')
                    continue
                
                expense = GeneralExpense(
                    market_id=market_id,
                    date=date_val,
                    description=description,
                    category=category,
                    amount=amount,
                    currency=currency,
                    exchange_rate=exchange_rate
                )
                
                db.session.add(expense)
                db.session.flush()
                
                # Create safe transaction (outflow)
                last_transaction = SafeTransaction.query.filter_by(market_id=market_id).order_by(
                    SafeTransaction.date.desc(), SafeTransaction.id.desc()
                ).first()
                
                balance_before = last_transaction.balance_after if last_transaction else Decimal('0')
                balance_after = balance_before - expense.amount_base_currency
                
                # Calculate exact base currency amount
                exact_base_amount = expense.amount * expense.exchange_rate
                
                safe_transaction = SafeTransaction(
                    market_id=market_id,
                    transaction_type='Outflow',
                    amount=expense.amount,
                    currency=expense.currency,
                    exchange_rate=expense.exchange_rate,
                    amount_base_currency_stored=exact_base_amount,  # Store exact value directly
                    date=expense.date,
                    description=f'General Expense - {expense.category}: {expense.description}',
                    general_expense_id=expense.id,
                    balance_after=balance_after
                )
                
                db.session.add(safe_transaction)
                created_expenses += 1
            
            except Exception as e:
                errors.append(f'Row {idx + 2}: {str(e)}')
                continue
        
        db.session.commit()
        
        # Recalculate balances
        from api.safe import recalc_safe_balances
        recalc_safe_balances(market_id)
        
        return jsonify({
            'success': True,
            'expenses_created': created_expenses,
            'errors': errors
        })
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Import failed: {str(e)}'}), 400

@bp.route('/export', methods=['GET'])
@login_required
def export_expenses():
    """Export general expenses to Excel - formatted for import to another market
    Format matches import requirements: Date, Description, Category, Amount, Currency, ExchangeRate
    """
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    category = request.args.get('category')
    
    # Build query (same as get_expenses)
    query = GeneralExpense.query.filter_by(market_id=market_id)
    
    if category:
        query = query.filter_by(category=category)
    if start_date:
        query = query.filter(GeneralExpense.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        query = query.filter(GeneralExpense.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    
    expenses = query.order_by(GeneralExpense.date.asc(), GeneralExpense.id.asc()).all()
    
    # Prepare Excel data in import format
    export_rows = []
    
    for expense in expenses:
        export_rows.append({
            'Date': expense.date.strftime('%Y-%m-%d'),
            'Description': expense.description,
            'Category': expense.category,
            'Amount': float(expense.amount),
            'Currency': expense.currency,
            'ExchangeRate': float(expense.exchange_rate)
        })
    
    # Create Excel file
    output = BytesIO()
    
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        if export_rows:
            df = pd.DataFrame(export_rows)
            df.to_excel(writer, index=False, sheet_name='Expenses')
            
            # Format the sheet
            worksheet = writer.sheets['Expenses']
            for idx, col in enumerate(df.columns):
                max_length = max(
                    df[col].astype(str).apply(len).max(),
                    len(str(col))
                )
                worksheet.column_dimensions[get_column_letter(idx + 1)].width = min(max_length + 2, 50)
    
    output.seek(0)
    filename = f'general_expenses_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx'
    
    return send_file(
        output,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name=filename
    )

