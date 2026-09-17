"""
Main Flask application for Multi-Market Used Clothes Wholesale Accounting System
"""
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from models import db, User, Market, MarketStickyNote, MarketPartner, PartnerDrawing, PurchasingRepresentative, Company, Item, PurchaseContainer, PurchaseItem, Sale, SaleItem, Payment, SafeTransaction, GeneralExpense, SafeStatementRealBalance, InventoryAdjustment, InventoryBatch, SaleItemAllocation, SupplierReturn, SupplierReturnLine, SupplierReturnAllocation
from datetime import datetime, timedelta
import json
import os

def _sqlalchemy_database_uri():
    """Local: SQLite. Live (Render): PostgreSQL only — never fall back to a wipeable file."""
    url = os.environ.get('DATABASE_URL')
    if os.environ.get('RENDER') and not url:
        raise RuntimeError(
            'DATABASE_URL is not set on Render. Refusing to start with SQLite '
            '(that disk is wiped when the service sleeps or restarts). '
            'Create a PostgreSQL database and attach it as DATABASE_URL.'
        )
    if not url:
        return 'sqlite:///accounting.db'
    if url.startswith('postgres://'):
        url = 'postgresql://' + url[len('postgres://'):]
    return url

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your-secret-key-change-in-production')
_DB_URI = _sqlalchemy_database_uri()
app.config['SQLALCHEMY_DATABASE_URI'] = _DB_URI
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
if _DB_URI.startswith('postgresql'):
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
        'pool_pre_ping': True,
        'pool_recycle': 280,
    }

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
    # Add markets.notes column if missing (existing SQLite/Postgres DBs)
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(db.engine)
        market_cols = [c['name'] for c in inspector.get_columns('markets')]
        if 'notes' not in market_cols:
            if db.engine.dialect.name == 'postgresql':
                db.session.execute(text('ALTER TABLE markets ADD COLUMN IF NOT EXISTS notes TEXT'))
            else:
                db.session.execute(text('ALTER TABLE markets ADD COLUMN notes TEXT'))
            db.session.commit()
            market_cols = [c['name'] for c in inspector.get_columns('markets')]
        if 'is_active' not in market_cols:
            if db.engine.dialect.name == 'postgresql':
                db.session.execute(text(
                    'ALTER TABLE markets ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE'
                ))
            else:
                db.session.execute(text(
                    'ALTER TABLE markets ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1'
                ))
            db.session.commit()
    except Exception:
        db.session.rollback()
    # Add safe_statement_real_balances.currency_rate if missing
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(db.engine)
        ss_cols = [c['name'] for c in inspector.get_columns('safe_statement_real_balances')]
        if 'currency_rate' not in ss_cols:
            if db.engine.dialect.name == 'postgresql':
                db.session.execute(text(
                    'ALTER TABLE safe_statement_real_balances ADD COLUMN IF NOT EXISTS currency_rate NUMERIC(12, 4)'
                ))
            else:
                db.session.execute(text(
                    'ALTER TABLE safe_statement_real_balances ADD COLUMN currency_rate NUMERIC(12, 4)'
                ))
            db.session.commit()
    except Exception:
        db.session.rollback()
    # safe_transactions.partner_drawing_id (partner cash drawings)
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(db.engine)
        st_cols = [c['name'] for c in inspector.get_columns('safe_transactions')]
        if 'partner_drawing_id' not in st_cols:
            if db.engine.dialect.name == 'postgresql':
                db.session.execute(text(
                    'ALTER TABLE safe_transactions ADD COLUMN IF NOT EXISTS partner_drawing_id INTEGER REFERENCES partner_drawings(id)'
                ))
            else:
                db.session.execute(text(
                    'ALTER TABLE safe_transactions ADD COLUMN partner_drawing_id INTEGER REFERENCES partner_drawings(id)'
                ))
            db.session.commit()
    except Exception:
        db.session.rollback()
    # sale_items: line_description + nullable item_id (fast sell)
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(db.engine)
        si_cols = {c['name']: c for c in inspector.get_columns('sale_items')}
        if 'line_description' not in si_cols:
            if db.engine.dialect.name == 'postgresql':
                db.session.execute(text(
                    'ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS line_description TEXT'
                ))
            else:
                db.session.execute(text('ALTER TABLE sale_items ADD COLUMN line_description TEXT'))
            db.session.commit()
            si_cols = {c['name']: c for c in inspector.get_columns('sale_items')}
        item_id_info = si_cols.get('item_id')
        if item_id_info and item_id_info.get('nullable') is False:
            if db.engine.dialect.name == 'postgresql':
                db.session.execute(text('ALTER TABLE sale_items ALTER COLUMN item_id DROP NOT NULL'))
                db.session.commit()
            else:
                # SQLite: recreate table to drop NOT NULL on item_id (preserve ids for FK e.g. sale_item_allocations)
                db.session.execute(text('PRAGMA foreign_keys=OFF'))
                db.session.execute(text(
                    'CREATE TABLE sale_items_new ('
                    'id INTEGER NOT NULL PRIMARY KEY,'
                    'sale_id INTEGER NOT NULL REFERENCES sales(id),'
                    'item_id INTEGER REFERENCES items(id),'
                    'line_description TEXT,'
                    'quantity NUMERIC(10,2) NOT NULL,'
                    'unit_price NUMERIC(10,2) NOT NULL,'
                    'total_price NUMERIC(10,2) NOT NULL)'
                ))
                db.session.execute(text(
                    'INSERT INTO sale_items_new (id, sale_id, item_id, line_description, quantity, unit_price, total_price) '
                    'SELECT id, sale_id, item_id, line_description, quantity, unit_price, total_price FROM sale_items'
                ))
                db.session.execute(text('DROP TABLE sale_items'))
                db.session.execute(text('ALTER TABLE sale_items_new RENAME TO sale_items'))
                db.session.execute(text('PRAGMA foreign_keys=ON'))
                db.session.commit()
    except Exception:
        db.session.rollback()
    # purchase_containers.representative_id (optional purchasing representative tag)
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(db.engine)
        pc_cols = [c['name'] for c in inspector.get_columns('purchase_containers')]
        if 'representative_id' not in pc_cols:
            if db.engine.dialect.name == 'postgresql':
                db.session.execute(text(
                    'ALTER TABLE purchase_containers ADD COLUMN IF NOT EXISTS representative_id INTEGER REFERENCES purchasing_representatives(id)'
                ))
            else:
                db.session.execute(text(
                    'ALTER TABLE purchase_containers ADD COLUMN representative_id INTEGER REFERENCES purchasing_representatives(id)'
                ))
            db.session.commit()
    except Exception:
        db.session.rollback()
    # payments.purchase_container_id (auto cash payment for representative purchases)
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(db.engine)
        pay_cols = [c['name'] for c in inspector.get_columns('payments')]
        if 'purchase_container_id' not in pay_cols:
            if db.engine.dialect.name == 'postgresql':
                db.session.execute(text(
                    'ALTER TABLE payments ADD COLUMN IF NOT EXISTS purchase_container_id INTEGER REFERENCES purchase_containers(id)'
                ))
            else:
                db.session.execute(text(
                    'ALTER TABLE payments ADD COLUMN purchase_container_id INTEGER REFERENCES purchase_containers(id)'
                ))
            db.session.commit()
    except Exception:
        db.session.rollback()
    # payments.proof_filename / proof_original_filename (payment proof attachments)
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(db.engine)
        pay_cols = [c['name'] for c in inspector.get_columns('payments')]
        for col_name in ('proof_filename', 'proof_original_filename'):
            if col_name not in pay_cols:
                if db.engine.dialect.name == 'postgresql':
                    db.session.execute(text(
                        f'ALTER TABLE payments ADD COLUMN IF NOT EXISTS {col_name} VARCHAR(255)'
                    ))
                else:
                    db.session.execute(text(
                        f'ALTER TABLE payments ADD COLUMN {col_name} VARCHAR(255)'
                    ))
                db.session.commit()
    except Exception:
        db.session.rollback()
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
            'base_currency': market.base_currency,
            'is_active': bool(market.is_active),
        }), 201
    
    active_only = request.args.get('active_only', 'false').lower() in ('1', 'true', 'yes')
    q = Market.query
    if active_only:
        q = q.filter_by(is_active=True)
    markets = q.order_by(Market.name.asc()).all()
    return jsonify([{
        'id': m.id,
        'name': m.name,
        'address': m.address,
        'base_currency': m.base_currency,
        'is_active': bool(m.is_active),
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
        if 'notes' in data:
            market.notes = data.get('notes') or None
        if 'is_active' in data:
            market.is_active = bool(data.get('is_active'))
        db.session.commit()
        return jsonify({
            'id': market.id,
            'name': market.name,
            'address': market.address,
            'base_currency': market.base_currency,
            'notes': market.notes or '',
            'is_active': bool(market.is_active),
        })
    
    return jsonify({
        'id': market.id,
        'name': market.name,
        'address': market.address,
        'base_currency': market.base_currency,
        'notes': getattr(market, 'notes', None) or '',
        'is_active': bool(getattr(market, 'is_active', True)),
    })

@app.route('/api/markets/<int:market_id>/clone', methods=['POST'])
@login_required
def clone_market(market_id):
    """Clone a market with its companies and items. Does not copy purchases, sales, payments, etc."""
    source = Market.query.get(market_id)
    if not source:
        return jsonify({'error': 'Market not found'}), 404

    # Create new market (user will rename)
    new_market = Market(
        name=f'{source.name} (Copy)',
        address=source.address or '',
        base_currency=source.base_currency,
        calculation_method=getattr(source, 'calculation_method', 'Average') or 'Average'
    )
    db.session.add(new_market)
    db.session.flush()

    # Map old company id -> new company
    company_map = {}
    for old_company in Company.query.filter_by(market_id=market_id).all():
        new_company = Company(
            market_id=new_market.id,
            name=old_company.name,
            address=old_company.address or '',
            category=old_company.category,
            payment_type=old_company.payment_type,
            currency=old_company.currency
        )
        db.session.add(new_company)
        db.session.flush()
        company_map[old_company.id] = new_company.id

    # Clone items with remapped supplier_id
    for old_item in Item.query.filter_by(market_id=market_id).all():
        new_supplier_id = company_map.get(old_item.supplier_id) if old_item.supplier_id else None
        new_item = Item(
            market_id=new_market.id,
            supplier_id=new_supplier_id,
            code=old_item.code,
            name=old_item.name,
            weight=old_item.weight,
            grade=old_item.grade,
            category1=old_item.category1,
            category2=old_item.category2
        )
        db.session.add(new_item)

    for sn in MarketStickyNote.query.filter_by(market_id=market_id).order_by(
        MarketStickyNote.sort_order, MarketStickyNote.id
    ).all():
        db.session.add(MarketStickyNote(
            market_id=new_market.id,
            body=sn.body or '',
            tint=sn.tint or 0,
            sort_order=sn.sort_order
        ))

    db.session.commit()
    return jsonify({
        'id': new_market.id,
        'name': new_market.name,
        'address': new_market.address,
        'base_currency': new_market.base_currency
    }), 201

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
                'base_currency': market.base_currency,
                'notes': getattr(market, 'notes', None) or ''
            })
    # Return first market if no current market set
    market = Market.query.first()
    if market:
        session['current_market_id'] = market.id
        return jsonify({
            'id': market.id,
            'name': market.name,
            'address': market.address,
            'base_currency': market.base_currency,
            'notes': getattr(market, 'notes', None) or ''
        })
    return jsonify({'error': 'No market available'}), 404

@app.route('/api/current-market/notes', methods=['PUT'])
@login_required
def update_current_market_notes():
    """Update legacy single-field notes for the currently selected market."""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    market = Market.query.get(market_id)
    if not market:
        return jsonify({'error': 'Market not found'}), 404
    data = request.json or {}
    text_val = data.get('notes')
    if text_val is None:
        text_val = ''
    market.notes = text_val if str(text_val).strip() else None
    db.session.commit()
    return jsonify({'notes': market.notes or ''})


def _migrate_legacy_sticky_notes(market_id):
    """If market has legacy Market.notes and no cards, import as first sticky."""
    market = Market.query.get(market_id)
    if not market:
        return
    if MarketStickyNote.query.filter_by(market_id=market_id).first():
        return
    legacy = (market.notes or '').strip()
    if not legacy:
        return
    db.session.add(MarketStickyNote(market_id=market_id, body=legacy, tint=0, sort_order=0))
    db.session.commit()


@app.route('/api/current-market/sticky-notes', methods=['GET'])
@login_required
def list_current_market_sticky_notes():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    market = Market.query.get(market_id)
    if not market:
        return jsonify({'error': 'Market not found'}), 404
    _migrate_legacy_sticky_notes(market_id)
    notes = MarketStickyNote.query.filter_by(market_id=market_id).order_by(
        MarketStickyNote.sort_order, MarketStickyNote.id
    ).all()
    return jsonify({
        'market_name': market.name,
        'notes': [{
            'id': n.id,
            'body': n.body or '',
            'tint': n.tint or 0,
            'sort_order': n.sort_order
        } for n in notes]
    })


@app.route('/api/current-market/sticky-notes', methods=['POST'])
@login_required
def create_current_market_sticky_note():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    if not Market.query.get(market_id):
        return jsonify({'error': 'Market not found'}), 404
    _migrate_legacy_sticky_notes(market_id)
    data = request.json or {}
    body = data.get('body', '') or ''
    tint = data.get('tint')
    existing = MarketStickyNote.query.filter_by(market_id=market_id).all()
    try:
        tint = int(tint) if tint is not None else (len(existing) % 6)
    except (TypeError, ValueError):
        tint = 0
    tint = max(0, min(5, tint))
    mx = max((n.sort_order for n in existing), default=0)
    n = MarketStickyNote(market_id=market_id, body=str(body)[:50000], tint=tint, sort_order=int(mx) + 1)
    db.session.add(n)
    db.session.commit()
    return jsonify({
        'id': n.id,
        'body': n.body,
        'tint': n.tint,
        'sort_order': n.sort_order
    }), 201


@app.route('/api/current-market/sticky-notes/<int:note_id>', methods=['PUT'])
@login_required
def update_current_market_sticky_note(note_id):
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    n = MarketStickyNote.query.filter_by(id=note_id, market_id=market_id).first()
    if not n:
        return jsonify({'error': 'Note not found'}), 404
    data = request.json or {}
    if 'body' in data:
        n.body = str(data.get('body') or '')[:50000]
    if 'tint' in data:
        try:
            n.tint = max(0, min(5, int(data.get('tint'))))
        except (TypeError, ValueError):
            pass
    db.session.commit()
    return jsonify({
        'id': n.id,
        'body': n.body,
        'tint': n.tint,
        'sort_order': n.sort_order
    })


@app.route('/api/current-market/sticky-notes/<int:note_id>', methods=['DELETE'])
@login_required
def delete_current_market_sticky_note(note_id):
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    n = MarketStickyNote.query.filter_by(id=note_id, market_id=market_id).first()
    if not n:
        return jsonify({'error': 'Note not found'}), 404
    db.session.delete(n)
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/import-data', methods=['POST'])
@login_required
def import_data():
    """Import data from local export (JSON). Replaces all data except users. Supports chunked import via replace=false."""
    from decimal import Decimal
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        replace = data.get('_replace', True)  # Default True for backward compatibility
        if not replace:
            data = {k: v for k, v in data.items() if not k.startswith('_')}
        
        # Tables in delete order (children first)
        delete_order = [
            SupplierReturnAllocation, SaleItemAllocation, SupplierReturnLine, InventoryBatch,
            InventoryAdjustment, SafeStatementRealBalance, SafeTransaction, PartnerDrawing,
            GeneralExpense, Payment, SaleItem, Sale, PurchaseItem, PurchaseContainer,
            SupplierReturn, Item, Company, MarketStickyNote, MarketPartner,
            PurchasingRepresentative, Market
        ]
        # Tables in insert order (parents first)
        table_config = [
            ('markets', Market, ['id', 'name', 'address', 'base_currency', 'calculation_method', 'notes', 'is_active', 'created_at']),
            ('market_sticky_notes', MarketStickyNote, ['id', 'market_id', 'body', 'tint', 'sort_order', 'created_at', 'updated_at']),
            ('market_partners', MarketPartner, ['id', 'market_id', 'name', 'share_percent', 'created_at', 'updated_at']),
            ('partner_drawings', PartnerDrawing, ['id', 'market_id', 'partner_id', 'date', 'description', 'amount', 'currency', 'exchange_rate', 'created_at']),
            ('purchasing_representatives', PurchasingRepresentative, ['id', 'market_id', 'name', 'is_active', 'created_at', 'updated_at']),
            ('companies', Company, ['id', 'market_id', 'name', 'address', 'category', 'payment_type', 'currency', 'created_at']),
            ('items', Item, ['id', 'market_id', 'supplier_id', 'code', 'name', 'weight', 'grade', 'category1', 'category2', 'created_at']),
            ('supplier_returns', SupplierReturn, ['id', 'market_id', 'supplier_id', 'date', 'reference_number', 'currency', 'exchange_rate', 'notes', 'created_at']),
            ('supplier_return_lines', SupplierReturnLine, ['id', 'supplier_return_id', 'item_id', 'quantity', 'unit_price', 'total_price']),
            ('purchase_containers', PurchaseContainer, ['id', 'market_id', 'container_number', 'supplier_id', 'representative_id', 'currency', 'exchange_rate', 'date', 'notes', 'expense1_amount', 'expense1_currency', 'expense1_exchange_rate', 'expense2_amount', 'expense2_service_company_id', 'expense2_currency', 'expense2_exchange_rate', 'expense3_amount', 'expense3_currency', 'expense3_exchange_rate', 'created_at']),
            ('purchase_items', PurchaseItem, ['id', 'container_id', 'item_id', 'quantity', 'unit_price', 'total_price']),
            ('sales', Sale, ['id', 'market_id', 'invoice_number', 'customer_id', 'supplier_id', 'date', 'total_amount', 'paid_amount', 'balance', 'payment_type', 'status', 'notes', 'created_at']),
            ('sale_items', SaleItem, ['id', 'sale_id', 'item_id', 'line_description', 'quantity', 'unit_price', 'total_price']),
            ('payments', Payment, ['id', 'market_id', 'company_id', 'sale_id', 'purchase_container_id', 'payment_type', 'amount', 'currency', 'exchange_rate', 'amount_base_currency_stored', 'date', 'notes', 'loan', 'created_at']),
            ('general_expenses', GeneralExpense, ['id', 'market_id', 'date', 'description', 'category', 'amount', 'currency', 'exchange_rate', 'created_at']),
            ('safe_transactions', SafeTransaction, ['id', 'market_id', 'transaction_type', 'amount', 'currency', 'exchange_rate', 'amount_base_currency_stored', 'date', 'description', 'payment_id', 'sale_id', 'general_expense_id', 'partner_drawing_id', 'balance_after', 'created_at']),
            ('safe_statement_real_balances', SafeStatementRealBalance, ['id', 'market_id', 'date', 'real_balance', 'currency_rate', 'created_at', 'updated_at']),
            ('inventory_adjustments', InventoryAdjustment, ['id', 'market_id', 'item_id', 'adjustment_type', 'quantity', 'date', 'reason', 'notes', 'created_at', 'updated_at']),
            ('inventory_batches', InventoryBatch, ['id', 'market_id', 'item_id', 'purchase_item_id', 'container_id', 'purchase_date', 'original_quantity', 'available_quantity', 'unit_price', 'cog_per_unit', 'cost_per_unit', 'currency', 'exchange_rate', 'created_at']),
            ('sale_item_allocations', SaleItemAllocation, ['id', 'sale_item_id', 'batch_id', 'quantity', 'cost_per_unit', 'total_cost', 'created_at']),
            ('supplier_return_allocations', SupplierReturnAllocation, ['id', 'supplier_return_line_id', 'batch_id', 'quantity']),
        ]
        
        def to_py(val):
            if val is None: return None
            if isinstance(val, str) and val.endswith('Z'): val = val.replace('Z', '+00:00')
            return val
        
        if replace:
            # Delete existing data
            for model in delete_order:
                model.query.delete()
            db.session.commit()
            # Reset SQLite autoincrement so imported IDs can be reused
            if db.engine.dialect.name != 'postgresql':
                try:
                    db.session.execute(db.text(
                        "DELETE FROM sqlite_sequence WHERE name IN ("
                        "'markets','market_sticky_notes','market_partners','partner_drawings',"
                        "'purchasing_representatives','companies','items','supplier_returns',"
                        "'supplier_return_lines','purchase_containers','purchase_items','sales',"
                        "'sale_items','payments','general_expenses','safe_transactions',"
                        "'safe_statement_real_balances','inventory_adjustments','inventory_batches',"
                        "'sale_item_allocations','supplier_return_allocations')"
                    ))
                    db.session.commit()
                except Exception:
                    db.session.rollback()
        
        total = 0
        for table_name, model, columns in table_config:
            rows = data.get(table_name, [])
            for row in rows:
                try:
                    kwargs = {}
                    for col in columns:
                        if col in row and row[col] is not None:
                            v = row[col]
                            if isinstance(v, (int, float)) and 'amount' in col.lower() or 'price' in col.lower() or 'quantity' in col.lower() or 'rate' in col.lower() or 'balance' in col.lower():
                                kwargs[col] = Decimal(str(v))
                            elif 'date' in col and col != 'created_at' and col != 'updated_at':
                                kwargs[col] = datetime.strptime(str(v)[:10], '%Y-%m-%d').date() if v else None
                            elif 'created_at' in col or 'updated_at' in col:
                                try:
                                    kwargs[col] = datetime.fromisoformat(str(v).replace('Z', '+00:00')) if v else datetime.utcnow()
                                except: kwargs[col] = datetime.utcnow()
                            else:
                                kwargs[col] = v
                    obj = model(**kwargs)
                    db.session.add(obj)
                    total += 1
                except Exception as e:
                    db.session.rollback()
                    return jsonify({'error': f'Import failed at {table_name}: {str(e)}'}), 400
        db.session.commit()

        # PostgreSQL keeps its own ID counters; after importing explicit IDs they must
        # be advanced or the next new invoice/item can fail with a duplicate-key error.
        if db.engine.dialect.name == 'postgresql':
            pg_tables = (
                'markets', 'market_sticky_notes', 'market_partners', 'partner_drawings',
                'purchasing_representatives', 'companies', 'items', 'supplier_returns',
                'supplier_return_lines', 'purchase_containers', 'purchase_items', 'sales',
                'sale_items', 'payments', 'general_expenses', 'safe_transactions',
                'safe_statement_real_balances', 'inventory_adjustments', 'inventory_batches',
                'sale_item_allocations', 'supplier_return_allocations',
            )
            for table in pg_tables:
                db.session.execute(db.text(
                    f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
                    f"COALESCE((SELECT MAX(id) FROM {table}), 1), "
                    f"(SELECT COUNT(*) FROM {table}) > 0)"
                ))
            db.session.commit()
        
        # Set session to first market
        market = Market.query.first()
        if market:
            session['current_market_id'] = market.id
        
        return jsonify({'success': True, 'message': f'Imported {total} records successfully.'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

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
from api import companies, items, purchases, sales, payments, reports, safe, expenses, inventory, partners, supplier_returns, representatives

app.register_blueprint(companies.bp, url_prefix='/api/companies')
app.register_blueprint(items.bp, url_prefix='/api/items')
app.register_blueprint(purchases.bp, url_prefix='/api/purchases')
app.register_blueprint(sales.bp, url_prefix='/api/sales')
app.register_blueprint(payments.bp, url_prefix='/api/payments')
app.register_blueprint(reports.bp, url_prefix='/api/reports')
app.register_blueprint(safe.bp, url_prefix='/api/safe')
app.register_blueprint(expenses.bp, url_prefix='/api/expenses')
app.register_blueprint(inventory.bp, url_prefix='/api/inventory')
app.register_blueprint(partners.bp, url_prefix='/api/partners')
app.register_blueprint(supplier_returns.bp, url_prefix='/api/supplier-returns')
app.register_blueprint(representatives.bp, url_prefix='/api/representatives')

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

@app.route('/supplier-returns')
@login_required
def supplier_returns_page():
    return render_template('supplier_returns.html')

@app.route('/sales')
@login_required
def sales_page():
    return render_template('sales.html')

@app.route('/fast-sell')
@login_required
def fast_sell_page():
    return render_template('fast_sell.html')

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

@app.route('/market-notes')
@login_required
def market_notes_page():
    return render_template('market_notes.html')

@app.route('/partners')
@login_required
def partners_page():
    return render_template('partners.html')

def get_dashboard_stats(market_id):
    """Calculate dashboard statistics"""
    from models import Company, Sale, PurchaseContainer, SafeTransaction, SaleItem, PurchaseItem, Item, SupplierReturn, SupplierReturnLine
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
    
    # Get supplier returns per item (reduces on-hand like sales)
    return_totals = dict(db.session.query(
        SupplierReturnLine.item_id,
        func.coalesce(func.sum(SupplierReturnLine.quantity), 0)
    ).join(SupplierReturn, SupplierReturnLine.supplier_return_id == SupplierReturn.id).filter(
        SupplierReturn.market_id == market_id,
        SupplierReturnLine.item_id.in_(item_ids) if item_ids else True
    ).group_by(SupplierReturnLine.item_id).all())
    
    # Calculate total available stock
    total_stock = Decimal('0')
    for item_id in item_ids:
        purchases_qty = Decimal(str(purchase_totals.get(item_id, 0)))
        sales_qty = Decimal(str(sale_totals.get(item_id, 0)))
        returns_qty = Decimal(str(return_totals.get(item_id, 0)))
        total_stock += purchases_qty - sales_qty - returns_qty
    
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
    from models import Company, Item, PurchaseItem, SaleItem, PurchaseContainer, Sale, InventoryAdjustment, SupplierReturn, SupplierReturnLine
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
        
        return_totals = dict(db.session.query(
            SupplierReturnLine.item_id,
            func.coalesce(func.sum(SupplierReturnLine.quantity), 0)
        ).join(SupplierReturn, SupplierReturnLine.supplier_return_id == SupplierReturn.id).filter(
            SupplierReturn.market_id == market_id,
            SupplierReturnLine.item_id.in_(item_ids)
        ).group_by(SupplierReturnLine.item_id).all())
        
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
            returns_qty = Decimal(str(return_totals.get(item.id, 0)))
            adjustment_qty = Decimal(str(adjustments_map.get(item.id, 0)))
            available_qty = purchases_qty - sales_qty - returns_qty + adjustment_qty
            
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

@app.route('/api/dashboard/selected-items-stock', methods=['GET'])
@login_required
def get_selected_items_stock():
    """Available on-hand quantity for a list of item IDs (same rules as Inventory Stock)."""
    from decimal import Decimal
    from api.reports import _available_quantity_map_for_item_ids

    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400

    raw_ids = request.args.get('item_ids', '')
    item_ids = []
    for part in raw_ids.split(','):
        part = part.strip()
        if not part:
            continue
        try:
            item_ids.append(int(part))
        except ValueError:
            return jsonify({'error': f'Invalid item id: {part}'}), 400

    if not item_ids:
        return jsonify({'items': [], 'totals': {'quantity': 0.0, 'weight': 0.0}})

    item_ids = list(dict.fromkeys(item_ids))
    items = Item.query.filter(Item.market_id == market_id, Item.id.in_(item_ids)).all()
    items_by_id = {i.id: i for i in items}

    supplier_ids = {i.supplier_id for i in items if i.supplier_id}
    suppliers_by_id = {}
    if supplier_ids:
        suppliers = Company.query.filter(Company.id.in_(supplier_ids)).all()
        suppliers_by_id = {s.id: s.name for s in suppliers}

    avail_map = _available_quantity_map_for_item_ids(market_id, item_ids)

    rows = []
    total_qty = Decimal('0')
    total_weight = Decimal('0')
    for iid in item_ids:
        item = items_by_id.get(iid)
        if not item:
            continue
        avail = Decimal(str(avail_map.get(iid, 0.0)))
        item_weight = Decimal(str(item.weight or 0))
        row_weight = avail * item_weight
        total_qty += avail
        total_weight += row_weight
        rows.append({
            'item_id': item.id,
            'code': item.code,
            'name': item.name,
            'supplier_name': suppliers_by_id.get(item.supplier_id, '—') if item.supplier_id else '—',
            'available_quantity': float(avail),
            'weight': float(item_weight),
            'total_weight': float(row_weight),
        })

    return jsonify({
        'items': rows,
        'totals': {
            'quantity': float(total_qty),
            'weight': float(total_weight),
        },
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

