"""Quick script to list all markets"""
from app import app, db
from models import Market

with app.app_context():
    markets = Market.query.all()
    print("Available Markets:")
    print("-" * 50)
    for market in markets:
        print(f"ID: {market.id}, Name: '{market.name}', Method: {market.calculation_method}")
