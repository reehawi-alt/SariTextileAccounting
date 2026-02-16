"""
Main Flask application for Multi-Market Used Clothes Wholesale Accounting System
"""
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from models import db, User, Market, Company, Item, PurchaseContainer, PurchaseItem, Sale, SaleItem, Payment, SafeTransaction, GeneralExpense, SafeStatementRealBalance, InventoryAdjustment, InventoryBatch, SaleItemAllocation
from datetime import datetime, timedelta
import json

app = Flask(__name__)
app.config['SECRET_KEY'] = __import__('os').environ.get('SECRET_KEY', 'your-secret-key-change-in-production')
app.config['SQLALCHEMY_DATABASE_URI'] = __import__('os').environ.get('DATABASE_URL', 'sqlite:///accounting.db').replace('postgres://', 'postgresql://')  # Render uses postgres://
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# Initialize database
with app.app_context():
    db.create_all()
    # Create default admin user if not exists
    if not User.query.filter_by(username='admin').first():
        admin = User(
            username='admin',
            password_hash=generate_password_hash('admin123'),
            full_name='Administrator'
        )
        db.session.add(admin)
        db.session.commit()
    # Create default market if none exists (for fresh deploys)
    if not Market.query.first():
        default_market = Market(
            name='Default Market',
            address='',
            base_currency='FCFA'
        )
        db.session.add(default_market)
        db.session.commit()

# Routes
@app.route('/')
@login_required
def index():
    return redirect(url_for('dashboard'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        user = User.query.filter_by(username=username).first()
        if user and check_password_hash(user.password_hash, password):
            login_user(user)
            # Set default market if available
            market = Market.query.first()
            if market:
                session['current_market_id'] = market.id
            return redirect(url_for('dashboard'))
        return render_template('login.html', error='Invalid credentials')
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.template_filter('format_k')
def format_k_filter(value):
    """Format number in K (thousands) format"""
    try:
        num = float(value)
        if abs(num) >= 1000:
            return f"{int(round(num / 1000))} K"
        else:
            return f"{num:.2f}"
    except (ValueError, TypeError):
        return str(value)

@app.route('/dashboard')
@login_required
def dashboard():
    market_id = session.get('current_market_id')
    if not market_id:
        # Try to get first market or create default
        market = Market.query.first()
        if market:
            session['current_market_id'] = market.id
            market_id = market.id
        else:
            return redirect(url_for('switch_market'))
    else:
        market = Market.query.get(market_id)
        if not market:
            market = Market.query.first()
            if market:
                session['current_market_id'] = market.id
                market_id = market.id
            else:
                return redirect(url_for('switch_market'))
    
    # Get dashboard statistics
    stats = get_dashboard_stats(market_id)
    return render_template('dashboard.html', market=market, stats=stats)

@app.route('/api/markets', methods=['GET', 'POST'])
@login_required
def markets():
    if request.method == 'POST':
        data = request.json
        market = Market(
            name=data['name'],
            address=data.get('address', ''),
            base_currency=data['base_currency']
        )
        db.session.add(market)
        db.session.commit()
        return jsonify({
            'id': market.id,
            'name': market.name,
            'address': market.address,
            'base_currency': market.base_currency
        }), 201
    
    markets = Market.query.all()
    return jsonify([{
        'id': m.id,
        'name': m.name,
        'address': m.address,
        'base_currency': m.base_currency
    } for m in markets])

@app.route('/api/markets/<int:market_id>', methods=['GET', 'PUT', 'DELETE'])
@login_required
def market_detail(market_id):
    market = Market.query.get(market_id)
    
    if not market:
        return jsonify({'error': 'Market not found'}), 404
    
    if request.method == 'DELETE':
        # Check if market has any records
        has_companies = Company.query.filter_by(market_id=market_id).first()
        has_items = Item.query.filter_by(market_id=market_id).first()
        has_purchases = PurchaseContainer.query.filter_by(market_id=market_id).first()
        has_sales = Sale.query.filter_by(market_id=market_id).first()
        has_payments = Payment.query.filter_by(market_id=market_id).first()
        has_safe = SafeTransaction.query.filter_by(market_id=market_id).first()
        
        if has_companies or has_items or has_purchases or has_sales or has_payments or has_safe:
            return jsonify({'error': 'Cannot delete market with existing records'}), 400
        
        db.session.delete(market)
        db.session.commit()
        return jsonify({'success': True})
    
    if request.method == 'PUT':
        data = request.json
        market.name = data.get('name', market.name)
        market.address = data.get('address', market.address)
        market.base_currency = data.get('base_currency', market.base_currency)
        db.session.commit()
        return jsonify({
            'id': market.id,
            'name': market.name,
            'address': market.address,
            'base_currency': market.base_currency
        })
    
    return jsonify({
        'id': market.id,
        'name': market.name,
        'address': market.address,
        'base_currency': market.base_currency
    })

@app.route('/api/current-market', methods=['GET'])
@login_required
def get_current_market():
    """Get the currently selected market"""
    market_id = session.get('current_market_id')
    if market_id:
        market = Market.query.get(market_id)
        if market:
            return jsonify({
                'id': market.id,
                'name': market.name,
                'address': market.address,
                'base_currency': market.base_currency
            })
    # Return first market if no current market set
    market = Market.query.first()
    if market:
        session['current_market_id'] = market.id
        return jsonify({
            'id': market.id,
            'name': market.name,
            'address': market.address,
            'base_currency': market.base_currency
        })
    return jsonify({'error': 'No market available'}), 404

@app.route('/api/switch-market', methods=['GET', 'POST'])
@login_required
def switch_market():
    if request.method == 'GET':
        # If someone tries to GET this endpoint, return current market info
        market_id = session.get('current_market_id')
        if market_id:
            market = Market.query.get(market_id)
            if market:
                return jsonify({
                    'id': market.id,
                    'name': market.name,
                    'address': market.address,
                    'base_currency': market.base_currency
                })
        # Return first market if no current market set
        market = Market.query.first()
        if market:
            session['current_market_id'] = market.id
            return jsonify({
                'id': market.id,
                'name': market.name,
                'address': market.address,
                'base_currency': market.base_currency
            })
        return jsonify({'error': 'No market available'}), 404
    
    # POST method - switch market
    data = request.json
    market_id = data.get('market_id')
    market = Market.query.get(market_id)
    if market:
        session['current_market_id'] = market_id
        return jsonify({'success': True, 'market': market.name})
    return jsonify({'success': False, 'error': 'Market not found'}), 404

@app.route('/api/markets/calculation-method', methods=['GET', 'POST'])
@login_required
def calculation_method():
    """Get or set calculation method (Average or FIFO) for current market"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    market = Market.query.get(market_id)
    if not market:
        return jsonify({'error': 'Market not found'}), 404
    
    if request.method == 'GET':
        # Return current method (default to 'Average' if not set)
        method = getattr(market, 'calculation_method', 'Average')
        return jsonify({'method': method})
    
    # POST - Update method
    data = request.json
    method = data.get('method')
    
    if method not in ['Average', 'FIFO']:
        return jsonify({'error': 'Invalid method. Must be "Average" or "FIFO"'}), 400
    
    market.calculation_method = method
    db.session.commit()
    
    # If switching to FIFO, backfill historical data
    if method == 'FIFO':
        try:
            from api.fifo_calculations import backfill_fifo_batches, backfill_fifo_allocations
            # First create batches for all purchases
            created_count = backfill_fifo_batches(market_id)
            # Then allocate all existing sales to batches
            allocated_count = backfill_fifo_allocations(market_id)
            return jsonify({
                'success': True,
                'method': method,
                'batches_created': created_count,
                'sales_allocated': allocated_count,
                'message': f'Switched to FIFO. Created {created_count} inventory batches and allocated {allocated_count} sales to batches.'
            })
        except Exception as e:
            # Log the error but still allow the method to be set
            import traceback
            print(f"Error during FIFO backfill: {e}")
            print(traceback.format_exc())
            return jsonify({
                'success': True,
                'method': method,
                'warning': f'Switched to FIFO but backfill encountered an error: {str(e)}. You may need to run backfill manually.'
            }), 200
    
    return jsonify({'success': True, 'method': method})

@app.route('/api/markets/recalculate-fifo-allocations', methods=['POST'])
@login_required
def recalculate_fifo_allocations():
    """Recalculate all FIFO allocations with correct exchange rate formula"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    market = Market.query.get(market_id)
    if not market:
        return jsonify({'error': 'Market not found'}), 404
    
    # Check if FIFO is enabled
    method = getattr(market, 'calculation_method', 'Average')
    if method != 'FIFO':
        return jsonify({'error': 'FIFO mode is not enabled. Please switch to FIFO mode first.'}), 400
    
    try:
        from api.fifo_calculations import backfill_fifo_allocations
        # Recalculate all allocations with the correct formula
        print(f"DEBUG: Starting FIFO allocation recalculation for market {market_id}")
        allocated_count = backfill_fifo_allocations(market_id)
        print(f"DEBUG: Completed FIFO allocation recalculation. Allocated {allocated_count} sales.")
        return jsonify({
            'success': True,
            'allocated_count': allocated_count,
            'message': f'Successfully recalculated {allocated_count} sales allocations with correct exchange rate formula. Please refresh your reports to see the updated values.'
        })
    except Exception as e:
        import traceback
        print(f"Error during FIFO allocation recalculation: {e}")
        print(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': f'Error recalculating allocations: {str(e)}'
        }), 500

# Import all API routes
from api import companies, items, purchases, sales, payments, reports, safe, expenses, inventory

app.register_blueprint(companies.bp, url_prefix='/api/companies')
app.register_blueprint(items.bp, url_prefix='/api/items')
app.register_blueprint(purchases.bp, url_prefix='/api/purchases')
app.register_blueprint(sales.bp, url_prefix='/api/sales')
app.register_blueprint(payments.bp, url_prefix='/api/payments')
app.register_blueprint(reports.bp, url_prefix='/api/reports')
app.register_blueprint(safe.bp, url_prefix='/api/safe')
app.register_blueprint(expenses.bp, url_prefix='/api/expenses')
app.register_blueprint(inventory.bp, url_prefix='/api/inventory')

# Frontend routes
@app.route('/companies')
@login_required
def companies_page():
    return render_template('companies.html')

@app.route('/companies/<int:company_id>/statement')
@login_required
def company_statement_page(company_id):
    return render_template('company_statement.html', company_id=company_id)

@app.route('/items')
@login_required
def items_page():
    return render_template('items.html')

@app.route('/purchases')
@login_required
def purchases_page():
    return render_template('purchases.html')

@app.route('/sales')
@login_required
def sales_page():
    return render_template('sales.html')

@app.route('/payments')
@login_required
def payments_page():
    return render_template('payments.html')

@app.route('/expenses')
@login_required
def expenses_page():
    return render_template('expenses.html')

@app.route('/reports')
@login_required
def reports_page():
    return render_template('reports.html')

@app.route('/reports/safe-statement')
@login_required
def safe_statement_page():
    return render_template('safe_statement.html')

@app.route('/administration')
@login_required
def administration_page():
    return render_template('administration.html')

@app.route('/switch-market')
@login_required
def switch_market_page():
    return render_template('switch_market.html')

@app.route('/currencies')
@login_required
def currencies_page():
    return render_template('currencies.html')

def get_dashboard_stats(market_id):
    """Calculate dashboard statistics"""
    from models import Company, Sale, PurchaseContainer, SafeTransaction, SaleItem, PurchaseItem, Item
    from decimal import Decimal
    from sqlalchemy import func
    
    # Calculate suppliers payables by currency (sum of all supplier balances - positive means we owe them)
    suppliers = Company.query.filter_by(market_id=market_id, category='Supplier').all()
    suppliers_payables_by_currency = {}
    for s in suppliers:
        balance = s.get_balance(market_id)
        if balance > 0:  # Only include suppliers we owe money to
            currency = s.currency
            if currency not in suppliers_payables_by_currency:
                suppliers_payables_by_currency[currency] = Decimal('0')
            suppliers_payables_by_currency[currency] += Decimal(str(balance))
    
    # Calculate total service company debit (sum of all service company balances - positive means we owe them)
    service_companies = Company.query.filter_by(market_id=market_id, category='Service Company').all()
    total_service_companies_debit = sum(max(Decimal('0'), Decimal(str(sc.get_balance(market_id)))) for sc in service_companies)
    
    # Calculate customer receivables by currency (sum of all customer balances - positive means they owe us)
    customers = Company.query.filter_by(market_id=market_id, category='Customer').all()
    customer_receivables_by_currency = {}
    for c in customers:
        balance = c.get_balance(market_id)
        if balance > 0:  # Only include customers who owe us money
            currency = c.currency
            if currency not in customer_receivables_by_currency:
                customer_receivables_by_currency[currency] = Decimal('0')
            customer_receivables_by_currency[currency] += Decimal(str(balance))
    
    # Calculate safe balance dynamically from all transactions
    # This ensures accuracy regardless of balance_after field values
    all_safe_transactions = SafeTransaction.query.filter_by(market_id=market_id).order_by(
        SafeTransaction.date.asc(), SafeTransaction.id.asc()
    ).all()
    
    safe_balance_amount = Decimal('0')
    for txn in all_safe_transactions:
        if txn.transaction_type in ['Opening', 'Inflow']:
            safe_balance_amount += txn.amount_base_currency
        elif txn.transaction_type == 'Outflow':
            safe_balance_amount -= txn.amount_base_currency
    
    safe_balance_amount = float(safe_balance_amount)
    
    # Calculate total profit from first sale to today
    # Get all sales from the beginning
    all_sales = db.session.query(SaleItem, Sale).join(
        Sale, SaleItem.sale_id == Sale.id
    ).filter(Sale.market_id == market_id).all()
    
    # Get all purchases for cost calculation
    all_purchases = db.session.query(PurchaseItem, PurchaseContainer).join(
        PurchaseContainer, PurchaseItem.container_id == PurchaseContainer.id
    ).filter(PurchaseContainer.market_id == market_id).all()
    
    # Calculate profit per item
    item_sales = {}
    item_costs = {}
    
    # Aggregate sales
    for sale_item, sale in all_sales:
        item_id = sale_item.item_id
        if item_id not in item_sales:
            item_sales[item_id] = {
                'total_sales': Decimal('0'),
                'quantity_sold': Decimal('0')
            }
        item_sales[item_id]['total_sales'] += sale_item.total_price
        item_sales[item_id]['quantity_sold'] += sale_item.quantity
    
    # Aggregate purchases for average cost
    for purchase_item, container in all_purchases:
        item_id = purchase_item.item_id
        if item_id not in item_costs:
            item_costs[item_id] = {
                'total_cost': Decimal('0'),
                'total_quantity': Decimal('0')
            }
        cost_base = purchase_item.total_price * container.exchange_rate
        item_costs[item_id]['total_cost'] += cost_base
        item_costs[item_id]['total_quantity'] += purchase_item.quantity
    
    # Calculate total profit
    total_profit = Decimal('0')
    for item_id, sales_data in item_sales.items():
        if item_id in item_costs and item_costs[item_id]['total_quantity'] > 0:
            avg_cost = item_costs[item_id]['total_cost'] / item_costs[item_id]['total_quantity']
            total_cost = avg_cost * sales_data['quantity_sold']
            total_profit += sales_data['total_sales'] - total_cost
        else:
            total_profit += sales_data['total_sales']
    
    # Calculate total stock available (purchases - sales) and unique items
    items = Item.query.filter_by(market_id=market_id).all()
    item_ids = [i.id for i in items]
    total_unique_items = len(items)
    
    # Get total purchases per item
    purchase_totals = dict(db.session.query(
        PurchaseItem.item_id,
        func.coalesce(func.sum(PurchaseItem.quantity), 0)
    ).join(PurchaseContainer, PurchaseItem.container_id == PurchaseContainer.id).filter(
        PurchaseContainer.market_id == market_id,
        PurchaseItem.item_id.in_(item_ids) if item_ids else True
    ).group_by(PurchaseItem.item_id).all())
    
    # Get total sales per item
    sale_totals = dict(db.session.query(
        SaleItem.item_id,
        func.coalesce(func.sum(SaleItem.quantity), 0)
    ).join(Sale, SaleItem.sale_id == Sale.id).filter(
        Sale.market_id == market_id,
        SaleItem.item_id.in_(item_ids) if item_ids else True
    ).group_by(SaleItem.item_id).all())
    
    # Calculate total available stock
    total_stock = Decimal('0')
    for item_id in item_ids:
        purchases_qty = Decimal(str(purchase_totals.get(item_id, 0)))
        sales_qty = Decimal(str(sale_totals.get(item_id, 0)))
        total_stock += purchases_qty - sales_qty
    
    return {
        'safe_balance': safe_balance_amount,
        'total_profit': float(total_profit),
        'total_stock': float(total_stock),
        'total_unique_items': total_unique_items,
        'suppliers_payables_by_currency': {currency: float(amount) for currency, amount in suppliers_payables_by_currency.items()},
        'total_service_companies_debit': float(total_service_companies_debit),
        'customer_receivables_by_currency': {currency: float(amount) for currency, amount in customer_receivables_by_currency.items()}
    }

@app.route('/api/stock-by-supplier', methods=['GET'])
@login_required
def get_stock_by_supplier():
    """Get available stock grouped by supplier with quantity, weight, and stock value in original currency"""
    from models import Company, Item, PurchaseItem, SaleItem, PurchaseContainer, Sale, InventoryAdjustment
    from decimal import Decimal
    from sqlalchemy import func, case
    
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    # Get all suppliers
    suppliers = Company.query.filter_by(market_id=market_id, category='Supplier').all()
    
    supplier_stock = []
    total_quantity = Decimal('0')
    total_weight = Decimal('0')
    
    for supplier in suppliers:
        # Get all items for this supplier
        items = Item.query.filter_by(market_id=market_id, supplier_id=supplier.id).all()
        item_ids = [i.id for i in items]
        
        if not item_ids:
            continue
        
        # Get total purchases per item
        purchase_totals = dict(db.session.query(
            PurchaseItem.item_id,
            func.coalesce(func.sum(PurchaseItem.quantity), 0)
        ).join(PurchaseContainer, PurchaseItem.container_id == PurchaseContainer.id).filter(
            PurchaseContainer.market_id == market_id,
            PurchaseItem.item_id.in_(item_ids)
        ).group_by(PurchaseItem.item_id).all())
        
        # Get total sales per item
        sale_totals = dict(db.session.query(
            SaleItem.item_id,
            func.coalesce(func.sum(SaleItem.quantity), 0)
        ).join(Sale, SaleItem.sale_id == Sale.id).filter(
            Sale.market_id == market_id,
            SaleItem.item_id.in_(item_ids)
        ).group_by(SaleItem.item_id).all())
        
        # Get inventory adjustments per item (affects available quantity but NOT COG)
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
             .filter(InventoryAdjustment.item_id.in_(item_ids)) \
             .group_by(InventoryAdjustment.item_id).all()
            adjustments_map = {item_id: float(qty) for item_id, qty in adjustments_q}
        except Exception as e:
            # If table doesn't exist or query fails, just use empty map
            print(f"Warning: Could not load inventory adjustments: {e}")
            adjustments_map = {}
        
        # Calculate available stock and stock value for this supplier
        supplier_quantity = Decimal('0')
        supplier_weight = Decimal('0')
        supplier_stock_value = Decimal('0')
        
        # Get all purchase items for items from this supplier to calculate costs
        # Join with Item to ensure relationship is loaded
        from sqlalchemy.orm import joinedload
        purchase_items_data = db.session.query(PurchaseItem, PurchaseContainer, Item).join(
            PurchaseContainer, PurchaseItem.container_id == PurchaseContainer.id
        ).join(Item, PurchaseItem.item_id == Item.id).filter(
            PurchaseContainer.market_id == market_id,
            PurchaseItem.item_id.in_(item_ids)
        ).all()
        
        # Group purchase items by container to calculate COG
        containers_data = {}
        for row in purchase_items_data:
            # Handle both tuple formats: (PurchaseItem, PurchaseContainer) or (PurchaseItem, PurchaseContainer, Item)
            if len(row) == 3:
                purchase_item, container, item = row
            else:
                purchase_item, container = row
                item = purchase_item.item  # Access through relationship
            container_id = container.id
            if container_id not in containers_data:
                containers_data[container_id] = {
                    'container': container,
                    'items': []
                }
            containers_data[container_id]['items'].append((purchase_item, item))
        
        # Calculate item costs (price + COG) in original currency
        # Structure: {item_id: {'total_cost': Decimal, 'total_quantity': Decimal}}
        item_costs = {}
        
        for container_id, container_info in containers_data.items():
            container = container_info['container']
            container_items = container_info['items']
            
            # Calculate sum of all 3 expenses in container's original currency
            # Convert each expense to container currency if needed
            expense1_in_container_currency = Decimal('0')
            if container.expense1_amount and container.expense1_amount > 0:
                if container.expense1_currency == container.currency:
                    expense1_in_container_currency = container.expense1_amount
                else:
                    # Convert to base currency first, then to container currency
                    expense1_base = container.expense1_amount * (container.expense1_exchange_rate or 1)
                    container_rate = container.exchange_rate or 1
                    if container_rate > 0:
                        expense1_in_container_currency = expense1_base / container_rate
            
            expense2_in_container_currency = Decimal('0')
            if container.expense2_amount and container.expense2_amount > 0:
                if container.expense2_currency == container.currency:
                    expense2_in_container_currency = container.expense2_amount
                else:
                    # Convert to base currency first, then to container currency
                    expense2_base = container.expense2_amount * (container.expense2_exchange_rate or 1)
                    container_rate = container.exchange_rate or 1
                    if container_rate > 0:
                        expense2_in_container_currency = expense2_base / container_rate
            
            expense3_in_container_currency = Decimal('0')
            if container.expense3_amount and container.expense3_amount > 0:
                if container.expense3_currency == container.currency:
                    expense3_in_container_currency = container.expense3_amount
                else:
                    # Convert to base currency first, then to container currency
                    expense3_base = container.expense3_amount * (container.expense3_exchange_rate or 1)
                    container_rate = container.exchange_rate or 1
                    if container_rate > 0:
                        expense3_in_container_currency = expense3_base / container_rate
            
            sum_expenses = expense1_in_container_currency + expense2_in_container_currency + expense3_in_container_currency
            
            # Calculate total quantity and total weight for the container
            total_quantity_container = sum(purchase_item.quantity for purchase_item, item in container_items)
            total_weight_container = sum((item.weight or Decimal('0')) * purchase_item.quantity for purchase_item, item in container_items)
            
            # Calculate COG for each item in this container (in container's original currency)
            for purchase_item, item in container_items:
                item_id = purchase_item.item_id
                # Access item weight directly from the loaded Item object
                item_weight = (item.weight if item else Decimal('0')) or Decimal('0')
                
                # Initialize item tracking
                if item_id not in item_costs:
                    item_costs[item_id] = {
                        'total_cost': Decimal('0'),
                        'total_quantity': Decimal('0')
                    }
                
                # Calculate COG per unit in container's original currency
                if total_quantity_container > 0 and total_weight_container > 0:
                    cog_per_unit = (sum_expenses / Decimal('2') / total_quantity_container) + \
                                  (sum_expenses / Decimal('2') / total_weight_container * item_weight)
                elif total_quantity_container > 0:
                    # If no weight, distribute by quantity only
                    cog_per_unit = sum_expenses / total_quantity_container
                else:
                    cog_per_unit = Decimal('0')
                
                # Item cost per unit = unit_price (in container currency) + COG per unit
                unit_price = purchase_item.unit_price  # Already in container's original currency
                item_cost_per_unit = unit_price + cog_per_unit
                total_item_cost = item_cost_per_unit * purchase_item.quantity
                
                # Aggregate for average calculation
                item_costs[item_id]['total_cost'] += total_item_cost
                item_costs[item_id]['total_quantity'] += purchase_item.quantity
        
        # Calculate stock value for each item
        for item in items:
            purchases_qty = Decimal(str(purchase_totals.get(item.id, 0)))
            sales_qty = Decimal(str(sale_totals.get(item.id, 0)))
            adjustment_qty = Decimal(str(adjustments_map.get(item.id, 0)))
            available_qty = purchases_qty - sales_qty + adjustment_qty
            
            # Include all items, even with negative or zero stock
            supplier_quantity += available_qty
            # Weight = quantity * item.weight (can be negative if stock is negative)
            supplier_weight += available_qty * Decimal(str(item.weight))
            
            # Calculate stock value in original currency
            if item.id in item_costs and item_costs[item.id]['total_quantity'] > 0:
                # Average cost per unit = total_cost / total_quantity
                avg_cost_per_unit = item_costs[item.id]['total_cost'] / item_costs[item.id]['total_quantity']
                # Stock value = available_qty * avg_cost_per_unit
                item_stock_value = available_qty * avg_cost_per_unit
                supplier_stock_value += item_stock_value
        
        # Get supplier's currency
        supplier_currency = supplier.currency
        
        # Include all suppliers, even if total is zero or negative
        supplier_stock.append({
            'supplier_id': supplier.id,
            'supplier_name': supplier.name,
            'quantity': float(supplier_quantity),
            'weight': float(supplier_weight),
            'stock_value': float(supplier_stock_value),
            'currency': supplier_currency
        })
        total_quantity += supplier_quantity
        total_weight += supplier_weight
    
    return jsonify({
        'suppliers': supplier_stock,
        'total': {
            'quantity': float(total_quantity),
            'weight': float(total_weight)
        }
    })

@app.route('/api/daily-report', methods=['GET'])
@login_required
def get_daily_report():
    """Calculate daily report data for a specific date"""
    from decimal import Decimal
    from datetime import timedelta
    
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    report_date_str = request.args.get('date')
    if not report_date_str:
        return jsonify({'error': 'Date is required'}), 400
    
    try:
        report_date = datetime.strptime(report_date_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400
    
    # Calculate previous day (end of day before report date)
    previous_day = report_date - timedelta(days=1)
    
    # 1. Get safe balance at end of previous day
    # Calculate balance dynamically by summing all transactions up to and including previous_day
    # This ensures accuracy regardless of stored balance_after values
    all_transactions_up_to_previous = SafeTransaction.query.filter_by(market_id=market_id).filter(
        SafeTransaction.date <= previous_day
    ).order_by(
        SafeTransaction.date.asc(), SafeTransaction.id.asc()
    ).all()
    
    balance_previous_day = Decimal('0')
    for txn in all_transactions_up_to_previous:
        if txn.transaction_type in ['Opening', 'Inflow']:
            balance_previous_day += txn.amount_base_currency
        elif txn.transaction_type == 'Outflow':
            balance_previous_day -= txn.amount_base_currency
    
    balance_previous_day = float(balance_previous_day)
    
    # 2. Get total sales (in) from safe statement for report date
    # Sum all Inflow transactions on the report date from SafeTransaction
    # This matches what the safe statement shows as "total_in" for that date
    safe_inflows_on_date = SafeTransaction.query.filter_by(
        market_id=market_id
    ).filter(
        SafeTransaction.date == report_date,
        SafeTransaction.transaction_type == 'Inflow'
    ).all()
    
    total_sales = sum(float(txn.amount_base_currency) for txn in safe_inflows_on_date)
    
    # Calculate supplier totals (quantity and amount) from actual sales for display
    # This is still needed for the supplier breakdown table
    from models import SaleItem, Company
    sales_on_date = Sale.query.filter_by(market_id=market_id).filter(
        Sale.date == report_date
    ).all()
    
    supplier_totals = {}
    supplier_ids = [s.supplier_id for s in sales_on_date if s.supplier_id]
    suppliers_dict = {sup.id: sup.name for sup in Company.query.filter(Company.id.in_(supplier_ids)).all()} if supplier_ids else {}
    
    for sale in sales_on_date:
        if sale.supplier_id:
            supplier_id = sale.supplier_id
            supplier_name = suppliers_dict.get(supplier_id, f'Supplier {supplier_id}')
            
            if supplier_id not in supplier_totals:
                supplier_totals[supplier_id] = {
                    'supplier_id': supplier_id,
                    'supplier_name': supplier_name,
                    'total_quantity': Decimal('0'),
                    'total_amount': Decimal('0')
                }
            
            # Get sale items for this sale
            sale_items = SaleItem.query.filter_by(sale_id=sale.id).all()
            for item in sale_items:
                supplier_totals[supplier_id]['total_quantity'] += item.quantity
                supplier_totals[supplier_id]['total_amount'] += item.total_price
    
    # 3. Get total out (general expenses + payments) on report date
    # General expenses on report date
    expenses_on_date = GeneralExpense.query.filter_by(market_id=market_id).filter(
        GeneralExpense.date == report_date
    ).all()
    
    total_expenses = sum(float(e.amount_base_currency) for e in expenses_on_date)
    
    # Payments on report date (outflows only)
    payments_on_date = Payment.query.filter_by(market_id=market_id, payment_type='Out').filter(
        Payment.date == report_date
    ).all()
    
    total_payments = sum(float(p.amount_base_currency) for p in payments_on_date)
    
    total_out = total_expenses + total_payments
    
    # 4. Calculated balance = balance_previous_day + total_sales - total_out
    calculated_balance = balance_previous_day + total_sales - total_out
    
    # Convert supplier totals to list with float values
    supplier_totals_list = [
        {
            'supplier_id': st['supplier_id'],
            'supplier_name': st['supplier_name'],
            'total_quantity': float(st['total_quantity']),
            'total_amount': float(st['total_amount'])
        }
        for st in supplier_totals.values()
    ]
    
    return jsonify({
        'date': report_date_str,
        'balance_previous_day': balance_previous_day,
        'total_sales': total_sales,
        'total_expenses': total_expenses,
        'total_payments': total_payments,
        'total_out': total_out,
        'calculated_balance': calculated_balance,
        'supplier_totals': supplier_totals_list
    })

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)

