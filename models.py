"""
Database models for the accounting system
"""
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from decimal import Decimal
from sqlalchemy import or_

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    full_name = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def is_authenticated(self):
        return True
    
    def is_active(self):
        return True
    
    def is_anonymous(self):
        return False
    
    def get_id(self):
        return str(self.id)

class Market(db.Model):
    __tablename__ = 'markets'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    address = db.Column(db.Text)
    base_currency = db.Column(db.String(10), nullable=False)
    calculation_method = db.Column(db.String(20), default='Average', nullable=False)  # 'Average' or 'FIFO'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    companies = db.relationship('Company', backref='market', lazy=True, cascade='all, delete-orphan')
    items = db.relationship('Item', backref='market', lazy=True, cascade='all, delete-orphan')
    purchases = db.relationship('PurchaseContainer', backref='market', lazy=True, cascade='all, delete-orphan')
    sales = db.relationship('Sale', backref='market', lazy=True, cascade='all, delete-orphan')
    safe_transactions = db.relationship('SafeTransaction', backref='market', lazy=True, cascade='all, delete-orphan')
    general_expenses = db.relationship('GeneralExpense', backref='market', lazy=True, cascade='all, delete-orphan')

class Company(db.Model):
    __tablename__ = 'companies'
    id = db.Column(db.Integer, primary_key=True)
    market_id = db.Column(db.Integer, db.ForeignKey('markets.id'), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    address = db.Column(db.Text)
    category = db.Column(db.String(50), nullable=False)  # Supplier, Service Company, Customer
    payment_type = db.Column(db.String(20))  # Cash, Credit (for customers)
    currency = db.Column(db.String(10), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    purchases = db.relationship('PurchaseContainer', foreign_keys='PurchaseContainer.supplier_id', backref='supplier', lazy=True)
    purchase_expenses = db.relationship('PurchaseContainer', foreign_keys='PurchaseContainer.expense2_service_company_id', backref='expense_service_company', lazy=True)
    sales_as_customer = db.relationship('Sale', foreign_keys='Sale.customer_id', backref='customer', lazy=True)
    sales_as_supplier = db.relationship('Sale', foreign_keys='Sale.supplier_id', backref='supplier', lazy=True)
    payments = db.relationship('Payment', backref='company', lazy=True)
    
    def get_balance(self, market_id):
        """Calculate company balance (debit - credit) in company's currency"""
        # For suppliers: purchases (including expense1) are debit, payments are credit
        # For service companies: expense2 from purchases are debit, payments are credit
        # For customers: sales are debit, payments are credit
        # IMPORTANT: Use original currency amounts (amount), NOT base currency (amount_base_currency)
        # Base currency is only used for safe movements, not for company statement balance
        if self.category == 'Supplier':
            # Total amount (items only) + expense1 separately
            purchases = PurchaseContainer.query.filter_by(
                market_id=market_id, supplier_id=self.id
            ).all()
            total_debit = sum(p.total_amount for p in purchases)  # Items only (excludes expense1)
            # Expense1 is always in container currency (same as supplier currency), use amount directly
            total_debit += sum(p.expense1_amount for p in purchases if p.expense1_amount and p.expense1_amount > 0)
            # Add loans as debit (money borrowed from supplier) - use original currency amount
            # IMPORTANT: Loan payments have payment_type='In' but should be included as debit
            all_payments = Payment.query.filter_by(
                market_id=market_id, company_id=self.id
            ).filter(
                or_(
                    Payment.payment_type == 'Out',  # Regular payments
                    Payment.loan.is_(True)  # Loan payments (can be 'In' or 'Out')
                )
            ).all()
            # Separate loans (debit) from regular payments (credit)
            loans = [p for p in all_payments if p.loan is True]
            payments = [p for p in all_payments if p.loan is not True]
            total_debit += sum(p.amount for p in loans)  # Use original currency, not base currency
            total_credit = sum(p.amount for p in payments)  # Use original currency, not base currency
        elif self.category == 'Service Company':
            total_debit = sum(p.expense2_base_currency for p in PurchaseContainer.query.filter_by(
                market_id=market_id, expense2_service_company_id=self.id
            ).all() if p.expense2_amount and p.expense2_amount > 0)
            # Add loans as debit (money borrowed from service company) - use original currency amount
            # IMPORTANT: Loan payments have payment_type='In' but should be included as debit
            all_payments = Payment.query.filter_by(
                market_id=market_id, company_id=self.id
            ).filter(
                or_(
                    Payment.payment_type == 'Out',  # Regular payments
                    Payment.loan.is_(True)  # Loan payments (can be 'In' or 'Out')
                )
            ).all()
            # Separate loans (debit) from regular payments (credit)
            loans = [p for p in all_payments if p.loan is True]
            payments = [p for p in all_payments if p.loan is not True]
            total_debit += sum(p.amount for p in loans)  # Use original currency, not base currency
            total_credit = sum(p.amount for p in payments)  # Use original currency, not base currency
        else:  # Customer
            # Use total_amount (not balance) since payments are tracked separately in Payment records
            total_debit = sum(s.total_amount for s in Sale.query.filter_by(
                market_id=market_id, customer_id=self.id
            ).all())
            # Get all payments (both In and Out)
            all_payments = Payment.query.filter_by(
                market_id=market_id, company_id=self.id
            ).all()
            # In payments = credit (reduces balance), Out payments = debit (increases balance)
            total_credit = sum(p.amount for p in all_payments if p.payment_type == 'In')
            total_debit_from_payments = sum(p.amount for p in all_payments if p.payment_type == 'Out')
            total_debit += total_debit_from_payments
        
        return total_debit - total_credit

class Item(db.Model):
    __tablename__ = 'items'
    id = db.Column(db.Integer, primary_key=True)
    market_id = db.Column(db.Integer, db.ForeignKey('markets.id'), nullable=False)
    supplier_id = db.Column(db.Integer, db.ForeignKey('companies.id'), nullable=True)  # NULL for legacy items
    code = db.Column(db.String(100), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    weight = db.Column(db.Numeric(10, 2), nullable=False)
    grade = db.Column(db.String(50))
    category1 = db.Column(db.String(100))
    category2 = db.Column(db.String(100))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    supplier = db.relationship('Company', foreign_keys=[supplier_id], backref='items')
    purchase_items = db.relationship('PurchaseItem', backref='item', lazy=True)
    sale_items = db.relationship('SaleItem', backref='item', lazy=True)
    
    __table_args__ = (db.UniqueConstraint('market_id', 'supplier_id', 'code', name='unique_item_code_per_supplier'),)

class PurchaseContainer(db.Model):
    __tablename__ = 'purchase_containers'
    id = db.Column(db.Integer, primary_key=True)
    market_id = db.Column(db.Integer, db.ForeignKey('markets.id'), nullable=False)
    container_number = db.Column(db.String(100), nullable=False)
    supplier_id = db.Column(db.Integer, db.ForeignKey('companies.id'), nullable=False)
    currency = db.Column(db.String(10), nullable=False)
    exchange_rate = db.Column(db.Numeric(10, 4), nullable=False)
    date = db.Column(db.Date, nullable=False, default=datetime.utcnow)
    notes = db.Column(db.Text)
    # Expenses
    expense1_amount = db.Column(db.Numeric(10, 2), default=0)  # Supplier expense (added to supplier debit)
    expense1_currency = db.Column(db.String(10))
    expense1_exchange_rate = db.Column(db.Numeric(10, 4))
    expense2_amount = db.Column(db.Numeric(10, 2), default=0)  # Service company expense
    expense2_service_company_id = db.Column(db.Integer, db.ForeignKey('companies.id'), nullable=True)
    expense2_currency = db.Column(db.String(10))
    expense2_exchange_rate = db.Column(db.Numeric(10, 4))
    expense3_amount = db.Column(db.Numeric(10, 2), default=0)  # Cash expense (shown in safe)
    expense3_currency = db.Column(db.String(10))
    expense3_exchange_rate = db.Column(db.Numeric(10, 4))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    items = db.relationship('PurchaseItem', backref='container', lazy=True, cascade='all, delete-orphan')
    
    @property
    def total_amount(self):
        """Total amount of items only (excludes expense1, which is shown separately)"""
        items_total = sum(item.total_price for item in self.items)
        return items_total
    
    @property
    def expense1_base_currency(self):
        """Expense 1 in base currency"""
        if not self.expense1_amount:
            return Decimal('0')
        return (self.expense1_amount or 0) * (self.expense1_exchange_rate or 1)
    
    @property
    def expense2_base_currency(self):
        """Expense 2 in base currency"""
        if not self.expense2_amount:
            return Decimal('0')
        return (self.expense2_amount or 0) * (self.expense2_exchange_rate or 1)
    
    @property
    def expense3_base_currency(self):
        """Expense 3 in base currency"""
        if not self.expense3_amount:
            return Decimal('0')
        return (self.expense3_amount or 0) * (self.expense3_exchange_rate or 1)

class PurchaseItem(db.Model):
    __tablename__ = 'purchase_items'
    id = db.Column(db.Integer, primary_key=True)
    container_id = db.Column(db.Integer, db.ForeignKey('purchase_containers.id'), nullable=False)
    item_id = db.Column(db.Integer, db.ForeignKey('items.id'), nullable=False)
    quantity = db.Column(db.Numeric(10, 2), nullable=False)
    unit_price = db.Column(db.Numeric(10, 2), nullable=False)
    total_price = db.Column(db.Numeric(10, 2), nullable=False)
    
    @property
    def total_price_base_currency(self):
        """Convert to market base currency"""
        return self.total_price * self.container.exchange_rate

class Sale(db.Model):
    __tablename__ = 'sales'
    id = db.Column(db.Integer, primary_key=True)
    market_id = db.Column(db.Integer, db.ForeignKey('markets.id'), nullable=False)
    invoice_number = db.Column(db.String(100), unique=True, nullable=False)
    customer_id = db.Column(db.Integer, db.ForeignKey('companies.id'), nullable=False)
    supplier_id = db.Column(db.Integer, db.ForeignKey('companies.id'), nullable=True)
    date = db.Column(db.Date, nullable=False, default=datetime.utcnow)
    total_amount = db.Column(db.Numeric(10, 2), nullable=False)
    paid_amount = db.Column(db.Numeric(10, 2), default=0)
    balance = db.Column(db.Numeric(10, 2), nullable=False)
    payment_type = db.Column(db.String(20), nullable=False)  # Cash, Credit
    status = db.Column(db.String(20), default='Unpaid')  # Paid, Unpaid, Partial
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    items = db.relationship('SaleItem', backref='sale', lazy=True, cascade='all, delete-orphan')
    payments = db.relationship('Payment', backref='sale', lazy=True)
    
    def update_status(self):
        """Update payment status based on paid_amount"""
        if self.paid_amount >= self.total_amount:
            self.status = 'Paid'
        elif self.paid_amount > 0:
            self.status = 'Partial'
        else:
            self.status = 'Unpaid'
        self.balance = self.total_amount - self.paid_amount

class SaleItem(db.Model):
    __tablename__ = 'sale_items'
    id = db.Column(db.Integer, primary_key=True)
    sale_id = db.Column(db.Integer, db.ForeignKey('sales.id'), nullable=False)
    item_id = db.Column(db.Integer, db.ForeignKey('items.id'), nullable=False)
    quantity = db.Column(db.Numeric(10, 2), nullable=False)
    unit_price = db.Column(db.Numeric(10, 2), nullable=False)
    total_price = db.Column(db.Numeric(10, 2), nullable=False)

class Payment(db.Model):
    __tablename__ = 'payments'
    id = db.Column(db.Integer, primary_key=True)
    market_id = db.Column(db.Integer, db.ForeignKey('markets.id'), nullable=False)
    company_id = db.Column(db.Integer, db.ForeignKey('companies.id'), nullable=False)
    sale_id = db.Column(db.Integer, db.ForeignKey('sales.id'), nullable=True)
    payment_type = db.Column(db.String(20), nullable=False)  # In (from customer), Out (to supplier/service)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    currency = db.Column(db.String(10), nullable=False)
    exchange_rate = db.Column(db.Numeric(10, 4), nullable=False)
    amount_base_currency_stored = db.Column(db.Numeric(10, 2), nullable=True)  # Store exact base currency amount entered
    date = db.Column(db.Date, nullable=False, default=datetime.utcnow)
    notes = db.Column(db.Text)
    loan = db.Column(db.Boolean, default=False)  # True if this is a loan/borrowing transaction
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    @property
    def amount_base_currency(self):
        """Get base currency amount - use stored value if available, otherwise calculate"""
        try:
            stored_value = getattr(self, 'amount_base_currency_stored', None)
            if stored_value is not None:
                return stored_value
        except (AttributeError, KeyError):
            pass
        # Fallback for old records without amount_base_currency_stored
        return self.amount * self.exchange_rate

class SafeTransaction(db.Model):
    __tablename__ = 'safe_transactions'
    id = db.Column(db.Integer, primary_key=True)
    market_id = db.Column(db.Integer, db.ForeignKey('markets.id'), nullable=False)
    transaction_type = db.Column(db.String(20), nullable=False)  # Opening, Inflow, Outflow
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    currency = db.Column(db.String(10), nullable=False)
    exchange_rate = db.Column(db.Numeric(10, 4), nullable=False)
    amount_base_currency_stored = db.Column(db.Numeric(10, 2), nullable=True)  # Store exact base currency amount
    date = db.Column(db.Date, nullable=False, default=datetime.utcnow)
    description = db.Column(db.Text)
    payment_id = db.Column(db.Integer, db.ForeignKey('payments.id'), nullable=True)
    sale_id = db.Column(db.Integer, db.ForeignKey('sales.id'), nullable=True)
    general_expense_id = db.Column(db.Integer, db.ForeignKey('general_expenses.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Calculated balance after this transaction
    balance_after = db.Column(db.Numeric(10, 2), nullable=False)
    
    @property
    def amount_base_currency(self):
        """Convert to market base currency - use stored value if available, otherwise calculate"""
        stored_value = getattr(self, 'amount_base_currency_stored', None)
        if stored_value is not None:
            return stored_value
        # Fallback for old records without amount_base_currency_stored
        return self.amount * self.exchange_rate

class GeneralExpense(db.Model):
    __tablename__ = 'general_expenses'
    id = db.Column(db.Integer, primary_key=True)
    market_id = db.Column(db.Integer, db.ForeignKey('markets.id'), nullable=False)
    date = db.Column(db.Date, nullable=False, default=datetime.utcnow)
    description = db.Column(db.Text, nullable=False)
    category = db.Column(db.String(100), nullable=False)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    currency = db.Column(db.String(10), nullable=False)
    exchange_rate = db.Column(db.Numeric(10, 4), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationship
    safe_transaction = db.relationship('SafeTransaction', backref='general_expense', uselist=False)
    
    @property
    def amount_base_currency(self):
        """Convert to market base currency"""
        return self.amount * self.exchange_rate

class SafeStatementRealBalance(db.Model):
    """Store manually entered real balance for each date in Safe Statement"""
    __tablename__ = 'safe_statement_real_balances'
    id = db.Column(db.Integer, primary_key=True)
    market_id = db.Column(db.Integer, db.ForeignKey('markets.id'), nullable=False)
    date = db.Column(db.Date, nullable=False)
    real_balance = db.Column(db.Numeric(10, 2), nullable=True)  # Nullable for dates without manual entry
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    __table_args__ = (db.UniqueConstraint('market_id', 'date', name='unique_market_date'),)

class InventoryAdjustment(db.Model):
    """Store inventory quantity adjustments that don't affect COG or financial calculations"""
    __tablename__ = 'inventory_adjustments'
    id = db.Column(db.Integer, primary_key=True)
    market_id = db.Column(db.Integer, db.ForeignKey('markets.id'), nullable=False)
    item_id = db.Column(db.Integer, db.ForeignKey('items.id'), nullable=False)
    adjustment_type = db.Column(db.String(20), nullable=False)  # 'Increase' or 'Decrease'
    quantity = db.Column(db.Numeric(10, 2), nullable=False)  # Always positive, type determines add/subtract
    date = db.Column(db.Date, nullable=False, default=datetime.utcnow)
    reason = db.Column(db.String(500))  # Reason for adjustment (e.g., "Damaged goods", "Found stock", etc.)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    item = db.relationship('Item', backref='inventory_adjustments')
    market = db.relationship('Market', backref='inventory_adjustments')

class InventoryBatch(db.Model):
    """Tracks available inventory from each purchase batch for FIFO calculation"""
    __tablename__ = 'inventory_batches'
    id = db.Column(db.Integer, primary_key=True)
    market_id = db.Column(db.Integer, db.ForeignKey('markets.id'), nullable=False)
    item_id = db.Column(db.Integer, db.ForeignKey('items.id'), nullable=False)
    purchase_item_id = db.Column(db.Integer, db.ForeignKey('purchase_items.id'), nullable=False)
    container_id = db.Column(db.Integer, db.ForeignKey('purchase_containers.id'), nullable=False)
    
    # Original purchase data
    purchase_date = db.Column(db.Date, nullable=False)
    original_quantity = db.Column(db.Numeric(10, 2), nullable=False)
    available_quantity = db.Column(db.Numeric(10, 2), nullable=False)  # Remaining stock
    unit_price = db.Column(db.Numeric(10, 2), nullable=False)  # In container currency
    cog_per_unit = db.Column(db.Numeric(10, 2), nullable=False)  # COG per unit
    cost_per_unit = db.Column(db.Numeric(10, 2), nullable=False)  # unit_price + cog_per_unit
    currency = db.Column(db.String(10), nullable=False)
    exchange_rate = db.Column(db.Numeric(10, 4), nullable=False)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    item = db.relationship('Item', backref='inventory_batches')
    purchase_item = db.relationship('PurchaseItem', backref='inventory_batches')
    container = db.relationship('PurchaseContainer')
    market = db.relationship('Market', backref='inventory_batches')
    
    # Indexes for performance
    __table_args__ = (
        db.Index('idx_batch_item_date', 'item_id', 'purchase_date'),
        db.Index('idx_batch_available', 'item_id', 'available_quantity'),
    )

class SaleItemAllocation(db.Model):
    """Tracks which inventory batches were used for each sale item (FIFO allocation)"""
    __tablename__ = 'sale_item_allocations'
    id = db.Column(db.Integer, primary_key=True)
    sale_item_id = db.Column(db.Integer, db.ForeignKey('sale_items.id'), nullable=False)
    batch_id = db.Column(db.Integer, db.ForeignKey('inventory_batches.id'), nullable=False)
    quantity = db.Column(db.Numeric(10, 2), nullable=False)  # Quantity from this batch
    cost_per_unit = db.Column(db.Numeric(10, 2), nullable=False)  # Cost at time of sale (in base currency)
    total_cost = db.Column(db.Numeric(10, 2), nullable=False)  # quantity * cost_per_unit
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    sale_item = db.relationship('SaleItem', backref='allocations')
    batch = db.relationship('InventoryBatch', backref='allocations')

