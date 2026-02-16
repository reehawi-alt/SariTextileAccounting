# SARI TEXTILE WAREHOUSES ACCOUNTING SYSTEM

A comprehensive web-based accounting software for global multi-market used clothes wholesale business, designed for managing sales by bales and big bales across multiple countries and currencies.

## Features

### Core Functionality
- **Multi-Market System**: Support for multiple independent markets with data isolation
- **Companies Management**: Manage suppliers, service companies, and customers (cash/credit)
- **Inventory Management**: Complete item master data with Excel import capability
- **Container-Based Purchases**: Track purchases by container/truck with exchange rate management
- **Sales Management**: Fast entry sales system with cash and credit support
- **Payment Processing**: Record payments from customers and to suppliers
- **Safe/Cashflow Management**: Track cash movements and balances
- **Multi-Currency Support**: Automatic currency conversion with exchange rates
- **Comprehensive Reports**: Profit & loss, inventory, receivables, payables, and more

### Technical Stack
- **Backend**: Python with Flask
- **Frontend**: HTML, CSS, JavaScript
- **Database**: SQLite (can be easily switched to PostgreSQL/MySQL)
- **Architecture**: Clean MVC pattern with RESTful API

## Installation

### Prerequisites
- Python 3.8 or higher
- pip (Python package manager)

### Setup Steps

1. **Clone or download the project**

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Initialize the database**:
   ```bash
   python app.py
   ```
   This will create the database and set up the default admin user.

4. **Generate test data (optional)**:
   ```bash
   python generate_test_data.py
   ```
   This will create one year of realistic test data including:
   - Multiple suppliers and customers
   - Purchase containers
   - Sales transactions
   - Payments
   - Safe transactions

5. **Run the application**:
   ```bash
   python app.py
   ```

6. **Access the application**:
   - Open your browser and navigate to: `http://localhost:5000`
   - Default login credentials:
     - Username: `admin`
     - Password: `admin123`

## Project Structure

```
.
├── app.py                 # Main Flask application
├── models.py              # Database models
├── requirements.txt       # Python dependencies
├── generate_test_data.py  # Test data generator
├── api/                   # API blueprints
│   ├── companies.py
│   ├── items.py
│   ├── purchases.py
│   ├── sales.py
│   ├── payments.py
│   ├── safe.py
│   └── reports.py
├── templates/             # HTML templates
│   ├── base.html
│   ├── login.html
│   ├── dashboard.html
│   ├── companies.html
│   ├── items.html
│   ├── purchases.html
│   ├── sales.html
│   ├── payments.html
│   ├── reports.html
│   └── ...
└── static/                # Static files
    ├── css/
    │   └── style.css
    └── js/
        ├── main.js
        ├── sales.js
        ├── companies.js
        ├── items.js
        └── ...
```

## Usage Guide

### Markets
- Each market operates independently
- Switch between markets using the market selector in the top navigation
- All data is isolated per market

### Companies
- **Suppliers**: Companies you purchase from
- **Service Companies**: Customs clearing, logistics, etc.
- **Customers**: Companies you sell to (Cash or Credit)

### Items
- Create item master data with code, name, weight, and optional categories
- Import items from Excel (columns: Code, Name, Weight, Grade, Category1, Category2)
- Items can only be deleted if they have no transactions

### Purchases
- Every purchase is linked to a container/truck
- Enter exchange rate once per container
- Multiple items per container with different prices
- Exchange rate automatically applied to all calculations

### Sales
- Fast entry with keyboard shortcuts
- Auto-generated invoice numbers (SAL-YYYYMMDD-XXX)
- Cash sales automatically recorded in safe
- Credit sales tracked as receivables

### Payments
- Record payments received from customers
- Record payments made to suppliers
- Automatically updates sale balances and safe

### Reports
- **Profit & Loss**: Analyze profit by item and period
- **Inventory**: Stock movement and valuation
- **Receivables**: Outstanding customer balances
- **Payables**: Outstanding supplier balances
- **Safe Movement**: Cash flow and balance tracking

## Database Schema

### Key Tables
- `markets`: Market/company information
- `companies`: Suppliers, service companies, customers
- `items`: Item master data
- `purchase_containers`: Container-based purchases
- `purchase_items`: Items within containers
- `sales`: Sales invoices
- `sale_items`: Items in sales
- `payments`: Payment transactions
- `safe_transactions`: Cash flow tracking

## Security Notes

⚠️ **Important**: This is a development version. For production use:
1. Change the `SECRET_KEY` in `app.py`
2. Use a production-grade database (PostgreSQL/MySQL)
3. Implement proper password hashing (already using Werkzeug)
4. Add HTTPS/SSL
5. Implement proper session management
6. Add input validation and sanitization
7. Implement rate limiting
8. Add backup and recovery procedures

## Development

### Adding New Features
- API endpoints go in `api/` directory as Flask blueprints
- Frontend pages go in `templates/` directory
- Static assets go in `static/` directory
- Database models go in `models.py`

### Database Migrations
Currently using SQLAlchemy with direct model creation. For production, consider using Flask-Migrate for proper migrations.

## Support

For issues, questions, or contributions, please refer to the project documentation or contact the development team.

## License

This software is provided as-is for use in the SARI TEXTILE WAREHOUSES accounting system.

---

**Version**: 1.0.0  
**Last Updated**: December 2024

