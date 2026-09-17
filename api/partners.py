"""
Market partners (profit share %) — per current market only.
Partner drawings post Outflow safe transactions (same pattern as general expenses).
"""
from flask import Blueprint, request, jsonify, session
from flask_login import login_required
from models import db, MarketPartner, PartnerDrawing, Market, SafeTransaction
from decimal import Decimal
from datetime import datetime

bp = Blueprint('partners', __name__)


def _partner_share_sum(market_id):
    rows = MarketPartner.query.filter_by(market_id=market_id).all()
    return sum(Decimal(str(p.share_percent)) for p in rows), len(rows)


def _drawing_to_dict(d):
    return {
        'id': d.id,
        'partner_id': d.partner_id,
        'partner_name': d.partner.name if d.partner else '',
        'date': d.date.isoformat(),
        'description': d.description,
        'amount': float(d.amount),
        'currency': d.currency,
        'exchange_rate': float(d.exchange_rate),
        'amount_base_currency': float(d.amount_base_currency),
    }


@bp.route('/drawings', methods=['GET'])
@login_required
def list_drawings():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    q = PartnerDrawing.query.filter_by(market_id=market_id).order_by(
        PartnerDrawing.date.desc(), PartnerDrawing.id.desc()
    )
    if start_date:
        q = q.filter(PartnerDrawing.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        q = q.filter(PartnerDrawing.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    rows = q.all()
    total_base = sum(Decimal(str(d.amount_base_currency)) for d in rows)
    return jsonify({
        'drawings': [_drawing_to_dict(d) for d in rows],
        'total_base_currency': float(total_base),
        'count': len(rows),
    })


@bp.route('/drawings', methods=['POST'])
@login_required
def create_drawing():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    data = request.json or {}
    partner_id = data.get('partner_id')
    if not partner_id:
        return jsonify({'error': 'partner_id is required'}), 400
    partner = MarketPartner.query.filter_by(id=int(partner_id), market_id=market_id).first()
    if not partner:
        return jsonify({'error': 'Partner not found'}), 404
    desc = (data.get('description') or '').strip() or 'Partner drawing'
    market = Market.query.get(market_id)
    amount = Decimal(str(data.get('amount', 0)))
    if amount <= 0:
        return jsonify({'error': 'Amount must be positive'}), 400
    currency = data.get('currency') or (market.base_currency if market else 'USD')
    ex = Decimal(str(data.get('exchange_rate', 1)))
    date_val = datetime.strptime(data['date'], '%Y-%m-%d').date() if data.get('date') else datetime.utcnow().date()

    drawing = PartnerDrawing(
        market_id=market_id,
        partner_id=partner.id,
        date=date_val,
        description=desc,
        amount=amount,
        currency=currency,
        exchange_rate=ex,
    )
    db.session.add(drawing)
    db.session.flush()

    last_transaction = SafeTransaction.query.filter_by(market_id=market_id).order_by(
        SafeTransaction.date.desc(), SafeTransaction.id.desc()
    ).first()
    balance_before = last_transaction.balance_after if last_transaction else Decimal('0')
    exact_base = drawing.amount * drawing.exchange_rate
    balance_after = balance_before - exact_base

    safe_transaction = SafeTransaction(
        market_id=market_id,
        transaction_type='Outflow',
        amount=drawing.amount,
        currency=drawing.currency,
        exchange_rate=drawing.exchange_rate,
        amount_base_currency_stored=exact_base,
        date=drawing.date,
        description=f'Partner drawing - {partner.name}: {drawing.description}',
        partner_drawing_id=drawing.id,
        balance_after=balance_after,
    )
    db.session.add(safe_transaction)
    db.session.commit()

    from api.safe import recalc_safe_balances
    recalc_safe_balances(market_id)

    return jsonify(_drawing_to_dict(drawing)), 201


@bp.route('/drawings/<int:drawing_id>', methods=['PUT'])
@login_required
def update_drawing(drawing_id):
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    d = PartnerDrawing.query.filter_by(id=drawing_id, market_id=market_id).first()
    if not d:
        return jsonify({'error': 'Drawing not found'}), 404
    data = request.json or {}

    if 'partner_id' in data:
        pid = int(data['partner_id'])
        partner = MarketPartner.query.filter_by(id=pid, market_id=market_id).first()
        if not partner:
            return jsonify({'error': 'Partner not found'}), 404
        d.partner_id = pid
    if 'date' in data:
        d.date = datetime.strptime(data['date'], '%Y-%m-%d').date()
    if 'description' in data:
        d.description = (data.get('description') or '').strip() or 'Partner drawing'
    if 'amount' in data:
        amt = Decimal(str(data['amount']))
        if amt <= 0:
            return jsonify({'error': 'Amount must be positive'}), 400
        d.amount = amt
    if 'currency' in data:
        d.currency = data['currency']
    if 'exchange_rate' in data:
        d.exchange_rate = Decimal(str(data['exchange_rate']))

    st = SafeTransaction.query.filter_by(partner_drawing_id=d.id).first()
    if st:
        exact_base = d.amount * d.exchange_rate
        st.amount = d.amount
        st.currency = d.currency
        st.exchange_rate = d.exchange_rate
        st.amount_base_currency_stored = exact_base
        st.date = d.date
        pname = d.partner.name if d.partner else ''
        st.description = f'Partner drawing - {pname}: {d.description}'

    db.session.commit()
    from api.safe import recalc_safe_balances
    recalc_safe_balances(market_id)
    return jsonify(_drawing_to_dict(d))


@bp.route('/drawings/<int:drawing_id>', methods=['DELETE'])
@login_required
def delete_drawing(drawing_id):
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    d = PartnerDrawing.query.filter_by(id=drawing_id, market_id=market_id).first()
    if not d:
        return jsonify({'error': 'Drawing not found'}), 404
    st = SafeTransaction.query.filter_by(partner_drawing_id=d.id).first()
    if st:
        db.session.delete(st)
    db.session.delete(d)
    db.session.commit()
    from api.safe import recalc_safe_balances
    recalc_safe_balances(market_id)
    return jsonify({'success': True})


@bp.route('', methods=['GET'])
@login_required
def list_partners():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    partners = MarketPartner.query.filter_by(market_id=market_id).order_by(MarketPartner.id).all()
    total_pct, _ = _partner_share_sum(market_id)
    return jsonify({
        'partners': [{
            'id': p.id,
            'name': p.name,
            'share_percent': float(p.share_percent),
        } for p in partners],
        'total_share_percent': float(total_pct),
        'shares_complete': abs(total_pct - Decimal('100')) <= Decimal('0.02'),
    })


@bp.route('', methods=['POST'])
@login_required
def create_partner():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    data = request.json or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Name is required'}), 400
    try:
        pct = Decimal(str(data.get('share_percent', 0)))
    except Exception:
        return jsonify({'error': 'Invalid share percentage'}), 400
    if pct < 0 or pct > 100:
        return jsonify({'error': 'Share must be between 0 and 100'}), 400
    p = MarketPartner(market_id=market_id, name=name, share_percent=pct)
    db.session.add(p)
    db.session.commit()
    total_pct, _ = _partner_share_sum(market_id)
    return jsonify({
        'id': p.id,
        'name': p.name,
        'share_percent': float(p.share_percent),
        'total_share_percent': float(total_pct),
        'shares_complete': abs(total_pct - Decimal('100')) <= Decimal('0.02'),
    }), 201


@bp.route('/<int:partner_id>', methods=['PUT'])
@login_required
def update_partner(partner_id):
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    p = MarketPartner.query.filter_by(id=partner_id, market_id=market_id).first()
    if not p:
        return jsonify({'error': 'Partner not found'}), 404
    data = request.json or {}
    if 'name' in data:
        name = (data.get('name') or '').strip()
        if not name:
            return jsonify({'error': 'Name is required'}), 400
        p.name = name
    if 'share_percent' in data:
        try:
            pct = Decimal(str(data['share_percent']))
        except Exception:
            return jsonify({'error': 'Invalid share percentage'}), 400
        if pct < 0 or pct > 100:
            return jsonify({'error': 'Share must be between 0 and 100'}), 400
        p.share_percent = pct
    db.session.commit()
    total_pct, _ = _partner_share_sum(market_id)
    return jsonify({
        'id': p.id,
        'name': p.name,
        'share_percent': float(p.share_percent),
        'total_share_percent': float(total_pct),
        'shares_complete': abs(total_pct - Decimal('100')) <= Decimal('0.02'),
    })


@bp.route('/<int:partner_id>', methods=['DELETE'])
@login_required
def delete_partner(partner_id):
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    p = MarketPartner.query.filter_by(id=partner_id, market_id=market_id).first()
    if not p:
        return jsonify({'error': 'Partner not found'}), 404
    if p.drawings:
        return jsonify({'error': 'Remove or reassign partner drawings before deleting this partner.'}), 400
    db.session.delete(p)
    db.session.commit()
    total_pct, _ = _partner_share_sum(market_id)
    return jsonify({
        'success': True,
        'total_share_percent': float(total_pct),
        'shares_complete': abs(total_pct - Decimal('100')) <= Decimal('0.02'),
    })
