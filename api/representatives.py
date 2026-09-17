"""
Purchasing representatives (optional collectors) — per current market only.
Does not post safe transactions; payments remain normal cash purchase payments.
"""
from flask import Blueprint, request, jsonify, session
from flask_login import login_required
from models import db, PurchasingRepresentative, PurchaseContainer
from datetime import datetime

bp = Blueprint('representatives', __name__)


def _rep_to_dict(rep):
    return {
        'id': rep.id,
        'name': rep.name,
        'is_active': bool(rep.is_active),
        'created_at': rep.created_at.isoformat() if rep.created_at else None,
        'updated_at': rep.updated_at.isoformat() if rep.updated_at else None,
    }


@bp.route('', methods=['GET'])
@login_required
def list_representatives():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    active_only = request.args.get('active_only', 'false').lower() in ('1', 'true', 'yes')
    q = PurchasingRepresentative.query.filter_by(market_id=market_id)
    if active_only:
        q = q.filter_by(is_active=True)
    rows = q.order_by(PurchasingRepresentative.name.asc()).all()
    return jsonify({'representatives': [_rep_to_dict(r) for r in rows]})


@bp.route('', methods=['POST'])
@login_required
def create_representative():
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    data = request.json or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Name is required'}), 400
    rep = PurchasingRepresentative(
        market_id=market_id,
        name=name,
        is_active=bool(data.get('is_active', True)),
    )
    db.session.add(rep)
    db.session.commit()
    return jsonify(_rep_to_dict(rep)), 201


@bp.route('/<int:rep_id>', methods=['PUT'])
@login_required
def update_representative(rep_id):
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    rep = PurchasingRepresentative.query.filter_by(id=rep_id, market_id=market_id).first()
    if not rep:
        return jsonify({'error': 'Representative not found'}), 404
    data = request.json or {}
    if 'name' in data:
        name = (data.get('name') or '').strip()
        if not name:
            return jsonify({'error': 'Name is required'}), 400
        rep.name = name
    if 'is_active' in data:
        rep.is_active = bool(data.get('is_active'))
    rep.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify(_rep_to_dict(rep))


@bp.route('/<int:rep_id>', methods=['DELETE'])
@login_required
def delete_representative(rep_id):
    market_id = session.get('current_market_id')
    if not market_id:
        return jsonify({'error': 'No market selected'}), 400
    rep = PurchasingRepresentative.query.filter_by(id=rep_id, market_id=market_id).first()
    if not rep:
        return jsonify({'error': 'Representative not found'}), 404
    linked = PurchaseContainer.query.filter_by(market_id=market_id, representative_id=rep.id).count()
    if linked:
        return jsonify({
            'error': f'Cannot delete: {linked} purchase container(s) are tagged to this representative. Deactivate instead.'
        }), 400
    db.session.delete(rep)
    db.session.commit()
    return jsonify({'success': True})
