"""
Export local accounting database to JSON for migration to deployed app.
Run locally: python scripts/export_data.py
Output: data_export.json (upload this to your deployed app via Administration > Import Data)
"""
import sqlite3
import json
import os
from datetime import date, datetime
from decimal import Decimal

# Find the database - Flask uses instance/accounting.db
DB_PATHS = [
    'instance/accounting.db',
    'accounting.db',
    os.path.join(os.path.dirname(__file__), '..', 'instance', 'accounting.db'),
]

def get_db_path():
    for path in DB_PATHS:
        if os.path.exists(path):
            return path
    raise FileNotFoundError("Could not find accounting.db. Run the app first to create it.")

def convert_value(val):
    if val is None:
        return None
    if isinstance(val, (date, datetime)):
        return val.isoformat()
    if isinstance(val, Decimal):
        return float(val)
    if isinstance(val, bytes):
        return val.decode('utf-8', errors='replace')
    return val

def export_table(conn, table_name):
    cursor = conn.execute(f"SELECT * FROM {table_name}")
    columns = [d[0] for d in cursor.description]
    rows = []
    for row in cursor.fetchall():
        rows.append(dict(zip(columns, [convert_value(v) for v in row])))
    return rows

def main():
    db_path = get_db_path()
    print(f"Exporting from {db_path}...")
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    
    tables = [
        'markets', 'companies', 'items', 'purchase_containers', 'purchase_items',
        'sales', 'sale_items', 'payments', 'general_expenses', 'safe_transactions',
        'safe_statement_real_balances', 'inventory_adjustments', 'inventory_batches',
        'sale_item_allocations'
    ]
    
    data = {}
    for table in tables:
        try:
            rows = export_table(conn, table)
            data[table] = rows
            print(f"  {table}: {len(rows)} rows")
        except sqlite3.OperationalError as e:
            print(f"  {table}: skipped ({e})")
            data[table] = []
    
    conn.close()
    
    out_path = 'data_export.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"\nExported to {out_path}")
    print("Next: Go to your deployed app > Administration > Import Data")
    print("      Upload this file to load your data.")

if __name__ == '__main__':
    main()
