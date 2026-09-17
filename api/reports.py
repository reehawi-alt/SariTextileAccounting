"""
Reports API endpoints
"""
from flask import Blueprint, request, jsonify, session, send_file
from flask_login import login_required
from models import db, Item, SaleItem, PurchaseItem, Sale, PurchaseContainer, Company, SafeTransaction, SafeStatementRealBalance, Market, MarketPartner, PartnerDrawing, InventoryAdjustment, InventoryBatch, SaleItemAllocation, Payment, GeneralExpense, SupplierReturn, SupplierReturnLine, PurchasingRepresentative
from decimal import Decimal
from datetime import datetime, timedelta
import pandas as pd
from io import BytesIO
from openpyxl.utils import get_column_letter
from sqlalchemy import func, case
from sqlalchemy.orm import joinedload

from api.expenses import _approx_usd_amount
from api.stock_value_details_compute import build_stock_value_item_row, historic_weighted_landed_cost_per_unit

bp = Blueprint('reports', __name__)

DEFAULT_USD_RATE = Decimal('0')


def _get_currency_rates_for_dates(market_id, dates):
    """Map date -> Safe Statement currency rate (base per USD)."""
    if not dates:
        return {}
    rows = SafeStatementRealBalance.query.filter_by(market_id=market_id).filter(
        SafeStatementRealBalance.date.in_(dates)
    ).all()
    return {
        row.date.isoformat(): float(row.currency_rate) if row.currency_rate else None
        for row in rows
    }


def _resolve_usd_rate(date_str, rates_map):
    rate = rates_map.get(date_str)
    if rate is None or rate <= 0:
        return float(DEFAULT_USD_RATE), False
    return float(rate), True

def _daily_sales_line_dict(sale_item, sale):
    """Serialize SaleItem for daily-sales report (catalog and fast-sell lines)."""
    row = {
        'id': sale_item.id,
        'item_id': sale_item.item_id,
        'line_description': sale_item.line_description,
        'quantity': float(sale_item.quantity),
        'unit_price': float(sale_item.unit_price),
        'total_price': float(sale_item.total_price),
        'customer_name': sale.customer.name if sale.customer else '',
        'supplier_name': sale.supplier.name if sale.supplier else None,
        'is_fast_line': sale_item.item_id is None,
    }
    if sale_item.item_id and getattr(sale_item, 'item', None) is not None:
        row['item_code'] = sale_item.item.code
        row['item_name'] = sale_item.item.name
    else:
        row['item_code'] = '—'
        row['item_name'] = (sale_item.line_description or '').strip() or '—'
    return row

@bp.route('/daily-sales', methods=['GET'])
@login_required
def get_daily_sales():
    """Get daily sales grouped by date, with all sales for each day combined into one invoice"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    query = Sale.query.options(
        joinedload(Sale.customer),
        joinedload(Sale.supplier),
        joinedload(Sale.items).joinedload(SaleItem.item),
    ).filter_by(market_id=market_id)
    
    if start_date:
        query = query.filter(Sale.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        query = query.filter(Sale.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    
    sales = query.order_by(Sale.date.asc(), Sale.id.asc()).all()
    
    # Group sales by date
    daily_sales = {}
    for sale in sales:
        sale_date = sale.date.isoformat()
        
        if sale_date not in daily_sales:
            daily_sales[sale_date] = {
                'date': sale_date,
                'sales': [],
                'total_amount': Decimal('0'),
                'total_paid': Decimal('0'),
                'total_balance': Decimal('0'),
                'total_quantity': Decimal('0'),
                'customers': set(),
                'suppliers': set()
            }
        
        items = [_daily_sales_line_dict(i, sale) for i in sale.items]
        
        supplier_name = sale.supplier.name if sale.supplier else None

        daily_sales[sale_date]['sales'].append({
            'id': sale.id,
            'invoice_number': sale.invoice_number,
            'customer_id': sale.customer_id,
            'customer_name': sale.customer.name,
            'supplier_id': sale.supplier_id,
            'supplier_name': supplier_name,
            'total_amount': float(sale.total_amount),
            'paid_amount': float(sale.paid_amount),
            'balance': float(sale.balance),
            'payment_type': sale.payment_type,
            'status': sale.status,
            'items': items
        })
        
        daily_sales[sale_date]['total_amount'] += sale.total_amount
        daily_sales[sale_date]['total_paid'] += sale.paid_amount
        daily_sales[sale_date]['total_balance'] += sale.balance
        daily_sales[sale_date]['total_quantity'] += sum((i.quantity for i in sale.items), Decimal('0'))
        daily_sales[sale_date]['customers'].add(sale.customer.name)
        if supplier_name:
            daily_sales[sale_date]['suppliers'].add(supplier_name)
    
    # Convert to list format with approximate USD amounts from Safe Statement rates
    sale_dates = [datetime.strptime(d, '%Y-%m-%d').date() for d in daily_sales.keys()]
    rates_map = _get_currency_rates_for_dates(market_id, sale_dates)
    result = []
    total_usd_amount = Decimal('0')
    total_usd_paid = Decimal('0')
    total_usd_balance = Decimal('0')
    for date, data in sorted(daily_sales.items()):
        usd_rate, from_safe_statement = _resolve_usd_rate(date, rates_map)
        approx_usd_amount = _approx_usd_amount(data['total_amount'], usd_rate)
        approx_usd_paid = _approx_usd_amount(data['total_paid'], usd_rate)
        approx_usd_balance = _approx_usd_amount(data['total_balance'], usd_rate)
        total_usd_amount += Decimal(str(approx_usd_amount))
        total_usd_paid += Decimal(str(approx_usd_paid))
        total_usd_balance += Decimal(str(approx_usd_balance))
        result.append({
            'date': data['date'],
            'total_amount': float(data['total_amount']),
            'total_paid': float(data['total_paid']),
            'total_balance': float(data['total_balance']),
            'total_quantity': float(data['total_quantity']),
            'approx_usd_amount': approx_usd_amount,
            'approx_usd_paid': approx_usd_paid,
            'approx_usd_balance': approx_usd_balance,
            'usd_rate': usd_rate,
            'usd_rate_from_safe_statement': from_safe_statement,
            'customers': list(data['customers']),
            'suppliers': list(data['suppliers']),
            'sales': data['sales']
        })
    
    return jsonify({
        'days': result,
        'total_amount': float(sum(d['total_amount'] for d in result)),
        'total_usd_amount': float(total_usd_amount),
        'total_usd_paid': float(total_usd_paid),
        'total_usd_balance': float(total_usd_balance),
    })


def _daily_purchase_line_dict(purchase_item, container):
    """Serialize PurchaseItem for daily-purchases / collections reports."""
    return {
        'id': purchase_item.id,
        'item_id': purchase_item.item_id,
        'item_code': purchase_item.item.code if purchase_item.item else '—',
        'item_name': purchase_item.item.name if purchase_item.item else '—',
        'quantity': float(purchase_item.quantity),
        'unit_price': float(purchase_item.unit_price),
        'total_price': float(purchase_item.total_price),
        'total_price_base': float(purchase_item.total_price * (container.exchange_rate or 1)),
        'supplier_name': container.supplier.name if container.supplier else '',
        'representative_name': container.representative.name if container.representative else None,
        'currency': container.currency,
        'is_fast_line': False,
    }


@bp.route('/daily-purchases', methods=['GET'])
@login_required
def get_daily_purchases():
    """Get daily purchases grouped by date (mirrors daily-sales shape)."""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400

    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    representative_id = request.args.get('representative_id', type=int)

    query = PurchaseContainer.query.options(
        joinedload(PurchaseContainer.supplier),
        joinedload(PurchaseContainer.representative),
        joinedload(PurchaseContainer.items).joinedload(PurchaseItem.item),
    ).filter_by(market_id=market_id)

    if start_date:
        query = query.filter(PurchaseContainer.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        query = query.filter(PurchaseContainer.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    if representative_id:
        query = query.filter(PurchaseContainer.representative_id == representative_id)

    containers = query.order_by(PurchaseContainer.date.asc(), PurchaseContainer.id.asc()).all()

    daily = {}
    for container in containers:
        purchase_date = container.date.isoformat()
        if purchase_date not in daily:
            daily[purchase_date] = {
                'date': purchase_date,
                'purchases': [],
                'total_amount': Decimal('0'),
                'total_paid': Decimal('0'),
                'total_balance': Decimal('0'),
                'total_quantity': Decimal('0'),
                'customers': set(),
                'suppliers': set(),
                'representatives': set(),
            }

        items = [_daily_purchase_line_dict(i, container) for i in container.items]
        amount_base = Decimal(str(container.total_amount_base_currency))
        qty = sum((i.quantity for i in container.items), Decimal('0'))
        supplier_name = container.supplier.name if container.supplier else None
        rep_name = container.representative.name if container.representative else None

        daily[purchase_date]['purchases'].append({
            'id': container.id,
            'invoice_number': container.container_number,
            'customer_id': None,
            'customer_name': '—',
            'supplier_id': container.supplier_id,
            'supplier_name': supplier_name,
            'representative_id': container.representative_id,
            'representative_name': rep_name,
            'total_amount': float(amount_base),
            'total_amount_original': float(container.total_amount or 0),
            'currency': container.currency,
            'exchange_rate': float(container.exchange_rate or 1),
            'paid_amount': 0.0,
            'balance': float(amount_base),
            'payment_type': 'Cash',
            'status': '—',
            'items': items,
        })

        daily[purchase_date]['total_amount'] += amount_base
        daily[purchase_date]['total_balance'] += amount_base
        daily[purchase_date]['total_quantity'] += qty
        if supplier_name:
            daily[purchase_date]['suppliers'].add(supplier_name)
        if rep_name:
            daily[purchase_date]['representatives'].add(rep_name)

    purchase_dates = [datetime.strptime(d, '%Y-%m-%d').date() for d in daily.keys()]
    rates_map = _get_currency_rates_for_dates(market_id, purchase_dates)
    result = []
    total_usd_amount = Decimal('0')
    for date, data in sorted(daily.items()):
        usd_rate, from_safe_statement = _resolve_usd_rate(date, rates_map)
        approx_usd_amount = _approx_usd_amount(data['total_amount'], usd_rate)
        total_usd_amount += Decimal(str(approx_usd_amount))
        result.append({
            'date': data['date'],
            'total_amount': float(data['total_amount']),
            'total_paid': float(data['total_paid']),
            'total_balance': float(data['total_balance']),
            'total_quantity': float(data['total_quantity']),
            'approx_usd_amount': approx_usd_amount,
            'usd_rate': usd_rate,
            'usd_rate_from_safe_statement': from_safe_statement,
            'customers': list(data['customers']),
            'suppliers': list(data['suppliers']),
            'representatives': list(data['representatives']),
            'sales': data['purchases'],  # same key as daily-sales for shared invoice UI shape
            'purchases': data['purchases'],
        })

    return jsonify({
        'days': result,
        'total_amount': float(sum(d['total_amount'] for d in result)),
        'total_usd_amount': float(total_usd_amount),
    })


@bp.route('/representative-collections', methods=['GET'])
@login_required
def get_representative_collections():
    """Collections (tagged purchases) by purchasing representative."""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400

    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    representative_id = request.args.get('representative_id', type=int)

    query = PurchaseContainer.query.options(
        joinedload(PurchaseContainer.supplier),
        joinedload(PurchaseContainer.representative),
        joinedload(PurchaseContainer.items).joinedload(PurchaseItem.item),
    ).filter(
        PurchaseContainer.market_id == market_id,
        PurchaseContainer.representative_id.isnot(None),
    )

    if start_date:
        query = query.filter(PurchaseContainer.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        query = query.filter(PurchaseContainer.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    if representative_id:
        query = query.filter(PurchaseContainer.representative_id == representative_id)

    containers = query.order_by(
        PurchaseContainer.date.desc(), PurchaseContainer.id.desc()
    ).all()

    by_rep = {}
    for container in containers:
        rid = container.representative_id
        if rid not in by_rep:
            by_rep[rid] = {
                'representative_id': rid,
                'representative_name': container.representative.name if container.representative else '—',
                'containers': [],
                'total_quantity': Decimal('0'),
                'total_amount_base': Decimal('0'),
                'container_count': 0,
            }
        qty = sum((i.quantity for i in container.items), Decimal('0'))
        amount_base = Decimal(str(container.total_amount_base_currency))
        by_rep[rid]['containers'].append({
            'id': container.id,
            'container_number': container.container_number,
            'date': container.date.isoformat(),
            'supplier_id': container.supplier_id,
            'supplier_name': container.supplier.name if container.supplier else '—',
            'currency': container.currency,
            'exchange_rate': float(container.exchange_rate or 1),
            'total_amount_original': float(container.total_amount or 0),
            'total_amount_base': float(amount_base),
            'total_quantity': float(qty),
            'items': [_daily_purchase_line_dict(i, container) for i in container.items],
        })
        by_rep[rid]['total_quantity'] += qty
        by_rep[rid]['total_amount_base'] += amount_base
        by_rep[rid]['container_count'] += 1

    representatives = []
    for data in sorted(by_rep.values(), key=lambda x: x['representative_name'].lower()):
        representatives.append({
            'representative_id': data['representative_id'],
            'representative_name': data['representative_name'],
            'container_count': data['container_count'],
            'total_quantity': float(data['total_quantity']),
            'total_amount_base': float(data['total_amount_base']),
            'containers': data['containers'],
        })

    return jsonify({
        'representatives': representatives,
        'total_quantity': float(sum(Decimal(str(r['total_quantity'])) for r in representatives)),
        'total_amount_base': float(sum(Decimal(str(r['total_amount_base'])) for r in representatives)),
        'container_count': sum(r['container_count'] for r in representatives),
    })


@bp.route('/safe-statement', methods=['GET'])
@login_required
def get_safe_statement():
    """Get safe statement with daily totals (IN/OUT) and real balance.
    Balance is computed by summing transactions (same logic as dashboard) - not from stored balance_after."""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    export_excel = request.args.get('export') == 'excel'
    
    # Get all transactions from beginning through end_date (need transactions before start_date for correct cumulative)
    query = SafeTransaction.query.filter_by(market_id=market_id)
    if end_date:
        end_date_obj = datetime.strptime(end_date, '%Y-%m-%d').date()
        query = query.filter(SafeTransaction.date <= end_date_obj)
    
    all_txns = query.order_by(SafeTransaction.date.asc(), SafeTransaction.id.asc()).all()
    
    # Compute opening balance (sum of all transactions before start_date)
    start_date_obj = datetime.strptime(start_date, '%Y-%m-%d').date() if start_date else None
    opening_balance = Decimal('0')
    transactions = []
    for t in all_txns:
        if start_date_obj and t.date < start_date_obj:
            if t.transaction_type in ['Opening', 'Inflow']:
                opening_balance += t.amount_base_currency
            elif t.transaction_type == 'Outflow':
                opening_balance -= t.amount_base_currency
        else:
            transactions.append(t)
    
    # Group by date and compute running balance from transactions (same logic as dashboard)
    daily_totals = {}
    running_balance = opening_balance
    for txn in transactions:
        date_str = txn.date.isoformat()
        if date_str not in daily_totals:
            daily_totals[date_str] = {
                'date': date_str,
                'total_in': Decimal('0'),
                'total_out': Decimal('0'),
                'real_balance': None,
                'currency_rate': None
            }
        
        if txn.transaction_type in ['Opening', 'Inflow']:
            daily_totals[date_str]['total_in'] += txn.amount_base_currency
            running_balance += txn.amount_base_currency
        elif txn.transaction_type == 'Outflow':
            daily_totals[date_str]['total_out'] += txn.amount_base_currency
            running_balance -= txn.amount_base_currency
        
        # Balance at end of day = running total after last transaction of the day
        daily_totals[date_str]['balance'] = running_balance
    
    # Get real balances from SafeStatementRealBalance
    if daily_totals:
        date_list = list(daily_totals.keys())
        real_balances = SafeStatementRealBalance.query.filter_by(
            market_id=market_id
        ).filter(
            SafeStatementRealBalance.date.in_([datetime.strptime(d, '%Y-%m-%d').date() for d in date_list])
        ).all()
        
        for rb in real_balances:
            date_str = rb.date.isoformat()
            if date_str in daily_totals:
                daily_totals[date_str]['real_balance'] = float(rb.real_balance) if rb.real_balance else None
                daily_totals[date_str]['currency_rate'] = float(rb.currency_rate) if rb.currency_rate else None
    
    # Convert to list and sort by date
    statement = []
    for date_str in sorted(daily_totals.keys()):
        data = daily_totals[date_str]
        statement.append({
            'date': data['date'],
            'total_in': float(data['total_in']),
            'total_out': float(data['total_out']),
            'balance': float(data['balance']),
            'real_balance': data['real_balance'],
            'currency_rate': data['currency_rate']
        })
    
    # Export to Excel if requested
    if export_excel:
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df = pd.DataFrame(statement)
            df.to_excel(writer, index=False, sheet_name='Safe Statement')
            
            # Format columns
            worksheet = writer.sheets['Safe Statement']
            for idx, col in enumerate(df.columns):
                max_length = max(
                    df[col].astype(str).apply(len).max(),
                    len(str(col))
                )
                worksheet.column_dimensions[get_column_letter(idx + 1)].width = min(max_length + 2, 50)
        
        output.seek(0)
        filename = f'safe_statement_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx'
        return send_file(output, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
                         as_attachment=True, download_name=filename)
    
    return jsonify({'statement': statement})

@bp.route('/safe-statement/real-balance', methods=['GET', 'PUT'])
@login_required
def safe_statement_real_balance():
    """Get or update real balance for a specific date"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    if request.method == 'GET':
        date_str = request.args.get('date')
        if not date_str:
            return jsonify({'error': 'Date is required'}), 400
        
        date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
        real_balance = SafeStatementRealBalance.query.filter_by(
            market_id=market_id,
            date=date_obj
        ).first()
        
        return jsonify({
            'date': date_str,
            'real_balance': float(real_balance.real_balance) if real_balance and real_balance.real_balance else None,
            'currency_rate': float(real_balance.currency_rate) if real_balance and real_balance.currency_rate else None
        })
    
    elif request.method == 'PUT':
        data = request.json or {}
        date_str = data.get('date')
        
        if not date_str:
            return jsonify({'error': 'Date is required'}), 400
        
        if 'real_balance' not in data and 'currency_rate' not in data:
            return jsonify({'error': 'real_balance or currency_rate is required'}), 400
        
        date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
        
        # Find or create row; update only fields present in JSON (so partial saves do not clear the other)
        row = SafeStatementRealBalance.query.filter_by(
            market_id=market_id,
            date=date_obj
        ).first()
        
        if not row:
            row = SafeStatementRealBalance(market_id=market_id, date=date_obj)
            db.session.add(row)
        
        if 'real_balance' in data:
            rv = data.get('real_balance')
            row.real_balance = Decimal(str(rv)) if rv is not None and rv != '' else None
        if 'currency_rate' in data:
            cv = data.get('currency_rate')
            row.currency_rate = Decimal(str(cv)) if cv is not None and cv != '' else None
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'date': date_str,
            'real_balance': float(row.real_balance) if row.real_balance else None,
            'currency_rate': float(row.currency_rate) if row.currency_rate else None
        })

def _returns_quantity_by_item(market_id, item_ids):
    """Total quantity returned to suppliers per catalog item (reduces on-hand like a sale)."""
    if not item_ids:
        return {}
    rq = db.session.query(
        SupplierReturnLine.item_id,
        func.coalesce(func.sum(SupplierReturnLine.quantity), 0),
    ).join(SupplierReturn, SupplierReturnLine.supplier_return_id == SupplierReturn.id).filter(
        SupplierReturn.market_id == market_id,
        SupplierReturnLine.item_id.in_(item_ids),
    ).group_by(SupplierReturnLine.item_id).all()
    return {i: Decimal(str(q)) for i, q in rq}


def _book_available_quantities(market_id, item_ids):
    """Catalog items only: purchases − sales − supplier returns + inventory adjustments (book quantity)."""
    if not item_ids:
        return {}
    purchase_q = db.session.query(
        PurchaseItem.item_id,
        func.coalesce(func.sum(PurchaseItem.quantity), 0),
    ).join(PurchaseContainer, PurchaseItem.container_id == PurchaseContainer.id).filter(
        PurchaseContainer.market_id == market_id,
        PurchaseItem.item_id.in_(item_ids),
    ).group_by(PurchaseItem.item_id).all()
    purchase_map = {i: Decimal(str(q)) for i, q in purchase_q}
    sales_q = db.session.query(
        SaleItem.item_id,
        func.coalesce(func.sum(SaleItem.quantity), 0),
    ).join(Sale, SaleItem.sale_id == Sale.id).filter(
        Sale.market_id == market_id,
        SaleItem.item_id.isnot(None),
        SaleItem.item_id.in_(item_ids),
    ).group_by(SaleItem.item_id).all()
    sales_map = {i: Decimal(str(q)) for i, q in sales_q}
    adj_map = {}
    try:
        adj_q = db.session.query(
            InventoryAdjustment.item_id,
            func.sum(
                case(
                    (InventoryAdjustment.adjustment_type == 'Increase', InventoryAdjustment.quantity),
                    else_=-InventoryAdjustment.quantity,
                )
            ),
        ).filter(
            InventoryAdjustment.market_id == market_id,
            InventoryAdjustment.item_id.in_(item_ids),
        ).group_by(InventoryAdjustment.item_id).all()
        for iid, qty in adj_q:
            adj_map[iid] = Decimal(str(qty or 0))
    except Exception:
        pass
    ret_map = _returns_quantity_by_item(market_id, item_ids)
    out = {}
    for iid in item_ids:
        p = purchase_map.get(iid, Decimal('0'))
        s = sales_map.get(iid, Decimal('0'))
        a = adj_map.get(iid, Decimal('0'))
        r = ret_map.get(iid, Decimal('0'))
        out[iid] = p - s - r + a
    return out


# Placeholder endpoints to prevent 404 errors
# These return minimal data structures expected by the frontend

def _compute_profit_loss_data(market_id, start_date, end_date, item_id):
    """Compute profit & loss report data. Returns dict with items, totals, calculation_method, base_currency."""
    market = Market.query.get(market_id)
    calculation_method = getattr(market, 'calculation_method', 'Average') if market else 'Average'
    base_currency = market.base_currency if market else 'USD'
    
    # Build query - eager load item and sale to avoid N+1
    query = SaleItem.query.options(
        joinedload(SaleItem.item),
        joinedload(SaleItem.sale)
    ).join(Sale).filter(Sale.market_id == market_id)
    
    if start_date:
        query = query.filter(Sale.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        query = query.filter(Sale.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    if item_id:
        query = query.filter(SaleItem.item_id == item_id)
    
    sale_items = query.all()
    
    if not sale_items:
        return {
            'calculation_method': calculation_method,
            'base_currency': base_currency,
            'items': [],
            'totals': {'total_sales': 0, 'total_cog': 0, 'total_cost': 0, 'total_profit': 0, 'profit_margin': 0}
        }
    
    sale_item_ids = [si.id for si in sale_items]
    unique_item_ids = list(set(si.item_id for si in sale_items if si.item_id is not None))
    
    # Pre-load all data in bulk to avoid N+1 queries
    if calculation_method == 'FIFO':
        allocations = SaleItemAllocation.query.filter(
            SaleItemAllocation.sale_item_id.in_(sale_item_ids)
        ).all()
        batch_ids = list(set(a.batch_id for a in allocations))
        batches = {b.id: b for b in InventoryBatch.query.filter(InventoryBatch.id.in_(batch_ids)).all()} if batch_ids else {}
        allocations_by_sale_item = {}
        for a in allocations:
            allocations_by_sale_item.setdefault(a.sale_item_id, []).append(a)
    else:
        # Average: pre-load purchase items for relevant item_ids, then all items per container for COG
        purchase_items_all = PurchaseItem.query.options(
            joinedload(PurchaseItem.item),
            joinedload(PurchaseItem.container)
        ).join(PurchaseContainer).filter(
            PurchaseContainer.market_id == market_id,
            PurchaseItem.item_id.in_(unique_item_ids)
        ).all()
        container_ids = list(set(pi.container_id for pi in purchase_items_all))
        # Load ALL items per container (needed for COG: total_qty and total_weight of entire container)
        all_container_items = PurchaseItem.query.options(joinedload(PurchaseItem.item)).filter(
            PurchaseItem.container_id.in_(container_ids)
        ).all() if container_ids else []
        container_items_map = {}
        for pi in all_container_items:
            container_items_map.setdefault(pi.container_id, []).append(pi)
        
        avg_cost_per_item = {}
        avg_cost_supplier_per_item = {}
        purchase_by_item = {}
        for pi in purchase_items_all:
            purchase_by_item.setdefault(pi.item_id, []).append(pi)
        
        for iid in unique_item_ids:
            purchase_items = purchase_by_item.get(iid, [])
            if not purchase_items:
                continue
            total_cost_base = Decimal('0')
            total_cost_supplier = Decimal('0')
            total_qty = Decimal('0')
            supplier_currency = None
            for pi in purchase_items:
                container = pi.container
                if not container:
                    continue
                container_id = pi.container_id
                if supplier_currency is None:
                    supplier_currency = container.currency
                all_items = container_items_map.get(container_id, [])
                total_qty_container = sum(p.quantity for p in all_items)
                total_weight_container = sum((p.item.weight or Decimal('0')) * p.quantity for p in all_items)
                expense1 = Decimal('0')
                if container.expense1_amount and container.expense1_amount > 0:
                    if container.expense1_currency == container.currency:
                        expense1 = container.expense1_amount
                    else:
                        eb = container.expense1_amount * (container.expense1_exchange_rate or 1)
                        cr = container.exchange_rate or 1
                        if cr > 0:
                            expense1 = eb / cr
                expense2 = Decimal('0')
                if container.expense2_amount and container.expense2_amount > 0:
                    if container.expense2_currency == container.currency:
                        expense2 = container.expense2_amount
                    else:
                        eb = container.expense2_amount * (container.expense2_exchange_rate or 1)
                        cr = container.exchange_rate or 1
                        if cr > 0:
                            expense2 = eb / cr
                expense3 = Decimal('0')
                if container.expense3_amount and container.expense3_amount > 0:
                    if container.expense3_currency == container.currency:
                        expense3 = container.expense3_amount
                    else:
                        eb = container.expense3_amount * (container.expense3_exchange_rate or 1)
                        cr = container.exchange_rate or 1
                        if cr > 0:
                            expense3 = eb / cr
                sum_expenses = expense1 + expense2 + expense3
                item_weight = pi.item.weight or Decimal('0')
                if total_qty_container > 0 and total_weight_container > 0:
                    cog_per_unit = (sum_expenses / Decimal('2') / total_qty_container) + \
                                  (sum_expenses / Decimal('2') / total_weight_container * item_weight)
                elif total_qty_container > 0:
                    cog_per_unit = sum_expenses / total_qty_container
                else:
                    cog_per_unit = Decimal('0')
                item_cost_per_unit_supplier = pi.unit_price + cog_per_unit
                item_cost_per_unit_base = item_cost_per_unit_supplier * container.exchange_rate
                total_cost_base += item_cost_per_unit_base * pi.quantity
                total_cost_supplier += item_cost_per_unit_supplier * pi.quantity
                total_qty += pi.quantity
            if total_qty > 0:
                avg_cost_per_item[iid] = total_cost_base / total_qty
                avg_cost_supplier_per_item[iid] = (total_cost_supplier / total_qty, supplier_currency)
    
    NONCAT = '__non_catalog__'
    # Group by item (single pass, no queries)
    items_data = {}
    for si in sale_items:
        if si.item_id is None:
            iid = NONCAT
            if iid not in items_data:
                items_data[iid] = {
                    'item_id': None,
                    'item_code': '—',
                    'item_name': 'Non-catalog (fast sell)',
                    'quantity_sold': Decimal('0'),
                    'total_sales': Decimal('0'),
                    'total_cost': Decimal('0'),
                    'cog': Decimal('0'),
                    'batch_details': []
                }
        else:
            iid = si.item_id
            if iid not in items_data:
                items_data[iid] = {
                    'item_id': iid,
                    'item_code': si.item.code,
                    'item_name': si.item.name,
                    'quantity_sold': Decimal('0'),
                    'total_sales': Decimal('0'),
                    'total_cost': Decimal('0'),
                    'cog': Decimal('0'),
                    'batch_details': []
                }
        
        items_data[iid]['quantity_sold'] += si.quantity
        items_data[iid]['total_sales'] += si.total_price
        
        if calculation_method == 'FIFO':
            for alloc in allocations_by_sale_item.get(si.id, []):
                batch = batches.get(alloc.batch_id)
                if batch:
                    cost_per_unit_base = batch.cost_per_unit * (batch.exchange_rate or Decimal('1'))
                    item_cost = cost_per_unit_base * alloc.quantity
                    items_data[iid]['total_cost'] += item_cost
                    items_data[iid]['cog'] += item_cost
                    items_data[iid]['batch_details'].append({
                        'sale_date': si.sale.date.isoformat(),
                        'invoice_number': si.sale.invoice_number,
                        'batch_code': batch.container.container_number if batch.container else '',
                        'purchase_date': batch.purchase_date.isoformat() if batch.purchase_date else None,
                        'quantity': float(alloc.quantity),
                        'cost_per_unit': float(cost_per_unit_base),
                        'total_cost': float(item_cost),
                        'currency': base_currency
                    })
        else:
            avg_cost = avg_cost_per_item.get(iid)
            if avg_cost is not None:
                item_cost = avg_cost * si.quantity
                items_data[iid]['total_cost'] += item_cost
                items_data[iid]['cog'] += item_cost
            avg_supplier_info = avg_cost_supplier_per_item.get(iid)
            if avg_supplier_info is not None:
                items_data[iid]['average_purchase_price_supplier_currency'] = float(avg_supplier_info[0])
                items_data[iid]['supplier_currency'] = avg_supplier_info[1]
    
    # Book stock ≤ 0 but COGS computed as zero → misleading 100% margin (e.g. FIFO gaps). Use last purchase unit cost (base).
    catalog_ids = [k for k in items_data.keys() if k != NONCAT]
    avail_by_item = _book_available_quantities(market_id, catalog_ids)
    for iid, item_data in items_data.items():
        if iid == NONCAT:
            continue
        qs = item_data['quantity_sold']
        tc = item_data['total_cost']
        if qs <= 0 or tc > 0:
            continue
        av = avail_by_item.get(iid, Decimal('0'))
        if av > 0:
            continue
        unit_base = _last_purchase_unit_cost_base(market_id, iid)
        if unit_base is None:
            continue
        synthetic = unit_base * qs
        item_data['total_cost'] = synthetic
        item_data['cog'] = synthetic
        item_data['provisional_cost'] = True
        item_data['book_available_quantity'] = float(av)
    
    # Convert to list and calculate profit
    items_list = []
    total_sales = Decimal('0')
    total_cog = Decimal('0')
    total_cost = Decimal('0')
    total_profit = Decimal('0')
    has_provisional_costs = False
    
    for item_data in items_data.values():
        profit = item_data['total_sales'] - item_data['total_cost']
        profit_margin = (profit / item_data['total_sales'] * 100) if item_data['total_sales'] > 0 else 0
        
        row = {
            'item_code': item_data['item_code'],
            'item_name': item_data['item_name'],
            'quantity_sold': float(item_data['quantity_sold']),
            'total_sales': float(item_data['total_sales']),
            'cog': float(item_data['cog']),
            'average_purchase_price': float(item_data['total_cost'] / item_data['quantity_sold']) if item_data['quantity_sold'] > 0 else 0,
            'total_cost': float(item_data['total_cost']),
            'profit': float(profit),
            'profit_margin': float(profit_margin),
            'batch_details': item_data['batch_details'] if calculation_method == 'FIFO' else [],
            'provisional_cost': bool(item_data.get('provisional_cost')),
            'book_available_quantity': item_data.get('book_available_quantity'),
        }
        if row['provisional_cost']:
            has_provisional_costs = True
        if calculation_method != 'FIFO':
            row['average_purchase_price_supplier_currency'] = item_data.get('average_purchase_price_supplier_currency')
            row['supplier_currency'] = item_data.get('supplier_currency')
        items_list.append(row)
        
        total_sales += item_data['total_sales']
        total_cog += item_data['cog']
        total_cost += item_data['total_cost']
        total_profit += profit
    
    profit_margin = (total_profit / total_sales * 100) if total_sales > 0 else 0
    
    return {
        'calculation_method': calculation_method,
        'base_currency': base_currency,
        'has_provisional_costs': has_provisional_costs,
        'items': items_list,
        'totals': {
            'total_sales': float(total_sales),
            'total_cog': float(total_cog),
            'total_cost': float(total_cost),
            'total_profit': float(total_profit),
            'profit_margin': float(profit_margin)
        }
    }

@bp.route('/profit-loss', methods=['GET'])
@login_required
def get_profit_loss():
    """Get profit & loss report"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    item_id = request.args.get('item_id', type=int)
    data = _compute_profit_loss_data(market_id, start_date, end_date, item_id)
    return jsonify(data)

@bp.route('/profit-loss/export', methods=['GET'])
@login_required
def export_profit_loss():
    """Export profit & loss report to Excel"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    item_id = request.args.get('item_id', type=int)
    data = _compute_profit_loss_data(market_id, start_date, end_date, item_id)
    is_fifo = data['calculation_method'] == 'FIFO'
    base_currency = data['base_currency']
    export_rows = []
    for row in data['items']:
        excel_row = {
            'Item Code': row['item_code'],
            'Item Name': row['item_name'],
            'Quantity Sold': row['quantity_sold'],
            'Total Sales': row['total_sales'],
            'COG': row['cog'],
            'Total Cost': row['total_cost'],
            'Profit': row['profit'],
            'Profit Margin %': row['profit_margin'],
        }
        if not is_fifo:
            excel_row['Average Purchase Price'] = row.get('average_purchase_price', 0)
            excel_row['Avg Purchase Price (Supplier Curr.)'] = row.get('average_purchase_price_supplier_currency')
            excel_row['Supplier Currency'] = row.get('supplier_currency', '')
        excel_row['Cost note'] = (
            'Last purchase (book stock <= 0; provisional)'
            if row.get('provisional_cost')
            else ''
        )
        export_rows.append(excel_row)
    total_row = {
        'Item Code': '',
        'Item Name': 'TOTAL',
        'Quantity Sold': '',
        'Total Sales': data['totals']['total_sales'],
        'COG': data['totals']['total_cog'],
        'Total Cost': data['totals']['total_cost'],
        'Profit': data['totals']['total_profit'],
        'Profit Margin %': data['totals']['profit_margin'],
    }
    if not is_fifo:
        total_row['Average Purchase Price'] = ''
        total_row['Avg Purchase Price (Supplier Curr.)'] = ''
        total_row['Supplier Currency'] = ''
    total_row['Cost note'] = ''
    export_rows.append(total_row)
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df = pd.DataFrame(export_rows)
        df.to_excel(writer, index=False, sheet_name='Profit & Loss')
        worksheet = writer.sheets['Profit & Loss']
        for idx, col in enumerate(df.columns):
            try:
                col_max = df[col].astype(str).apply(len).max()
            except (ValueError, TypeError):
                col_max = 0
            max_length = max(col_max, len(str(col)))
            worksheet.column_dimensions[get_column_letter(idx + 1)].width = min(max_length + 2, 50)
    output.seek(0)
    filename = f'profit_loss_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx'
    return send_file(output, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                     as_attachment=True, download_name=filename)


def _compute_period_purchases_amount_base(market_id, start_date, end_date):
    """Sum purchase container item totals in base currency for containers dated in the period."""
    total = db.session.query(
        func.coalesce(
            func.sum(PurchaseItem.total_price * func.coalesce(PurchaseContainer.exchange_rate, 1)),
            0,
        )
    ).join(PurchaseContainer, PurchaseItem.container_id == PurchaseContainer.id).filter(
        PurchaseContainer.market_id == market_id,
    )
    if start_date:
        total = total.filter(PurchaseContainer.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        total = total.filter(PurchaseContainer.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    return Decimal(str(total.scalar() or 0))


@bp.route('/partner-profit-allocation', methods=['GET'])
@login_required
def get_partner_profit_allocation():
    """
    Operating profit (before tax): P&L revenue minus period purchase amounts (items in base currency),
    minus general expenses in base currency, split by partner share %. Partner drawings (period, base
    currency) reduce each partner's net and the entity total; they are not operating expenses but cash
    movements from safe.
    """
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400

    partners = MarketPartner.query.filter_by(market_id=market_id).order_by(MarketPartner.id).all()
    if not partners:
        return jsonify({
            'error': 'No partners defined for this market. Add partners on the Partners page.',
        }), 400

    total_share = sum(Decimal(str(p.share_percent)) for p in partners)
    if abs(total_share - Decimal('100')) > Decimal('0.02'):
        return jsonify({
            'error': f'Partner share percentages must total 100% (currently {float(total_share):.2f}%).',
            'total_share_percent': float(total_share),
        }), 400

    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    pl = _compute_profit_loss_data(market_id, start_date, end_date, None)
    revenue = Decimal(str(pl['totals']['total_sales']))
    purchases_amount = _compute_period_purchases_amount_base(market_id, start_date, end_date)
    gross_profit = revenue - purchases_amount

    exp_q = GeneralExpense.query.filter_by(market_id=market_id)
    if start_date:
        exp_q = exp_q.filter(GeneralExpense.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        exp_q = exp_q.filter(GeneralExpense.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    opex = sum(Decimal(str(e.amount_base_currency)) for e in exp_q.all())
    operating_profit = gross_profit - opex

    draw_q = PartnerDrawing.query.filter_by(market_id=market_id)
    if start_date:
        draw_q = draw_q.filter(PartnerDrawing.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        draw_q = draw_q.filter(PartnerDrawing.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    drawings_by_partner = {p.id: Decimal('0') for p in partners}
    for d in draw_q.all():
        if d.partner_id in drawings_by_partner:
            drawings_by_partner[d.partner_id] += Decimal(str(d.amount_base_currency))
    total_drawings = sum(drawings_by_partner.values())
    operating_profit_after_drawings = operating_profit - total_drawings

    partner_rows = []
    for p in partners:
        pct = Decimal(str(p.share_percent)) / Decimal('100')
        alloc = operating_profit * pct
        dw = drawings_by_partner.get(p.id, Decimal('0'))
        net = alloc - dw
        partner_rows.append({
            'partner_id': p.id,
            'name': p.name,
            'share_percent': float(p.share_percent),
            'allocated_profit': float(alloc),
            'drawings': float(dw),
            'net_after_drawings': float(net),
        })

    return jsonify({
        'base_currency': pl['base_currency'],
        'revenue': float(revenue),
        'purchases_amount': float(purchases_amount),
        'gross_profit': float(gross_profit),
        'operating_expenses': float(opex),
        'operating_profit': float(operating_profit),
        'total_partner_drawings': float(total_drawings),
        'operating_profit_after_drawings': float(operating_profit_after_drawings),
        'partners': partner_rows,
        'disclaimer': (
            'Indicative only: revenue follows the same rules as the Profit & Loss report (may mix invoice currencies). '
            'Purchases are container item totals in base currency for purchase dates in the selected period '
            '(not FIFO/average COGS). Operating expenses use General Expenses converted to base currency. '
            'Partner drawings are cash withdrawals (debited from safe); they reduce each partner’s net after allocation '
            'and the entity total “after drawings”, but are not P&L operating expenses. Excludes tax and interest.'
        ),
    })


@bp.route('/customer-receivables', methods=['GET'])
@login_required
def get_customer_receivables():
    """Get customer receivables report"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    customers = Company.query.filter_by(market_id=market_id, category='Customer').all()
    receivables = []
    total_receivables = Decimal('0')
    
    for customer in customers:
        balance = customer.get_balance(market_id)
        if balance > 0:
            receivables.append({
                'customer_id': customer.id,
                'customer_name': customer.name,
                'currency': customer.currency,
                'balance': float(balance)
            })
            total_receivables += Decimal(str(balance))
    
    return jsonify({
        'receivables': receivables,
        'total_receivables': float(total_receivables)
    })

@bp.route('/supplier-payables', methods=['GET'])
@login_required
def get_supplier_payables():
    """Get supplier payables report"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    suppliers = Company.query.filter_by(market_id=market_id, category='Supplier').all()
    payables = []
    currency_totals = {}
    
    for supplier in suppliers:
        balance = supplier.get_balance(market_id)
        if balance > 0:
            currency = supplier.currency
            payables.append({
                'supplier_id': supplier.id,
                'supplier_name': supplier.name,
                'currency': currency,
                'balance': float(balance)
            })
            
            if currency not in currency_totals:
                currency_totals[currency] = Decimal('0')
            currency_totals[currency] += Decimal(str(balance))
    
    return jsonify({
        'payables': payables,
        'currency_totals': {k: float(v) for k, v in currency_totals.items()}
    })

@bp.route('/sales', methods=['GET'])
@login_required
def get_sales_report():
    """Get sales report by item"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    market = Market.query.get(market_id)
    base_currency = market.base_currency if market else 'USD'
    
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    query = SaleItem.query.join(Sale).filter(Sale.market_id == market_id)
    
    if start_date:
        query = query.filter(Sale.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        query = query.filter(Sale.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    
    sale_items = query.all()
    
    # Group by item
    items_data = {}
    for si in sale_items:
        item_id = si.item_id
        if item_id not in items_data:
            items_data[item_id] = {
                'item_id': item_id,
                'item_code': si.item.code,
                'item_name': si.item.name,
                'total_quantity': Decimal('0'),
                'total_amount': Decimal('0'),
                'sales': []
            }
        
        items_data[item_id]['total_quantity'] += si.quantity
        items_data[item_id]['total_amount'] += si.total_price
        
        supplier_name = si.sale.supplier.name if si.sale.supplier else None
        
        items_data[item_id]['sales'].append({
            'date': si.sale.date.isoformat(),
            'invoice_number': si.sale.invoice_number,
            'customer_name': si.sale.customer.name if si.sale.customer else 'Unknown',
            'supplier_name': supplier_name,
            'quantity': float(si.quantity),
            'unit_price': float(si.unit_price),
            'total_price': float(si.total_price),
            'payment_type': si.sale.payment_type,
            'status': si.sale.status
        })
    
    items_list = []
    total_sales = Decimal('0')
    total_items_sold = Decimal('0')
    transactions_count = 0
    
    for item_data in items_data.values():
        items_list.append({
            'item_code': item_data['item_code'],
            'item_name': item_data['item_name'],
            'total_quantity': float(item_data['total_quantity']),
            'total_amount': float(item_data['total_amount']),
            'sales': item_data['sales']
        })
        total_sales += item_data['total_amount']
        total_items_sold += item_data['total_quantity']
        transactions_count += len(item_data['sales'])
    
    return jsonify({
        'base_currency': base_currency,
        'items': items_list,
        'totals': {
            'total_sales': float(total_sales),
            'total_items_sold': float(total_items_sold),
            'items_count': len(items_list),
            'transactions_count': transactions_count
        }
    })

@bp.route('/sales/export', methods=['GET'])
@login_required
def export_sales_report():
    """Export sales report to Excel"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    market = Market.query.get(market_id)
    base_currency = market.base_currency if market else 'USD'
    
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    query = SaleItem.query.options(joinedload(SaleItem.item)).join(Sale).filter(Sale.market_id == market_id)
    
    if start_date:
        query = query.filter(Sale.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        query = query.filter(Sale.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    
    sale_items = query.order_by(Sale.date.asc(), Sale.id.asc()).all()
    
    # Build export data - flatten the structure for Excel
    export_data = []
    
    for si in sale_items:
        supplier_name = si.sale.supplier.name if si.sale.supplier else None
        if si.item_id and si.item:
            code, name = si.item.code, si.item.name
        else:
            code = '—'
            name = (si.line_description or '').strip() or '—'
        export_data.append({
            'Date': si.sale.date.isoformat(),
            'Invoice Number': si.sale.invoice_number,
            'Item Code': code,
            'Item Name': name,
            'Customer': si.sale.customer.name if si.sale.customer else 'Unknown',
            'Supplier': supplier_name or '',
            'Quantity': float(si.quantity),
            'Unit Price': float(si.unit_price),
            'Total Price': float(si.total_price),
            'Payment Type': si.sale.payment_type,
            'Status': si.sale.status
        })
    
    # Create Excel file
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df = pd.DataFrame(export_data)
        df.to_excel(writer, index=False, sheet_name='Sales Report')
        
        # Auto-adjust column widths
        worksheet = writer.sheets['Sales Report']
        for idx, col in enumerate(df.columns):
            max_length = max(
                df[col].astype(str).apply(len).max(),
                len(str(col))
            )
            worksheet.column_dimensions[get_column_letter(idx + 1)].width = min(max_length + 2, 50)
    
    output.seek(0)
    filename = f'sales_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx'
    return send_file(output, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                     as_attachment=True, download_name=filename)

def _build_inventory_stock_data(market_id, supplier_id=None):
    """Build inventory stock rows.

    - **FIFO** markets: on-hand = sum(batch available_quantity) + adjustments when batches exist;
      otherwise purchases − sales + adjustments (same as Items page).
    - **Average** (default): always purchases − sales + adjustments so the report matches the Items
      page and stale batch rows left from a former FIFO period do not affect quantity.
    """
    market = Market.query.get(market_id)
    use_fifo_on_hand = market and getattr(market, 'calculation_method', 'Average') == 'FIFO'

    query = Item.query.options(joinedload(Item.supplier)).filter_by(market_id=market_id)
    if supplier_id:
        query = query.filter_by(supplier_id=supplier_id)
    items = query.order_by(Item.code, Item.name).all()

    if not items:
        return {'total_items': 0, 'total_quantity': 0.0, 'total_weight': 0.0, 'items': []}

    item_ids = [i.id for i in items]

    pq = db.session.query(
        PurchaseItem.item_id,
        func.coalesce(func.sum(PurchaseItem.quantity), 0),
        func.coalesce(func.sum(PurchaseItem.total_price), 0),
    ).join(PurchaseContainer, PurchaseItem.container_id == PurchaseContainer.id).filter(
        PurchaseContainer.market_id == market_id,
        PurchaseItem.item_id.in_(item_ids),
    ).group_by(PurchaseItem.item_id).all()
    purchase_qty_map = {row[0]: Decimal(str(row[1])) for row in pq}
    purchase_value_map = {row[0]: Decimal(str(row[2])) for row in pq}

    sq = db.session.query(
        SaleItem.item_id,
        func.coalesce(func.sum(SaleItem.quantity), 0),
        func.coalesce(func.sum(SaleItem.total_price), 0),
    ).join(Sale, SaleItem.sale_id == Sale.id).filter(
        Sale.market_id == market_id,
        SaleItem.item_id.isnot(None),
        SaleItem.item_id.in_(item_ids),
    ).group_by(SaleItem.item_id).all()
    sales_qty_map = {row[0]: Decimal(str(row[1])) for row in sq}
    sales_value_map = {row[0]: Decimal(str(row[2])) for row in sq}

    adjustments_map = {}
    try:
        adjustments_q = db.session.query(
            InventoryAdjustment.item_id,
            func.sum(
                case(
                    (InventoryAdjustment.adjustment_type == 'Increase', InventoryAdjustment.quantity),
                    else_=-InventoryAdjustment.quantity,
                )
            ),
        ).filter(
            InventoryAdjustment.market_id == market_id,
            InventoryAdjustment.item_id.in_(item_ids),
        ).group_by(InventoryAdjustment.item_id).all()
        for iid, qty in adjustments_q:
            adjustments_map[iid] = Decimal(str(qty or 0))
    except Exception:
        pass

    ret_map = _returns_quantity_by_item(market_id, item_ids)

    batch_qty_map = {}
    items_with_any_batch = set()
    if use_fifo_on_hand:
        batch_qty_rows = db.session.query(
            InventoryBatch.item_id,
            func.coalesce(func.sum(InventoryBatch.available_quantity), 0),
        ).filter(
            InventoryBatch.market_id == market_id,
            InventoryBatch.item_id.in_(item_ids),
        ).group_by(InventoryBatch.item_id).all()
        batch_qty_map = {row[0]: Decimal(str(row[1])) for row in batch_qty_rows}
        items_with_any_batch = set(batch_qty_map.keys())

    result_items = []
    total_quantity = Decimal('0')
    total_weight = Decimal('0')

    for item in items:
        iw = item.weight if item.weight is not None else Decimal('0')
        tp = purchase_qty_map.get(item.id, Decimal('0'))
        ts = sales_qty_map.get(item.id, Decimal('0'))
        adj = adjustments_map.get(item.id, Decimal('0'))
        ret = ret_map.get(item.id, Decimal('0'))

        if use_fifo_on_hand and item.id in items_with_any_batch:
            bq = batch_qty_map.get(item.id, Decimal('0'))
            available = bq + adj
        else:
            available = tp - ts - ret + adj

        tpv = purchase_value_map.get(item.id, Decimal('0'))
        tsv = sales_value_map.get(item.id, Decimal('0'))
        avg_purchase = float(tpv / tp) if tp > 0 else 0.0
        avg_sales = float(tsv / ts) if ts > 0 else 0.0
        tw = available * iw

        total_quantity += available
        total_weight += tw

        result_items.append({
            'item_id': item.id,
            'code': item.code,
            'name': item.name,
            'supplier_name': item.supplier.name if item.supplier else None,
            'grade': item.grade or None,
            'category1': item.category1 or None,
            'category2': item.category2 or None,
            'weight': float(iw),
            'total_purchases': float(tp),
            'total_sales': float(ts),
            'available_quantity': float(available),
            'total_weight': float(tw),
            'avg_purchase_price': avg_purchase,
            'avg_sales_price': avg_sales,
        })

    return {
        'total_items': len(result_items),
        'total_quantity': float(total_quantity),
        'total_weight': float(total_weight),
        'items': result_items,
    }


def _available_quantity_map_for_item_ids(market_id, item_ids):
    """On-hand quantity per item id — same FIFO / average rules as Inventory Stock."""
    if not item_ids:
        return {}
    item_ids = list({int(i) for i in item_ids})
    market = Market.query.get(market_id)
    use_fifo_on_hand = market and getattr(market, 'calculation_method', 'Average') == 'FIFO'

    pq = db.session.query(
        PurchaseItem.item_id,
        func.coalesce(func.sum(PurchaseItem.quantity), 0),
    ).join(PurchaseContainer, PurchaseItem.container_id == PurchaseContainer.id).filter(
        PurchaseContainer.market_id == market_id,
        PurchaseItem.item_id.in_(item_ids),
    ).group_by(PurchaseItem.item_id).all()
    purchase_qty_map = {row[0]: Decimal(str(row[1])) for row in pq}

    sq = db.session.query(
        SaleItem.item_id,
        func.coalesce(func.sum(SaleItem.quantity), 0),
    ).join(Sale, SaleItem.sale_id == Sale.id).filter(
        Sale.market_id == market_id,
        SaleItem.item_id.isnot(None),
        SaleItem.item_id.in_(item_ids),
    ).group_by(SaleItem.item_id).all()
    sales_qty_map = {row[0]: Decimal(str(row[1])) for row in sq}

    adjustments_map = {}
    try:
        adjustments_q = db.session.query(
            InventoryAdjustment.item_id,
            func.sum(
                case(
                    (InventoryAdjustment.adjustment_type == 'Increase', InventoryAdjustment.quantity),
                    else_=-InventoryAdjustment.quantity,
                )
            ),
        ).filter(
            InventoryAdjustment.market_id == market_id,
            InventoryAdjustment.item_id.in_(item_ids),
        ).group_by(InventoryAdjustment.item_id).all()
        for iid, qty in adjustments_q:
            adjustments_map[iid] = Decimal(str(qty or 0))
    except Exception:
        pass

    ret_map = _returns_quantity_by_item(market_id, item_ids)

    batch_qty_map = {}
    items_with_any_batch = set()
    if use_fifo_on_hand:
        batch_qty_rows = db.session.query(
            InventoryBatch.item_id,
            func.coalesce(func.sum(InventoryBatch.available_quantity), 0),
        ).filter(
            InventoryBatch.market_id == market_id,
            InventoryBatch.item_id.in_(item_ids),
        ).group_by(InventoryBatch.item_id).all()
        batch_qty_map = {row[0]: Decimal(str(row[1])) for row in batch_qty_rows}
        items_with_any_batch = set(batch_qty_map.keys())

    out = {}
    for iid in item_ids:
        tp = purchase_qty_map.get(iid, Decimal('0'))
        ts = sales_qty_map.get(iid, Decimal('0'))
        adj = adjustments_map.get(iid, Decimal('0'))
        ret = ret_map.get(iid, Decimal('0'))
        if use_fifo_on_hand and iid in items_with_any_batch:
            bq = batch_qty_map.get(iid, Decimal('0'))
            available = bq + adj
        else:
            available = tp - ts - ret + adj
        out[iid] = float(available)
    return out


def _build_inventory_stock_at_cost_data(market_id, supplier_id=None):
    """Same quantities as Inventory Stock; avg unit cost = purchase price + allocated COG (historic weighted average)."""
    base = _build_inventory_stock_data(market_id, supplier_id)
    total_stock_at_landed = Decimal('0')
    for row in base['items']:
        iid = row.get('item_id')
        item = Item.query.get(iid) if iid else None
        if not item:
            landed = Decimal('0')
        else:
            landed = historic_weighted_landed_cost_per_unit(market_id, item)
        avail = Decimal(str(row['available_quantity']))
        stock_at = (avail * landed) if avail else Decimal('0')
        total_stock_at_landed += stock_at
        row['avg_unit_total_cost'] = float(landed)
        row['stock_at_landed_cost'] = float(stock_at)
    base['total_stock_at_landed_cost'] = float(total_stock_at_landed)
    return base


@bp.route('/inventory-stock', methods=['GET'])
@login_required
def get_inventory_stock():
    """Get inventory stock report (quantities, weights, average purchase/sale prices)."""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400

    supplier_id = request.args.get('supplier_id', type=int)
    payload = _build_inventory_stock_data(market_id, supplier_id)
    return jsonify(payload)


@bp.route('/inventory-stock/export', methods=['GET'])
@login_required
def export_inventory_stock():
    """Export inventory stock report to Excel."""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400

    supplier_id = request.args.get('supplier_id', type=int)
    data = _build_inventory_stock_data(market_id, supplier_id)

    export_data = []
    for row in data['items']:
        export_data.append({
            'Item Code': row['code'],
            'Item Name': row['name'],
            'Supplier': row['supplier_name'] or '',
            'Grade': row['grade'] or '',
            'Category 1': row['category1'] or '',
            'Category 2': row['category2'] or '',
            'Unit Weight': row['weight'],
            'Total Purchases': row['total_purchases'],
            'Total Sales': row['total_sales'],
            'Available Quantity': row['available_quantity'],
            'Total Weight': row['total_weight'],
            'Avg Purchase Price': round(row['avg_purchase_price'], 2) if row['avg_purchase_price'] else 0,
            'Avg Sales Price': round(row['avg_sales_price'], 2) if row['avg_sales_price'] else 0,
        })

    tot_p = sum(r['total_purchases'] for r in data['items'])
    tot_s = sum(r['total_sales'] for r in data['items'])
    export_data.append({
        'Item Code': 'TOTAL',
        'Item Name': '',
        'Supplier': '',
        'Grade': '',
        'Category 1': '',
        'Category 2': '',
        'Unit Weight': '',
        'Total Purchases': tot_p,
        'Total Sales': tot_s,
        'Available Quantity': data['total_quantity'],
        'Total Weight': data['total_weight'],
        'Avg Purchase Price': '',
        'Avg Sales Price': '',
    })

    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df = pd.DataFrame(export_data)
        df.to_excel(writer, index=False, sheet_name='Inventory Stock')

        worksheet = writer.sheets['Inventory Stock']
        for idx, col in enumerate(df.columns):
            max_length = len(str(col)) if df.empty else max(
                df[col].astype(str).apply(len).max(),
                len(str(col)),
            )
            worksheet.column_dimensions[get_column_letter(idx + 1)].width = min(max_length + 2, 50)

    output.seek(0)
    filename = f'inventory_stock_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx'
    return send_file(
        output,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name=filename,
    )


@bp.route('/inventory-stock-at-cost', methods=['GET'])
@login_required
def get_inventory_stock_at_cost():
    """Inventory stock with avg unit total cost (purchase + COG) instead of purchase-only average."""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400

    supplier_id = request.args.get('supplier_id', type=int)
    payload = _build_inventory_stock_at_cost_data(market_id, supplier_id)
    return jsonify(payload)


@bp.route('/inventory-stock-at-cost/export', methods=['GET'])
@login_required
def export_inventory_stock_at_cost():
    """Export inventory stock at landed cost to Excel."""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400

    supplier_id = request.args.get('supplier_id', type=int)
    data = _build_inventory_stock_at_cost_data(market_id, supplier_id)

    export_data = []
    for row in data['items']:
        export_data.append({
            'Item Code': row['code'],
            'Item Name': row['name'],
            'Supplier': row['supplier_name'] or '',
            'Grade': row['grade'] or '',
            'Category 1': row['category1'] or '',
            'Category 2': row['category2'] or '',
            'Unit Weight': row['weight'],
            'Total Purchases': row['total_purchases'],
            'Total Sales': row['total_sales'],
            'Available Quantity': row['available_quantity'],
            'Total Weight': row['total_weight'],
            'Avg Unit Total Cost (Price+COG)': round(row['avg_unit_total_cost'], 4) if row.get('avg_unit_total_cost') else 0,
            'Stock at Landed Cost': round(row['stock_at_landed_cost'], 2) if row.get('stock_at_landed_cost') is not None else 0,
            'Avg Sales Price': round(row['avg_sales_price'], 2) if row['avg_sales_price'] else 0,
        })

    tot_p = sum(r['total_purchases'] for r in data['items'])
    tot_s = sum(r['total_sales'] for r in data['items'])
    export_data.append({
        'Item Code': 'TOTAL',
        'Item Name': '',
        'Supplier': '',
        'Grade': '',
        'Category 1': '',
        'Category 2': '',
        'Unit Weight': '',
        'Total Purchases': tot_p,
        'Total Sales': tot_s,
        'Available Quantity': data['total_quantity'],
        'Total Weight': data['total_weight'],
        'Avg Unit Total Cost (Price+COG)': '',
        'Stock at Landed Cost': round(data.get('total_stock_at_landed_cost', 0), 2),
        'Avg Sales Price': '',
    })

    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df = pd.DataFrame(export_data)
        df.to_excel(writer, index=False, sheet_name='Stock At Cost')

        worksheet = writer.sheets['Stock At Cost']
        for idx, col in enumerate(df.columns):
            max_length = len(str(col)) if df.empty else max(
                df[col].astype(str).apply(len).max(),
                len(str(col)),
            )
            worksheet.column_dimensions[get_column_letter(idx + 1)].width = min(max_length + 2, 50)

    output.seek(0)
    filename = f'inventory_stock_at_cost_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx'
    return send_file(
        output,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name=filename,
    )


@bp.route('/inventory-snapshot', methods=['GET'])
@login_required
def get_inventory_snapshot():
    """Get inventory snapshot report"""
    return jsonify({'error': 'Endpoint not yet implemented'}), 501

@bp.route('/container-report', methods=['GET'])
@login_required
def get_container_report():
    """Get container report with items, expenses, and costs"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    container_id = request.args.get('container_id', type=int)
    if not container_id:
        return jsonify({'error': 'Container ID is required'}), 400
    
    # Get container
    container = PurchaseContainer.query.filter_by(
        market_id=market_id,
        id=container_id
    ).first()
    
    if not container:
        return jsonify({'error': 'Container not found'}), 404
    
    # Get all purchase items for this container
    purchase_items = PurchaseItem.query.filter_by(container_id=container.id).all()
    
    # Calculate expenses in container currency
    expense1 = Decimal('0')
    if container.expense1_amount and container.expense1_amount > 0:
        if container.expense1_currency == container.currency:
            expense1 = container.expense1_amount
        else:
            # Convert to base currency first, then to container currency
            expense1_base = container.expense1_amount * (container.expense1_exchange_rate or 1)
            container_rate = container.exchange_rate or 1
            if container_rate > 0:
                expense1 = expense1_base / container_rate
    
    expense2 = Decimal('0')
    if container.expense2_amount and container.expense2_amount > 0:
        if container.expense2_currency == container.currency:
            expense2 = container.expense2_amount
        else:
            # Convert to base currency first, then to container currency
            expense2_base = container.expense2_amount * (container.expense2_exchange_rate or 1)
            container_rate = container.exchange_rate or 1
            if container_rate > 0:
                expense2 = expense2_base / container_rate
    
    expense3 = Decimal('0')
    if container.expense3_amount and container.expense3_amount > 0:
        if container.expense3_currency == container.currency:
            expense3 = container.expense3_amount
        else:
            # Convert to base currency first, then to container currency
            expense3_base = container.expense3_amount * (container.expense3_exchange_rate or 1)
            container_rate = container.exchange_rate or 1
            if container_rate > 0:
                expense3 = expense3_base / container_rate
    
    sum_expenses = expense1 + expense2 + expense3
    
    # Calculate total quantity and total weight for the container
    total_quantity = sum(pi.quantity for pi in purchase_items)
    total_weight = sum((pi.item.weight or Decimal('0')) * pi.quantity for pi in purchase_items)
    
    # Build items list with all calculations
    items = []
    total_price = Decimal('0')
    total_cog = Decimal('0')
    total_item_cost = Decimal('0')
    
    for pi in purchase_items:
        item = pi.item
        item_weight = (item.weight or Decimal('0'))
        item_total_weight = item_weight * pi.quantity
        
        # Calculate COG per unit in container currency
        if total_quantity > 0 and total_weight > 0:
            cog_per_unit = (sum_expenses / Decimal('2') / total_quantity) + \
                          (sum_expenses / Decimal('2') / total_weight * item_weight)
        elif total_quantity > 0:
            # If no weight, distribute by quantity only
            cog_per_unit = sum_expenses / total_quantity
        else:
            cog_per_unit = Decimal('0')
        
        total_cog_for_item = cog_per_unit * pi.quantity
        
        # Item cost per unit = unit_price (in container currency) + COG per unit
        item_cost_per_unit = pi.unit_price + cog_per_unit
        item_total_cost_for_item = item_cost_per_unit * pi.quantity
        
        items.append({
            'item_code': item.code,
            'item_name': item.name,
            'quantity': float(pi.quantity),
            'item_weight': float(item_weight),
            'item_total_weight': float(item_total_weight),
            'unit_price': float(pi.unit_price),
            'total_price': float(pi.total_price),
            'cog': float(cog_per_unit),
            'total_cog': float(total_cog_for_item),
            'item_cost': float(item_cost_per_unit),
            'item_total_cost': float(item_total_cost_for_item)
        })
        
        total_price += pi.total_price
        total_cog += total_cog_for_item
        total_item_cost += item_total_cost_for_item
    
    # Calculate supplier cost (total price + expense1)
    # Note: total_item_cost already includes COG, so we use total_price + expense1
    # to avoid double-counting expense1
    supplier_cost = total_price + expense1
    
    return jsonify({
        'container': {
            'container_number': container.container_number,
            'supplier_name': container.supplier.name if container.supplier else 'Unknown',
            'currency': container.currency,
            'exchange_rate': float(container.exchange_rate),
            'date': container.date.isoformat()
        },
        'items': items,
        'totals': {
            'quantity': float(total_quantity),
            'item_total_weight': float(total_weight),
            'total_price': float(total_price),
            'total_cog': float(total_cog),
            'item_total_cost': float(total_item_cost)
        },
        'expenses': {
            'expense1': float(expense1),
            'expense2': float(expense2),
            'expense3': float(expense3),
            'total': float(sum_expenses)
        },
        'supplier_cost': float(supplier_cost)
    })

@bp.route('/stock-value-details', methods=['GET'])
@login_required
def get_stock_value_details():
    """Get stock value details report grouped by supplier"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    item_id = request.args.get('item_id', type=int)
    
    # Get market calculation method
    market = Market.query.get(market_id)
    calculation_method = getattr(market, 'calculation_method', 'Average') if market else 'Average'
    
    # Get all suppliers
    suppliers = Company.query.filter_by(market_id=market_id, category='Supplier').all()
    
    suppliers_data = []
    
    for supplier in suppliers:
        # Get items for this supplier
        items_query = Item.query.filter_by(market_id=market_id, supplier_id=supplier.id)
        if item_id:
            items_query = items_query.filter_by(id=item_id)
        items = items_query.all()
        
        if not items:
            continue
        
        supplier_items = []
        
        for item in items:
            supplier_items.append(
                build_stock_value_item_row(market_id, supplier, item, calculation_method)
            )
        
        if supplier_items:
            suppliers_data.append({
                'supplier_name': supplier.name,
                'supplier_currency': supplier.currency,
                'items': supplier_items
            })
    
    return jsonify({
        'success': True,
        'data': suppliers_data
    })

def _autosize_excel_columns(writer, sheet_name, df):
    if df.empty or len(df.columns) == 0:
        return
    worksheet = writer.sheets[sheet_name]
    for idx, col in enumerate(df.columns):
        max_length = max(
            int(df[col].astype(str).apply(len).max()),
            len(str(col))
        )
        worksheet.column_dimensions[get_column_letter(idx + 1)].width = min(max_length + 2, 50)


@bp.route('/stock-value-details/export', methods=['GET'])
@login_required
def export_stock_value_details():
    """Export stock value details to Excel (same figures and breakdown as on-screen report)."""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400

    item_id = request.args.get('item_id', type=int)

    market = Market.query.get(market_id)
    calculation_method = getattr(market, 'calculation_method', 'Average') if market else 'Average'

    suppliers = Company.query.filter_by(market_id=market_id, category='Supplier').all()

    summary_rows = []
    detail_rows = []

    for supplier in suppliers:
        items_query = Item.query.filter_by(market_id=market_id, supplier_id=supplier.id)
        if item_id:
            items_query = items_query.filter_by(id=item_id)
        items = items_query.all()

        if not items:
            continue

        for item in items:
            row = build_stock_value_item_row(market_id, supplier, item, calculation_method)
            summary_rows.append({
                'Supplier': supplier.name,
                'Supplier Currency': supplier.currency,
                'Item Code': row['item_code'],
                'Item Name': row['item_name'],
                'Item Weight': row['item_weight'],
                'Purchased Quantity': row['purchased_quantity'],
                'Sold Quantity': row['sold_quantity'],
                'Available Quantity': row['available_quantity'],
                'Total Cost (All Batches/Containers)': row['total_cost_all_containers'],
                'Total Quantity (All Batches/Containers)': row['total_quantity_all_containers'],
                'Average Cost Per Unit': row['average_cost_per_unit'],
                'Stock Value': row['stock_value'],
                'Calculation Method': calculation_method,
            })
            item_currency = row['currency']
            for c in row.get('containers') or []:
                detail_rows.append({
                    'Supplier': supplier.name,
                    'Item Code': row['item_code'],
                    'Item Name': row['item_name'],
                    'Item Currency (supplier)': item_currency,
                    'Batch Code (Container)': c.get('container_number') or '',
                    'Container Date': c.get('container_date') or '',
                    'Row Currency': c.get('container_currency') or item_currency,
                    'Quantity': c.get('quantity'),
                    'Unit Price': c.get('unit_price'),
                    'Expense1 Original': c.get('expense1_original'),
                    'Expense1 Original CCY': c.get('expense1_currency'),
                    'Expense1 In Row CCY': c.get('expense1_in_container_currency'),
                    'Expense2 Original': c.get('expense2_original'),
                    'Expense2 Original CCY': c.get('expense2_currency'),
                    'Expense2 In Row CCY': c.get('expense2_in_container_currency'),
                    'Expense3 Original': c.get('expense3_original'),
                    'Expense3 Original CCY': c.get('expense3_currency'),
                    'Expense3 In Row CCY': c.get('expense3_in_container_currency'),
                    'Total Expenses (Row CCY)': c.get('total_expenses_in_container_currency'),
                    'COG Per Unit': c.get('cog_per_unit'),
                    'Cost Per Unit': c.get('item_cost_per_unit'),
                    'Total Cost': c.get('total_cost'),
                })

    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df_summary = pd.DataFrame(summary_rows)
        df_summary.to_excel(writer, index=False, sheet_name='Summary')
        _autosize_excel_columns(writer, 'Summary', df_summary)

        df_detail = pd.DataFrame(detail_rows)
        df_detail.to_excel(writer, index=False, sheet_name='Batch Container Breakdown')
        _autosize_excel_columns(writer, 'Batch Container Breakdown', df_detail)

    output.seek(0)
    filename = f'stock_value_details_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx'
    return send_file(
        output,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name=filename,
    )


def _statement_item_ids(market_id, item_id, supplier_id):
    if item_id:
        if Item.query.filter_by(id=item_id, market_id=market_id).first():
            return [item_id]
        return []
    query = Item.query.filter_by(market_id=market_id)
    if supplier_id:
        query = query.filter_by(supplier_id=supplier_id)
    return [i.id for i in query.all()]


def _item_net_qty_as_of(market_id, item_ids, as_of_date):
    """Book quantity on hand at end of as_of_date (inclusive)."""
    if not item_ids or not as_of_date:
        return Decimal('0')

    purchases = db.session.query(
        func.coalesce(func.sum(PurchaseItem.quantity), 0)
    ).join(PurchaseContainer, PurchaseItem.container_id == PurchaseContainer.id).filter(
        PurchaseContainer.market_id == market_id,
        PurchaseItem.item_id.in_(item_ids),
        PurchaseContainer.date <= as_of_date,
    ).scalar()

    sales = db.session.query(
        func.coalesce(func.sum(SaleItem.quantity), 0)
    ).join(Sale, SaleItem.sale_id == Sale.id).filter(
        Sale.market_id == market_id,
        SaleItem.item_id.in_(item_ids),
        SaleItem.item_id.isnot(None),
        Sale.date <= as_of_date,
    ).scalar()

    returns = db.session.query(
        func.coalesce(func.sum(SupplierReturnLine.quantity), 0)
    ).join(SupplierReturn, SupplierReturnLine.supplier_return_id == SupplierReturn.id).filter(
        SupplierReturn.market_id == market_id,
        SupplierReturnLine.item_id.in_(item_ids),
        SupplierReturn.date <= as_of_date,
    ).scalar()

    adj_in = db.session.query(
        func.coalesce(func.sum(InventoryAdjustment.quantity), 0)
    ).filter(
        InventoryAdjustment.market_id == market_id,
        InventoryAdjustment.item_id.in_(item_ids),
        InventoryAdjustment.adjustment_type == 'Increase',
        InventoryAdjustment.date <= as_of_date,
    ).scalar()

    adj_out = db.session.query(
        func.coalesce(func.sum(InventoryAdjustment.quantity), 0)
    ).filter(
        InventoryAdjustment.market_id == market_id,
        InventoryAdjustment.item_id.in_(item_ids),
        InventoryAdjustment.adjustment_type == 'Decrease',
        InventoryAdjustment.date <= as_of_date,
    ).scalar()

    return (
        Decimal(str(purchases or 0))
        - Decimal(str(sales or 0))
        - Decimal(str(returns or 0))
        + Decimal(str(adj_in or 0))
        - Decimal(str(adj_out or 0))
    )


def _collect_item_statement_movements(market_id, item_ids, start_date, end_date):
    if not item_ids:
        return []

    movements = []

    pq = db.session.query(PurchaseItem, PurchaseContainer, Item).join(
        PurchaseContainer, PurchaseItem.container_id == PurchaseContainer.id
    ).join(Item, PurchaseItem.item_id == Item.id).filter(
        PurchaseContainer.market_id == market_id,
        PurchaseItem.item_id.in_(item_ids),
    )
    if start_date:
        pq = pq.filter(PurchaseContainer.date >= start_date)
    if end_date:
        pq = pq.filter(PurchaseContainer.date <= end_date)
    for pi, container, item in pq.all():
        movements.append({
            'sort_date': container.date,
            'sort_id': pi.id,
            'date': container.date.isoformat(),
            'transaction_type': 'IN',
            'type': 'IN',
            'movement_kind': 'Purchase',
            'item_id': item.id,
            'item_code': item.code,
            'item_name': item.name,
            'quantity': float(pi.quantity),
            'unit_price': float(pi.unit_price),
            'total_amount': float(pi.total_price),
            'currency': container.currency,
            'reference': container.container_number or f'Container #{container.id}',
        })

    sq = db.session.query(SaleItem, Sale, Item).join(
        Sale, SaleItem.sale_id == Sale.id
    ).join(Item, SaleItem.item_id == Item.id).filter(
        Sale.market_id == market_id,
        SaleItem.item_id.in_(item_ids),
        SaleItem.item_id.isnot(None),
    )
    if start_date:
        sq = sq.filter(Sale.date >= start_date)
    if end_date:
        sq = sq.filter(Sale.date <= end_date)
    for si, sale, item in sq.all():
        customer = sale.customer
        movements.append({
            'sort_date': sale.date,
            'sort_id': si.id,
            'date': sale.date.isoformat(),
            'transaction_type': 'OUT',
            'type': 'OUT',
            'movement_kind': 'Sale',
            'item_id': item.id,
            'item_code': item.code,
            'item_name': item.name,
            'quantity': float(si.quantity),
            'unit_price': float(si.unit_price),
            'total_amount': float(si.total_price),
            'currency': customer.currency if customer else '',
            'reference': sale.invoice_number or f'Sale #{sale.id}',
        })

    rq = db.session.query(SupplierReturnLine, SupplierReturn, Item).join(
        SupplierReturn, SupplierReturnLine.supplier_return_id == SupplierReturn.id
    ).join(Item, SupplierReturnLine.item_id == Item.id).filter(
        SupplierReturn.market_id == market_id,
        SupplierReturnLine.item_id.in_(item_ids),
    )
    if start_date:
        rq = rq.filter(SupplierReturn.date >= start_date)
    if end_date:
        rq = rq.filter(SupplierReturn.date <= end_date)
    for line, ret, item in rq.all():
        movements.append({
            'sort_date': ret.date,
            'sort_id': line.id,
            'date': ret.date.isoformat(),
            'transaction_type': 'OUT',
            'type': 'OUT',
            'movement_kind': 'Supplier Return',
            'item_id': item.id,
            'item_code': item.code,
            'item_name': item.name,
            'quantity': float(line.quantity),
            'unit_price': float(line.unit_price),
            'total_amount': float(line.total_price),
            'currency': ret.currency,
            'reference': ret.reference_number or f'Return #{ret.id}',
        })

    aq = InventoryAdjustment.query.filter(
        InventoryAdjustment.market_id == market_id,
        InventoryAdjustment.item_id.in_(item_ids),
    )
    if start_date:
        aq = aq.filter(InventoryAdjustment.date >= start_date)
    if end_date:
        aq = aq.filter(InventoryAdjustment.date <= end_date)
    for adj in aq.all():
        tx_type = 'IN' if adj.adjustment_type == 'Increase' else 'OUT'
        movements.append({
            'sort_date': adj.date,
            'sort_id': adj.id,
            'date': adj.date.isoformat(),
            'transaction_type': tx_type,
            'type': tx_type,
            'movement_kind': 'Adjustment',
            'item_id': adj.item_id,
            'item_code': adj.item.code if adj.item else '',
            'item_name': adj.item.name if adj.item else '',
            'quantity': float(adj.quantity),
            'unit_price': 0.0,
            'total_amount': 0.0,
            'currency': '',
            'reference': adj.reason or adj.notes or f'Adjustment #{adj.id}',
        })

    movements.sort(key=lambda m: (m['sort_date'], 0 if m['transaction_type'] == 'IN' else 1, m['sort_id']))
    return movements


def _build_item_statement_data(market_id, item_id, supplier_id, start_date, end_date, transaction_type):
    item_ids = _statement_item_ids(market_id, item_id, supplier_id)
    if item_id and not item_ids:
        return {'error': 'Item not found'}, 404

    supplier_name = None
    if supplier_id:
        supplier = Company.query.filter_by(id=supplier_id, market_id=market_id).first()
        supplier_name = supplier.name if supplier else None

    item_label = None
    if item_id and item_ids:
        item = Item.query.get(item_id)
        if item:
            item_label = {'id': item.id, 'code': item.code, 'name': item.name}

    start_dt = datetime.strptime(start_date, '%Y-%m-%d').date() if start_date else None
    end_dt = datetime.strptime(end_date, '%Y-%m-%d').date() if end_date else None

    openings = {}
    for iid in item_ids:
        if start_dt:
            openings[iid] = _item_net_qty_as_of(market_id, [iid], start_dt - timedelta(days=1))
        else:
            openings[iid] = Decimal('0')

    opening_quantity = float(sum(openings.values()))
    movements = _collect_item_statement_movements(market_id, item_ids, start_dt, end_dt)

    if transaction_type == 'IN':
        movements = [m for m in movements if m['transaction_type'] == 'IN']
    elif transaction_type == 'OUT':
        movements = [m for m in movements if m['transaction_type'] == 'OUT']

    running = dict(openings)
    total_in = Decimal('0')
    total_out = Decimal('0')
    statement = []
    for m in movements:
        qty = Decimal(str(m['quantity']))
        iid = m['item_id']
        if m['transaction_type'] == 'IN':
            total_in += qty
            running[iid] = running.get(iid, Decimal('0')) + qty
        else:
            total_out += qty
            running[iid] = running.get(iid, Decimal('0')) - qty
        row = {k: v for k, v in m.items() if k not in ('sort_date', 'sort_id', 'item_id')}
        row['balance_after'] = float(running.get(iid, Decimal('0')))
        statement.append(row)

    if end_dt:
        closing_quantity = float(_item_net_qty_as_of(market_id, item_ids, end_dt))
    else:
        closing_quantity = float(sum(running.values()))

    return {
        'supplier_name': supplier_name,
        'item': item_label,
        'start_date': start_date,
        'end_date': end_date,
        'summary': {
            'opening_quantity': opening_quantity,
            'total_in': float(total_in),
            'total_out': float(total_out),
            'net_change': float(total_in - total_out),
            'closing_quantity': closing_quantity,
        },
        'statement': statement,
    }, 200


@bp.route('/item-statement', methods=['GET'])
@login_required
def get_item_statement():
    """Item-level IN/OUT movements with opening/closing book stock for the period."""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400

    item_id = request.args.get('item_id', type=int)
    supplier_id = request.args.get('supplier_id', type=int)
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    transaction_type = request.args.get('transaction_type', 'All')

    data, status = _build_item_statement_data(
        market_id, item_id, supplier_id, start_date, end_date, transaction_type
    )
    return jsonify(data), status


@bp.route('/item-statement/export', methods=['GET'])
@login_required
def export_item_statement():
    """Export item statement report to Excel."""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400

    item_id = request.args.get('item_id', type=int)
    supplier_id = request.args.get('supplier_id', type=int)
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    transaction_type = request.args.get('transaction_type', 'All')

    data, status = _build_item_statement_data(
        market_id, item_id, supplier_id, start_date, end_date, transaction_type
    )
    if status != 200:
        return jsonify(data), status

    export_rows = [{
        'Date': row['date'],
        'Type': row['transaction_type'],
        'Movement': row.get('movement_kind', ''),
        'Item Code': row.get('item_code', ''),
        'Item Name': row.get('item_name', ''),
        'Quantity': row['quantity'],
        'Balance After': row.get('balance_after', ''),
        'Unit Price': row.get('unit_price', 0),
        'Total Amount': row.get('total_amount', 0),
        'Currency': row.get('currency', ''),
        'Reference': row.get('reference', ''),
    } for row in data['statement']]

    summary = data['summary']
    export_rows.append({})
    export_rows.append({
        'Date': 'SUMMARY',
        'Type': '',
        'Movement': '',
        'Item Code': '',
        'Item Name': '',
        'Quantity': '',
        'Balance After': summary['closing_quantity'],
        'Unit Price': 'Opening Qty',
        'Total Amount': summary['opening_quantity'],
        'Currency': '',
        'Reference': f"Total IN: {summary['total_in']} | Total OUT: {summary['total_out']} | Net: {summary['net_change']}",
    })

    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df = pd.DataFrame(export_rows)
        df.to_excel(writer, index=False, sheet_name='Item Statement')
        worksheet = writer.sheets['Item Statement']
        for idx, col in enumerate(df.columns):
            max_length = len(str(col)) if df.empty else max(
                df[col].astype(str).apply(len).max(),
                len(str(col)),
            )
            worksheet.column_dimensions[get_column_letter(idx + 1)].width = min(max_length + 2, 50)

    output.seek(0)
    filename = f'item_statement_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx'
    return send_file(
        output,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name=filename,
    )


@bp.route('/virtual-purchase-profit', methods=['POST'])
@login_required
def virtual_purchase_profit():
    """Virtual purchase profit report"""
    return jsonify({'error': 'Endpoint not yet implemented'}), 501

@bp.route('/average-sale-price', methods=['GET'])
@login_required
def get_average_sale_price():
    """Get average sale price report - Average Sale Price = Total Revenue ÷ Total Quantity per item"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400

    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    supplier_id = request.args.get('supplier_id', type=int)
    customer_id = request.args.get('customer_id', type=int)
    item_id = request.args.get('item_id', type=int)

    query = db.session.query(SaleItem, Sale, Item).join(
        Sale, SaleItem.sale_id == Sale.id
    ).join(
        Item, SaleItem.item_id == Item.id
    ).filter(Sale.market_id == market_id)

    if start_date:
        query = query.filter(Sale.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        query = query.filter(Sale.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    if supplier_id:
        query = query.filter(Item.supplier_id == supplier_id)
    if customer_id:
        query = query.filter(Sale.customer_id == customer_id)
    if item_id:
        query = query.filter(SaleItem.item_id == item_id)

    sale_items = query.order_by(Sale.date.asc(), Sale.id.asc()).all()

    # Aggregate by item
    items_data = {}
    for si, sale, item in sale_items:
        iid = item.id
        if iid not in items_data:
            supplier = item.supplier
            items_data[iid] = {
                'item_id': iid,
                'item_code': item.code,
                'item_name': item.name,
                'supplier_name': supplier.name if supplier else None,
                'total_quantity_sold': Decimal('0'),
                'total_revenue': Decimal('0'),
                'sales': []
            }

        items_data[iid]['total_quantity_sold'] += si.quantity
        items_data[iid]['total_revenue'] += si.total_price
        items_data[iid]['sales'].append({
            'date': sale.date.isoformat(),
            'invoice_number': sale.invoice_number,
            'customer_name': sale.customer.name if sale.customer else 'Unknown',
            'customer_currency': sale.customer.currency if sale.customer else 'CFA',
            'quantity': float(si.quantity),
            'unit_price': float(si.unit_price),
            'total_price': float(si.total_price)
        })

    items_list = []
    for item_data in items_data.values():
        total_qty = float(item_data['total_quantity_sold'])
        total_rev = float(item_data['total_revenue'])
        avg_price = total_rev / total_qty if total_qty > 0 else 0

        items_list.append({
            'item_id': item_data['item_id'],
            'item_code': item_data['item_code'],
            'item_name': item_data['item_name'],
            'supplier_name': item_data['supplier_name'],
            'average_sale_price': round(avg_price, 2),
            'total_quantity_sold': total_qty,
            'total_revenue': round(total_rev, 2),
            'transaction_count': len(item_data['sales']),
            'sales': item_data['sales']
        })

    # Sort by item_code
    items_list.sort(key=lambda x: (x['item_code'] or '', x['item_name'] or ''))

    return jsonify({
        'items': items_list,
        'filters': {
            'start_date': start_date,
            'end_date': end_date,
            'supplier_id': supplier_id,
            'customer_id': customer_id,
            'item_id': item_id
        }
    })

def _get_average_sale_price_data(market_id, start_date, end_date, supplier_id, customer_id, item_id):
    """Shared logic for average sale price report and export"""
    query = db.session.query(SaleItem, Sale, Item).join(
        Sale, SaleItem.sale_id == Sale.id
    ).join(
        Item, SaleItem.item_id == Item.id
    ).filter(Sale.market_id == market_id)

    if start_date:
        query = query.filter(Sale.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        query = query.filter(Sale.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    if supplier_id:
        query = query.filter(Item.supplier_id == supplier_id)
    if customer_id:
        query = query.filter(Sale.customer_id == customer_id)
    if item_id:
        query = query.filter(SaleItem.item_id == item_id)

    sale_items = query.order_by(Sale.date.asc(), Sale.id.asc()).all()

    items_data = {}
    for si, sale, item in sale_items:
        iid = item.id
        if iid not in items_data:
            supplier = item.supplier
            items_data[iid] = {
                'item_id': iid,
                'item_code': item.code,
                'item_name': item.name,
                'supplier_name': supplier.name if supplier else None,
                'total_quantity_sold': Decimal('0'),
                'total_revenue': Decimal('0'),
            }

        items_data[iid]['total_quantity_sold'] += si.quantity
        items_data[iid]['total_revenue'] += si.total_price

    items_list = []
    for item_data in items_data.values():
        total_qty = float(item_data['total_quantity_sold'])
        total_rev = float(item_data['total_revenue'])
        avg_price = total_rev / total_qty if total_qty > 0 else 0
        items_list.append({
            'item_code': item_data['item_code'],
            'item_name': item_data['item_name'],
            'supplier_name': item_data['supplier_name'] or '',
            'average_sale_price': round(avg_price, 2),
            'total_quantity_sold': total_qty,
            'total_revenue': round(total_rev, 2),
        })

    items_list.sort(key=lambda x: (x['item_code'] or '', x['item_name'] or ''))
    return items_list

@bp.route('/average-sale-price/export', methods=['GET'])
@login_required
def export_average_sale_price():
    """Export Average Sale Price report to Excel"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400

    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    supplier_id = request.args.get('supplier_id', type=int)
    customer_id = request.args.get('customer_id', type=int)
    item_id = request.args.get('item_id', type=int)

    items_list = _get_average_sale_price_data(market_id, start_date, end_date, supplier_id, customer_id, item_id)

    export_data = []
    for row in items_list:
        export_data.append({
            'Item Code': row['item_code'],
            'Item Name': row['item_name'],
            'Supplier': row['supplier_name'],
            'Average Sale Price': row['average_sale_price'],
            'Total Quantity Sold': row['total_quantity_sold'],
            'Total Revenue': row['total_revenue'],
        })

    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df = pd.DataFrame(export_data)
        df.to_excel(writer, index=False, sheet_name='Average Sale Price')

        worksheet = writer.sheets['Average Sale Price']
        for idx, col in enumerate(df.columns):
            max_length = len(str(col)) if df.empty else max(
                df[col].astype(str).apply(len).max(),
                len(str(col))
            )
            worksheet.column_dimensions[get_column_letter(idx + 1)].width = min(max_length + 2, 50)

    output.seek(0)
    filename = f'average_sale_price_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx'
    return send_file(output, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                     as_attachment=True, download_name=filename)

@bp.route('/last-purchase-price', methods=['GET'])
@login_required
def get_last_purchase_price():
    """Last purchase price for all items - the unit price from the most recent purchase per item"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400

    supplier_id = request.args.get('supplier_id', type=int)
    item_id = request.args.get('item_id', type=int)

    # Get items that have purchases (with optional filters)
    items_query = Item.query.filter_by(market_id=market_id)
    if supplier_id:
        items_query = items_query.filter(Item.supplier_id == supplier_id)
    if item_id:
        items_query = items_query.filter(Item.id == item_id)

    items_list = []
    for item in items_query.all():
        # Get most recent purchase for this item
        last_purchase = db.session.query(PurchaseItem, PurchaseContainer).join(
            PurchaseContainer, PurchaseItem.container_id == PurchaseContainer.id
        ).filter(
            PurchaseContainer.market_id == market_id,
            PurchaseItem.item_id == item.id
        ).order_by(PurchaseContainer.date.desc(), PurchaseContainer.id.desc()).first()

        if not last_purchase:
            continue

        pi, container = last_purchase
        supplier = container.supplier if container else None
        purchase_items = list(container.items) if container else []
        cog_per_unit, _, _, _ = _compute_cog_for_purchase_item(pi, container, purchase_items)

        items_list.append({
            'item_id': item.id,
            'item_code': item.code,
            'supplier_name': supplier.name if supplier else None,
            'last_purchase_price': float(pi.unit_price),
            'last_cog_per_unit': float(cog_per_unit),
            'last_purchase_date': container.date.isoformat() if container.date else None,
            'container_number': container.container_number if container else None,
            'quantity': float(pi.quantity),
            'total_price': float(pi.total_price),
            'currency': container.currency if container else None
        })

    items_list.sort(key=lambda x: (x['item_code'] or '',))

    return jsonify({
        'items': items_list,
        'filters': {'supplier_id': supplier_id, 'item_id': item_id}
    })

@bp.route('/last-purchase-price/export', methods=['GET'])
@login_required
def export_last_purchase_price():
    """Export Last Purchase Price report to Excel"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400

    supplier_id = request.args.get('supplier_id', type=int)
    item_id = request.args.get('item_id', type=int)

    items_query = Item.query.filter_by(market_id=market_id)
    if supplier_id:
        items_query = items_query.filter(Item.supplier_id == supplier_id)
    if item_id:
        items_query = items_query.filter(Item.id == item_id)

    export_data = []
    for item in items_query.all():
        last_purchase = db.session.query(PurchaseItem, PurchaseContainer).join(
            PurchaseContainer, PurchaseItem.container_id == PurchaseContainer.id
        ).filter(
            PurchaseContainer.market_id == market_id,
            PurchaseItem.item_id == item.id
        ).order_by(PurchaseContainer.date.desc(), PurchaseContainer.id.desc()).first()

        if not last_purchase:
            continue

        pi, container = last_purchase
        supplier = container.supplier if container else None
        purchase_items = list(container.items) if container else []
        cog_per_unit, _, _, _ = _compute_cog_for_purchase_item(pi, container, purchase_items)

        export_data.append({
            'Item Code': item.code,
            'Supplier': supplier.name if supplier else '',
            'Last Purchase Price': float(pi.unit_price),
            'Last COG Per Unit': float(cog_per_unit),
            'Last Purchase Date': container.date.isoformat() if container.date else '',
            'Container Number': container.container_number if container else '',
            'Quantity': float(pi.quantity),
            'Total Price': float(pi.total_price),
            'Currency': container.currency if container else '',
        })

    export_data.sort(key=lambda x: (x['Item Code'] or '',))

    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df = pd.DataFrame(export_data)
        df.to_excel(writer, index=False, sheet_name='Last Purchase Price')

        worksheet = writer.sheets['Last Purchase Price']
        for idx, col in enumerate(df.columns):
            max_length = len(str(col)) if df.empty else max(
                df[col].astype(str).apply(len).max(),
                len(str(col))
            )
            worksheet.column_dimensions[get_column_letter(idx + 1)].width = min(max_length + 2, 50)

    output.seek(0)
    filename = f'last_purchase_price_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx'
    return send_file(output, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                     as_attachment=True, download_name=filename)

def _compute_cog_for_purchase_item(pi, container, purchase_items):
    """Compute COG for a single purchase item within its container. Returns (cog_per_unit, cost_per_unit, total_cog, total_cost)."""
    expense1 = Decimal('0')
    if container.expense1_amount and container.expense1_amount > 0:
        if container.expense1_currency == container.currency:
            expense1 = container.expense1_amount
        else:
            expense1_base = container.expense1_amount * (container.expense1_exchange_rate or 1)
            cr = container.exchange_rate or 1
            if cr > 0:
                expense1 = expense1_base / cr
    expense2 = Decimal('0')
    if container.expense2_amount and container.expense2_amount > 0:
        if container.expense2_currency == container.currency:
            expense2 = container.expense2_amount
        else:
            expense2_base = container.expense2_amount * (container.expense2_exchange_rate or 1)
            cr = container.exchange_rate or 1
            if cr > 0:
                expense2 = expense2_base / cr
    expense3 = Decimal('0')
    if container.expense3_amount and container.expense3_amount > 0:
        if container.expense3_currency == container.currency:
            expense3 = container.expense3_amount
        else:
            expense3_base = container.expense3_amount * (container.expense3_exchange_rate or 1)
            cr = container.exchange_rate or 1
            if cr > 0:
                expense3 = expense3_base / cr
    sum_expenses = expense1 + expense2 + expense3
    total_quantity = sum(p.quantity for p in purchase_items)
    total_weight = sum((p.item.weight or Decimal('0')) * p.quantity for p in purchase_items)
    item_weight = pi.item.weight or Decimal('0')
    if total_quantity > 0 and total_weight > 0:
        cog_per_unit = (sum_expenses / Decimal('2') / total_quantity) + \
                       (sum_expenses / Decimal('2') / total_weight * item_weight)
    elif total_quantity > 0:
        cog_per_unit = sum_expenses / total_quantity
    else:
        cog_per_unit = Decimal('0')
    cost_per_unit = pi.unit_price + cog_per_unit
    total_cog = cog_per_unit * pi.quantity
    total_cost = cost_per_unit * pi.quantity
    return cog_per_unit, cost_per_unit, total_cog, total_cost


def _last_purchase_unit_cost_base(market_id, item_id):
    """Fully absorbed cost per unit in market base currency from latest purchase, or None."""
    last = db.session.query(PurchaseItem, PurchaseContainer).join(
        PurchaseContainer, PurchaseItem.container_id == PurchaseContainer.id
    ).filter(
        PurchaseContainer.market_id == market_id,
        PurchaseItem.item_id == item_id,
    ).order_by(PurchaseContainer.date.desc(), PurchaseContainer.id.desc()).first()
    if not last:
        return None
    pi, container = last
    purchase_items = list(container.items) if container else []
    _, cost_per_unit, _, _ = _compute_cog_for_purchase_item(pi, container, purchase_items)
    er = container.exchange_rate or Decimal('1')
    return cost_per_unit * er


@bp.route('/last-purchase-cog', methods=['GET'])
@login_required
def get_last_purchase_cog():
    """COG from the last (most recent) purchase of each item - not average of all purchases"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400

    supplier_id = request.args.get('supplier_id', type=int)
    item_id = request.args.get('item_id', type=int)
    market = Market.query.get(market_id)
    base_currency = market.base_currency if market else 'USD'

    items_query = Item.query.filter_by(market_id=market_id)
    if supplier_id:
        items_query = items_query.filter(Item.supplier_id == supplier_id)
    if item_id:
        items_query = items_query.filter(Item.id == item_id)

    items_list = []
    for item in items_query.all():
        last_purchase = db.session.query(PurchaseItem, PurchaseContainer).join(
            PurchaseContainer, PurchaseItem.container_id == PurchaseContainer.id
        ).filter(
            PurchaseContainer.market_id == market_id,
            PurchaseItem.item_id == item.id
        ).order_by(PurchaseContainer.date.desc(), PurchaseContainer.id.desc()).first()

        if not last_purchase:
            continue

        pi, container = last_purchase
        supplier = container.supplier if container else None
        purchase_items = list(container.items) if container else []

        cog_per_unit, cost_per_unit, total_cog, total_cost = _compute_cog_for_purchase_item(pi, container, purchase_items)
        total_cost_base = total_cost * (container.exchange_rate or Decimal('1'))

        items_list.append({
            'item_id': item.id,
            'item_code': item.code,
            'item_name': item.name,
            'supplier_name': supplier.name if supplier else None,
            'last_purchase_date': container.date.isoformat() if container.date else None,
            'container_number': container.container_number if container else None,
            'quantity': float(pi.quantity),
            'unit_price': float(pi.unit_price),
            'total_price': float(pi.total_price),
            'cog_per_unit': float(cog_per_unit),
            'total_cog': float(total_cog),
            'cost_per_unit': float(cost_per_unit),
            'total_cost': float(total_cost),
            'total_cost_base_currency': float(total_cost_base),
            'currency': container.currency if container else None,
            'exchange_rate': float(container.exchange_rate) if container.exchange_rate else 1
        })

    items_list.sort(key=lambda x: (x['item_code'] or '', x['item_name'] or ''))

    avail_map = _available_quantity_map_for_item_ids(market_id, [x['item_id'] for x in items_list])
    for row in items_list:
        row['available_quantity'] = avail_map.get(row['item_id'], 0.0)

    return jsonify({
        'items': items_list,
        'base_currency': base_currency,
        'filters': {'supplier_id': supplier_id, 'item_id': item_id}
    })

@bp.route('/last-purchase-cog/export', methods=['GET'])
@login_required
def export_last_purchase_cog():
    """Export Last Purchase COG report to Excel"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400

    supplier_id = request.args.get('supplier_id', type=int)
    item_id = request.args.get('item_id', type=int)
    market = Market.query.get(market_id)
    base_currency = market.base_currency if market else 'USD'

    items_query = Item.query.filter_by(market_id=market_id)
    if supplier_id:
        items_query = items_query.filter(Item.supplier_id == supplier_id)
    if item_id:
        items_query = items_query.filter(Item.id == item_id)

    export_data = []
    for item in items_query.all():
        last_purchase = db.session.query(PurchaseItem, PurchaseContainer).join(
            PurchaseContainer, PurchaseItem.container_id == PurchaseContainer.id
        ).filter(
            PurchaseContainer.market_id == market_id,
            PurchaseItem.item_id == item.id
        ).order_by(PurchaseContainer.date.desc(), PurchaseContainer.id.desc()).first()

        if not last_purchase:
            continue

        pi, container = last_purchase
        supplier = container.supplier if container else None
        purchase_items = list(container.items) if container else []

        cog_per_unit, cost_per_unit, total_cog, total_cost = _compute_cog_for_purchase_item(pi, container, purchase_items)
        total_cost_base = total_cost * (container.exchange_rate or Decimal('1'))

        export_data.append({
            '_item_id': item.id,
            'Item Code': item.code,
            'Item Name': item.name,
            'Supplier': supplier.name if supplier else '',
            'Last Purchase Date': container.date.isoformat() if container.date else '',
            'Container Number': container.container_number if container else '',
            'Quantity': float(pi.quantity),
            'Unit Price': float(pi.unit_price),
            'Total Price': float(pi.total_price),
            'COG Per Unit': float(cog_per_unit),
            'Total COG': float(total_cog),
            'Cost Per Unit': float(cost_per_unit),
            'Total Cost': float(total_cost),
            f'Total Cost ({base_currency})': float(total_cost_base),
            'Currency': container.currency if container else '',
            'Exchange Rate': float(container.exchange_rate) if container.exchange_rate else 1
        })

    export_data.sort(key=lambda x: (x['Item Code'] or '', x['Item Name'] or ''))

    ids_for_avail = [r['_item_id'] for r in export_data]
    avail_map = _available_quantity_map_for_item_ids(market_id, ids_for_avail)
    export_data = [
        {
            'Item Code': r['Item Code'],
            'Item Name': r['Item Name'],
            'Supplier': r['Supplier'],
            'Last Purchase Date': r['Last Purchase Date'],
            'Container Number': r['Container Number'],
            'Available Quantity': avail_map.get(r['_item_id'], 0.0),
            'Quantity': r['Quantity'],
            'Unit Price': r['Unit Price'],
            'Total Price': r['Total Price'],
            'COG Per Unit': r['COG Per Unit'],
            'Total COG': r['Total COG'],
            'Cost Per Unit': r['Cost Per Unit'],
            'Total Cost': r['Total Cost'],
            f'Total Cost ({base_currency})': r[f'Total Cost ({base_currency})'],
            'Currency': r['Currency'],
            'Exchange Rate': r['Exchange Rate'],
        }
        for r in export_data
    ]

    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df = pd.DataFrame(export_data)
        df.to_excel(writer, index=False, sheet_name='Last Purchase COG')
        worksheet = writer.sheets['Last Purchase COG']
        for idx, col in enumerate(df.columns):
            max_length = len(str(col)) if df.empty else max(
                df[col].astype(str).apply(len).max(),
                len(str(col))
            )
            worksheet.column_dimensions[get_column_letter(idx + 1)].width = min(max_length + 2, 50)

    output.seek(0)
    filename = f'last_purchase_cog_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx'
    return send_file(output, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                     as_attachment=True, download_name=filename)

@bp.route('/average-last-n-sales', methods=['GET'])
@login_required
def get_average_last_n_sales():
    """Average of last N sales per item (N=10, or 9, 8, ... if fewer available).
    For each item: take the last 10 sale line items (most recent), or all if fewer than 10.
    Average = Total Revenue ÷ Total Quantity from those transactions."""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400

    supplier_id = request.args.get('supplier_id', type=int)
    item_id = request.args.get('item_id', type=int)
    max_n = 10

    # Get all items that have sales (optional: filter by supplier/item)
    items_query = Item.query.filter_by(market_id=market_id)
    if supplier_id:
        items_query = items_query.filter(Item.supplier_id == supplier_id)
    if item_id:
        items_query = items_query.filter(Item.id == item_id)

    items_list = []
    for item in items_query.all():
        # Get sale items for this item, most recent first
        q = db.session.query(SaleItem, Sale).join(
            Sale, SaleItem.sale_id == Sale.id
        ).filter(
            Sale.market_id == market_id,
            SaleItem.item_id == item.id
        ).options(joinedload(Sale.customer)).order_by(Sale.date.desc(), Sale.id.desc())

        rows = q.limit(max_n).all()

        if not rows:
            continue

        total_qty = sum(float(si.quantity) for si, _ in rows)
        total_rev = sum(float(si.total_price) for si, _ in rows)
        n_used = len(rows)
        avg_price = total_rev / total_qty if total_qty > 0 else 0

        sales_detail = []
        for si, sale in rows:
            sales_detail.append({
                'date': sale.date.isoformat(),
                'invoice_number': sale.invoice_number,
                'customer_name': sale.customer.name if sale.customer else 'Unknown',
                'customer_currency': sale.customer.currency if sale.customer else 'CFA',
                'quantity': float(si.quantity),
                'unit_price': float(si.unit_price),
                'total_price': float(si.total_price)
            })

        supplier = item.supplier
        items_list.append({
            'item_id': item.id,
            'item_code': item.code,
            'item_name': item.name,
            'supplier_name': supplier.name if supplier else None,
            'average_sale_price': round(avg_price, 2),
            'total_quantity_sold': total_qty,
            'total_revenue': round(total_rev, 2),
            'sales_used': n_used,
            'sales': sales_detail
        })

    items_list.sort(key=lambda x: (x['item_code'] or '', x['item_name'] or ''))

    return jsonify({
        'items': items_list,
        'max_n': max_n,
        'filters': {'supplier_id': supplier_id, 'item_id': item_id}
    })

@bp.route('/average-last-n-sales/export', methods=['GET'])
@login_required
def export_average_last_n_sales():
    """Export Average of Last N Sales report to Excel"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400

    supplier_id = request.args.get('supplier_id', type=int)
    item_id = request.args.get('item_id', type=int)
    max_n = 10

    items_query = Item.query.filter_by(market_id=market_id)
    if supplier_id:
        items_query = items_query.filter(Item.supplier_id == supplier_id)
    if item_id:
        items_query = items_query.filter(Item.id == item_id)

    export_data = []
    for item in items_query.all():
        q = db.session.query(SaleItem, Sale).join(
            Sale, SaleItem.sale_id == Sale.id
        ).filter(
            Sale.market_id == market_id,
            SaleItem.item_id == item.id
        ).order_by(Sale.date.desc(), Sale.id.desc())

        rows = q.limit(max_n).all()
        if not rows:
            continue

        total_qty = sum(float(si.quantity) for si, _ in rows)
        total_rev = sum(float(si.total_price) for si, _ in rows)
        n_used = len(rows)
        avg_price = total_rev / total_qty if total_qty > 0 else 0

        supplier = item.supplier
        export_data.append({
            'Item Code': item.code,
            'Item Name': item.name,
            'Supplier': supplier.name if supplier else '',
            'Sales Used (N)': n_used,
            'Average Sale Price': round(avg_price, 2),
            'Total Quantity': total_qty,
            'Total Revenue': round(total_rev, 2),
        })

    export_data.sort(key=lambda x: (x['Item Code'] or '', x['Item Name'] or ''))

    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df = pd.DataFrame(export_data)
        df.to_excel(writer, index=False, sheet_name='Avg Last N Sales')

        worksheet = writer.sheets['Avg Last N Sales']
        for idx, col in enumerate(df.columns):
            max_length = len(str(col)) if df.empty else max(
                df[col].astype(str).apply(len).max(),
                len(str(col))
            )
            worksheet.column_dimensions[get_column_letter(idx + 1)].width = min(max_length + 2, 50)

    output.seek(0)
    filename = f'avg_last_n_sales_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx'
    return send_file(output, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                     as_attachment=True, download_name=filename)

@bp.route('/safe-out', methods=['GET'])
@login_required
def get_safe_out_report():
    """Get Safe Out Report - combines payments (Out) and general expenses"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    # Get all Out payments (eager load company and sale to avoid N+1 queries)
    payments_query = Payment.query.options(
        joinedload(Payment.company),
        joinedload(Payment.sale)
    ).filter_by(
        market_id=market_id,
        payment_type='Out'
    )
    
    if start_date:
        payments_query = payments_query.filter(Payment.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        payments_query = payments_query.filter(Payment.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    
    payments = payments_query.order_by(Payment.date.asc(), Payment.id.asc()).all()
    
    # Get all general expenses
    expenses_query = GeneralExpense.query.filter_by(market_id=market_id)
    
    if start_date:
        expenses_query = expenses_query.filter(GeneralExpense.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        expenses_query = expenses_query.filter(GeneralExpense.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    
    expenses = expenses_query.order_by(GeneralExpense.date.asc(), GeneralExpense.id.asc()).all()
    
    # Combine into a single list with type indicator
    transactions = []
    
    for payment in payments:
        amount_base = payment.amount_base_currency_stored if payment.amount_base_currency_stored else payment.amount * payment.exchange_rate
        transactions.append({
            'id': payment.id,
            'date': payment.date.isoformat(),
            'type': 'Payment',
            'description': payment.company.name if payment.company else 'Unknown',
            'category': 'Loan' if payment.loan else payment.company.category if payment.company else 'Unknown',
            'invoice_number': payment.sale.invoice_number if payment.sale else None,
            'amount': float(payment.amount),
            'currency': payment.currency,
            'exchange_rate': float(payment.exchange_rate),
            'amount_base_currency': float(amount_base),
            'notes': payment.notes,
            'loan': payment.loan
        })
    
    for expense in expenses:
        amount_base = expense.amount_base_currency
        transactions.append({
            'id': expense.id,
            'date': expense.date.isoformat(),
            'type': 'Expense',
            'description': expense.description,
            'category': expense.category,
            'invoice_number': None,
            'amount': float(expense.amount),
            'currency': expense.currency,
            'exchange_rate': float(expense.exchange_rate),
            'amount_base_currency': float(amount_base),
            'notes': None,
            'loan': False
        })
    
    # Sort by date
    transactions.sort(key=lambda x: (x['date'], x['id']))
    
    # Calculate totals
    total_payments = sum(t['amount_base_currency'] for t in transactions if t['type'] == 'Payment')
    total_expenses = sum(t['amount_base_currency'] for t in transactions if t['type'] == 'Expense')
    total_out = total_payments + total_expenses
    
    return jsonify({
        'transactions': transactions,
        'totals': {
            'total_payments': float(total_payments),
            'total_expenses': float(total_expenses),
            'total_out': float(total_out),
            'count': len(transactions)
        }
    })

@bp.route('/safe-out/export', methods=['GET'])
@login_required
def export_safe_out_report():
    """Export Safe Out Report to Excel"""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    # Get data using the same logic as the report endpoint (eager load to avoid N+1)
    payments_query = Payment.query.options(
        joinedload(Payment.company),
        joinedload(Payment.sale)
    ).filter_by(
        market_id=market_id,
        payment_type='Out'
    )
    
    if start_date:
        payments_query = payments_query.filter(Payment.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        payments_query = payments_query.filter(Payment.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    
    payments = payments_query.order_by(Payment.date.asc(), Payment.id.asc()).all()
    
    expenses_query = GeneralExpense.query.filter_by(market_id=market_id)
    
    if start_date:
        expenses_query = expenses_query.filter(GeneralExpense.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        expenses_query = expenses_query.filter(GeneralExpense.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    
    expenses = expenses_query.order_by(GeneralExpense.date.asc(), GeneralExpense.id.asc()).all()
    
    # Build export data
    export_data = []
    
    for payment in payments:
        amount_base = payment.amount_base_currency_stored if payment.amount_base_currency_stored else payment.amount * payment.exchange_rate
        export_data.append({
            'Date': payment.date.isoformat(),
            'Type': 'Payment',
            'Description/Company': payment.company.name if payment.company else 'Unknown',
            'Category': 'Loan' if payment.loan else payment.company.category if payment.company else 'Unknown',
            'Invoice Number': payment.sale.invoice_number if payment.sale else '',
            'Amount': float(payment.amount),
            'Currency': payment.currency,
            'Exchange Rate': float(payment.exchange_rate),
            'Amount (Base Currency)': float(amount_base),
            'Notes': payment.notes or ''
        })
    
    for expense in expenses:
        amount_base = expense.amount_base_currency
        export_data.append({
            'Date': expense.date.isoformat(),
            'Type': 'Expense',
            'Description/Company': expense.description,
            'Category': expense.category,
            'Invoice Number': '',
            'Amount': float(expense.amount),
            'Currency': expense.currency,
            'Exchange Rate': float(expense.exchange_rate),
            'Amount (Base Currency)': float(amount_base),
            'Notes': ''
        })
    
    # Sort by date
    export_data.sort(key=lambda x: (x['Date'], x.get('ID', 0)))
    
    # Create Excel file
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df = pd.DataFrame(export_data)
        df.to_excel(writer, index=False, sheet_name='Safe Out Report')
        
        # Auto-adjust column widths
        worksheet = writer.sheets['Safe Out Report']
        for idx, col in enumerate(df.columns):
            max_length = max(
                df[col].astype(str).apply(len).max(),
                len(str(col))
            )
            worksheet.column_dimensions[get_column_letter(idx + 1)].width = min(max_length + 2, 50)
    
    output.seek(0)
    filename = f'safe_out_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx'
    return send_file(output, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                     as_attachment=True, download_name=filename)
