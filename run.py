"""
Simple script to run the application
"""
from app import app

if __name__ == '__main__':
    print("=" * 60)
    print("SARI TEXTILE WAREHOUSES ACCOUNTING SYSTEM")
    print("=" * 60)
    print("\nStarting server...")
    print("Access the application at: http://localhost:5000")
    print("Default login: admin / admin123")
    print("\nTo generate test data, run: python generate_test_data.py")
    print("=" * 60)
    print()
    
    app.run(debug=True, host='0.0.0.0', port=5000)

