"""
Supplier returns (goods sent back to supplier) — stock, FIFO batches, supplier payable.
"""
from collections import defaultdict
from io import BytesIO

import pandas as pd
from flask import Blueprint, request, jsonify, session, send_file
from flask_login import login_required
from sqlalchemy import func
from sqlalchemy.orm import joinedload
from decimal import Decimal
from datetime import datetime

from models import db, SupplierReturn, SupplierReturnLine, SupplierReturnAllocation, Company, Item, Market
from api.reports import _available_quantity_map_for_item_ids
from api.fifo_calculations import apply_supplier_return_fifo, restore_supplier_return_batches
from openpyxl.utils import get_column_letter

bp = Blueprint('supplier_returns', __name__)


def _serialize_return(r):
    return {
        'id': r.id,
        'supplier_id': r.supplier_id,
        'supplier_name': r.supplier.name if r.supplier else None,
        'date': r.date.isoformat(),
        'reference_number': r.reference_number or '',
        'currency': r.currency,
        'exchange_rate': float(r.exchange_rate),
        'notes': r.notes or '',
        'total_amount': float(sum(Decimal(str(l.total_price)) for l in r.lines)),
        'lines': [
            {
                'id': l.id,
                'item_id': l.item_id,
                'item_code': l.item.code if l.item else None,
                'item_name': l.item.name if l.item else None,
                'quantity': float(l.quantity),
                'unit_price': float(l.unit_price),
                'total_price': float(l.total_price),
            }
            for l in r.lines
        ],
    }


def _make_parsed_lines(market_id, supplier_id, lines_in):
    """
    Build parsed line dicts (with Item ORM); check stock.
    Returns (parsed_lines, None) or (None, error_message).
    """
    parsed_lines = []
    item_ids = []
    for i, row in enumerate(lines_in):
        item_id = row.get('item_id')
        if not item_id:
            return None, f'Line {i + 1}: item_id required'
        item = Item.query.filter_by(id=item_id, market_id=market_id).first()
        if not item:
            return None, f'Line {i + 1}: item not found'
        if item.supplier_id != supplier_id:
            return None, f'Line {i + 1}: item {item.code} does not belong to this supplier'
        qty = Decimal(str(row['quantity']))
        if qty <= 0:
            return None, f'Line {i + 1}: quantity must be positive'
        unit_price = Decimal(str(row.get('unit_price', 0)))
        if unit_price < 0:
            return None, f'Line {i + 1}: unit_price invalid'
        if 'total_price' in row and row['total_price'] is not None:
            total_price = Decimal(str(row['total_price']))
        else:
            total_price = (qty * unit_price).quantize(Decimal('0.01'))
        parsed_lines.append({
            'item': item,
            'quantity': qty,
            'unit_price': unit_price,
            'total_price': total_price,
        })
        item_ids.append(item_id)

    avail = _available_quantity_map_for_item_ids(market_id, list(set(item_ids)))
    for pl in parsed_lines:
        iid = pl['item'].id
        if Decimal(str(avail.get(iid, 0))) < pl['quantity']:
            return None, (
                f'Insufficient stock for {pl["item"].code}: available {avail.get(iid, 0)}, return {pl["quantity"]}'
            )
    return parsed_lines, None


def _coalesce_return_lines(lines_in):
    """Merge duplicate item_id rows (sum quantity and line total; unit price from total/qty)."""
    if not lines_in:
        return []
    agg = defaultdict(lambda: {'quantity': Decimal('0'), 'total_price': Decimal('0')})
    for row in lines_in:
        iid = row.get('item_id')
        if not iid:
            continue
        qty = Decimal(str(row['quantity']))
        if qty <= 0:
            continue
        if 'total_price' in row and row['total_price'] is not None:
            tp = Decimal(str(row['total_price']))
        else:
            up = Decimal(str(row.get('unit_price', 0)))
            tp = (qty * up).quantize(Decimal('0.01'))
        agg[iid]['quantity'] += qty
        agg[iid]['total_price'] += tp
    out = []
    for iid, v in agg.items():
        q = v['quantity']
        tp = v['total_price'].quantize(Decimal('0.01'))
        up = (tp / q).quantize(Decimal('0.0001')) if q else Decimal('0')
        out.append({'item_id': iid, 'quantity': q, 'unit_price': up, 'total_price': tp})
    return out


def _append_lines_to_return(market_id, supplier_return_id, parsed_lines):
    """Add line rows + FIFO allocations to an existing return. Does not commit."""
    market = Market.query.get(market_id)
    use_fifo = market and getattr(market, 'calculation_method', 'Average') == 'FIFO'
    for pl in parsed_lines:
        line = SupplierReturnLine(
            supplier_return_id=supplier_return_id,
            item_id=pl['item'].id,
            quantity=pl['quantity'],
            unit_price=pl['unit_price'],
            total_price=pl['total_price'],
        )
        db.session.add(line)
        db.session.flush()
        if use_fifo:
            slices = apply_supplier_return_fifo(market_id, pl['item'].id, pl['quantity'])
            for sl in slices:
                db.session.add(SupplierReturnAllocation(
                    supplier_return_line_id=line.id,
                    batch_id=sl['batch_id'],
                    quantity=sl['quantity'],
                ))


def _persist_supplier_return(market_id, supplier, ret_date, ref, notes, exchange_rate, parsed_lines):
    """Create SupplierReturn + lines + FIFO allocations. Commits on success."""
    ret = SupplierReturn(
        market_id=market_id,
        supplier_id=supplier.id,
        date=ret_date,
        reference_number=ref,
        currency=supplier.currency,
        exchange_rate=Decimal(str(exchange_rate)),
        notes=notes or '',
    )
    db.session.add(ret)
    db.session.flush()
    _append_lines_to_return(market_id, ret.id, parsed_lines)
    db.session.commit()

    return SupplierReturn.query.options(
        joinedload(SupplierReturn.supplier),
        joinedload(SupplierReturn.lines).joinedload(SupplierReturnLine.item),
    ).get(ret.id)


@bp.route('', methods=['GET'])
@login_required
def list_returns():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    supplier_id = request.args.get('supplier_id', type=int)
    q = SupplierReturn.query.options(
        joinedload(SupplierReturn.supplier),
        joinedload(SupplierReturn.lines).joinedload(SupplierReturnLine.item),
    ).filter_by(market_id=market_id)
    if supplier_id:
        q = q.filter_by(supplier_id=supplier_id)
    rows = q.order_by(SupplierReturn.date.desc(), SupplierReturn.id.desc()).all()
    return jsonify([_serialize_return(r) for r in rows])


@bp.route('/<int:return_id>', methods=['GET'])
@login_required
def get_return(return_id):
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    r = SupplierReturn.query.options(
        joinedload(SupplierReturn.supplier),
        joinedload(SupplierReturn.lines).joinedload(SupplierReturnLine.item),
    ).filter_by(id=return_id, market_id=market_id).first()
    if not r:
        return jsonify({'error': 'Return not found'}), 404
    return jsonify(_serialize_return(r))


@bp.route('', methods=['POST'])
@login_required
def create_return():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data'}), 400
    supplier_id = data.get('supplier_id')
    if not supplier_id:
        return jsonify({'error': 'supplier_id is required'}), 400
    supplier = Company.query.filter_by(id=supplier_id, market_id=market_id, category='Supplier').first()
    if not supplier:
        return jsonify({'error': 'Supplier not found'}), 404
    lines_in = _coalesce_return_lines(data.get('lines') or [])
    if not lines_in:
        return jsonify({'error': 'At least one line is required'}), 400
    try:
        ret_date = datetime.strptime(data['date'], '%Y-%m-%d').date() if data.get('date') else datetime.utcnow().date()
    except ValueError:
        return jsonify({'error': 'Invalid date. Use YYYY-MM-DD'}), 400

    parsed_lines, err = _make_parsed_lines(market_id, supplier_id, lines_in)
    if err:
        return jsonify({'error': err}), 400

    ref = (data.get('reference_number') or '').strip() or None
    try:
        r = _persist_supplier_return(
            market_id, supplier, ret_date, ref,
            data.get('notes') or '',
            data.get('exchange_rate', 1),
            parsed_lines,
        )
    except ValueError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

    return jsonify(_serialize_return(r)), 201


@bp.route('/<int:return_id>', methods=['PUT'])
@login_required
def update_return(return_id):
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data'}), 400

    r = SupplierReturn.query.options(
        joinedload(SupplierReturn.lines).joinedload(SupplierReturnLine.allocations),
    ).filter_by(id=return_id, market_id=market_id).first()
    if not r:
        return jsonify({'error': 'Return not found'}), 404

    lines_in = _coalesce_return_lines(data.get('lines') or [])
    if not lines_in:
        return jsonify({'error': 'At least one line is required'}), 400
    try:
        ret_date = datetime.strptime(data['date'], '%Y-%m-%d').date() if data.get('date') else r.date
    except ValueError:
        return jsonify({'error': 'Invalid date. Use YYYY-MM-DD'}), 400

    try:
        for line in list(r.lines):
            restore_supplier_return_batches(line.allocations)
        for line in list(r.lines):
            db.session.delete(line)
        db.session.flush()

        parsed_lines, err = _make_parsed_lines(market_id, r.supplier_id, lines_in)
        if err:
            db.session.rollback()
            return jsonify({'error': err}), 400

        r.date = ret_date
        r.reference_number = (data.get('reference_number') or '').strip() or None
        r.notes = data.get('notes') or ''
        r.exchange_rate = Decimal(str(data.get('exchange_rate', r.exchange_rate)))

        _append_lines_to_return(market_id, r.id, parsed_lines)
        db.session.commit()
    except ValueError as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

    out = SupplierReturn.query.options(
        joinedload(SupplierReturn.supplier),
        joinedload(SupplierReturn.lines).joinedload(SupplierReturnLine.item),
    ).get(r.id)
    return jsonify(_serialize_return(out))


def _normalize_excel_columns(df):
    """Map flexible header names to canonical keys."""
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]
    cmap = {}
    for c in df.columns:
        lc = c.lower().replace(' ', '')
        if lc in ('supplier', 'company', 'suppliername'):
            cmap[c] = 'Supplier'
        elif lc == 'date':
            cmap[c] = 'Date'
        elif lc in ('reference', 'ref', 'referenceno'):
            cmap[c] = 'Reference'
        elif lc == 'notes':
            cmap[c] = 'Notes'
        elif lc in ('itemcode', 'code', 'item_code', 'sku'):
            cmap[c] = 'ItemCode'
        elif lc in ('quantity', 'qty'):
            cmap[c] = 'Quantity'
        elif lc in ('unitprice', 'price'):
            cmap[c] = 'UnitPrice'
        elif lc in ('totalprice', 'linetotal', 'amount', 'total'):
            cmap[c] = 'TotalPrice'
    df = df.rename(columns=cmap)
    return df


@bp.route('/import', methods=['POST'])
@login_required
def import_returns_excel():
    """Excel: rows grouped into returns by Supplier + Date + Reference. Required columns: Supplier, Date, ItemCode, Quantity, and UnitPrice or TotalPrice."""
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    file = request.files['file']
    if not file or file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    if not (file.filename.endswith('.xlsx') or file.filename.endswith('.xls')):
        return jsonify({'error': 'Use .xlsx or .xls'}), 400

    try:
        if file.filename.endswith('.xlsx'):
            df = pd.read_excel(file, engine='openpyxl')
        else:
            df = pd.read_excel(file)
    except Exception as e:
        return jsonify({'error': f'Could not read Excel: {e}'}), 400

    if df.empty:
        return jsonify({'error': 'Excel file is empty'}), 400

    df = _normalize_excel_columns(df)
    required = ['Supplier', 'Date', 'ItemCode', 'Quantity']
    miss = [c for c in required if c not in df.columns]
    if miss:
        return jsonify({'error': f'Missing columns: {", ".join(miss)}. Found: {", ".join(df.columns.tolist())}'}), 400
    if 'UnitPrice' not in df.columns and 'TotalPrice' not in df.columns:
        return jsonify({'error': 'Need UnitPrice and/or TotalPrice column'}), 400

    suppliers = Company.query.filter_by(market_id=market_id, category='Supplier').all()
    sup_by_lower = {s.name.strip().lower(): s for s in suppliers}

    errors = []
    returns_created = 0
    created = []

    groups = {}
    for idx, row in df.iterrows():
        excel_row = int(idx) + 2
        if pd.isna(row.get('Supplier')) or str(row['Supplier']).strip() == '':
            errors.append(f'Row {excel_row}: Supplier required')
            continue
        sup_raw = str(row['Supplier']).strip()
        sup_k = sup_raw.lower()
        dtv = pd.to_datetime(row['Date'], errors='coerce')
        if pd.isna(dtv):
            errors.append(f'Row {excel_row}: Date invalid')
            continue
        ret_date = dtv.date()
        ref = ''
        if 'Reference' in df.columns and pd.notna(row.get('Reference')):
            ref = str(row['Reference']).strip()
        key = (sup_k, ret_date, ref)
        groups.setdefault(key, []).append((excel_row, row, sup_raw))

    for key, row_pack in groups.items():
        supplier_key, ret_date, ref_str = key
        supplier = sup_by_lower.get(supplier_key)
        if not supplier:
            errors.append(f'Supplier not found: "{row_pack[0][2]}"')
            continue

        lines_payload = []
        notes_parts = []
        row_errors = []

        for excel_row, row, _sup_raw in row_pack:
            code = str(row['ItemCode']).strip() if pd.notna(row['ItemCode']) else ''
            if not code or code.lower() == 'nan':
                row_errors.append(f'Row {excel_row}: empty ItemCode')
                continue

            item = Item.query.filter_by(market_id=market_id).filter(
                func.lower(Item.code) == code.lower()
            ).first()
            if not item:
                row_errors.append(f'Row {excel_row}: item code "{code}" not found')
                continue
            if item.supplier_id != supplier.id:
                row_errors.append(f'Row {excel_row}: item "{code}" is not for this supplier')
                continue

            try:
                qty = Decimal(str(row['Quantity']))
            except Exception:
                row_errors.append(f'Row {excel_row}: bad Quantity')
                continue
            if qty <= 0:
                row_errors.append(f'Row {excel_row}: quantity must be positive')
                continue

            unit_price = None
            total_price = None
            if 'UnitPrice' in df.columns and pd.notna(row.get('UnitPrice')):
                try:
                    unit_price = Decimal(str(row['UnitPrice']))
                except Exception:
                    row_errors.append(f'Row {excel_row}: bad UnitPrice')
                    continue
            if 'TotalPrice' in df.columns and pd.notna(row.get('TotalPrice')):
                try:
                    total_price = Decimal(str(row['TotalPrice']))
                except Exception:
                    row_errors.append(f'Row {excel_row}: bad TotalPrice')
                    continue

            if total_price is not None and total_price >= 0:
                if unit_price is None or unit_price == 0:
                    unit_price = (total_price / qty).quantize(Decimal('0.0001')) if qty else Decimal('0')
            elif unit_price is not None:
                total_price = (qty * unit_price).quantize(Decimal('0.01'))
            else:
                row_errors.append(f'Row {excel_row}: need UnitPrice or TotalPrice')
                continue

            if unit_price < 0:
                row_errors.append(f'Row {excel_row}: unit price invalid')
                continue

            line_obj = {'item_id': item.id, 'quantity': qty, 'unit_price': unit_price, 'total_price': total_price}
            lines_payload.append(line_obj)

            if 'Notes' in df.columns and pd.notna(row.get('Notes')):
                n = str(row['Notes']).strip()
                if n and n.lower() != 'nan' and n not in notes_parts:
                    notes_parts.append(n)

        if row_errors:
            errors.extend(row_errors)
            continue
        if not lines_payload:
            errors.append(f'Group {supplier.name} {ret_date}: no valid lines')
            continue

        merged_by_item = defaultdict(lambda: {'quantity': Decimal('0'), 'total_price': Decimal('0')})
        for lp in lines_payload:
            mid = lp['item_id']
            merged_by_item[mid]['quantity'] += lp['quantity']
            merged_by_item[mid]['total_price'] += lp['total_price']
        merged_lines = []
        for mid, agg in merged_by_item.items():
            q = agg['quantity']
            tp = agg['total_price'].quantize(Decimal('0.01'))
            up = (tp / q).quantize(Decimal('0.0001')) if q else Decimal('0')
            merged_lines.append({
                'item_id': mid,
                'quantity': q,
                'unit_price': up,
                'total_price': tp,
            })

        parsed_lines, err = _make_parsed_lines(market_id, supplier.id, merged_lines)
        if err:
            errors.append(f'{supplier.name} {ret_date} {ref_str}: {err}')
            continue

        ref = ref_str if ref_str else None
        notes_combined = ' | '.join(notes_parts) if notes_parts else ''

        try:
            r = _persist_supplier_return(
                market_id, supplier, ret_date, ref, notes_combined,
                1,
                parsed_lines,
            )
            returns_created += 1
            created.append({'id': r.id, 'supplier': supplier.name, 'date': r.date.isoformat(), 'reference': ref or ''})
        except ValueError as e:
            errors.append(f'{supplier.name} {ret_date}: {e}')
            db.session.rollback()
        except Exception as e:
            errors.append(f'{supplier.name} {ret_date}: {e}')
            db.session.rollback()

    return jsonify({
        'success': True,
        'returns_created': returns_created,
        'created': created,
        'errors': errors,
    })


@bp.route('/import/template', methods=['GET'])
@login_required
def download_import_template():
    """Sample Excel layout for supplier return import."""
    rows = [{
        'Supplier': 'Example Supplier Ltd',
        'Date': datetime.utcnow().date().isoformat(),
        'Reference': 'RET-001',
        'Notes': 'Damaged lot',
        'ItemCode': 'ITEM-001',
        'Quantity': 10,
        'UnitPrice': 5.50,
        'TotalPrice': 55.00,
    }]
    out = BytesIO()
    df = pd.DataFrame(rows)
    with pd.ExcelWriter(out, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Returns')
        ws = writer.sheets['Returns']
        for i, col in enumerate(df.columns):
            max_len = max(df[col].astype(str).map(len).max(), len(col)) + 2
            ws.column_dimensions[get_column_letter(i + 1)].width = min(max_len, 40)
    out.seek(0)
    return send_file(
        out,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name='supplier_returns_import_template.xlsx',
    )


@bp.route('/<int:return_id>', methods=['DELETE'])
@login_required
def delete_return(return_id):
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    r = SupplierReturn.query.options(
        joinedload(SupplierReturn.lines).joinedload(SupplierReturnLine.allocations),
    ).filter_by(id=return_id, market_id=market_id).first()
    if not r:
        return jsonify({'error': 'Return not found'}), 404
    try:
        for line in r.lines:
            restore_supplier_return_batches(line.allocations)
        db.session.delete(r)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400
    return jsonify({'success': True})
