"""
Script to fix FIFO allocations by running backfill_fifo_allocations
This will:
1. Reset all batches to original quantities
2. Delete old allocations
3. Re-allocate all sales chronologically
4. Update batch available_quantity correctly
"""

from app import app, db
from models import Market
from api.fifo_calculations import backfill_fifo_batches, backfill_fifo_allocations

def fix_fifo_allocations(market_name=None, market_id=None):
    """Fix FIFO allocations for a specific market"""
    
    with app.app_context():
        # Find market
        if market_id:
            market = Market.query.get(market_id)
        elif market_name:
            market = Market.query.filter_by(name=market_name).first()
        else:
            print("Error: Please provide either market_name or market_id")
            return
        
        if not market:
            print(f"Error: Market not found")
            return
        
        print("=" * 80)
        print(f"FIXING FIFO ALLOCATIONS FOR MARKET: {market.name} (ID: {market.id})")
        print(f"Calculation Method: {market.calculation_method}")
        print("=" * 80)
        print()
        
        if market.calculation_method != 'FIFO':
            print(f"[ERROR] Market is not using FIFO method. Current method: {market.calculation_method}")
            print("Please switch to FIFO method first.")
            return
        
        # Step 1: Ensure batches exist for all purchases
        print("Step 1: Checking/creating batches for all purchases...")
        try:
            created_count = backfill_fifo_batches(market.id)
            print(f"[OK] Created {created_count} new batches (or batches already existed)")
        except Exception as e:
            print(f"[ERROR] Failed to create batches: {e}")
            import traceback
            traceback.print_exc()
            return
        
        print()
        
        # Step 2: Recalculate all allocations
        print("Step 2: Recalculating FIFO allocations...")
        print("This will:")
        print("  - Reset all batch available_quantity to original_quantity")
        print("  - Delete all existing allocations")
        print("  - Re-allocate all sales chronologically")
        print("  - Update batch available_quantity correctly")
        print()
        
        try:
            allocated_count = backfill_fifo_allocations(market.id)
            print(f"[OK] Successfully allocated {allocated_count} sale items to batches")
        except Exception as e:
            print(f"[ERROR] Failed to recalculate allocations: {e}")
            import traceback
            traceback.print_exc()
            return
        
        print()
        print("=" * 80)
        print("FIX COMPLETE!")
        print("=" * 80)
        print()
        print("Please run the diagnostic script again to verify the fix:")
        print(f'  python diagnose_fifo_allocations.py "{market.name}"')
        print()

if __name__ == '__main__':
    import sys
    
    if len(sys.argv) > 1:
        # Try as market name first
        market_name = sys.argv[1]
        fix_fifo_allocations(market_name=market_name)
    else:
        # Default: fix Tanzania (Yasser) market
        fix_fifo_allocations(market_name='TANZANYA ( YASSER ) ')
