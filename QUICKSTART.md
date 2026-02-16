# Quick Start Guide

## First Time Setup

1. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

2. **Run the Application**
   ```bash
   python run.py
   ```
   Or:
   ```bash
   python app.py
   ```

3. **Login**
   - Open browser: http://localhost:5000
   - Username: `admin`
   - Password: `admin123`

4. **Create Your First Market**
   - After login, if no market exists, you'll be redirected to "Switch Market"
   - Use the browser console or API to create a market:
     ```javascript
     fetch('/api/markets', {
         method: 'POST',
         headers: {'Content-Type': 'application/json'},
         body: JSON.stringify({
             name: 'POINTE NOIRE (JAMIL)',
             address: 'Pointe Noire, Republic of Congo',
             base_currency: 'FCFA'
         })
     })
     ```
   - Or run the test data generator which creates a market automatically

5. **Generate Test Data (Optional)**
   ```bash
   python generate_test_data.py
   ```
   This creates:
   - 1 market
   - 4 suppliers
   - 2 service companies
   - 4 customers
   - 8 items
   - 1 year of purchase containers
   - 1 year of sales
   - Payments and safe transactions

## Basic Workflow

### 1. Setup Companies
- Go to **Companies** page
- Add Suppliers (companies you buy from)
- Add Customers (companies you sell to)
- Add Service Companies (customs, logistics, etc.)

### 2. Setup Items
- Go to **Items** page
- Add items manually or import from Excel
- Required: Code, Name, Weight
- Optional: Grade, Category1, Category2

### 3. Record Purchases
- Go to **Purchases** page
- Add a container/truck
- Enter supplier, currency, exchange rate
- Add items with quantities and prices

### 4. Record Sales
- Go to **Sales** page
- Click "+ Add Sale"
- Select customer and date
- Add items with quantities and prices
- Invoice number is auto-generated
- Cash sales automatically go to Safe
- Credit sales create receivables

### 5. Record Payments
- Go to **Payments** page
- Record payments received from customers
- Record payments made to suppliers
- Payments automatically update balances

### 6. View Reports
- Go to **Reports** page
- View Profit & Loss
- View Inventory movements
- View Receivables and Payables
- View Safe movement

## Key Features

- **Multi-Market**: Switch between markets using the dropdown in top navigation
- **Multi-Currency**: Each company has its own currency, exchange rates applied automatically
- **Container-Based Purchases**: Track purchases by container with exchange rates
- **Fast Sales Entry**: Quick entry with auto-calculations
- **Automatic Safe Tracking**: Cash sales and payments automatically update safe balance
- **Comprehensive Reports**: All major accounting reports available

## Troubleshooting

### Database Issues
- Delete `accounting.db` and restart to reset database
- Run `python app.py` to recreate database structure

### No Market Selected
- Create a market using the API or test data generator
- Or manually insert into database

### Login Issues
- Default credentials: admin / admin123
- To reset, delete database and restart

## Next Steps

- Customize the UI colors and branding
- Add more report types
- Implement Excel export (requires additional library)
- Add user roles and permissions
- Set up production database (PostgreSQL/MySQL)
- Add backup and recovery procedures

