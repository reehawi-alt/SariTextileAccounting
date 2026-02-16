// Reports page JavaScript

let currentReportType = null;
let currentItemId = null;
let currentItemCode = null;
let currentItemName = null;

document.addEventListener('DOMContentLoaded', function() {
    // Set default dates (last 10 days for general reports, 01/01/2020 for inventory movement)
    const today = new Date();
    const tenDaysAgo = new Date(today);
    tenDaysAgo.setDate(today.getDate() - 10);
    document.getElementById('reportStartDate').value = tenDaysAgo.toISOString().split('T')[0];
    document.getElementById('reportEndDate').value = today.toISOString().split('T')[0];
    
    // Set default start date for inventory movement report to 01/01/2020
    const inventoryStartDate = new Date('2020-01-01');
    // Store this for when inventory report is shown
    window.inventoryDefaultStartDate = inventoryStartDate.toISOString().split('T')[0];

    // If URL has params for inventory report and item_id, auto-open
    const params = new URLSearchParams(window.location.search);
    const reportParam = params.get('report');
    const itemParam = params.get('item_id');
    currentItemCode = params.get('item_code') ? decodeURIComponent(params.get('item_code')) : null;
    currentItemName = params.get('item_name') ? decodeURIComponent(params.get('item_name')) : null;
    if (reportParam === 'inventory' || itemParam) {
        currentItemId = itemParam ? parseInt(itemParam) : null;
        showInventoryReport();
    }
    
    // If URL has params for container report, auto-open
    if (reportParam === 'container') {
        const supplierId = params.get('supplier_id');
        const containerId = params.get('container_id');
        if (supplierId && containerId) {
            showContainerReport();
            // Wait for dropdowns to load, then set values
            setTimeout(() => {
                document.getElementById('containerReportSupplier').value = supplierId;
                loadContainersForReport();
                setTimeout(() => {
                    document.getElementById('containerReportContainer').value = containerId;
                    loadReport();
                }, 500);
            }, 500);
        }
    }
});

function showProfitLossReport() {
    currentReportType = 'profit-loss';
    // Hide PDF export button for non-container reports
    const pdfBtn = document.getElementById('exportPDFBtn');
    if (pdfBtn) pdfBtn.style.display = 'none';
    document.getElementById('reportTitle').textContent = 'Profit & Loss Report';
    document.getElementById('reportFilters').style.display = 'block';
    document.getElementById('containerReportFilters').style.display = 'none';
    document.getElementById('safeReportTypeFilter').style.display = 'none';
    document.getElementById('inventoryMovementTypeFilter').style.display = 'none';
    document.getElementById('inventoryItemFilter').style.display = 'none';
    document.getElementById('profitLossItemFilter').style.display = 'block';
    document.getElementById('inventoryStockFilters').style.display = 'none';
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('reportArea').style.display = 'block';
    loadItemsForProfitLoss();
    loadReport();
}

function showInventoryReport() {
    currentReportType = 'inventory';
    // Hide PDF export button for non-container reports
    const pdfBtn = document.getElementById('exportPDFBtn');
    if (pdfBtn) pdfBtn.style.display = 'none';
    const title = currentItemName ? `Inventory Movement - ${currentItemCode || ''} ${currentItemName}`.trim() : 'Inventory Movement Report';
    document.getElementById('reportTitle').textContent = title;
    document.getElementById('reportFilters').style.display = 'block';
    document.getElementById('containerReportFilters').style.display = 'none';
    document.getElementById('safeReportTypeFilter').style.display = 'none';
    document.getElementById('inventoryMovementTypeFilter').style.display = 'block';
    document.getElementById('inventoryItemFilter').style.display = 'block';
    document.getElementById('profitLossItemFilter').style.display = 'none';
    document.getElementById('inventoryStockFilters').style.display = 'none';
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('reportArea').style.display = 'block';
    
    // Set default start date to 01/01/2020
    if (window.inventoryDefaultStartDate) {
        const startDateInput = document.getElementById('reportStartDate');
        startDateInput.value = window.inventoryDefaultStartDate;
    }
    
    // Load items for filter
    loadItemsForInventoryReport();
    
    // Set item filter if coming from URL
    if (currentItemId) {
        setTimeout(() => {
            document.getElementById('inventoryReportItem').value = currentItemId;
        }, 500);
    }
    
    // Display filter info if item selected
    const infoBar = document.getElementById('reportFilterInfo');
    if (infoBar) {
        if (currentItemId) {
            const label = currentItemCode || '';
            const name = currentItemName || '';
            infoBar.innerHTML = `<strong>Item:</strong> ${label} ${name}`.trim();
        } else {
            infoBar.innerHTML = '';
        }
    }
    loadReport();
}

function showReceivablesReport() {
    currentReportType = 'receivables';
    // Hide PDF export button for non-container reports
    const pdfBtn = document.getElementById('exportPDFBtn');
    if (pdfBtn) pdfBtn.style.display = 'none';
    document.getElementById('reportTitle').textContent = 'Customer Receivables';
    document.getElementById('reportFilters').style.display = 'none';
    document.getElementById('containerReportFilters').style.display = 'none';
    document.getElementById('safeReportTypeFilter').style.display = 'none';
    document.getElementById('inventoryMovementTypeFilter').style.display = 'none';
    document.getElementById('inventoryItemFilter').style.display = 'none';
    document.getElementById('profitLossItemFilter').style.display = 'none';
    document.getElementById('inventoryStockFilters').style.display = 'none';
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('reportArea').style.display = 'block';
    loadReport();
}

function showPayablesReport() {
    currentReportType = 'payables';
    // Hide PDF export button for non-container reports
    const pdfBtn = document.getElementById('exportPDFBtn');
    if (pdfBtn) pdfBtn.style.display = 'none';
    document.getElementById('reportTitle').textContent = 'Supplier Payables';
    document.getElementById('reportFilters').style.display = 'none';
    document.getElementById('containerReportFilters').style.display = 'none';
    document.getElementById('safeReportTypeFilter').style.display = 'none';
    document.getElementById('inventoryMovementTypeFilter').style.display = 'none';
    document.getElementById('inventoryItemFilter').style.display = 'none';
    document.getElementById('profitLossItemFilter').style.display = 'none';
    document.getElementById('inventoryStockFilters').style.display = 'none';
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('reportArea').style.display = 'block';
    loadReport();
}

function showSalesReport() {
    currentReportType = 'sales';
    // Hide PDF export button for non-container reports
    const pdfBtn = document.getElementById('exportPDFBtn');
    if (pdfBtn) pdfBtn.style.display = 'none';
    document.getElementById('reportTitle').textContent = 'Sales Report';
    document.getElementById('reportFilters').style.display = 'block';
    document.getElementById('containerReportFilters').style.display = 'none';
    document.getElementById('safeReportTypeFilter').style.display = 'none';
    document.getElementById('inventoryMovementTypeFilter').style.display = 'none';
    document.getElementById('inventoryItemFilter').style.display = 'none';
    document.getElementById('profitLossItemFilter').style.display = 'none';
    document.getElementById('inventoryStockFilters').style.display = 'none';
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('reportArea').style.display = 'block';
    loadReport();
}

function showVirtualPurchaseProfitReport() {
    currentReportType = 'virtual-purchase-profit';
    // Hide PDF export button for non-container reports
    const pdfBtn = document.getElementById('exportPDFBtn');
    if (pdfBtn) pdfBtn.style.display = 'none';
    document.getElementById('reportTitle').textContent = 'Virtual Purchase Profit Report';
    document.getElementById('reportFilters').style.display = 'none';
    document.getElementById('containerReportFilters').style.display = 'none';
    document.getElementById('safeReportTypeFilter').style.display = 'none';
    document.getElementById('inventoryMovementTypeFilter').style.display = 'none';
    document.getElementById('inventoryItemFilter').style.display = 'none';
    document.getElementById('profitLossItemFilter').style.display = 'none';
    document.getElementById('inventoryStockFilters').style.display = 'none';
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'block';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('reportArea').style.display = 'block';
    
    // Show empty state until file is uploaded
    const content = document.getElementById('reportContent');
    content.innerHTML = '<p style="color: var(--text-secondary); padding: 20px; text-align: center;">Please upload an Excel file with columns: ItemCode, Quantity, Price, Currency, ExchangeRate</p>';
}

function showDailySalesReport() {
    currentReportType = 'daily-sales';
    const pdfBtn = document.getElementById('exportPDFBtn');
    if (pdfBtn) pdfBtn.style.display = 'none';
    document.getElementById('reportTitle').textContent = 'Daily Sales Invoice Report';
    document.getElementById('reportFilters').style.display = 'block';
    document.getElementById('containerReportFilters').style.display = 'none';
    document.getElementById('safeReportTypeFilter').style.display = 'none';
    document.getElementById('inventoryMovementTypeFilter').style.display = 'none';
    document.getElementById('inventoryItemFilter').style.display = 'none';
    document.getElementById('profitLossItemFilter').style.display = 'none';
    document.getElementById('inventoryStockFilters').style.display = 'none';
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('reportArea').style.display = 'block';
    loadDailySalesReport();
}

function showAverageSalePriceReport() {
    currentReportType = 'average-sale-price';
    // Hide PDF export button for non-container reports
    const pdfBtn = document.getElementById('exportPDFBtn');
    if (pdfBtn) pdfBtn.style.display = 'none';
    document.getElementById('reportTitle').textContent = 'Average Sale Price Report';
    document.getElementById('reportFilters').style.display = 'none';
    document.getElementById('containerReportFilters').style.display = 'none';
    document.getElementById('safeReportTypeFilter').style.display = 'none';
    document.getElementById('inventoryMovementTypeFilter').style.display = 'none';
    document.getElementById('inventoryItemFilter').style.display = 'none';
    document.getElementById('profitLossItemFilter').style.display = 'none';
    document.getElementById('inventoryStockFilters').style.display = 'none';
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'block';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('reportArea').style.display = 'block';
    
    // Load filters
    loadSuppliersForAverageSalePrice();
    loadCustomersForAverageSalePrice();
    loadItemsForAverageSalePrice();
    
    // Load report with default dates
    loadAverageSalePriceReport();
}

function showAverageLastNSalesReport() {
    currentReportType = 'average-last-n-sales';
    const pdfBtn = document.getElementById('exportPDFBtn');
    if (pdfBtn) pdfBtn.style.display = 'none';
    document.getElementById('reportTitle').textContent = 'Average of Last 10 Sales';
    document.getElementById('reportFilters').style.display = 'none';
    document.getElementById('containerReportFilters').style.display = 'none';
    document.getElementById('safeReportTypeFilter').style.display = 'none';
    document.getElementById('inventoryMovementTypeFilter').style.display = 'none';
    document.getElementById('inventoryItemFilter').style.display = 'none';
    document.getElementById('profitLossItemFilter').style.display = 'none';
    document.getElementById('inventoryStockFilters').style.display = 'none';
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'block';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('reportArea').style.display = 'block';
    loadSuppliersForAverageLastNSales();
    loadItemsForAverageLastNSales();
    loadAverageLastNSalesReport();
}

function showCollectedMoneyReport() {
    currentReportType = 'collected-money';
    // Hide PDF export button for non-container reports
    const pdfBtn = document.getElementById('exportPDFBtn');
    if (pdfBtn) pdfBtn.style.display = 'none';
    document.getElementById('reportTitle').textContent = 'Collected Money Report';
    document.getElementById('reportFilters').style.display = 'block';
    document.getElementById('containerReportFilters').style.display = 'none';
    document.getElementById('safeReportTypeFilter').style.display = 'none';
    document.getElementById('collectedMoneyColumnSelector').style.display = 'block';
    document.getElementById('reportArea').style.display = 'block';
    loadCollectedMoneyReport();
}

function showSafeOutReport() {
    currentReportType = 'safe-out';
    // Hide PDF export button for non-container reports
    const pdfBtn = document.getElementById('exportPDFBtn');
    if (pdfBtn) pdfBtn.style.display = 'none';
    document.getElementById('reportTitle').textContent = 'Safe Out Report';
    document.getElementById('reportFilters').style.display = 'block';
    document.getElementById('containerReportFilters').style.display = 'none';
    document.getElementById('safeReportTypeFilter').style.display = 'none';
    document.getElementById('collectedMoneyColumnSelector').style.display = 'none';
    document.getElementById('reportArea').style.display = 'block';
    loadSafeOutReport();
}

function showSafeReport() {
    currentReportType = 'safe';
    // Hide PDF export button for non-container reports
    const pdfBtn = document.getElementById('exportPDFBtn');
    if (pdfBtn) pdfBtn.style.display = 'none';
    document.getElementById('reportTitle').textContent = 'Safe Movement Report';
    document.getElementById('reportFilters').style.display = 'block';
    document.getElementById('containerReportFilters').style.display = 'none';
    document.getElementById('safeReportTypeFilter').style.display = 'block';
    document.getElementById('inventoryMovementTypeFilter').style.display = 'none';
    document.getElementById('inventoryItemFilter').style.display = 'none';
    document.getElementById('profitLossItemFilter').style.display = 'none';
    document.getElementById('inventoryStockFilters').style.display = 'none';
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('reportArea').style.display = 'block';
    loadReport();
}

function showContainerReport() {
    currentReportType = 'container';
    document.getElementById('reportTitle').textContent = 'Container Report';
    document.getElementById('reportFilters').style.display = 'none';
    document.getElementById('containerReportFilters').style.display = 'block';
    document.getElementById('safeReportTypeFilter').style.display = 'none';
    document.getElementById('inventoryMovementTypeFilter').style.display = 'none';
    document.getElementById('inventoryItemFilter').style.display = 'none';
    document.getElementById('profitLossItemFilter').style.display = 'none';
    document.getElementById('inventoryStockFilters').style.display = 'none';
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('reportArea').style.display = 'block';
    // Show PDF export button for container report
    const pdfBtn = document.getElementById('exportPDFBtn');
    if (pdfBtn) pdfBtn.style.display = 'inline-block';
    loadSuppliersForContainerReport();
    loadColumnVisibilitySettings();
    loadReport();
}

function showLastPurchasePriceReport() {
    currentReportType = 'last-purchase-price';
    const pdfBtn = document.getElementById('exportPDFBtn');
    if (pdfBtn) pdfBtn.style.display = 'none';
    document.getElementById('reportTitle').textContent = 'Last Purchase Price';
    document.getElementById('reportFilters').style.display = 'none';
    document.getElementById('containerReportFilters').style.display = 'none';
    document.getElementById('safeReportTypeFilter').style.display = 'none';
    document.getElementById('inventoryMovementTypeFilter').style.display = 'none';
    document.getElementById('inventoryItemFilter').style.display = 'none';
    document.getElementById('profitLossItemFilter').style.display = 'none';
    document.getElementById('inventoryStockFilters').style.display = 'none';
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'block';
    document.getElementById('reportArea').style.display = 'block';
    loadSuppliersForLastPurchasePrice();
    loadItemsForLastPurchasePrice();
    loadLastPurchasePriceReport();
}

function showStockValueDetailsReport() {
    currentReportType = 'stock-value-details';
    // Hide PDF export button for non-container reports
    const pdfBtn = document.getElementById('exportPDFBtn');
    if (pdfBtn) pdfBtn.style.display = 'none';
    document.getElementById('reportTitle').textContent = 'Stock Value Calculation Details';
    document.getElementById('reportFilters').style.display = 'none';
    document.getElementById('containerReportFilters').style.display = 'none';
    document.getElementById('safeReportTypeFilter').style.display = 'none';
    document.getElementById('inventoryMovementTypeFilter').style.display = 'none';
    document.getElementById('inventoryItemFilter').style.display = 'none';
    document.getElementById('profitLossItemFilter').style.display = 'none';
    document.getElementById('inventoryStockFilters').style.display = 'none';
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'block';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('reportArea').style.display = 'block';
    
    // Load items for filter
    loadItemsForStockValueDetails();
    
    // Show empty state until filters are applied
    const content = document.getElementById('reportContent');
    content.innerHTML = '<p style="color: var(--text-secondary); padding: 20px; text-align: center;">Please select an item (or leave as "All Items") and click "Apply Filters" to load the report.</p>';
}

function closeReport() {
    document.getElementById('reportArea').style.display = 'none';
    // Hide PDF export button when closing report
    const pdfBtn = document.getElementById('exportPDFBtn');
    if (pdfBtn) pdfBtn.style.display = 'none';
    currentReportType = null;
}

function clearReportFilters() {
    document.getElementById('reportStartDate').value = '';
    document.getElementById('reportEndDate').value = '';
    const transactionTypeSelect = document.getElementById('reportTransactionType');
    if (transactionTypeSelect) {
        transactionTypeSelect.value = 'All';
    }
    const movementTypeSelect = document.getElementById('inventoryMovementType');
    if (movementTypeSelect) {
        movementTypeSelect.value = 'both';
    }
    const itemSelect = document.getElementById('inventoryReportItem');
    if (itemSelect) {
        itemSelect.value = '';
    }
    const profitLossItemInput = document.getElementById('profitLossItem');
    const profitLossItemSearch = document.getElementById('profitLossItemSearch');
    if (profitLossItemInput) profitLossItemInput.value = '';
    if (profitLossItemSearch) profitLossItemSearch.value = '';
    // Reset default start date for inventory report
    if (currentReportType === 'inventory' && window.inventoryDefaultStartDate) {
        document.getElementById('reportStartDate').value = window.inventoryDefaultStartDate;
    }
    loadReport();
}

function loadReport() {
    const content = document.getElementById('reportContent');
    content.innerHTML = '<div class="spinner"></div>';
    
    switch(currentReportType) {
        case 'profit-loss':
            loadProfitLossReport();
            break;
        case 'inventory':
            loadInventoryReport();
            break;
        case 'inventory-stock':
            loadInventoryStockReport();
            break;
        case 'inventory-snapshot':
            loadInventorySnapshotReport();
            break;
        case 'receivables':
            loadReceivablesReport();
            break;
        case 'payables':
            loadPayablesReport();
            break;
        case 'safe':
            loadSafeReport();
            break;
        case 'container':
            loadContainerReport();
            break;
        case 'stock-value-details':
            loadStockValueDetailsReport();
            break;
        case 'item-statement':
            loadItemStatementReport();
            break;
        case 'sales':
            loadSalesReport();
            break;
        case 'virtual-purchase-profit':
            loadVirtualPurchaseProfitReport();
            break;
        case 'average-sale-price':
            loadAverageSalePriceReport();
            break;
        case 'average-last-n-sales':
            loadAverageLastNSalesReport();
            break;
        case 'last-purchase-price':
            loadLastPurchasePriceReport();
            break;
        case 'daily-sales':
            loadDailySalesReport();
            break;
        case 'safe-out':
            loadSafeOutReport();
            break;
        case 'collected-money':
            loadCollectedMoneyReport();
            break;
    }
}

let currentMarket = null;

function loadCurrentMarketForReports() {
    return fetch('/api/current-market')
        .then(response => response.json())
        .then(data => {
            currentMarket = data;
            return data;
        })
        .catch(error => {
            console.error('Error loading current market:', error);
            return null;
        });
}

function loadDailySalesReport() {
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    
    let url = '/api/reports/daily-sales?';
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                document.getElementById('reportContent').innerHTML = `<p style="color: red;">Error: ${data.error}</p>`;
                return;
            }
            
            if (!data || data.length === 0) {
                document.getElementById('reportContent').innerHTML = '<p style="color: #666; text-align: center; padding: 40px;">No sales found for the selected period.</p>';
                return;
            }
            
            let html = `
                <div class="table-container">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background-color: #1e3a5f; color: white;">
                                <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Date</th>
                                <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Customers</th>
                                <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Suppliers</th>
                                <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Total Amount</th>
                                <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Total Paid</th>
                                <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Balance</th>
                                <th style="padding: 12px; text-align: center; border: 1px solid #ddd;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            data.forEach(day => {
                const date = new Date(day.date).toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
                const customers = day.customers.join(', ') || '-';
                const suppliers = day.suppliers.join(', ') || '-';
                
                html += `
                    <tr style="border-bottom: 1px solid #ddd;">
                        <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">${date}</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${customers}</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${suppliers}</td>
                        <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${formatCurrency(day.total_amount)}</td>
                        <td style="padding: 10px; text-align: right; border: 1px solid #ddd; color: #4caf50;">${formatCurrency(day.total_paid)}</td>
                        <td style="padding: 10px; text-align: right; border: 1px solid #ddd; color: ${day.total_balance > 0 ? '#f44336' : '#4caf50'};">${formatCurrency(day.total_balance)}</td>
                        <td style="padding: 10px; text-align: center; border: 1px solid #ddd;">
                            <button class="btn btn-primary btn-sm" onclick="showDailyInvoice('${day.date}', ${JSON.stringify(day).replace(/'/g, "\\'").replace(/"/g, '&quot;')})">View Invoice</button>
                        </td>
                    </tr>
                `;
            });
            
            html += `
                        </tbody>
                    </table>
                </div>
            `;
            
            document.getElementById('reportContent').innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading daily sales report:', error);
            document.getElementById('reportContent').innerHTML = '<p style="color: red;">Error loading report</p>';
        });
}

function showDailyInvoice(date, dayDataStr) {
    const dayData = typeof dayDataStr === 'string' ? JSON.parse(dayDataStr.replace(/&quot;/g, '"')) : dayDataStr;
    
    // Load market data first
    let marketPromise = Promise.resolve(currentMarket);
    if (!currentMarket) {
        marketPromise = loadCurrentMarketForReports();
    }
    
    marketPromise.then(market => {
        const marketData = market || { name: 'Market', address: '', base_currency: 'USD' };
        
        // Format date
        const saleDate = new Date(date).toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        
        // Combine all items from all sales for this day
        const allItems = [];
        dayData.sales.forEach(sale => {
            sale.items.forEach(item => {
                allItems.push({
                    ...item,
                    customer_name: sale.customer_name,
                    supplier_name: sale.supplier_name || '-',
                    invoice_number: sale.invoice_number
                });
            });
        });
        
        // Build invoice HTML
        let invoiceHTML = `
            <div id="dailyInvoiceToPrint" style="font-family: Arial, sans-serif; color: #333;">
                <!-- Header -->
                <div style="text-align: center; margin-bottom: 30px; border-bottom: 3px solid #1e3a5f; padding-bottom: 20px;">
                    <h1 style="color: #1e3a5f; margin: 0 0 10px 0; font-size: 28px;">SARI TEXTILE WAREHOUSES</h1>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">${marketData.address || ''}</p>
                    <h2 style="color: #1e3a5f; margin: 20px 0 0 0; font-size: 22px;">DAILY SALES INVOICE</h2>
                </div>
                
                <!-- Invoice Details -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px;">
                    <div>
                        <h3 style="color: #1e3a5f; margin: 0 0 10px 0; font-size: 16px; border-bottom: 2px solid #1e3a5f; padding-bottom: 5px;">Invoice Details</h3>
                        <p style="margin: 5px 0;"><strong>Date:</strong> ${saleDate}</p>
                        <p style="margin: 5px 0;"><strong>Total Sales:</strong> ${dayData.sales.length}</p>
                    </div>
                    <div>
                        <h3 style="color: #1e3a5f; margin: 0 0 10px 0; font-size: 16px; border-bottom: 2px solid #1e3a5f; padding-bottom: 5px;">Summary</h3>
                        <p style="margin: 5px 0;"><strong>Customers:</strong> ${dayData.customers.join(', ') || '-'}</p>
                        <p style="margin: 5px 0;"><strong>Suppliers:</strong> ${dayData.suppliers.join(', ') || '-'}</p>
                    </div>
                </div>
                
                <!-- Items Table -->
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <thead>
                        <tr style="background-color: #1e3a5f; color: white;">
                            <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">#</th>
                            <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Invoice No</th>
                            <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Customer</th>
                            <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Supplier</th>
                            <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Item Code</th>
                            <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Item Name</th>
                            <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Quantity</th>
                            <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Unit Price</th>
                            <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        allItems.forEach((item, index) => {
            invoiceHTML += `
                        <tr style="border-bottom: 1px solid #ddd;">
                            <td style="padding: 10px; border: 1px solid #ddd;">${index + 1}</td>
                            <td style="padding: 10px; border: 1px solid #ddd;">${item.invoice_number}</td>
                            <td style="padding: 10px; border: 1px solid #ddd;">${item.customer_name}</td>
                            <td style="padding: 10px; border: 1px solid #ddd;">${item.supplier_name}</td>
                            <td style="padding: 10px; border: 1px solid #ddd;">${item.item_code}</td>
                            <td style="padding: 10px; border: 1px solid #ddd;">${item.item_name}</td>
                            <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${parseFloat(item.quantity).toFixed(2)}</td>
                            <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${formatCurrency(item.unit_price)}</td>
                            <td style="padding: 10px; text-align: right; border: 1px solid #ddd; font-weight: bold;">${formatCurrency(item.total_price)}</td>
                        </tr>
            `;
        });
        
        invoiceHTML += `
                    </tbody>
                </table>
                
                <!-- Totals -->
                <div style="display: flex; justify-content: flex-end; margin-bottom: 20px;">
                    <div style="width: 300px;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px; text-align: right; border: 1px solid #ddd;"><strong>Total Amount:</strong></td>
                                <td style="padding: 8px; text-align: right; border: 1px solid #ddd; font-weight: bold; font-size: 18px; color: #1e3a5f;">${formatCurrency(dayData.total_amount)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; text-align: right; border: 1px solid #ddd;"><strong>Total Paid:</strong></td>
                                <td style="padding: 8px; text-align: right; border: 1px solid #ddd; font-weight: bold; color: #4caf50;">${formatCurrency(dayData.total_paid)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; text-align: right; border: 1px solid #ddd;"><strong>Balance:</strong></td>
                                <td style="padding: 8px; text-align: right; border: 1px solid #ddd; font-weight: bold; color: ${dayData.total_balance > 0 ? '#f44336' : '#4caf50'};">${formatCurrency(dayData.total_balance)}</td>
                            </tr>
                        </table>
                    </div>
                </div>
            </div>
        `;
        
        // Create or update invoice modal
        let invoiceModal = document.getElementById('dailyInvoiceModal');
        if (!invoiceModal) {
            invoiceModal = document.createElement('div');
            invoiceModal.id = 'dailyInvoiceModal';
            invoiceModal.className = 'modal';
            invoiceModal.innerHTML = `
                <div class="modal-content" style="max-width: 900px;">
                    <span class="close" onclick="closeDailyInvoiceModal()">&times;</span>
                    <div id="dailyInvoiceContent" style="background: white; padding: 30px; border-radius: 5px;">
                    </div>
                    <div class="action-buttons" style="margin-top: 20px; text-align: center;">
                        <button type="button" class="btn btn-primary" onclick="printDailyInvoice()">Print</button>
                        <button type="button" class="btn btn-secondary" onclick="closeDailyInvoiceModal()">Close</button>
                    </div>
                </div>
            `;
            document.body.appendChild(invoiceModal);
        }
        
        document.getElementById('dailyInvoiceContent').innerHTML = invoiceHTML;
        invoiceModal.style.display = 'block';
    });
}

function closeDailyInvoiceModal() {
    const modal = document.getElementById('dailyInvoiceModal');
    if (modal) modal.style.display = 'none';
}

function printDailyInvoice() {
    const invoiceContent = document.getElementById('dailyInvoiceToPrint');
    if (!invoiceContent) return;
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Daily Sales Invoice</title>
                <style>
                    @page {
                        margin: 1cm;
                        size: A4;
                    }
                    body {
                        font-family: Arial, sans-serif;
                        color: #333;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                    }
                    th, td {
                        padding: 8px;
                        border: 1px solid #ddd;
                    }
                </style>
            </head>
            <body>
                ${invoiceContent.innerHTML}
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    }
}

function printReport() {
    // Use screen capture instead of browser print
    captureReportAsImage();
}

function captureReportAsImage() {
    const reportContent = document.getElementById('reportContent');
    if (!reportContent || !reportContent.innerHTML.trim()) {
        alert('No report content to capture');
        return;
    }
    
    // Show loading message
    const originalOpacity = reportContent.style.opacity;
    reportContent.style.opacity = '0.7';
    
    // Temporarily hide UI elements (buttons, filters, title) for clean capture
    const reportTitle = document.getElementById('reportTitle');
    const actionButtons = document.querySelector('#reportArea .action-buttons');
    const filters = document.querySelectorAll('.filters');
    const categorySections = [
        'safeReportsSection',
        'financialReportsSection',
        'inventoryReportsSection',
        'purchaseReportsSection'
    ];
    
    // Store original display states
    const titleDisplay = reportTitle ? reportTitle.style.display : '';
    const buttonsDisplay = actionButtons ? actionButtons.style.display : '';
    const filtersDisplay = [];
    const categoryDisplays = [];
    
    // Hide UI elements
    if (reportTitle) reportTitle.style.display = 'none';
    if (actionButtons) actionButtons.style.display = 'none';
    filters.forEach(filter => {
        filtersDisplay.push(filter.style.display);
        filter.style.display = 'none';
    });
    categorySections.forEach(sectionId => {
        const section = document.getElementById(sectionId);
        if (section) {
            categoryDisplays.push({ id: sectionId, display: section.style.display });
            section.style.display = 'none';
        }
    });
    
    // Hide calculation methodology section
    const methodologySections = reportContent.querySelectorAll('.calculation-methodology');
    const methodologyDisplays = [];
    methodologySections.forEach(section => {
        methodologyDisplays.push(section.style.display);
        section.style.display = 'none';
    });
    
    // Ensure report area is visible and properly sized
    const reportArea = document.getElementById('reportArea');
    if (reportArea) {
        reportArea.style.display = 'block';
        reportArea.style.padding = '0';
        reportArea.style.margin = '0';
    }
    
    // Minimize top padding/margin of report content
    const originalPadding = reportContent.style.padding;
    const originalMargin = reportContent.style.margin;
    reportContent.style.padding = '5px 20px 20px 20px';
    reportContent.style.margin = '0';
    
    // Wait for DOM to update
    setTimeout(() => {
        // Capture only the reportContent div - this contains header to footer
        html2canvas(reportContent, {
            backgroundColor: null, // Transparent background
            scale: 2, // High quality (2x resolution)
            useCORS: true,
            logging: false,
            allowTaint: false,
            width: reportContent.scrollWidth,
            height: reportContent.scrollHeight,
            scrollX: 0,
            scrollY: 0,
            windowWidth: reportContent.scrollWidth,
            windowHeight: reportContent.scrollHeight,
            onclone: function(clonedDoc) {
                // Ensure all styles and colors are preserved
                const clonedContent = clonedDoc.getElementById('reportContent');
                if (clonedContent) {
                    clonedContent.style.width = '100%';
                    clonedContent.style.background = 'transparent';
                    clonedContent.style.padding = '5px 20px 20px 20px';
                    clonedContent.style.margin = '0';
                }
                
                // Hide calculation methodology in cloned document
                const clonedMethodology = clonedDoc.querySelectorAll('.calculation-methodology');
                clonedMethodology.forEach(section => {
                    section.style.display = 'none';
                });
                
                // Force color printing in cloned document
                const style = clonedDoc.createElement('style');
                style.textContent = `
                    * {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                        color-adjust: exact !important;
                    }
                `;
                clonedDoc.head.appendChild(style);
            }
        }).then(canvas => {
            // Restore original display states
            if (reportTitle) reportTitle.style.display = titleDisplay;
            if (actionButtons) actionButtons.style.display = buttonsDisplay;
            filters.forEach((filter, index) => {
                filter.style.display = filtersDisplay[index] || '';
            });
            categoryDisplays.forEach(item => {
                const section = document.getElementById(item.id);
                if (section) section.style.display = item.display || '';
            });
            methodologySections.forEach((section, index) => {
                section.style.display = methodologyDisplays[index] || '';
            });
            reportContent.style.opacity = originalOpacity || '1';
            
            if (reportArea) {
                reportArea.style.padding = '';
                reportArea.style.margin = '';
            }
            reportContent.style.padding = originalPadding || '';
            reportContent.style.margin = originalMargin || '';
            
            // Convert canvas to blob and create download
            canvas.toBlob(function(blob) {
                const url = URL.createObjectURL(blob);
                
                // Download the image
                const link = document.createElement('a');
                link.href = url;
                const reportName = document.getElementById('reportTitle')?.textContent || 'report';
                link.download = `${reportName.replace(/[^a-z0-9]/gi, '_')}_${new Date().getTime()}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                // Open print dialog with the captured image
                const printWindow = window.open('', '_blank');
                if (printWindow) {
                    printWindow.document.write(`
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <title>Print Report</title>
                            <style>
                                @page {
                                    margin: 0.2cm 0.5cm 0.2cm 0.5cm;
                                    size: A4;
                                }
                                * {
                                    -webkit-print-color-adjust: exact !important;
                                    print-color-adjust: exact !important;
                                    color-adjust: exact !important;
                                }
                                body {
                                    margin: 0;
                                    padding: 0;
                                    display: flex;
                                    justify-content: center;
                                    align-items: flex-start;
                                    background: white;
                                }
                                img {
                                    max-width: 100%;
                                    height: auto;
                                    display: block;
                                    page-break-inside: avoid;
                                }
                            </style>
                        </head>
                        <body>
                            <img src="${url}" alt="Report" onload="setTimeout(function() { window.print(); }, 250); window.onafterprint = function() { window.close(); }">
                        </body>
                        </html>
                    `);
                    printWindow.document.close();
                }
                
                // Clean up URL after a delay
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }, 'image/png', 1.0);
        }).catch(error => {
            console.error('Error capturing report:', error);
            alert('Error capturing report: ' + error.message + '. Please try again.');
            
            // Restore original display on error
            if (reportTitle) reportTitle.style.display = titleDisplay;
            if (actionButtons) actionButtons.style.display = buttonsDisplay;
            filters.forEach((filter, index) => {
                filter.style.display = filtersDisplay[index] || '';
            });
            categoryDisplays.forEach(item => {
                const section = document.getElementById(item.id);
                if (section) section.style.display = item.display || '';
            });
            methodologySections.forEach((section, index) => {
                section.style.display = methodologyDisplays[index] || '';
            });
            reportContent.style.opacity = originalOpacity || '1';
            
            if (reportArea) {
                reportArea.style.padding = '';
                reportArea.style.margin = '';
            }
            reportContent.style.padding = originalPadding || '';
            reportContent.style.margin = originalMargin || '';
        });
    }, 300);
}

function generateReportHeader(title, meta = {}) {
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    
    let metaHtml = '';
    if (meta.startDate || meta.endDate) {
        metaHtml += `<span>📅 Period: ${meta.startDate || 'All'} - ${meta.endDate || 'All'}</span>`;
    }
    if (meta.supplier) {
        metaHtml += `<span>🏢 Supplier: ${meta.supplier}</span>`;
    }
    if (meta.container) {
        metaHtml += `<span>📦 Container: ${meta.container}</span>`;
    }
    if (meta.item) {
        metaHtml += `<span>📦 Item: ${meta.item}</span>`;
    }
    
    return `
        <div class="report-header">
            <h2>${title}</h2>
            <div class="report-meta">
                ${metaHtml}
                <span>🕒 Generated: ${dateStr} at ${timeStr}</span>
            </div>
        </div>
    `;
}

function generateReportFooter() {
    return `
        <div class="report-footer">
            <div class="generated-date">Generated by SARI TEXTILE WAREHOUSES ACCOUNTING System</div>
            <div>© ${new Date().getFullYear()} SARI TEXTILE WAREHOUSES. All rights reserved.</div>
        </div>
    `;
}

function exportReportToExcel() {
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    
    let url = '';
    switch(currentReportType) {
        case 'profit-loss':
            url = `/api/reports/profit-loss/export?`;
            if (startDate) url += `start_date=${startDate}&`;
            if (endDate) url += `end_date=${endDate}&`;
            const profitLossItemId = document.getElementById('profitLossItem')?.value || '';
            if (profitLossItemId) url += `item_id=${profitLossItemId}&`;
            break;
        case 'inventory':
            const movementType = document.getElementById('inventoryMovementType')?.value || 'both';
            const itemId = document.getElementById('inventoryReportItem')?.value || currentItemId;
            url = `/api/items/stock-movement/export?type=${movementType}`;
            if (startDate) url += `&start_date=${startDate}`;
            if (endDate) url += `&end_date=${endDate}`;
            if (itemId) url += `&item_id=${itemId}`;
            break;
        case 'inventory-stock':
            url = `/api/reports/inventory-stock/export`;
            const supplierId = document.getElementById('inventoryStockSupplier')?.value;
            if (supplierId) url += `?supplier_id=${supplierId}`;
            break;
        case 'inventory-snapshot':
            const snapshotDate = document.getElementById('inventorySnapshotDate')?.value;
            const snapshotSupplierId = document.getElementById('inventorySnapshotSupplier')?.value;
            const snapshotItemId = document.getElementById('inventorySnapshotItem')?.value;
            if (!snapshotDate) {
                alert('Please select a snapshot date');
                return;
            }
            url = `/api/reports/inventory-snapshot/export?date=${snapshotDate}`;
            if (snapshotSupplierId) url += `&supplier_id=${snapshotSupplierId}`;
            if (snapshotItemId) url += `&item_id=${snapshotItemId}`;
            break;
        case 'receivables':
            url = `/api/reports/customer-receivables/export`;
            break;
        case 'payables':
            url = `/api/reports/supplier-payables/export`;
            break;
        case 'safe':
            url = `/api/safe/movement-report/export?`;
            if (startDate) url += `start_date=${startDate}&`;
            if (endDate) url += `end_date=${endDate}&`;
            break;
        case 'collected-money':
            url = `/api/safe/collected-money-report/export?`;
            if (startDate) url += `start_date=${startDate}&`;
            if (endDate) url += `end_date=${endDate}&`;
            break;
        case 'safe-out':
            url = `/api/reports/safe-out/export?`;
            if (startDate) url += `start_date=${startDate}&`;
            if (endDate) url += `end_date=${endDate}&`;
            break;
        case 'stock-value-details':
            url = `/api/reports/stock-value-details/export`;
            const stockValueDetailsItemId = document.getElementById('stockValueDetailsItem')?.value;
            if (stockValueDetailsItemId) url += `?item_id=${stockValueDetailsItemId}`;
            break;
        case 'item-statement':
            url = `/api/reports/item-statement/export?`;
            const itemStatementSupplierId = document.getElementById('itemStatementSupplier')?.value;
            const itemStatementItemId = document.getElementById('itemStatementItem')?.value;
            const itemStatementStartDate = document.getElementById('itemStatementStartDate')?.value;
            const itemStatementEndDate = document.getElementById('itemStatementEndDate')?.value;
            const itemStatementType = document.getElementById('itemStatementType')?.value || 'All';
            if (itemStatementSupplierId) url += `supplier_id=${itemStatementSupplierId}&`;
            if (itemStatementItemId) url += `item_id=${itemStatementItemId}&`;
            if (itemStatementStartDate) url += `start_date=${itemStatementStartDate}&`;
            if (itemStatementEndDate) url += `end_date=${itemStatementEndDate}&`;
            url += `transaction_type=${itemStatementType}`;
            break;
        case 'sales':
            url = `/api/reports/sales/export?`;
            if (startDate) url += `start_date=${startDate}&`;
            if (endDate) url += `end_date=${endDate}&`;
            break;
        case 'virtual-purchase-profit':
            exportVirtualPurchaseProfitToExcel();
            return; // This function handles the export differently (file upload)
        case 'average-sale-price':
            exportAverageSalePriceReport();
            return;
        case 'average-last-n-sales':
            exportAverageLastNSalesReport();
            return;
        case 'last-purchase-price':
            exportLastPurchasePriceReport();
            return;
    }
    
    if (url) {
        window.location.href = url;
    }
}

function loadProfitLossReport() {
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    const itemId = document.getElementById('profitLossItem')?.value || '';
    
    let url = '/api/reports/profit-loss?';
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    if (itemId) url += `item_id=${itemId}&`;
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                document.getElementById('reportContent').innerHTML = `<p style="color: red;">Error: ${data.error}</p>`;
                return;
            }
            
            const startDateDisplay = startDate ? new Date(startDate).toLocaleDateString() : 'All';
            const endDateDisplay = endDate ? new Date(endDate).toLocaleDateString() : 'All';
            const isFIFO = data.calculation_method === 'FIFO';
            const baseCurrency = data.base_currency || '';  // Get base currency from API
            
            let html = generateReportHeader('Profit & Loss Report', { startDate: startDateDisplay, endDate: endDateDisplay });
            
            html += `<div class="report-summary">
                <h3>Summary</h3>
                <div class="report-summary-grid">
                    <div class="report-summary-item">
                        <label>Total Sales</label>
                        <div class="value">${formatCurrency(data.totals.total_sales)}</div>
                    </div>
                    <div class="report-summary-item">
                        <label>Total COG</label>
                        <div class="value">${formatCurrency(data.totals.total_cog || 0)}</div>
                    </div>
                    <div class="report-summary-item">
                        <label>Total Cost</label>
                        <div class="value">${formatCurrency(data.totals.total_cost)}</div>
                    </div>
                    <div class="report-summary-item">
                        <label>Total Profit</label>
                        <div class="value" style="color: ${data.totals.total_profit >= 0 ? '#4caf50' : '#f44336'}">${formatCurrency(data.totals.total_profit)}</div>
                    </div>
                    <div class="report-summary-item">
                        <label>Profit Margin</label>
                        <div class="value" style="color: ${data.totals.profit_margin >= 0 ? '#4caf50' : '#f44336'}">${data.totals.profit_margin.toFixed(2)}%</div>
                    </div>
                </div>
            </div>`;
            
            html += '<div class="report-table-wrapper"><table><thead><tr>';
            html += '<th>Item Code</th><th>Item Name</th><th class="text-right">Quantity Sold</th><th class="text-right">Total Sales</th><th class="text-right">COG</th>';
            if (!isFIFO) {
                html += '<th class="text-right">Average Purchase Price</th>';
                html += '<th class="text-right">Avg Purchase Price (Supplier Curr.)</th>';
            }
            html += '<th class="text-right">Total Cost</th><th class="text-right">Profit</th><th class="text-right">Profit Margin %</th>';
            html += '</tr></thead><tbody>';
            
            if (data.items.length === 0) {
                const colspan = isFIFO ? 8 : 10;
                html += `<tr><td colspan="${colspan}" class="empty-state">No data available</td></tr>`;
            } else {
                data.items.forEach((item, index) => {
                    html += `<tr class="item-row" data-item-index="${index}">
                        <td>${item.item_code}</td>
                        <td>${item.item_name}</td>
                        <td class="text-right">${item.quantity_sold.toFixed(2)}</td>
                        <td class="text-right">${formatCurrency(item.total_sales)}</td>
                        <td class="text-right">${formatCurrency(item.cog || 0)}</td>`;
                    
                    if (!isFIFO) {
                        html += `<td class="text-right">${formatCurrency(item.average_purchase_price || 0)}</td>`;
                        const avgSupplier = item.average_purchase_price_supplier_currency != null ? formatCurrency(item.average_purchase_price_supplier_currency, item.supplier_currency || '') : '-';
                        html += `<td class="text-right">${avgSupplier}</td>`;
                    }
                    
                    html += `<td class="text-right">${formatCurrency(item.total_cost)}</td>
                        <td class="text-right" style="color: ${item.profit >= 0 ? '#4caf50' : '#f44336'}; font-weight: 600;">${formatCurrency(item.profit)}</td>
                        <td class="text-right">${item.profit_margin.toFixed(2)}%</td>
                    </tr>`;
                    
                    // Add batch details row for FIFO mode
                    if (isFIFO && item.batch_details && item.batch_details.length > 0) {
                        html += `<tr class="batch-details-row" data-item-index="${index}" style="background-color: #f5f5f5; display: none;">
                            <td colspan="${isFIFO ? 8 : 10}" style="padding: 15px;">
                                <div style="margin-left: 20px;">
                                    <strong style="color: #1e3a5f; font-size: 13px;">Batch Breakdown:</strong>
                                    <table style="width: 100%; margin-top: 10px; font-size: 12px; border-collapse: collapse;">
                                        <thead>
                                            <tr style="background-color: #e3f2fd; border-bottom: 2px solid #2196f3;">
                                                <th style="padding: 8px; text-align: left;">Sale Date</th>
                                                <th style="padding: 8px; text-align: left;">Invoice</th>
                                                <th style="padding: 8px; text-align: left;">Batch Code</th>
                                                <th style="padding: 8px; text-align: left;">Purchase Date</th>
                                                <th style="padding: 8px; text-align: right;">Quantity</th>
                                                <th style="padding: 8px; text-align: right;">Cost/Unit</th>
                                                <th style="padding: 8px; text-align: right;">Total Cost</th>
                                                <th style="padding: 8px; text-align: left;">Currency</th>
                                            </tr>
                                        </thead>
                                        <tbody>`;
                        
                        item.batch_details.forEach(batch => {
                            html += `<tr style="border-bottom: 1px solid #ddd;">
                                <td style="padding: 6px;">${new Date(batch.sale_date).toLocaleDateString()}</td>
                                <td style="padding: 6px;">${batch.invoice_number || '-'}</td>
                                <td style="padding: 6px; font-weight: 600; color: #1976d2;">${batch.batch_code || '-'}</td>
                                <td style="padding: 6px;">${batch.purchase_date ? new Date(batch.purchase_date).toLocaleDateString() : '-'}</td>
                                <td style="padding: 6px; text-align: right;">${parseFloat(batch.quantity).toFixed(2)}</td>
                                <td style="padding: 6px; text-align: right;">${formatCurrency(batch.cost_per_unit, baseCurrency)}</td>
                                <td style="padding: 6px; text-align: right; font-weight: 600;">${formatCurrency(batch.total_cost, baseCurrency)}</td>
                                <td style="padding: 6px;">${batch.currency || '-'}</td>
                            </tr>`;
                        });
                        
                        html += `</tbody>
                                    </table>
                                </div>
                            </td>
                        </tr>`;
                    }
                });
                
                html += `<tr class="total-row">
                    <td colspan="2"><strong>TOTAL</strong></td>
                    <td class="text-right">${data.items.reduce((sum, item) => sum + item.quantity_sold, 0).toFixed(2)}</td>
                    <td class="text-right"><strong>${formatCurrency(data.totals.total_sales)}</strong></td>
                    <td class="text-right"><strong>${formatCurrency(data.totals.total_cog || 0)}</strong></td>`;
                
                if (!isFIFO) {
                    html += `<td class="text-right">-</td><td class="text-right">-</td>`;
                }
                
                html += `<td class="text-right"><strong>${formatCurrency(data.totals.total_cost)}</strong></td>
                    <td class="text-right" style="color: ${data.totals.total_profit >= 0 ? '#4caf50' : '#f44336'}"><strong>${formatCurrency(data.totals.total_profit)}</strong></td>
                    <td class="text-right"><strong>${data.totals.profit_margin.toFixed(2)}%</strong></td>
                </tr>`;
            }
            
            html += '</tbody></table></div>';
            html += generateReportFooter();
            
            document.getElementById('reportContent').innerHTML = html;
            
            // Add click handler for expanding batch details in FIFO mode (after HTML is inserted)
            if (isFIFO) {
                document.querySelectorAll('.item-row').forEach(row => {
                    row.style.cursor = 'pointer';
                    row.title = 'Click to show/hide batch details';
                    row.addEventListener('click', function() {
                        const index = this.getAttribute('data-item-index');
                        const batchRow = document.querySelector(`.batch-details-row[data-item-index="${index}"]`);
                        if (batchRow) {
                            const isHidden = batchRow.style.display === 'none' || batchRow.style.display === '';
                            batchRow.style.display = isHidden ? 'table-row' : 'none';
                            // Add visual indicator
                            if (isHidden) {
                                this.style.backgroundColor = 'rgba(33, 150, 243, 0.1)';
                            } else {
                                this.style.backgroundColor = '';
                            }
                        }
                    });
                });
            }
        })
        .catch(error => {
            console.error('Error loading profit loss report:', error);
            document.getElementById('reportContent').innerHTML = '<p style="color: red;">Error loading report</p>';
        });
}

function loadItemsForInventoryReport() {
    fetch('/api/items')
        .then(response => response.json())
        .then(data => {
            const select = document.getElementById('inventoryReportItem');
            select.innerHTML = '<option value="">All Items</option>';
            data.forEach(item => {
                const option = document.createElement('option');
                option.value = item.id;
                option.textContent = `${item.code} - ${item.name}`;
                select.appendChild(option);
            });
            
            // Set selected item if currentItemId is set
            if (currentItemId) {
                select.value = currentItemId;
            }
        })
        .catch(error => console.error('Error loading items:', error));
}

function calculateMovementTotals(data) {
    let purchasesQty = 0;
    let salesQty = 0;
    data.forEach(movement => {
        const qty = Number(movement.quantity || 0);
        if (movement.type === 'Purchase') {
            purchasesQty += qty;
        } else if (movement.type === 'Sale') {
            salesQty += qty;
        }
    });
    return {
        purchasesQty,
        salesQty,
        netQty: purchasesQty - salesQty
    };
}

function renderMovementSummary(data) {
    const totals = calculateMovementTotals(data);
    return `
        <div style="margin-bottom: 15px; padding: 10px; background: var(--bg-tertiary); border-radius: 4px; color: var(--text-primary); transition: background-color 0.3s ease, color 0.3s ease;">
            <strong>Total Purchases:</strong> ${totals.purchasesQty.toFixed(2)} |
            <strong>Total Sales:</strong> ${totals.salesQty.toFixed(2)} |
            <strong>Net Quantity:</strong> ${totals.netQty.toFixed(2)}
        </div>
    `;
}

function loadInventoryReport() {
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    const movementType = document.getElementById('inventoryMovementType')?.value || 'both';
    const itemId = document.getElementById('inventoryReportItem')?.value || currentItemId;
    
    let url = `/api/items/stock-movement?type=${movementType}`;
    if (startDate) url += `&start_date=${startDate}`;
    if (endDate) url += `&end_date=${endDate}`;
    if (itemId) url += `&item_id=${itemId}`;
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                document.getElementById('reportContent').innerHTML = `<p style="color: red;">Error: ${data.error}</p>`;
                return;
            }
            
            let html = '';
            
            // If item is selected, show price breakdown
            if (itemId) {
                // Fetch price breakdown
                fetch(`/api/items/${itemId}/price-breakdown?start_date=${startDate || ''}&end_date=${endDate || ''}`)
                    .then(response => response.json())
                    .then(breakdown => {
                        if (!breakdown.error) {
                            html += '<div style="margin-bottom: 30px;">';
                            
                            // Purchase prices breakdown
                            if (breakdown.purchase_prices && breakdown.purchase_prices.length > 0) {
                                html += '<h3 style="color: var(--text-primary); margin-bottom: 15px; transition: color 0.3s ease;">Purchase Prices Breakdown</h3>';
                                html += '<div class="table-container" style="margin-bottom: 20px;"><table><thead><tr>';
                                html += '<th class="text-right">Unit Price</th><th>Currency</th><th class="text-right">Total Quantity</th><th class="text-right">Total Amount</th>';
                                html += '</tr></thead><tbody>';
                                
                                breakdown.purchase_prices.forEach((price, index) => {
                                    html += `<tr>
                                        <td class="text-right">${formatCurrency(price.unit_price, price.currency)}</td>
                                        <td>${price.currency}</td>
                                        <td class="text-right">${price.total_quantity.toFixed(2)}</td>
                                        <td class="text-right">${formatCurrency(price.total_amount, price.currency)}</td>
                                    </tr>`;
                                });
                                
                                html += '</tbody></table></div>';
                            }
                            
                            // Sales prices breakdown
                            if (breakdown.sales_prices && breakdown.sales_prices.length > 0) {
                                html += '<h3 style="color: var(--text-primary); margin-bottom: 15px; transition: color 0.3s ease;">Sales Prices Breakdown</h3>';
                                html += '<div class="table-container" style="margin-bottom: 20px;"><table><thead><tr>';
                                html += '<th class="text-right">Unit Price</th><th>Currency</th><th class="text-right">Total Quantity</th><th class="text-right">Total Amount</th>';
                                html += '</tr></thead><tbody>';
                                
                                breakdown.sales_prices.forEach((price, index) => {
                                    html += `<tr>
                                        <td class="text-right">${formatCurrency(price.unit_price, price.currency)}</td>
                                        <td>${price.currency}</td>
                                        <td class="text-right">${price.total_quantity.toFixed(2)}</td>
                                        <td class="text-right">${formatCurrency(price.total_amount, price.currency)}</td>
                                    </tr>`;
                                });
                                
                                html += '</tbody></table></div>';
                            }
                            
                            html += '</div>';
                        }
                        
                        // Show movement details table
                        html += renderMovementSummary(data);
                        html += '<h3 style="color: var(--text-primary); margin-bottom: 15px; transition: color 0.3s ease;">Movement Details</h3>';
                        html += '<div class="table-container"><table><thead><tr>';
                        html += '<th>Date</th><th>Type</th><th>Item Code</th><th>Item Name</th><th class="text-right">Quantity</th><th class="text-right">Unit Price</th><th class="text-right">Total Price</th><th>Currency</th><th>Reference</th>';
                        html += '</tr></thead><tbody>';
                        
                        if (data.length === 0) {
                            html += '<tr><td colspan="9" class="empty-state">No movements found</td></tr>';
                        } else {
                            data.forEach((movement, index) => {
                                let referenceLink = '';
                                if (movement.type === 'Purchase' && movement.container_id) {
                                    referenceLink = `<a href="/purchases?container_id=${movement.container_id}" style="color: #1e3a5f; text-decoration: underline; cursor: pointer;" title="View Purchase Container">${movement.container_number || 'N/A'}</a>`;
                                } else if (movement.type === 'Sale' && movement.sale_id) {
                                    referenceLink = `<a href="/sales?sale_id=${movement.sale_id}" style="color: #1e3a5f; text-decoration: underline; cursor: pointer;" title="View Sale Invoice">${movement.invoice_number || 'N/A'}</a>`;
                                } else {
                                    referenceLink = movement.container_number || movement.invoice_number || 'N/A';
                                }
                                
                                html += `<tr>
                                    <td>${movement.date}</td>
                                    <td><span class="badge badge-${movement.type.toLowerCase()}">${movement.type}</span></td>
                                    <td>${movement.item_code}</td>
                                    <td>${movement.item_name}</td>
                                    <td class="text-right">${movement.quantity}</td>
                                    <td class="text-right">${formatCurrency(movement.unit_price, movement.currency)}</td>
                                    <td class="text-right">${formatCurrency(movement.total_price, movement.currency)}</td>
                                    <td>${movement.currency}</td>
                                    <td>${referenceLink}</td>
                                </tr>`;
                            });
                        }
                        
                        html += '</tbody></table></div>';
                        document.getElementById('reportContent').innerHTML = html;
                    })
                    .catch(error => {
                        console.error('Error loading price breakdown:', error);
                        // Still show movement details even if breakdown fails
                        renderMovementTable(data);
                    });
            } else {
                // No item selected, just show movement table
                renderMovementTable(data);
            }
        })
        .catch(error => {
            console.error('Error loading inventory report:', error);
            document.getElementById('reportContent').innerHTML = '<p style="color: red;">Error loading report</p>';
        });
}

function renderMovementTable(data) {
    let html = renderMovementSummary(data);
    html += '<div class="table-container"><table><thead><tr>';
    html += '<th>Date</th><th>Type</th><th>Item Code</th><th>Item Name</th><th class="text-right">Quantity</th><th class="text-right">Unit Price</th><th class="text-right">Total Price</th><th>Currency</th>';
    html += '</tr></thead><tbody>';
    
    if (data.length === 0) {
        html += '<tr><td colspan="8" class="empty-state">No movements found</td></tr>';
    } else {
        data.forEach((movement, index) => {
            html += `<tr>
                <td>${movement.date}</td>
                <td><span class="badge badge-${movement.type.toLowerCase()}">${movement.type}</span></td>
                <td>${movement.item_code}</td>
                <td>${movement.item_name}</td>
                <td class="text-right">${movement.quantity}</td>
                <td class="text-right">${formatCurrency(movement.unit_price, movement.currency)}</td>
                <td class="text-right">${formatCurrency(movement.total_price, movement.currency)}</td>
                <td>${movement.currency}</td>
            </tr>`;
        });
    }
    
    html += '</tbody></table></div>';
    document.getElementById('reportContent').innerHTML = html;
}

function showInventoryStockReport() {
    currentReportType = 'inventory-stock';
    // Hide PDF export button for non-container reports
    const pdfBtn = document.getElementById('exportPDFBtn');
    if (pdfBtn) pdfBtn.style.display = 'none';
    document.getElementById('reportTitle').textContent = 'Inventory Stock Report';
    document.getElementById('reportFilters').style.display = 'none';
    document.getElementById('containerReportFilters').style.display = 'none';
    document.getElementById('safeReportTypeFilter').style.display = 'none';
    document.getElementById('inventoryMovementTypeFilter').style.display = 'none';
    document.getElementById('inventoryItemFilter').style.display = 'none';
    document.getElementById('profitLossItemFilter').style.display = 'none';
    document.getElementById('inventoryStockFilters').style.display = 'block';
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('reportArea').style.display = 'block';
    
    // Load suppliers for filter
    fetch('/api/companies?category=Supplier')
        .then(response => response.json())
        .then(suppliers => {
            const select = document.getElementById('inventoryStockSupplier');
            if (select) {
                // Clear existing options except "All Suppliers"
                select.innerHTML = '<option value="">All Suppliers</option>';
                suppliers.forEach(s => {
                    const option = document.createElement('option');
                    option.value = s.id;
                    option.textContent = s.name;
                    select.appendChild(option);
                });
            }
        })
        .catch(error => {
            console.error('Error loading suppliers:', error);
        });
    
    loadInventoryStockReport();
}

function showInventorySnapshotReport() {
    currentReportType = 'inventory-snapshot';
    // Hide PDF export button for non-container reports
    const pdfBtn = document.getElementById('exportPDFBtn');
    if (pdfBtn) pdfBtn.style.display = 'none';
    document.getElementById('reportTitle').textContent = 'Inventory Snapshot Report';
    document.getElementById('reportFilters').style.display = 'none';
    document.getElementById('containerReportFilters').style.display = 'none';
    document.getElementById('safeReportTypeFilter').style.display = 'none';
    document.getElementById('inventoryMovementTypeFilter').style.display = 'none';
    document.getElementById('inventoryItemFilter').style.display = 'none';
    document.getElementById('profitLossItemFilter').style.display = 'none';
    document.getElementById('inventoryStockFilters').style.display = 'none';
    document.getElementById('inventorySnapshotFilters').style.display = 'block';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('reportArea').style.display = 'block';
    
    // Default snapshot date to today
    const today = new Date().toISOString().split('T')[0];
    const snapshotDateInput = document.getElementById('inventorySnapshotDate');
    if (snapshotDateInput && !snapshotDateInput.value) {
        snapshotDateInput.value = today;
    }
    
    loadSuppliersForInventorySnapshot();
    loadItemsForInventorySnapshot();
    loadInventorySnapshotReport();
}

function showItemStatementReport() {
    currentReportType = 'item-statement';
    // Hide PDF export button for non-container reports
    const pdfBtn = document.getElementById('exportPDFBtn');
    if (pdfBtn) pdfBtn.style.display = 'none';
    document.getElementById('reportTitle').textContent = 'Item Statement Report';
    document.getElementById('reportFilters').style.display = 'none';
    document.getElementById('containerReportFilters').style.display = 'none';
    document.getElementById('safeReportTypeFilter').style.display = 'none';
    document.getElementById('inventoryMovementTypeFilter').style.display = 'none';
    document.getElementById('inventoryItemFilter').style.display = 'none';
    document.getElementById('profitLossItemFilter').style.display = 'none';
    document.getElementById('inventoryStockFilters').style.display = 'none';
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'block';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('reportArea').style.display = 'block';
    
    // Set default dates (last 30 days)
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    document.getElementById('itemStatementStartDate').value = thirtyDaysAgo.toISOString().split('T')[0];
    document.getElementById('itemStatementEndDate').value = today.toISOString().split('T')[0];
    
    // Load suppliers
    loadSuppliersForItemStatement();
    loadItemsForItemStatement();
    loadItemStatementReport();
}

function loadInventoryStockReport() {
    const supplierId = document.getElementById('inventoryStockSupplier')?.value || '';
    
    let url = '/api/reports/inventory-stock';
    if (supplierId) url += `?supplier_id=${supplierId}`;
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                document.getElementById('reportContent').innerHTML = `<p style="color: red;">Error: ${data.error}</p>`;
                return;
            }
            
            // Add supplier filter if not exists
            let filterHtml = '';
            if (!document.getElementById('inventoryStockSupplier')) {
                filterHtml = `
                    <div class="filters" style="margin-bottom: 20px;">
                        <div class="filters-row">
                            <div class="form-group">
                                <label>Supplier</label>
                                <select id="inventoryStockSupplier" class="form-control" onchange="loadInventoryStockReport()">
                                    <option value="">All Suppliers</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <button class="btn btn-secondary" onclick="clearInventoryStockFilters()">Clear</button>
                            </div>
                        </div>
                    </div>
                `;
                
                // Load suppliers
                fetch('/api/companies?category=Supplier')
                    .then(r => r.json())
                    .then(suppliers => {
                        const select = document.getElementById('inventoryStockSupplier');
                        if (select) {
                            suppliers.forEach(s => {
                                const option = document.createElement('option');
                                option.value = s.id;
                                option.textContent = s.name;
                                if (supplierId && s.id == supplierId) option.selected = true;
                                select.appendChild(option);
                            });
                        }
                    });
            }
            
            let html = filterHtml;
            html += `<div style="margin-bottom: 15px; padding: 10px; background: var(--bg-tertiary); border-radius: 4px; color: var(--text-primary); transition: background-color 0.3s ease, color 0.3s ease;">
                <strong>Total Items:</strong> ${data.total_items} | 
                <strong>Total Quantity:</strong> ${data.total_quantity.toFixed(2)} | 
                <strong>Total Weight:</strong> ${data.total_weight.toFixed(2)}
            </div>`;
            html += '<div class="table-container"><table><thead><tr>';
            html += '<th>Item Code</th><th>Item Name</th><th>Supplier</th><th>Grade</th><th>Category 1</th><th>Category 2</th>';
            html += '<th class="text-right">Unit Weight</th><th class="text-right">Total Purchases</th><th class="text-right">Total Sales</th><th class="text-right">Available Quantity</th><th class="text-right">Total Weight</th>';
            html += '<th class="text-right">Avg Purchase Price</th><th class="text-right">Avg Sales Price</th>';
            html += '</tr></thead><tbody>';
            
            if (!data.items || data.items.length === 0) {
                html += '<tr><td colspan="13" class="empty-state">No items found</td></tr>';
            } else {
                data.items.forEach((item, index) => {
                    const avgPurchasePrice = item.avg_purchase_price || 0;
                    const avgSalesPrice = item.avg_sales_price || 0;
                    html += `<tr>
                        <td>${item.code}</td>
                        <td>${item.name}</td>
                        <td>${item.supplier_name || '-'}</td>
                        <td>${item.grade || '-'}</td>
                        <td>${item.category1 || '-'}</td>
                        <td>${item.category2 || '-'}</td>
                        <td class="text-right">${item.weight.toFixed(2)}</td>
                        <td class="text-right">${item.total_purchases.toFixed(2)}</td>
                        <td class="text-right">${item.total_sales.toFixed(2)}</td>
                        <td class="text-right"><strong>${item.available_quantity.toFixed(2)}</strong></td>
                        <td class="text-right">${item.total_weight.toFixed(2)}</td>
                        <td class="text-right">${avgPurchasePrice > 0 ? parseFloat(avgPurchasePrice).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}</td>
                        <td class="text-right">${avgSalesPrice > 0 ? parseFloat(avgSalesPrice).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}</td>
                    </tr>`;
                });
                
                // Add totals row
                html += `<tr class="total-row">
                    <td colspan="7"><strong>TOTAL</strong></td>
                    <td class="text-right"><strong>${data.items.reduce((sum, i) => sum + i.total_purchases, 0).toFixed(2)}</strong></td>
                    <td class="text-right"><strong>${data.items.reduce((sum, i) => sum + i.total_sales, 0).toFixed(2)}</strong></td>
                    <td class="text-right"><strong>${data.total_quantity.toFixed(2)}</strong></td>
                    <td class="text-right"><strong>${data.total_weight.toFixed(2)}</strong></td>
                    <td class="text-right">-</td>
                    <td class="text-right">-</td>
                </tr>`;
            }
            
            html += '</tbody></table></div>';
            document.getElementById('reportContent').innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading inventory stock report:', error);
            document.getElementById('reportContent').innerHTML = '<p style="color: red;">Error loading report</p>';
        });
}

function clearInventoryStockFilters() {
    const select = document.getElementById('inventoryStockSupplier');
    if (select) select.value = '';
    loadInventoryStockReport();
}

function loadSuppliersForInventorySnapshot() {
    fetch('/api/companies?category=Supplier')
        .then(response => response.json())
        .then(suppliers => {
            const select = document.getElementById('inventorySnapshotSupplier');
            if (!select) return;
            select.innerHTML = '<option value="">All Suppliers</option>';
            suppliers.forEach(s => {
                const option = document.createElement('option');
                option.value = s.id;
                option.textContent = s.name;
                select.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Error loading suppliers:', error);
        });
}

function loadItemsForInventorySnapshot() {
    const supplierId = document.getElementById('inventorySnapshotSupplier')?.value;
    let url = '/api/items';
    if (supplierId) {
        url += `?supplier_id=${supplierId}`;
    }
    fetch(url)
        .then(response => response.json())
        .then(items => {
            const select = document.getElementById('inventorySnapshotItem');
            if (!select) return;
            select.innerHTML = '<option value="">All Items</option>';
            items.forEach(item => {
                const option = document.createElement('option');
                option.value = item.id;
                option.textContent = `${item.code} - ${item.name}`;
                select.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Error loading items:', error);
        });
}

function loadInventorySnapshotReport() {
    const snapshotDate = document.getElementById('inventorySnapshotDate')?.value;
    const supplierId = document.getElementById('inventorySnapshotSupplier')?.value;
    const itemId = document.getElementById('inventorySnapshotItem')?.value;
    
    if (!snapshotDate) {
        document.getElementById('reportContent').innerHTML = '<p style="color: red;">Please select a snapshot date.</p>';
        return;
    }
    
    let url = `/api/reports/inventory-snapshot?date=${snapshotDate}`;
    if (supplierId) url += `&supplier_id=${supplierId}`;
    if (itemId) url += `&item_id=${itemId}`;
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                document.getElementById('reportContent').innerHTML = `<p style="color: red;">Error: ${data.error}</p>`;
                return;
            }
            
            const dateDisplay = new Date(data.date).toLocaleDateString();
            let html = generateReportHeader('Inventory Snapshot Report', { startDate: dateDisplay });
            
            html += `<div style="margin-bottom: 15px; padding: 10px; background: var(--bg-tertiary); border-radius: 4px; color: var(--text-primary); transition: background-color 0.3s ease, color 0.3s ease;">
                <strong>Total Items:</strong> ${data.total_items} | 
                <strong>Total Quantity:</strong> ${Number(data.total_quantity).toFixed(2)} | 
                <strong>Total Weight:</strong> ${Number(data.total_weight).toFixed(2)}
            </div>`;
            
            html += '<div class="table-container"><table><thead><tr>';
            html += '<th>Item Code</th><th>Item Name</th><th>Supplier</th><th>Grade</th><th>Category 1</th><th>Category 2</th>';
            html += '<th class="text-right">Unit Weight</th><th class="text-right">Total Purchases</th><th class="text-right">Total Sales</th><th class="text-right">Adjustments</th><th class="text-right">Available Quantity</th><th class="text-right">Total Weight</th>';
            html += '</tr></thead><tbody>';
            
            if (!data.items || data.items.length === 0) {
                html += '<tr><td colspan="12" class="empty-state">No items found</td></tr>';
            } else {
                data.items.forEach(item => {
                    html += `<tr>
                        <td>${item.code}</td>
                        <td>${item.name}</td>
                        <td>${item.supplier_name || '-'}</td>
                        <td>${item.grade || '-'}</td>
                        <td>${item.category1 || '-'}</td>
                        <td>${item.category2 || '-'}</td>
                        <td class="text-right">${Number(item.weight || 0).toFixed(2)}</td>
                        <td class="text-right">${Number(item.total_purchases).toFixed(2)}</td>
                        <td class="text-right">${Number(item.total_sales).toFixed(2)}</td>
                        <td class="text-right">${Number(item.adjustments).toFixed(2)}</td>
                        <td class="text-right"><strong>${Number(item.available_quantity).toFixed(2)}</strong></td>
                        <td class="text-right">${Number(item.total_weight).toFixed(2)}</td>
                    </tr>`;
                });
                
                html += `<tr class="total-row">
                    <td colspan="8"><strong>TOTAL</strong></td>
                    <td class="text-right"><strong>${data.items.reduce((sum, i) => sum + Number(i.total_sales), 0).toFixed(2)}</strong></td>
                    <td class="text-right"><strong>${data.items.reduce((sum, i) => sum + Number(i.adjustments), 0).toFixed(2)}</strong></td>
                    <td class="text-right"><strong>${Number(data.total_quantity).toFixed(2)}</strong></td>
                    <td class="text-right"><strong>${Number(data.total_weight).toFixed(2)}</strong></td>
                </tr>`;
            }
            
            html += '</tbody></table></div>';
            document.getElementById('reportContent').innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading inventory snapshot report:', error);
            document.getElementById('reportContent').innerHTML = '<p style="color: red;">Error loading report</p>';
        });
}

function clearInventorySnapshotFilters() {
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('inventorySnapshotDate');
    if (dateInput) dateInput.value = today;
    const supplierSelect = document.getElementById('inventorySnapshotSupplier');
    if (supplierSelect) supplierSelect.value = '';
    loadItemsForInventorySnapshot();
    loadInventorySnapshotReport();
}

function loadReceivablesReport() {
    fetch('/api/reports/customer-receivables')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                document.getElementById('reportContent').innerHTML = `<p style="color: red;">Error: ${data.error}</p>`;
                return;
            }
            
            let html = generateReportHeader('Customer Receivables Report');
            
            html += `<div class="report-summary">
                <h3>Summary</h3>
                <div class="report-summary-grid">
                    <div class="report-summary-item">
                        <label>Total Receivables</label>
                        <div class="value">${formatCurrency(data.total_receivables)}</div>
                    </div>
                    <div class="report-summary-item">
                        <label>Number of Customers</label>
                        <div class="value">${data.receivables.length}</div>
                    </div>
                </div>
            </div>`;
            
            html += '<div class="report-table-wrapper"><table><thead><tr>';
            html += '<th>Customer Name</th><th>Currency</th><th class="text-right">Outstanding Balance</th>';
            html += '</tr></thead><tbody>';
            
            if (data.receivables.length === 0) {
                html += '<tr><td colspan="3" class="empty-state">No outstanding receivables</td></tr>';
            } else {
                data.receivables.forEach((rec, index) => {
                    html += `<tr>
                        <td>${rec.customer_name}</td>
                        <td>${rec.currency}</td>
                        <td class="text-right" style="font-weight: 600;">${formatCurrency(rec.balance, rec.currency)}</td>
                    </tr>`;
                });
                
                html += `<tr class="total-row">
                    <td colspan="2"><strong>TOTAL</strong></td>
                    <td class="text-right"><strong>${formatCurrency(data.total_receivables)}</strong></td>
                </tr>`;
            }
            
            html += '</tbody></table></div>';
            html += generateReportFooter();
            document.getElementById('reportContent').innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading receivables report:', error);
            document.getElementById('reportContent').innerHTML = '<p style="color: red;">Error loading report</p>';
        });
}

function loadPayablesReport() {
    fetch('/api/reports/supplier-payables')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                document.getElementById('reportContent').innerHTML = `<p style="color: red;">Error: ${data.error}</p>`;
            return;
            }
            
            let html = generateReportHeader('Supplier Payables Report');
            
            // Build currency totals summary
            let currencyTotalsHtml = '';
            if (data.currency_totals && Object.keys(data.currency_totals).length > 0) {
                currencyTotalsHtml = '<div class="report-summary" style="margin-bottom: 20px;">';
                currencyTotalsHtml += '<h3>Totals by Currency</h3>';
                currencyTotalsHtml += '<div class="report-summary-grid">';
                
                Object.keys(data.currency_totals).sort().forEach(currency => {
                    const total = data.currency_totals[currency];
                    currencyTotalsHtml += `
                        <div class="report-summary-item">
                            <label>Total (${currency})</label>
                            <div class="value">${formatCurrency(total, currency)}</div>
                        </div>
                    `;
                });
                
                currencyTotalsHtml += '</div></div>';
            }
            
            html += `<div class="report-summary">
                <h3>Summary</h3>
                <div class="report-summary-grid">
                    <div class="report-summary-item">
                        <label>Number of Suppliers</label>
                        <div class="value">${data.payables.length}</div>
                    </div>
                    <div class="report-summary-item">
                        <label>Number of Currencies</label>
                        <div class="value">${data.currency_totals ? Object.keys(data.currency_totals).length : 0}</div>
                    </div>
                </div>
            </div>`;
            
            html += currencyTotalsHtml;
            
            html += '<div class="report-table-wrapper"><table><thead><tr>';
            html += '<th>Supplier Name</th><th>Currency</th><th class="text-right">Outstanding Balance</th>';
            html += '</tr></thead><tbody>';
            
            if (data.payables.length === 0) {
                html += '<tr><td colspan="3" class="empty-state">No outstanding payables</td></tr>';
            } else {
                // Group by currency for better organization
                const payablesByCurrency = {};
                data.payables.forEach(pay => {
                    if (!payablesByCurrency[pay.currency]) {
                        payablesByCurrency[pay.currency] = [];
                    }
                    payablesByCurrency[pay.currency].push(pay);
                });
                
                // Render by currency
                Object.keys(payablesByCurrency).sort().forEach(currency => {
                    const currencyPayables = payablesByCurrency[currency];
                    currencyPayables.forEach((pay, index) => {
                        html += `<tr>
                            <td>${pay.supplier_name}</td>
                            <td>${currency}</td>
                            <td class="text-right" style="font-weight: 600;">${formatCurrency(pay.balance, currency)}</td>
                        </tr>`;
                    });
                    
                    // Add subtotal for this currency
                    const currencyTotal = data.currency_totals[currency];
                    html += `<tr class="total-row">
                        <td colspan="2"><strong>Subtotal (${currency})</strong></td>
                        <td class="text-right"><strong>${formatCurrency(currencyTotal, currency)}</strong></td>
                    </tr>`;
                });
            }
            
            html += '</tbody></table></div>';
            html += generateReportFooter();
            document.getElementById('reportContent').innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading payables report:', error);
            document.getElementById('reportContent').innerHTML = '<p style="color: red;">Error loading report</p>';
        });
}

function loadSalesReport() {
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    
    let url = '/api/reports/sales?';
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                document.getElementById('reportContent').innerHTML = `<p style="color: red;">Error: ${data.error}</p>`;
                return;
            }
            
            const startDateDisplay = startDate ? new Date(startDate).toLocaleDateString() : 'All';
            const endDateDisplay = endDate ? new Date(endDate).toLocaleDateString() : 'All';
            const baseCurrency = data.base_currency || '';
            
            let html = generateReportHeader('Sales Report (By Item)', {
                startDate: startDateDisplay,
                endDate: endDateDisplay
            });
            
            html += `<div class="report-summary">
                <h3>Summary</h3>
                <div class="report-summary-grid">
                    <div class="report-summary-item">
                        <label>Total Sales</label>
                        <div class="value" style="color: #4caf50;">${formatCurrency(data.totals.total_sales, baseCurrency)}</div>
                    </div>
                    <div class="report-summary-item">
                        <label>Total Items Sold</label>
                        <div class="value">${data.totals.total_items_sold.toFixed(2)}</div>
                    </div>
                    <div class="report-summary-item">
                        <label>Number of Items</label>
                        <div class="value">${data.totals.items_count}</div>
                    </div>
                    <div class="report-summary-item">
                        <label>Number of Transactions</label>
                        <div class="value">${data.totals.transactions_count}</div>
                    </div>
                </div>
            </div>`;
            
            html += '<div class="report-table-wrapper"><table><thead><tr>';
            html += '<th>Item Code</th><th>Item Name</th><th>Date</th><th>Invoice</th><th>Customer</th><th>Supplier</th>';
            html += '<th class="text-right">Quantity</th><th class="text-right">Unit Price</th><th class="text-right">Total Price</th><th>Payment Type</th><th>Status</th>';
            html += '</tr></thead><tbody>';
            
            if (data.items.length === 0) {
                html += '<tr><td colspan="11" class="empty-state">No sales found for the selected period</td></tr>';
            } else {
                data.items.forEach((item, itemIndex) => {
                    // Item header row with totals
                    html += `<tr class="item-header-row" style="background-color: #e3f2fd; font-weight: 600;">
                        <td colspan="2" style="color: #1e3a5f;">${item.item_code} - ${item.item_name}</td>
                        <td colspan="4" style="color: #1e3a5f;">Total: ${item.total_quantity.toFixed(2)} units</td>
                        <td class="text-right" colspan="3" style="color: #1e3a5f;">${formatCurrency(item.total_amount, baseCurrency)}</td>
                        <td colspan="2"></td>
                    </tr>`;
                    
                    // Sales transactions for this item
                    item.sales.forEach((sale, saleIndex) => {
                        const dateObj = new Date(sale.date);
                        const dateDisplay = dateObj.toLocaleDateString();
                        
                        html += `<tr class="sale-transaction-row" data-item-index="${itemIndex}">
                            <td></td>
                            <td></td>
                            <td>${dateDisplay}</td>
                            <td style="font-weight: 600; color: #1e3a5f;">${sale.invoice_number}</td>
                            <td>${sale.customer_name}</td>
                            <td>${sale.supplier_name || '-'}</td>
                            <td class="text-right">${sale.quantity.toFixed(2)}</td>
                            <td class="text-right">${formatCurrency(sale.unit_price, baseCurrency)}</td>
                            <td class="text-right" style="font-weight: 600;">${formatCurrency(sale.total_price, baseCurrency)}</td>
                            <td><span class="badge badge-${sale.payment_type === 'Cash' ? 'success' : 'info'}">${sale.payment_type}</span></td>
                            <td><span class="badge badge-${sale.status === 'Paid' ? 'success' : sale.status === 'Partial' ? 'warning' : 'danger'}">${sale.status}</span></td>
                        </tr>`;
                    });
                });
                
                html += `<tr class="total-row">
                    <td colspan="6"><strong>TOTAL</strong></td>
                    <td class="text-right"><strong>${data.totals.total_items_sold.toFixed(2)}</strong></td>
                    <td colspan="2" class="text-right"><strong>${formatCurrency(data.totals.total_sales, baseCurrency)}</strong></td>
                    <td colspan="2"></td>
                </tr>`;
            }
            
            html += '</tbody></table></div>';
            html += generateReportFooter();
            document.getElementById('reportContent').innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading sales report:', error);
            document.getElementById('reportContent').innerHTML = '<p style="color: red;">Error loading report</p>';
        });
}

function loadCollectedMoneyReport() {
    const content = document.getElementById('reportContent');
    content.innerHTML = '<div class="spinner"></div>';

    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    const groupBy = 'date'; // Can be enhanced to add group_by filter
    
    let url = '/api/safe/collected-money-report?';
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    url += `group_by=${groupBy}`;
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                document.getElementById('reportContent').innerHTML = `<p style="color: red;">Error: ${data.error}</p>`;
                return;
            }
            
            const startDateDisplay = startDate ? new Date(startDate).toLocaleDateString() : 'All';
            const endDateDisplay = endDate ? new Date(endDate).toLocaleDateString() : 'All';
            
            let html = generateReportHeader('Collected Money Report', { startDate: startDateDisplay, endDate: endDateDisplay });
            
            html += `<div class="report-summary">
                <h3>Summary</h3>
                <div class="report-summary-grid">
                    <div class="report-summary-item" style="border: 2px solid #4caf50;">
                        <label>Total Collected</label>
                        <div class="value" style="color: #4caf50; font-size: 24px;">${formatCurrency(data.total_collected)}</div>
                    </div>
                </div>
            </div>`;
            
            html += '<div class="report-table-wrapper" id="collectedMoneyTable"><table><thead><tr>';
            html += '<th data-column="date">Date<span class="resizer"></span></th><th data-column="source_type">Source Type<span class="resizer"></span></th><th data-column="customer">Customer/Source<span class="resizer"></span></th><th data-column="invoice_number">Invoice Number<span class="resizer"></span></th><th data-column="description">Description<span class="resizer"></span></th><th class="text-right" data-column="amount">Amount<span class="resizer"></span></th>';
            html += '</tr></thead><tbody>';
            
            if (data.grouped_by === 'date' && data.data) {
                // Grouped by date
                data.data.forEach(group => {
                    html += `<tr style="background-color: #f0f0f0; font-weight: 600;" class="group-header-row">
                        <td data-column="date" colspan="1">${group.date} - Total</td>
                        <td data-column="source_type" colspan="4"></td>
                        <td class="text-right" data-column="amount" style="font-weight: 600;">${formatCurrency(group.total)}</td>
                    </tr>`;
                    group.items.forEach(item => {
                        html += `<tr>
                            <td data-column="date">${item.date}</td>
                            <td data-column="source_type"><span class="badge badge-${item.source_type.toLowerCase().replace(' ', '-')}">${item.source_type}</span></td>
                            <td data-column="customer">${item.customer_name || item.source_name || 'N/A'}</td>
                            <td data-column="invoice_number">${item.invoice_number || '-'}</td>
                            <td data-column="description">${item.description || '-'}</td>
                            <td class="text-right" data-column="amount" style="color: #4caf50; font-weight: 600;">${formatCurrency(item.amount)}</td>
                        </tr>`;
                    });
                });
            } else if (data.grouped_by === 'customer' && data.data) {
                // Grouped by customer
                data.data.forEach(group => {
                    html += `<tr style="background-color: #f0f0f0; font-weight: 600;" class="group-header-row">
                        <td data-column="date" colspan="1">${group.customer_name} - Total</td>
                        <td data-column="source_type" colspan="4"></td>
                        <td class="text-right" data-column="amount" style="font-weight: 600;">${formatCurrency(group.total)}</td>
                    </tr>`;
                    group.items.forEach(item => {
                        html += `<tr>
                            <td data-column="date">${item.date}</td>
                            <td data-column="source_type"><span class="badge badge-${item.source_type.toLowerCase().replace(' ', '-')}">${item.source_type}</span></td>
                            <td data-column="customer">${item.customer_name || item.source_name || 'N/A'}</td>
                            <td data-column="invoice_number">${item.invoice_number || '-'}</td>
                            <td data-column="description">${item.description || '-'}</td>
                            <td class="text-right" data-column="amount" style="color: #4caf50; font-weight: 600;">${formatCurrency(item.amount)}</td>
                        </tr>`;
                    });
                });
            } else if (data.data && data.data.length > 0) {
                // Not grouped
                data.data.forEach(item => {
                    html += `<tr>
                        <td data-column="date">${item.date}</td>
                        <td data-column="source_type"><span class="badge badge-${item.source_type.toLowerCase().replace(' ', '-')}">${item.source_type}</span></td>
                        <td data-column="customer">${item.customer_name || item.source_name || 'N/A'}</td>
                        <td data-column="invoice_number">${item.invoice_number || '-'}</td>
                        <td data-column="description">${item.description || '-'}</td>
                        <td class="text-right" data-column="amount" style="color: #4caf50; font-weight: 600;">${formatCurrency(item.amount)}</td>
                    </tr>`;
                });
            } else {
                html += '<tr><td colspan="6" class="empty-state">No collected money found</td></tr>';
            }
            
            html += '</tbody></table></div>';
            html += generateReportFooter();
            document.getElementById('reportContent').innerHTML = html;
            
            // Initialize column resizing and apply saved visibility
            setTimeout(() => {
                initializeReportColumnResizing('collectedMoneyTable');
                applySavedCollectedMoneyColumnVisibility();
            }, 100);
        })
        .catch(error => {
            console.error('Error loading collected money report:', error);
            document.getElementById('reportContent').innerHTML = '<p style="color: red;">Error loading report</p>';
        });
}

function loadSafeReport() {
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    const transactionType = document.getElementById('reportTransactionType').value;
    
    let url = '/api/safe/movement-report?';
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    if (transactionType && transactionType !== 'All') url += `transaction_type=${transactionType}&`;
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                document.getElementById('reportContent').innerHTML = `<p style="color: red;">Error: ${data.error}</p>`;
                return;
            }
            
            const startDateDisplay = startDate ? new Date(startDate).toLocaleDateString() : 'All';
            const endDateDisplay = endDate ? new Date(endDate).toLocaleDateString() : 'All';
            
            let html = generateReportHeader('Safe Movement Report', { startDate: startDateDisplay, endDate: endDateDisplay });
            
            html += `<div class="report-summary">
                <h3>Summary</h3>
                <div class="report-summary-grid">
                    <div class="report-summary-item">
                        <label>Opening Balance</label>
                        <div class="value">${formatCurrency(data.opening_balance)}</div>
                    </div>
                    <div class="report-summary-item">
                        <label>Total Inflow</label>
                        <div class="value" style="color: #4caf50;">${formatCurrency(data.total_inflow)}</div>
                    </div>
                    <div class="report-summary-item">
                        <label>Total Outflow</label>
                        <div class="value" style="color: #f44336;">${formatCurrency(data.total_outflow)}</div>
                    </div>
                    <div class="report-summary-item">
                        <label>Closing Balance</label>
                        <div class="value" style="color: #1e3a5f;">${formatCurrency(data.closing_balance)}</div>
                    </div>
                </div>
            </div>`;
            
            html += '<div class="report-table-wrapper" id="safeMovementTable"><table><thead><tr>';
            html += '<th>Date<span class="resizer"></span></th><th>Type<span class="resizer"></span></th><th>Description<span class="resizer"></span></th><th class="text-right">Amount<span class="resizer"></span></th><th class="text-right">Balance After<span class="resizer"></span></th>';
            html += '</tr></thead><tbody>';
            
            if (data.transactions.length === 0) {
                html += '<tr><td colspan="5" class="empty-state">No transactions found</td></tr>';
            } else {
                data.transactions.forEach((txn, index) => {
                    html += `<tr>
                        <td>${txn.date}</td>
                        <td><span class="badge badge-${txn.type.toLowerCase()}">${txn.type}</span></td>
                        <td>${txn.description}</td>
                        <td class="text-right" style="color: ${txn.type === 'Inflow' ? '#4caf50' : '#f44336'}; font-weight: 600;">${formatCurrency(txn.amount)}</td>
                        <td class="text-right" style="font-weight: 600;">${formatCurrency(txn.balance_after)}</td>
                    </tr>`;
                });
            }
            
            html += '</tbody></table></div>';
            html += generateReportFooter();
            document.getElementById('reportContent').innerHTML = html;
            
            // Initialize column resizing for safe movement report after a short delay to ensure DOM is ready
            setTimeout(() => {
                initializeReportColumnResizing('safeMovementTable');
            }, 100);
        })
        .catch(error => {
            console.error('Error loading safe report:', error);
            document.getElementById('reportContent').innerHTML = '<p style="color: red;">Error loading report</p>';
        });
}

function loadSafeOutReport() {
    const content = document.getElementById('reportContent');
    content.innerHTML = '<div class="spinner"></div>';

    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;

    let url = '/api/reports/safe-out?';
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                document.getElementById('reportContent').innerHTML = `<p style="color: red;">Error: ${data.error}</p>`;
                return;
            }

            const startDateDisplay = startDate ? new Date(startDate).toLocaleDateString() : 'All';
            const endDateDisplay = endDate ? new Date(endDate).toLocaleDateString() : 'All';

            let html = generateReportHeader('Safe Out Report', { startDate: startDateDisplay, endDate: endDateDisplay });

            html += `<div class="report-summary">
                <h3>Summary</h3>
                <div class="report-summary-grid">
                    <div class="report-summary-item">
                        <label>Total Payments</label>
                        <div class="value">${formatCurrency(data.totals ? data.totals.total_payments : 0)}</div>
                    </div>
                    <div class="report-summary-item">
                        <label>Total Expenses</label>
                        <div class="value">${formatCurrency(data.totals ? data.totals.total_expenses : 0)}</div>
                    </div>
                    <div class="report-summary-item">
                        <label>Total Out</label>
                        <div class="value" style="color: #f44336;">${formatCurrency(data.totals ? data.totals.total_out : 0)}</div>
                    </div>
                </div>
            </div>`;

            html += '<div class="report-table-wrapper" id="safeOutTable"><table><thead><tr>';
            html += '<th>Date<span class="resizer"></span></th><th>Type<span class="resizer"></span></th><th>Description<span class="resizer"></span></th><th>Category<span class="resizer"></span></th><th>Invoice<span class="resizer"></span></th><th class="text-right">Amount<span class="resizer"></span></th><th class="text-right">Amount (Base)<span class="resizer"></span></th><th>Notes<span class="resizer"></span></th>';
            html += '</tr></thead><tbody>';

            const transactions = data.transactions || [];
            if (transactions.length === 0) {
                html += '<tr><td colspan="8" class="empty-state">No transactions found</td></tr>';
            } else {
                transactions.forEach(txn => {
                    html += `<tr>
                        <td>${txn.date}</td>
                        <td><span class="badge badge-${txn.type.toLowerCase()}">${txn.type}</span></td>
                        <td>${escapeHtml(txn.description)}</td>
                        <td>${escapeHtml(txn.category)}</td>
                        <td>${txn.invoice_number || '-'}</td>
                        <td class="text-right">${formatCurrency(txn.amount)} ${txn.currency || ''}</td>
                        <td class="text-right" style="color: #f44336; font-weight: 600;">${formatCurrency(txn.amount_base_currency)}</td>
                        <td>${escapeHtml(txn.notes || '-')}</td>
                    </tr>`;
                });
            }

            html += '</tbody></table></div>';
            html += generateReportFooter();
            document.getElementById('reportContent').innerHTML = html;

            setTimeout(() => {
                initializeReportColumnResizing('safeOutTable');
            }, 100);
        })
        .catch(error => {
            console.error('Error loading safe out report:', error);
            document.getElementById('reportContent').innerHTML = '<p style="color: red;">Error loading report</p>';
        });
}

function loadSuppliersForContainerReport() {
    fetch('/api/companies?category=Supplier')
        .then(response => response.json())
        .then(data => {
            const select = document.getElementById('containerReportSupplier');
            select.innerHTML = '<option value="">Select Supplier</option>';
            data.forEach(supplier => {
                const option = document.createElement('option');
                option.value = supplier.id;
                option.textContent = supplier.name;
                select.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Error loading suppliers:', error);
        });
}

function loadContainersForReport() {
    const supplierId = document.getElementById('containerReportSupplier').value;
    const containerSelect = document.getElementById('containerReportContainer');
    containerSelect.innerHTML = '<option value="">Select Container</option>';
    
    if (!supplierId) {
        return;
    }
    
    fetch(`/api/purchases/containers?supplier_id=${supplierId}`)
        .then(response => response.json())
        .then(data => {
            data.forEach(container => {
                const option = document.createElement('option');
                option.value = container.id;
                option.textContent = `${container.container_number} - ${container.date}`;
                containerSelect.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Error loading containers:', error);
        });
}

function loadContainerReport() {
    const supplierId = document.getElementById('containerReportSupplier').value;
    const containerId = document.getElementById('containerReportContainer').value;
    
    if (!containerId) {
        document.getElementById('reportContent').innerHTML = '<p style="color: #666;">Please select a supplier and container</p>';
        return;
    }
    
    let url = `/api/reports/container-report?container_id=${containerId}`;
    if (supplierId) url += `&supplier_id=${supplierId}`;
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                document.getElementById('reportContent').innerHTML = `<p style="color: red;">Error: ${data.error}</p>`;
                return;
            }
            
            const currency = data.container.currency;
            const dateDisplay = new Date(data.container.date).toLocaleDateString();
            
            let html = generateReportHeader('Container Report', {
                container: data.container.container_number,
                supplier: data.container.supplier_name,
                startDate: dateDisplay
            });
            
            html += `<div class="report-summary">
                <h3>Container Information</h3>
                <div class="report-summary-grid">
                    <div class="report-summary-item">
                        <label>Container Number</label>
                        <div class="value">${data.container.container_number}</div>
                    </div>
                    <div class="report-summary-item">
                        <label>Date</label>
                        <div class="value">${dateDisplay}</div>
                    </div>
                    <div class="report-summary-item">
                        <label>Supplier</label>
                        <div class="value">${data.container.supplier_name}</div>
                    </div>
                    <div class="report-summary-item">
                        <label>Currency</label>
                        <div class="value">${data.container.currency}</div>
                    </div>
                    <div class="report-summary-item">
                        <label>Exchange Rate</label>
                        <div class="value">${data.container.exchange_rate.toFixed(4)}</div>
                    </div>
                </div>
            </div>`;
            
            // Get column visibility settings
            const columnVisibility = getColumnVisibility();
            
            html += '<div class="report-table-wrapper" id="containerReportTable"><table><thead><tr>';
            
            if (columnVisibility.item_code !== false) {
                html += '<th data-column="item_code">Item Code<span class="resizer"></span></th>';
            }
            if (columnVisibility.item_name !== false) {
                html += '<th data-column="item_name">Item Name<span class="resizer"></span></th>';
            }
            if (columnVisibility.quantity !== false) {
                html += '<th class="text-right" data-column="quantity">Quantity<span class="resizer"></span></th>';
            }
            if (columnVisibility.item_weight !== false) {
                html += '<th class="text-right" data-column="item_weight">Item Weight<span class="resizer"></span></th>';
            }
            if (columnVisibility.item_total_weight !== false) {
                html += '<th class="text-right" data-column="item_total_weight">Item Total Weight<span class="resizer"></span></th>';
            }
            if (columnVisibility.unit_price !== false) {
                html += '<th class="text-right" data-column="unit_price">Unit Price<span class="resizer"></span></th>';
            }
            if (columnVisibility.total_price !== false) {
                html += '<th class="text-right" data-column="total_price">Total Price<span class="resizer"></span></th>';
            }
            if (columnVisibility.cog !== false) {
                html += '<th class="text-right" data-column="cog">COG<span class="resizer"></span></th>';
            }
            if (columnVisibility.total_cog !== false) {
                html += '<th class="text-right" data-column="total_cog">Total COG<span class="resizer"></span></th>';
            }
            if (columnVisibility.item_cost !== false) {
                html += '<th class="text-right" data-column="item_cost" style="color: #4caf50; font-weight: 600;">Item Cost<span class="resizer"></span></th>';
            }
            if (columnVisibility.item_total_cost !== false) {
                html += '<th class="text-right" data-column="item_total_cost">Item Total Cost<span class="resizer"></span></th>';
            }
            
            html += '</tr></thead><tbody>';
            
            data.items.forEach((item, index) => {
                html += '<tr>';
                
                if (columnVisibility.item_code !== false) {
                    html += `<td data-column="item_code">${item.item_code}</td>`;
                }
                if (columnVisibility.item_name !== false) {
                    html += `<td data-column="item_name">${item.item_name}</td>`;
                }
                if (columnVisibility.quantity !== false) {
                    html += `<td class="text-right" data-column="quantity">${item.quantity.toFixed(2)}</td>`;
                }
                if (columnVisibility.item_weight !== false) {
                    html += `<td class="text-right" data-column="item_weight">${item.item_weight.toFixed(2)}</td>`;
                }
                if (columnVisibility.item_total_weight !== false) {
                    html += `<td class="text-right" data-column="item_total_weight">${item.item_total_weight.toFixed(2)}</td>`;
                }
                if (columnVisibility.unit_price !== false) {
                    html += `<td class="text-right" data-column="unit_price">${formatCurrency(item.unit_price, currency)}</td>`;
                }
                if (columnVisibility.total_price !== false) {
                    html += `<td class="text-right" data-column="total_price">${formatCurrency(item.total_price, currency)}</td>`;
                }
                if (columnVisibility.cog !== false) {
                    html += `<td class="text-right" data-column="cog">${formatCurrency(item.cog, currency)}</td>`;
                }
                if (columnVisibility.total_cog !== false) {
                    html += `<td class="text-right" data-column="total_cog">${formatCurrency(item.total_cog, currency)}</td>`;
                }
                if (columnVisibility.item_cost !== false) {
                    html += `<td class="text-right" data-column="item_cost" style="color: #4caf50; font-weight: 600;">${formatCurrency(item.item_cost, currency)}</td>`;
                }
                if (columnVisibility.item_total_cost !== false) {
                    html += `<td class="text-right" data-column="item_total_cost">${formatCurrency(item.item_total_cost, currency)}</td>`;
                }
                
                html += '</tr>';
            });
            
            // Totals row - calculate colspan dynamically for first two columns
            html += '<tr class="total-row">';
            
            let labelColspan = 0;
            if (columnVisibility.item_code !== false) labelColspan++;
            if (columnVisibility.item_name !== false) labelColspan++;
            labelColspan = Math.max(1, labelColspan);
            
            if (columnVisibility.item_code !== false || columnVisibility.item_name !== false) {
                html += `<td colspan="${labelColspan}"><strong>TOTAL</strong></td>`;
            }
            
            if (columnVisibility.quantity !== false) {
                html += `<td class="text-right" data-column="quantity"><strong>${data.totals.quantity.toFixed(2)}</strong></td>`;
            }
            if (columnVisibility.item_weight !== false) {
                html += '<td class="text-right" data-column="item_weight">-</td>';
            }
            if (columnVisibility.item_total_weight !== false) {
                html += `<td class="text-right" data-column="item_total_weight"><strong>${data.totals.item_total_weight.toFixed(2)}</strong></td>`;
            }
            if (columnVisibility.unit_price !== false) {
                html += '<td class="text-right" data-column="unit_price">-</td>';
            }
            if (columnVisibility.total_price !== false) {
                html += `<td class="text-right" data-column="total_price"><strong>${formatCurrency(data.totals.total_price, currency)}</strong></td>`;
            }
            if (columnVisibility.cog !== false) {
                html += '<td class="text-right" data-column="cog">-</td>';
            }
            if (columnVisibility.total_cog !== false) {
                html += `<td class="text-right" data-column="total_cog"><strong>${formatCurrency(data.totals.total_cog, currency)}</strong></td>`;
            }
            if (columnVisibility.item_cost !== false) {
                html += '<td class="text-right" data-column="item_cost">-</td>';
            }
            if (columnVisibility.item_total_cost !== false) {
                html += `<td class="text-right" data-column="item_total_cost" style="color: #4caf50; font-weight: 600;"><strong>${formatCurrency(data.totals.item_total_cost, currency)}</strong></td>`;
            }
            
            html += '</tr>';
            
            html += '</tbody></table></div>';
            
            // Initialize column resizing after a short delay to ensure DOM is ready
            setTimeout(() => {
                initializeReportColumnResizing('containerReportTable');
            }, 100);
            
            // Expenses and Supplier Cost boxes
            html += `<div class="report-summary" style="margin-top: 30px;">
                <h3>Expenses & Costs</h3>
                <div class="report-summary-grid">
                    <div class="report-summary-item expense-box" style="background: #e3f2fd; border-color: #2196f3;">
                        <label style="color: #1976d2;">Expense 1 <span style="font-size: 11px; font-weight: normal; color: #666;">(FREIGHT & OTHER SUPPLIER EXP)</span></label>
                        <div class="value" style="color: #1976d2;">${formatCurrency(data.expenses.expense1, currency)}</div>
                    </div>
                    <div class="report-summary-item expense-box" style="background: #fff3e0; border-color: #ff9800;">
                        <label style="color: #f57c00;">Expense 2 <span style="font-size: 11px; font-weight: normal; color: #666;">(CUSTOMS FEES & CLEARNCE)</span></label>
                        <div class="value" style="color: #f57c00;">${formatCurrency(data.expenses.expense2, currency)}</div>
                    </div>
                    <div class="report-summary-item expense-box" style="background: #fce4ec; border-color: #e91e63;">
                        <label style="color: #c2185b;">Expense 3 <span style="font-size: 11px; font-weight: normal; color: #666;">(OTHER)</span></label>
                        <div class="value" style="color: #c2185b;">${formatCurrency(data.expenses.expense3, currency)}</div>
                    </div>
                    <div class="report-summary-item expense-box" style="background: #e8f5e9; border-color: #4caf50;">
                        <label style="color: #2e7d32;">Total Expenses</label>
                        <div class="value" style="color: #2e7d32;">${formatCurrency(data.expenses.total, currency)}</div>
                    </div>
                    <div class="report-summary-item expense-box" style="background: #fff9c4; border-color: #fbc02d;">
                        <label style="color: #f57f17;">Supplier Cost</label>
                        <div class="value" style="color: #f57f17;">${formatCurrency(data.supplier_cost, currency)}</div>
                    </div>
                </div>
            </div>`;
            
            html += generateReportFooter();
            document.getElementById('reportContent').innerHTML = html;
            
            // Store current report data for PDF export
            window.currentContainerReportData = data;
        })
        .catch(error => {
            console.error('Error loading container report:', error);
            document.getElementById('reportContent').innerHTML = '<p style="color: red;">Error loading report</p>';
        });
}

let profitLossItems = [];

function loadItemsForProfitLoss() {
    fetch('/api/items')
        .then(response => response.json())
        .then(data => {
            profitLossItems = data;
            filterProfitLossItems('');
        })
        .catch(error => {
            console.error('Error loading items for profit loss:', error);
        });
}

function showProfitLossItemDropdown() {
    const dropdown = document.getElementById('profitLossItemDropdown');
    if (dropdown) {
        dropdown.style.display = 'block';
    }
}

function hideProfitLossItemDropdown() {
    const dropdown = document.getElementById('profitLossItemDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
}

function filterProfitLossItems(searchTerm) {
    const dropdown = document.getElementById('profitLossItemDropdown');
    if (!dropdown) return;
    
    const searchLower = (searchTerm || '').toLowerCase();
    const filteredItems = profitLossItems.filter(item => {
        const code = (item.code || '').toLowerCase();
        const name = (item.name || '').toLowerCase();
        const fullText = `${code} ${name}`.trim();
        return fullText.includes(searchLower);
    });
    
    dropdown.innerHTML = '';
    
    const allItemsDiv = document.createElement('div');
    allItemsDiv.className = 'dropdown-item';
    allItemsDiv.textContent = 'All Items';
    allItemsDiv.style.cssText = 'padding: 10px; cursor: pointer; border-bottom: 1px solid var(--border-color);';
    allItemsDiv.onclick = () => selectProfitLossItem('', 'All Items');
    dropdown.appendChild(allItemsDiv);
    
    filteredItems.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'dropdown-item';
        itemDiv.style.cssText = 'padding: 10px; cursor: pointer; border-bottom: 1px solid var(--border-color);';
        const displayText = `${item.code || ''} ${item.name || ''}`.trim() || 'Unnamed Item';
        itemDiv.textContent = displayText;
        itemDiv.onclick = () => selectProfitLossItem(item.id, displayText);
        dropdown.appendChild(itemDiv);
    });
    
    if (searchTerm || filteredItems.length > 0) {
        showProfitLossItemDropdown();
    }
}

function selectProfitLossItem(itemId, displayText) {
    const hiddenInput = document.getElementById('profitLossItem');
    const searchInput = document.getElementById('profitLossItemSearch');
    
    if (hiddenInput) hiddenInput.value = itemId || '';
    if (searchInput) searchInput.value = displayText || '';
    
    hideProfitLossItemDropdown();
}

let stockValueDetailsItems = [];

function loadItemsForStockValueDetails() {
    fetch('/api/items')
        .then(response => response.json())
        .then(data => {
            stockValueDetailsItems = data;
            filterStockValueDetailsItems('');
        })
        .catch(error => {
            console.error('Error loading items:', error);
        });
}

function showStockValueDetailsDropdown() {
    const dropdown = document.getElementById('stockValueDetailsItemDropdown');
    if (dropdown) {
        dropdown.style.display = 'block';
    }
}

function hideStockValueDetailsDropdown() {
    const dropdown = document.getElementById('stockValueDetailsItemDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
}

function filterStockValueDetailsItems(searchTerm) {
    const dropdown = document.getElementById('stockValueDetailsItemDropdown');
    if (!dropdown) return;
    
    const searchLower = searchTerm.toLowerCase();
    const filteredItems = stockValueDetailsItems.filter(item => {
        const code = (item.code || '').toLowerCase();
        const name = (item.name || '').toLowerCase();
        const fullText = `${code} ${name}`.trim();
        return fullText.includes(searchLower);
    });
    
    // Clear dropdown
    dropdown.innerHTML = '';
    
    // Add "All Items" option
    const allItemsDiv = document.createElement('div');
    allItemsDiv.className = 'dropdown-item';
    allItemsDiv.textContent = 'All Items';
    allItemsDiv.onclick = () => selectStockValueDetailsItem('', 'All Items');
    dropdown.appendChild(allItemsDiv);
    
    // Add filtered items
    filteredItems.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'dropdown-item';
        const displayText = `${item.code || ''} ${item.name || ''}`.trim() || 'Unnamed Item';
        itemDiv.textContent = displayText;
        itemDiv.onclick = () => selectStockValueDetailsItem(item.id, displayText);
        dropdown.appendChild(itemDiv);
    });
    
    // Show dropdown if there's a search term or items
    if (searchTerm || filteredItems.length > 0) {
        showStockValueDetailsDropdown();
    }
}

function selectStockValueDetailsItem(itemId, displayText) {
    const hiddenInput = document.getElementById('stockValueDetailsItem');
    const searchInput = document.getElementById('stockValueDetailsItemSearch');
    
    if (hiddenInput) hiddenInput.value = itemId;
    if (searchInput) searchInput.value = displayText;
    
    hideStockValueDetailsDropdown();
}

function clearStockValueDetailsFilters() {
    const hiddenInput = document.getElementById('stockValueDetailsItem');
    const searchInput = document.getElementById('stockValueDetailsItemSearch');
    
    if (hiddenInput) hiddenInput.value = '';
    if (searchInput) searchInput.value = '';
    
    const content = document.getElementById('reportContent');
    content.innerHTML = '<p style="color: var(--text-secondary); padding: 20px; text-align: center;">Please select an item (or leave as "All Items") and click "Apply Filters" to load the report.</p>';
}

function loadStockValueDetailsReport() {
    const content = document.getElementById('reportContent');
    content.innerHTML = '<div class="spinner"></div>';
    
    const itemId = document.getElementById('stockValueDetailsItem')?.value || '';
    let url = '/api/reports/stock-value-details';
    if (itemId) url += `?item_id=${itemId}`;
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                content.innerHTML = `<p style="color: red;">Error: ${data.error}</p>`;
                return;
            }
            
            if (!data.success || !data.data || data.data.length === 0) {
                content.innerHTML = '<p style="color: var(--text-secondary); padding: 20px; text-align: center;">No stock data available for the selected filter.</p>';
                return;
            }
            
            let html = generateReportHeader('Stock Value Calculation Details');
            
            // Check calculation method and render report
            fetch('/api/markets/calculation-method')
                .then(response => response.json())
                .then(methodData => {
                    renderStockValueDetailsReport(data.data, methodData.method || 'Average');
                })
                .catch(() => {
                    renderStockValueDetailsReport(data.data, 'Average');
                });
        })
        .catch(error => {
            console.error('Error loading stock value details report:', error);
            content.innerHTML = '<p style="color: red;">Error loading report: ' + error.message + '</p>';
        });
}

function renderStockValueDetailsReport(suppliersData, calcMethod) {
    const content = document.getElementById('reportContent');
    let html = generateReportHeader('Stock Value Calculation Details');
    
    // Add methodology based on calculation method
    if (calcMethod === 'FIFO') {
        html += `
            <div class="calculation-methodology" style="margin: 20px 0; padding: 15px; background: #e3f2fd; border-left: 4px solid #2196f3; border-radius: 4px;">
                <h3 style="margin: 0 0 10px 0; color: #1976d2;">Calculation Methodology (FIFO)</h3>
                <p style="margin: 5px 0; line-height: 1.6;">
                    <strong>Stock Value = Sum of (Available Quantity × Cost Per Unit) for each batch (in supplier currency)</strong>
                </p>
                <p style="margin: 5px 0; line-height: 1.6;">
                    <strong>Cost Per Unit = Unit Purchase Price + COG Per Unit</strong>
                </p>
                <p style="margin: 5px 0; line-height: 1.6;">
                    <strong>COG Per Unit = (Total Expenses ÷ 2 ÷ Total Container Quantity) + (Total Expenses ÷ 2 ÷ Total Container Weight × Item Weight)</strong>
                </p>
                <p style="margin: 5px 0; line-height: 1.6; font-size: 0.9em; color: #555;">
                    <em>Note: FIFO uses actual cost of oldest inventory batches. Each batch (container) is tracked separately. 
                    Stock value reflects the actual cost of remaining inventory from each purchase batch. Batch Code = Container Number.</em>
                </p>
            </div>
        `;
    } else {
        html += `
            <div class="calculation-methodology" style="margin: 20px 0; padding: 15px; background: #e3f2fd; border-left: 4px solid #2196f3; border-radius: 4px;">
                <h3 style="margin: 0 0 10px 0; color: #1976d2;">Calculation Methodology (Average Cost)</h3>
                <p style="margin: 5px 0; line-height: 1.6;">
                    <strong>Stock Value = Available Quantity × Average Cost Per Unit</strong>
                </p>
                <p style="margin: 5px 0; line-height: 1.6;">
                    <strong>Average Cost Per Unit = Total Cost (All Containers) ÷ Total Quantity (All Containers)</strong>
                </p>
                <p style="margin: 5px 0; line-height: 1.6;">
                    <strong>Total Cost Per Item = (Unit Price + COG Per Unit) × Quantity</strong>
                </p>
                <p style="margin: 5px 0; line-height: 1.6;">
                    <strong>COG Per Unit = (Total Expenses ÷ 2 ÷ Total Container Quantity) + (Total Expenses ÷ 2 ÷ Total Container Weight × Item Weight)</strong>
                </p>
                <p style="margin: 5px 0; line-height: 1.6; font-size: 0.9em; color: #555;">
                    <em>Note: Expenses (Expense1, Expense2, Expense3) are converted to container's original currency before COG calculation. 
                    COG is distributed 50% by quantity and 50% by weight.</em>
                </p>
            </div>
        `;
    }
    
    suppliersData.forEach(supplier => {
        html += `
            <div style="margin: 30px 0; border: 2px solid #1e3a5f; border-radius: 8px; overflow: hidden;">
                <div style="background: #1e3a5f; color: white; padding: 15px;">
                    <h3 style="margin: 0; font-size: 18px;">Supplier: ${supplier.supplier_name}</h3>
                    <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">Currency: ${supplier.supplier_currency}</p>
                </div>
        `;
        
        if (supplier.items && supplier.items.length > 0) {
            supplier.items.forEach(item => {
                html += `
                    <div style="padding: 20px; border-bottom: 1px solid #ddd;">
                        <h4 style="margin: 0 0 15px 0; color: #1e3a5f; font-size: 16px;">
                            Item: ${item.item_code} - ${item.item_name}
                        </h4>
                        
                        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px;">
                            <div style="padding: 10px; background: #f5f5f5; border-radius: 4px;">
                                <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Purchased Qty</div>
                                <div style="font-size: 16px; font-weight: 600; color: #1e3a5f;">${parseFloat(item.purchased_quantity || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                            </div>
                            <div style="padding: 10px; background: #f5f5f5; border-radius: 4px;">
                                <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Sold Qty</div>
                                <div style="font-size: 16px; font-weight: 600; color: #f44336;">${parseFloat(item.sold_quantity || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                            </div>
                            <div style="padding: 10px; background: #e8f5e9; border-radius: 4px;">
                                <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Available Qty</div>
                                <div style="font-size: 16px; font-weight: 600; color: #2e7d32;">${parseFloat(item.available_quantity || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                            </div>
                            <div style="padding: 10px; background: #fff3e0; border-radius: 4px;">
                                <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Item Weight</div>
                                <div style="font-size: 16px; font-weight: 600; color: #e65100;">${parseFloat(item.item_weight || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                            </div>
                        </div>
                        
                        <div style="margin-bottom: 20px;">
                            <h5 style="margin: 0 0 10px 0; color: #555; font-size: 14px;">Batch/Container Breakdown:</h5>
                            <table class="dashboard-table" style="font-size: 12px;">
                                <thead>
                                    <tr>
                                        <th>Batch Code (Container)</th>
                                        <th class="text-right">Qty</th>
                                        <th class="text-right">Unit Price</th>
                                        <th class="text-right">Expense1</th>
                                        <th class="text-right">Expense2</th>
                                        <th class="text-right">Expense3</th>
                                        <th class="text-right">Total Expenses</th>
                                        <th class="text-right">COG/Unit</th>
                                        <th class="text-right">Cost/Unit</th>
                                        <th class="text-right">Total Cost</th>
                                    </tr>
                                </thead>
                                <tbody>
                `;
                    
                    if (item.containers && item.containers.length > 0) {
                        item.containers.forEach((container, containerIndex) => {
                            const batchCode = container.container_number || container.batch_code || '';
                            const containerCurrency = container.container_currency || item.currency || supplier.supplier_currency;
                            html += `
                                <tr>
                                    <td>
                                        ${batchCode}<br>
                                        <small style="color: var(--text-tertiary);">${container.container_date || ''}</small>
                                    </td>
                                    <td class="text-right">${parseFloat(container.quantity || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                                    <td class="text-right">${formatCurrency(container.unit_price || 0, containerCurrency)}</td>
                                    <td class="text-right">
                                        ${container.expense1_original > 0 ? formatCurrency(container.expense1_original, container.expense1_currency) + '<br><small style="color: var(--text-tertiary);">(' + formatCurrency(container.expense1_in_container_currency || 0, containerCurrency) + ')</small>' : '-'}
                                    </td>
                                    <td class="text-right">
                                        ${container.expense2_original > 0 ? formatCurrency(container.expense2_original, container.expense2_currency) + '<br><small style="color: var(--text-tertiary);">(' + formatCurrency(container.expense2_in_container_currency || 0, containerCurrency) + ')</small>' : '-'}
                                    </td>
                                    <td class="text-right">
                                        ${container.expense3_original > 0 ? formatCurrency(container.expense3_original, container.expense3_currency) + '<br><small style="color: var(--text-tertiary);">(' + formatCurrency(container.expense3_in_container_currency || 0, containerCurrency) + ')</small>' : '-'}
                                    </td>
                                    <td class="text-right" style="font-weight: 600;">${formatCurrency(container.total_expenses_in_container_currency || 0, containerCurrency)}</td>
                                    <td class="text-right" style="color: #f57c00;">${formatCurrency(container.cog_per_unit || 0, containerCurrency)}</td>
                                    <td class="text-right" style="font-weight: 600; color: #1976d2;">${formatCurrency(container.item_cost_per_unit || 0, containerCurrency)}</td>
                                    <td class="text-right" style="font-weight: 600; color: #2e7d32;">${formatCurrency(container.total_cost || 0, containerCurrency)}</td>
                                </tr>
                            `;
                        });
                    } else {
                        html += `<tr><td colspan="10" style="text-align: center; padding: 20px; color: #999;">No batch/container data available</td></tr>`;
                    }
                    
                    html += `
                                    </tbody>
                                </table>
                            </div>
                            
                            <div style="padding: 15px; background: #e8f5e9; border-radius: 4px; margin-top: 15px;">
                                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                                    <div>
                                        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Total Cost (All Batches/Containers)</div>
                                        <div style="font-size: 18px; font-weight: 600; color: #2e7d32;">${formatCurrency(item.total_cost_all_containers || 0, item.currency || supplier.supplier_currency)}</div>
                                    </div>
                                    <div>
                                        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Total Quantity (All Batches/Containers)</div>
                                        <div style="font-size: 18px; font-weight: 600; color: #2e7d32;">${parseFloat(item.total_quantity_all_containers || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                                    </div>
                                    <div>
                                        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Average Cost Per Unit</div>
                                        <div style="font-size: 18px; font-weight: 600; color: #1976d2;">${formatCurrency(item.average_cost_per_unit || 0, item.currency || supplier.supplier_currency)}</div>
                                        ${item.total_quantity_all_containers > 0 ? `<div style="font-size: 11px; color: #999; margin-top: 3px;">= ${formatCurrency(item.total_cost_all_containers, item.currency || supplier.supplier_currency)} ÷ ${parseFloat(item.total_quantity_all_containers).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>` : ''}
                                    </div>
                                    <div>
                                        <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Stock Value</div>
                                        <div style="font-size: 20px; font-weight: 700; color: #1e3a5f;">${formatCurrency(item.stock_value || 0, item.currency || supplier.supplier_currency)}</div>
                                        ${calcMethod === 'FIFO' ? 
                                            '<div style="font-size: 11px; color: #999; margin-top: 3px;">(Sum of batch values: Available Qty × Cost Per Unit in supplier currency)</div>' :
                                            `<div style="font-size: 11px; color: #999; margin-top: 3px;">= ${parseFloat(item.available_quantity).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} × ${formatCurrency(item.average_cost_per_unit || 0, item.currency || supplier.supplier_currency)}</div>`
                                        }
                                    </div>
                                </div>
                            </div>
                    </div>
                `;
            });
        } else {
            html += `<div style="padding: 20px; text-align: center; color: #999;">No items available for this supplier</div>`;
        }
        
        html += `</div>`;
    });
    
    html += generateReportFooter();
    content.innerHTML = html;
}

function initializeReportColumnResizing(tableWrapperId) {
    const tableWrapper = document.getElementById(tableWrapperId);
    if (!tableWrapper) return;
    
    const table = tableWrapper.querySelector('table');
    if (!table) return;
    
    const ths = Array.from(table.querySelectorAll('thead th'));
    
    ths.forEach((th, index) => {
        const resizer = th.querySelector('.resizer');
        if (!resizer) return;
        
        let startX, startWidth, currentTh;
        
        const startResize = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            currentTh = th;
            const clientX = e.clientX || (e.touches ? e.touches[0].clientX : 0);
            startX = clientX;
            startWidth = currentTh.offsetWidth;
            
            tableWrapper.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            resizer.classList.add('active');
            
            document.addEventListener('mousemove', doResize);
            document.addEventListener('mouseup', stopResize);
            if (e.touches) {
                document.addEventListener('touchmove', doResize);
                document.addEventListener('touchend', stopResize);
            }
        };
        
        const doResize = (e) => {
            if (!currentTh) return;
            
            const clientX = e.clientX || (e.touches ? e.touches[0].clientX : 0);
            const diff = clientX - startX;
            const newWidth = Math.max(60, startWidth + diff); // Minimum width 60px
            
            currentTh.style.width = newWidth + 'px';
            currentTh.style.minWidth = newWidth + 'px';
            
            // Apply same width to all cells in this column
            const colIndex = ths.indexOf(currentTh);
            const rows = table.querySelectorAll('tbody tr');
            rows.forEach(row => {
                const cell = row.cells[colIndex];
                if (cell) {
                    cell.style.width = newWidth + 'px';
                    cell.style.minWidth = newWidth + 'px';
                }
            });
        };
        
        const stopResize = () => {
            tableWrapper.classList.remove('resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            if (resizer) resizer.classList.remove('active');
            currentTh = null;
            
            document.removeEventListener('mousemove', doResize);
            document.removeEventListener('mouseup', stopResize);
            document.removeEventListener('touchmove', doResize);
            document.removeEventListener('touchend', stopResize);
        };
        
        resizer.addEventListener('mousedown', startResize);
        resizer.addEventListener('touchstart', startResize);
    });
}

function clearContainerReportFilters() {
    document.getElementById('containerReportSupplier').value = '';
    document.getElementById('containerReportContainer').value = '';
    document.getElementById('containerReportContainer').innerHTML = '<option value="">Select Container</option>';
    document.getElementById('reportContent').innerHTML = '<p style="color: #666;">Please select a supplier and container</p>';
}

function exportContainerReportToPDF() {
    const reportContent = document.getElementById('reportContent');
    if (!reportContent || !reportContent.innerHTML || !reportContent.innerHTML.trim()) {
        alert('Please load a container report first');
        return;
    }
    
    // Get container number for filename
    const containerData = window.currentContainerReportData;
    const containerNumber = containerData ? containerData.container.container_number : 'container-report';
    const filename = `Container_Report_${containerNumber}_${new Date().toISOString().split('T')[0]}.pdf`;
    
    // Show loading indicator
    const originalOpacity = reportContent.style.opacity || '1';
    reportContent.style.opacity = '0.8';
    
    // Hide UI elements temporarily for clean capture (like Awesome Screenshot)
    const reportTitle = document.getElementById('reportTitle');
    const actionButtons = document.querySelector('#reportArea .action-buttons');
    const filters = document.querySelectorAll('.filters');
    
    const titleDisplay = reportTitle ? reportTitle.style.display : '';
    const buttonsDisplay = actionButtons ? actionButtons.style.display : '';
    const filtersDisplay = [];
    
    if (reportTitle) reportTitle.style.display = 'none';
    if (actionButtons) actionButtons.style.display = 'none';
    filters.forEach(filter => {
        filtersDisplay.push(filter.style.display);
        filter.style.display = 'none';
    });
    
    // Store original styles to restore later
    const originalPadding = reportContent.style.padding || '';
    const originalMargin = reportContent.style.margin || '';
    const originalWidth = reportContent.style.width || '';
    const originalHeight = reportContent.style.height || '';
    
    // Ensure full content is visible and properly sized
    reportContent.style.width = 'auto';
    reportContent.style.height = 'auto';
    reportContent.style.padding = '20px';
    reportContent.style.margin = '0';
    reportContent.style.backgroundColor = '#ffffff';
    
    // Wait a bit for styles to apply, then capture
    setTimeout(() => {
        // Capture with high quality (like Awesome Screenshot)
        html2canvas(reportContent, {
            scale: 2.5, // Higher scale for better quality
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            width: reportContent.scrollWidth,
            height: reportContent.scrollHeight,
            windowWidth: reportContent.scrollWidth,
            windowHeight: reportContent.scrollHeight,
            allowTaint: true,
            removeContainer: false,
            imageTimeout: 15000,
            onclone: function(clonedDoc) {
                // Ensure colors are preserved in the cloned document
                const style = clonedDoc.createElement('style');
                style.textContent = `
                    * {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                        color-adjust: exact !important;
                    }
                `;
                clonedDoc.head.appendChild(style);
            }
        }).then(canvas => {
            // Restore UI elements immediately after capture
            reportContent.style.opacity = originalOpacity;
            if (reportTitle) reportTitle.style.display = titleDisplay;
            if (actionButtons) actionButtons.style.display = buttonsDisplay;
            filters.forEach((filter, index) => {
                filter.style.display = filtersDisplay[index] || '';
            });
            reportContent.style.padding = originalPadding;
            reportContent.style.margin = originalMargin;
            reportContent.style.width = originalWidth;
            reportContent.style.height = originalHeight;
            
            // Get jsPDF
            const { jsPDF } = window.jspdf;
            
            // A4 dimensions in mm
            const A4_WIDTH_MM = 210;
            const A4_HEIGHT_MM = 297;
            
            // Determine orientation based on content aspect ratio
            const aspectRatio = canvas.width / canvas.height;
            const useLandscape = aspectRatio > 1.2; // Use landscape if width is more than 1.2x height
            
            const pageWidth = useLandscape ? A4_HEIGHT_MM : A4_WIDTH_MM;
            const pageHeight = useLandscape ? A4_WIDTH_MM : A4_HEIGHT_MM;
            
            // Margins: minimal top/bottom, standard left/right for fit to width
            const marginHorizontal = 10; // Left and right margins
            const marginVertical = 5; // Minimal top and bottom margins
            const availableWidth = pageWidth - (marginHorizontal * 2);
            const availableHeight = pageHeight - (marginVertical * 2);
            
            // Convert canvas dimensions to mm
            // html2canvas scale 2.5 means: 1 CSS pixel = 2.5 canvas pixels
            // Standard: 96 pixels per inch = 25.4mm per inch
            // So: 1 canvas pixel = 25.4 / 96 mm = 0.264583mm
            const PIXELS_TO_MM = 0.264583;
            const imgWidthMm = canvas.width * PIXELS_TO_MM;
            const imgHeightMm = canvas.height * PIXELS_TO_MM;
            
            // FIT TO WIDTH: Scale content to fit exactly to available page width
            // Calculate scale factor to fit width
            const widthScale = availableWidth / imgWidthMm;
            // Width fits exactly to available width
            const scaledWidthMm = availableWidth;
            // Height scales proportionally to maintain aspect ratio
            const scaledHeightMm = imgHeightMm * widthScale;
            
            // Calculate number of pages needed (Awesome Screenshot style - split intelligently)
            const pagesNeeded = Math.ceil(scaledHeightMm / availableHeight);
            
            // Create PDF
            const pdf = new jsPDF(useLandscape ? 'landscape' : 'portrait', 'mm', 'a4');
            
            // Get image as data URL
            const imgData = canvas.toDataURL('image/png', 1.0);
            
            // Split and add to PDF pages (like Awesome Screenshot)
            for (let page = 0; page < pagesNeeded; page++) {
                if (page > 0) {
                    pdf.addPage(useLandscape ? 'landscape' : 'portrait');
                }
                
                // Calculate source region for this page
                const sourceYPercent = page / pagesNeeded;
                const sourceHeightPercent = 1 / pagesNeeded;
                
                const sourceY = Math.round(canvas.height * sourceYPercent);
                const sourceHeight = Math.round(canvas.height * sourceHeightPercent);
                
                // Handle last page to avoid cutting off content
                let actualSourceHeight = sourceHeight;
                if (page === pagesNeeded - 1) {
                    actualSourceHeight = canvas.height - sourceY;
                }
                
                // Create a temporary canvas for this page slice
                const pageCanvas = document.createElement('canvas');
                pageCanvas.width = canvas.width;
                pageCanvas.height = actualSourceHeight;
                const pageCtx = pageCanvas.getContext('2d');
                
                // Draw the slice onto the page canvas
                pageCtx.drawImage(
                    canvas,
                    0, sourceY, canvas.width, actualSourceHeight,  // Source rectangle
                    0, 0, canvas.width, actualSourceHeight          // Destination rectangle
                );
                
                // Get image data for this page
                const pageImgData = pageCanvas.toDataURL('image/png', 1.0);
                
                // Calculate display height for this page in mm (proportional to source height)
                const pageHeightMm = (actualSourceHeight / canvas.height) * scaledHeightMm;
                
                // Position image on page (fit to width, minimal top/bottom margins)
                const xPos = marginHorizontal; // Left margin for width fit
                const yPos = marginVertical; // Minimal top margin (always start at top for each page)
                
                // Ensure page height doesn't exceed available height
                const displayHeight = Math.min(pageHeightMm, availableHeight);
                
                // Add image to PDF page - FIT TO WIDTH with minimal vertical margins
                pdf.addImage(pageImgData, 'PNG', xPos, yPos, scaledWidthMm, displayHeight, undefined, 'FAST');
            }
            
            // Save the PDF
            pdf.save(filename);
            
        }).catch(error => {
            // Restore UI on error
            reportContent.style.opacity = originalOpacity;
            if (reportTitle) reportTitle.style.display = titleDisplay;
            if (actionButtons) actionButtons.style.display = buttonsDisplay;
            filters.forEach((filter, index) => {
                filter.style.display = filtersDisplay[index] || '';
            });
            reportContent.style.padding = originalPadding;
            reportContent.style.margin = originalMargin;
            reportContent.style.width = originalWidth;
            reportContent.style.height = originalHeight;
            
            console.error('Error generating PDF:', error);
            alert('Error generating PDF. Please check the console for details and try again.');
        });
    }, 300); // Wait for styles to apply
}

function loadSuppliersForItemStatement() {
    fetch('/api/companies?category=Supplier')
        .then(response => response.json())
        .then(suppliers => {
            const select = document.getElementById('itemStatementSupplier');
            if (select) {
                // Clear existing options except "All Suppliers"
                select.innerHTML = '<option value="">All Suppliers</option>';
                suppliers.forEach(s => {
                    const option = document.createElement('option');
                    option.value = s.id;
                    option.textContent = s.name;
                    select.appendChild(option);
                });
            }
        })
        .catch(error => {
            console.error('Error loading suppliers:', error);
        });
}

function loadItemsForItemStatement() {
    const supplierId = document.getElementById('itemStatementSupplier')?.value;
    const input = document.getElementById('itemStatementItemSearch');
    const list = document.getElementById('itemStatementItemList');
    const hidden = document.getElementById('itemStatementItem');
    
    if (!list || !input || !hidden) return;
    
    // Clear existing options and reset selection
    list.innerHTML = '';
    input.value = '';
    hidden.value = '';
    window.itemStatementItemMap = new Map();
    
    const url = supplierId ? `/api/items?supplier_id=${supplierId}` : '/api/items';
    
    // Load items for the selected supplier (or all items)
    fetch(url)
        .then(response => response.json())
        .then(data => {
            const items = Array.isArray(data) ? data : (data.items || []);
            if (!Array.isArray(items)) return;
            items.forEach(item => {
                const label = `${item.code || ''} - ${item.name || ''}`.replace(/\s+-\s+-/g, ' - ').trim();
                const option = document.createElement('option');
                option.value = label;
                list.appendChild(option);
                window.itemStatementItemMap.set(label, item.id);
            });
        })
        .catch(error => {
            console.error('Error loading items:', error);
        });
}

function handleItemStatementItemInput() {
    const input = document.getElementById('itemStatementItemSearch');
    const hidden = document.getElementById('itemStatementItem');
    if (!input || !hidden) return;
    const value = input.value.trim();
    if (!value) {
        hidden.value = '';
        return;
    }
    const itemId = window.itemStatementItemMap ? window.itemStatementItemMap.get(value) : null;
    hidden.value = itemId || '';
}

function loadItemStatementReport() {
    const content = document.getElementById('reportContent');
    content.innerHTML = '<div class="spinner"></div>';
    
    const supplierId = document.getElementById('itemStatementSupplier')?.value || '';
    const itemId = document.getElementById('itemStatementItem')?.value || '';
    const startDate = document.getElementById('itemStatementStartDate')?.value || '';
    const endDate = document.getElementById('itemStatementEndDate')?.value || '';
    const transactionType = document.getElementById('itemStatementType')?.value || 'All';
    
    let url = '/api/reports/item-statement?';
    if (supplierId) url += `supplier_id=${supplierId}&`;
    if (itemId) url += `item_id=${itemId}&`;
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    url += `transaction_type=${transactionType}`;
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                content.innerHTML = `<p style="color: red;">Error: ${data.error}</p>`;
                return;
            }
            
            const startDateDisplay = startDate ? new Date(startDate).toLocaleDateString() : 'All';
            const endDateDisplay = endDate ? new Date(endDate).toLocaleDateString() : 'All';
            const supplierName = data.supplier_name ? ` - ${data.supplier_name}` : '';
            
            let html = generateReportHeader('Item Statement Report' + supplierName, {
                startDate: startDateDisplay,
                endDate: endDateDisplay
            });
            
            // Summary
            html += `<div class="report-summary" style="margin-bottom: 20px;">
                <h3>Summary</h3>
                <div class="report-summary-grid">
                    <div class="report-summary-item" style="background: #e8f5e9; border-color: #4caf50;">
                        <label style="color: #2e7d32;">Total IN</label>
                        <div class="value" style="color: #2e7d32;">${formatCurrency(data.summary.total_in)}</div>
                    </div>
                    <div class="report-summary-item" style="background: #ffebee; border-color: #f44336;">
                        <label style="color: #c62828;">Total OUT</label>
                        <div class="value" style="color: #c62828;">${formatCurrency(data.summary.total_out)}</div>
                    </div>
                    <div class="report-summary-item" style="background: #e3f2fd; border-color: #2196f3;">
                        <label style="color: #1976d2;">Net Change</label>
                        <div class="value" style="color: #1976d2;">${formatCurrency(data.summary.net_change)}</div>
                    </div>
                </div>
            </div>`;
            
            // Transactions grouped by date
            if (!data.statement || data.statement.length === 0) {
                html += '<p style="color: var(--text-secondary); padding: 20px; text-align: center;">No transactions found for the selected filters.</p>';
            } else {
                html += '<div class="table-container"><table><thead><tr>';
                html += '<th>Date</th><th>Type</th><th>Item Code</th><th>Item Name</th>';
                html += '<th class="text-right">Quantity</th><th class="text-right">Unit Price</th><th class="text-right">Total Amount</th><th>Currency</th><th>Reference</th>';
                html += '</tr></thead><tbody>';
                
                data.statement.forEach((transaction, index) => {
                    const txType = transaction.transaction_type || transaction.type || 'IN';
                    const typeColor = txType === 'IN' ? '#4caf50' : '#f44336';
                    const typeBg = txType === 'IN' ? '#e8f5e9' : '#ffebee';
                    
                    html += `<tr>
                        <td>${new Date(transaction.date).toLocaleDateString()}</td>
                        <td><span style="background: ${typeBg}; color: ${typeColor}; padding: 4px 8px; border-radius: 4px; font-weight: 600;">${txType}</span></td>
                        <td>${transaction.item_code || '-'}</td>
                        <td>${transaction.item_name || '-'}</td>
                        <td class="text-right">${parseFloat(transaction.quantity).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td class="text-right">${formatCurrency(transaction.unit_price, transaction.currency)}</td>
                        <td class="text-right" style="font-weight: 600;">${formatCurrency(transaction.total_amount, transaction.currency)}</td>
                        <td>${transaction.currency || '-'}</td>
                        <td>${transaction.reference || '-'}</td>
                    </tr>`;
                });
                
                html += '</tbody></table></div>';
            }
            
            html += generateReportFooter();
            content.innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading item statement report:', error);
            content.innerHTML = '<p style="color: red;">Error loading report: ' + error.message + '</p>';
        });
}

// Column Visibility Functions for Container Report
function toggleColumnSelector() {
    const dropdown = document.getElementById('columnSelectorDropdown');
    if (dropdown) {
        const isVisible = dropdown.style.display === 'block';
        dropdown.style.display = isVisible ? 'none' : 'block';
        
        // Close dropdown when clicking outside
        if (!isVisible) {
            setTimeout(() => {
                document.addEventListener('click', closeColumnSelectorOutside, true);
            }, 100);
        }
    }
}

function closeColumnSelectorOutside(event) {
    const dropdown = document.getElementById('columnSelectorDropdown');
    const button = event.target.closest('button[onclick*="toggleColumnSelector"]');
    
    if (dropdown && !dropdown.contains(event.target) && !button) {
        dropdown.style.display = 'none';
        document.removeEventListener('click', closeColumnSelectorOutside, true);
    }
}

function selectAllColumns() {
    const checkboxes = document.querySelectorAll('.column-checkbox');
    checkboxes.forEach(cb => cb.checked = true);
    updateColumnSelectorBadge();
}

function deselectAllColumns() {
    const checkboxes = document.querySelectorAll('.column-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
    updateColumnSelectorBadge();
}

function updateColumnSelectorBadge() {
    const checkboxes = document.querySelectorAll('.column-checkbox');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    const totalCount = checkboxes.length;
    const badge = document.getElementById('columnSelectorBadge');
    
    if (badge) {
        if (checkedCount < totalCount) {
            badge.textContent = (totalCount - checkedCount).toString();
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }
}

function loadColumnVisibilitySettings() {
    const saved = localStorage.getItem('containerReportColumnVisibility');
    if (saved) {
        try {
            const visibility = JSON.parse(saved);
            const checkboxes = document.querySelectorAll('.column-checkbox');
            checkboxes.forEach(cb => {
                const column = cb.getAttribute('data-column');
                if (visibility.hasOwnProperty(column)) {
                    cb.checked = visibility[column] !== false;
                }
            });
            updateColumnSelectorBadge();
        } catch (e) {
            console.error('Error loading column visibility settings:', e);
        }
    } else {
        // Initialize all as checked by default
        const checkboxes = document.querySelectorAll('.column-checkbox');
        checkboxes.forEach(cb => cb.checked = true);
        updateColumnSelectorBadge();
    }
}

function getColumnVisibility() {
    const saved = localStorage.getItem('containerReportColumnVisibility');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            console.error('Error parsing column visibility settings:', e);
        }
    }
    // Default: all columns visible
    return {
        item_code: true,
        item_name: true,
        quantity: true,
        item_weight: true,
        item_total_weight: true,
        unit_price: true,
        total_price: true,
        cog: true,
        total_cog: true,
        item_cost: true,
        item_total_cost: true
    };
}

function saveColumnVisibility() {
    const checkboxes = document.querySelectorAll('.column-checkbox');
    const visibility = {};
    checkboxes.forEach(cb => {
        const column = cb.getAttribute('data-column');
        visibility[column] = cb.checked;
    });
    localStorage.setItem('containerReportColumnVisibility', JSON.stringify(visibility));
}

function applyColumnVisibility() {
    saveColumnVisibility();
    const dropdown = document.getElementById('columnSelectorDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
    document.removeEventListener('click', closeColumnSelectorOutside, true);
    
    // Reload the report if it's already loaded
    const containerId = document.getElementById('containerReportContainer')?.value;
    if (containerId) {
        loadContainerReport();
    }
}

// Collected Money Report Column Visibility Functions
function toggleCollectedMoneyColumnSelector() {
    const dropdown = document.getElementById('collectedMoneyColumnSelectorDropdown');
    if (dropdown) {
        const isVisible = dropdown.style.display === 'block';
        dropdown.style.display = isVisible ? 'none' : 'block';
        
        if (!isVisible) {
            // Load saved visibility state
            loadSavedCollectedMoneyColumnVisibility();
            updateCollectedMoneyColumnSelectorBadge();
            // Close dropdown when clicking outside
            setTimeout(() => {
                document.addEventListener('click', closeCollectedMoneyColumnSelectorOutside, true);
            }, 0);
        } else {
            document.removeEventListener('click', closeCollectedMoneyColumnSelectorOutside, true);
        }
    }
}

function closeCollectedMoneyColumnSelectorOutside(event) {
    const dropdown = document.getElementById('collectedMoneyColumnSelectorDropdown');
    const button = event.target.closest('button[onclick*="toggleCollectedMoneyColumnSelector"]');
    
    if (dropdown && !dropdown.contains(event.target) && !button) {
        dropdown.style.display = 'none';
        document.removeEventListener('click', closeCollectedMoneyColumnSelectorOutside, true);
    }
}

function selectAllCollectedMoneyColumns() {
    const checkboxes = document.querySelectorAll('.collected-money-column-checkbox');
    checkboxes.forEach(cb => cb.checked = true);
    updateCollectedMoneyColumnSelectorBadge();
}

function deselectAllCollectedMoneyColumns() {
    const checkboxes = document.querySelectorAll('.collected-money-column-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
    updateCollectedMoneyColumnSelectorBadge();
}

function updateCollectedMoneyColumnSelectorBadge() {
    const checkboxes = document.querySelectorAll('.collected-money-column-checkbox');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    const totalCount = checkboxes.length;
    const badge = document.getElementById('collectedMoneyColumnSelectorBadge');
    
    if (badge) {
        if (checkedCount < totalCount) {
            badge.textContent = totalCount - checkedCount;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }
}

function saveCollectedMoneyColumnVisibility() {
    const checkboxes = document.querySelectorAll('.collected-money-column-checkbox');
    const visibility = {};
    checkboxes.forEach(cb => {
        const column = cb.getAttribute('data-column');
        visibility[column] = cb.checked;
    });
    localStorage.setItem('collectedMoneyColumnVisibility', JSON.stringify(visibility));
}

function loadSavedCollectedMoneyColumnVisibility() {
    const saved = localStorage.getItem('collectedMoneyColumnVisibility');
    if (saved) {
        try {
            const visibility = JSON.parse(saved);
            const checkboxes = document.querySelectorAll('.collected-money-column-checkbox');
            checkboxes.forEach(cb => {
                const column = cb.getAttribute('data-column');
                if (visibility.hasOwnProperty(column)) {
                    cb.checked = visibility[column] !== false;
                }
            });
        } catch (e) {
            console.error('Error loading saved column visibility:', e);
        }
    } else {
        // Default: all columns visible
        const checkboxes = document.querySelectorAll('.collected-money-column-checkbox');
        checkboxes.forEach(cb => cb.checked = true);
    }
}

function applySavedCollectedMoneyColumnVisibility() {
    const saved = localStorage.getItem('collectedMoneyColumnVisibility');
    if (saved) {
        try {
            const visibility = JSON.parse(saved);
            const table = document.getElementById('collectedMoneyTable');
            if (!table) return;
            
            // Apply to headers
            const headers = table.querySelectorAll('thead th[data-column]');
            headers.forEach(th => {
                const column = th.getAttribute('data-column');
                if (visibility.hasOwnProperty(column) && visibility[column] === false) {
                    th.style.display = 'none';
                } else {
                    th.style.display = '';
                }
            });
            
            // Apply to cells
            const cells = table.querySelectorAll('tbody td[data-column], tbody th[data-column]');
            cells.forEach(cell => {
                const column = cell.getAttribute('data-column');
                if (visibility.hasOwnProperty(column) && visibility[column] === false) {
                    cell.style.display = 'none';
                } else {
                    cell.style.display = '';
                }
            });
            
            // Handle group header rows (they use colspan)
            const groupHeaders = table.querySelectorAll('tr.group-header-row');
            groupHeaders.forEach(row => {
                const cells = row.querySelectorAll('td[data-column], th[data-column]');
                let visibleBeforeLast = 0;
                let lastCellVisible = false;
                
                cells.forEach((cell, index) => {
                    const column = cell.getAttribute('data-column');
                    const isVisible = !visibility.hasOwnProperty(column) || visibility[column] !== false;
                    
                    if (index === 0) {
                        // First cell - count visible columns before it
                        visibleBeforeLast = 0;
                    } else if (index === cells.length - 1) {
                        // Last cell (amount column)
                        lastCellVisible = isVisible;
                    } else {
                        // Middle cells
                        if (isVisible) {
                            visibleBeforeLast++;
                        }
                    }
                });
                
                // Adjust colspan for first cell in group header
                const firstCell = cells[0];
                if (firstCell) {
                    // Count total visible columns
                    let totalVisible = 0;
                    const allHeaders = table.querySelectorAll('thead th[data-column]');
                    allHeaders.forEach(th => {
                        const col = th.getAttribute('data-column');
                        if (!visibility.hasOwnProperty(col) || visibility[col] !== false) {
                            totalVisible++;
                        }
                    });
                    // First cell spans all columns except the last one (amount)
                    const firstCellColspan = lastCellVisible ? totalVisible - 1 : totalVisible;
                    firstCell.setAttribute('colspan', firstCellColspan);
                }
            });
        } catch (e) {
            console.error('Error applying saved column visibility:', e);
        }
    }
}

function applyCollectedMoneyColumnVisibility() {
    saveCollectedMoneyColumnVisibility();
    const dropdown = document.getElementById('collectedMoneyColumnSelectorDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
    document.removeEventListener('click', closeCollectedMoneyColumnSelectorOutside, true);
    
    // Apply visibility to current table
    applySavedCollectedMoneyColumnVisibility();
    updateCollectedMoneyColumnSelectorBadge();
}

function clearItemStatementFilters() {
    document.getElementById('itemStatementSupplier').value = '';
    const itemSearch = document.getElementById('itemStatementItemSearch');
    const itemHidden = document.getElementById('itemStatementItem');
    const itemList = document.getElementById('itemStatementItemList');
    if (itemSearch) itemSearch.value = '';
    if (itemHidden) itemHidden.value = '';
    if (itemList) itemList.innerHTML = '';
    window.itemStatementItemMap = new Map();
    
    // Reset to last 30 days
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    document.getElementById('itemStatementStartDate').value = thirtyDaysAgo.toISOString().split('T')[0];
    document.getElementById('itemStatementEndDate').value = today.toISOString().split('T')[0];
    
    document.getElementById('itemStatementType').value = 'All';
    loadItemsForItemStatement();
    loadItemStatementReport();
}

function loadVirtualPurchaseProfitReport() {
    const fileInput = document.getElementById('virtualPurchaseProfitFile');
    const file = fileInput?.files[0];
    
    if (!file) {
        alert('Please select an Excel file to upload');
        return;
    }
    
    const content = document.getElementById('reportContent');
    content.innerHTML = '<div class="spinner"></div>';
    
    const formData = new FormData();
    formData.append('file', file);
    
    fetch('/api/reports/virtual-purchase-profit', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            content.innerHTML = `<p style="color: red; padding: 20px;">Error: ${data.error}</p>`;
            return;
        }
        
        if (!data.success) {
            content.innerHTML = `<p style="color: red; padding: 20px;">Error: ${data.error || 'Unknown error'}</p>`;
            return;
        }
        
        renderVirtualPurchaseProfitReport(data);
    })
    .catch(error => {
        console.error('Error loading virtual purchase profit report:', error);
        content.innerHTML = '<p style="color: red; padding: 20px;">Error loading report: ' + error.message + '</p>';
    });
}

function renderVirtualPurchaseProfitReport(data) {
    const content = document.getElementById('reportContent');
    const results = data.results || [];
    const totals = data.totals || {};
    const baseCurrency = data.base_currency || 'USD';
    const errors = data.errors || [];
    
    if (results.length === 0) {
        content.innerHTML = '<p style="color: var(--text-secondary); padding: 20px; text-align: center;">No data to display. Please check your Excel file format.</p>';
        return;
    }
    
    let html = '<div class="report-table-wrapper">';
    html += '<h3 style="margin-bottom: 20px; color: #1e3a5f;">Virtual Purchase Profit Analysis</h3>';
    
    // Show errors if any
    if (errors.length > 0) {
        html += '<div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 15px; margin-bottom: 20px;">';
        html += '<h4 style="color: #856404; margin-top: 0;">Warnings/Errors:</h4>';
        html += '<ul style="margin: 0; padding-left: 20px;">';
        errors.forEach(error => {
            html += `<li style="color: #856404;">${error}</li>`;
        });
        html += '</ul></div>';
    }
    
    // Table
    html += '<table class="report-table" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">';
    html += '<thead><tr style="background: #1e3a5f; color: white;">';
    html += '<th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Item Code</th>';
    html += '<th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Item Name</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Quantity</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Purchase Price</th>';
    html += '<th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Currency</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Exchange Rate</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Purchase Cost (' + baseCurrency + ')</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Avg Selling Price</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Estimated Revenue</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Estimated Profit</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Profit %</th>';
    html += '</tr></thead><tbody>';
    
    results.forEach(row => {
        const profitClass = row.profit_percentage >= 0 ? 'profit-positive' : 'profit-negative';
        const profitColor = row.profit_percentage >= 0 ? '#28a745' : '#dc3545';
        
        html += '<tr>';
        html += `<td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(row.item_code)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(row.item_name)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${formatNumber(row.quantity)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${formatNumber(row.purchase_price)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(row.purchase_currency)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${formatNumber(row.exchange_rate)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${formatNumber(row.purchase_cost_base)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${row.average_selling_price !== null ? formatNumber(row.average_selling_price) : 'N/A'}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${formatNumber(row.estimated_revenue)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right; color: ${profitColor}; font-weight: bold;">${formatNumber(row.estimated_profit)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right; color: ${profitColor}; font-weight: bold;">${formatNumber(row.profit_percentage)}%</td>`;
        html += '</tr>';
    });
    
    // Totals row
    const totalProfitColor = totals.total_profit >= 0 ? '#28a745' : '#dc3545';
    html += '<tr style="background: #f8f9fa; font-weight: bold;">';
    html += '<td colspan="6" style="padding: 12px; border: 1px solid #ddd; text-align: right;">TOTALS:</td>';
    html += `<td style="padding: 12px; border: 1px solid #ddd; text-align: right;">${formatNumber(totals.total_cost)}</td>`;
    html += '<td style="padding: 12px; border: 1px solid #ddd; text-align: right;">-</td>';
    html += `<td style="padding: 12px; border: 1px solid #ddd; text-align: right;">${formatNumber(totals.total_revenue)}</td>`;
    html += `<td style="padding: 12px; border: 1px solid #ddd; text-align: right; color: ${totalProfitColor};">${formatNumber(totals.total_profit)}</td>`;
    html += `<td style="padding: 12px; border: 1px solid #ddd; text-align: right; color: ${totalProfitColor};">${formatNumber(totals.overall_profit_percentage)}%</td>`;
    html += '</tr>';
    
    html += '</tbody></table>';
    html += '</div>';
    
    content.innerHTML = html;
}

function exportVirtualPurchaseProfitToExcel() {
    const fileInput = document.getElementById('virtualPurchaseProfitFile');
    const file = fileInput?.files[0];
    
    if (!file) {
        alert('Please select an Excel file to export. If you have already calculated the report, please select the same file again.');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    // Show loading indicator
    const originalText = document.querySelector('.action-buttons .btn-secondary')?.textContent;
    
    fetch('/api/reports/virtual-purchase-profit/export', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.error || 'Export failed');
            });
        }
        return response.blob();
    })
    .then(blob => {
        // Create download link
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `virtual_purchase_profit_${new Date().getTime()}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        // Show success notification
        showNotification('Report exported successfully!', 'success');
    })
    .catch(error => {
        console.error('Error exporting report:', error);
        alert('Error exporting report: ' + error.message);
    });
}

function clearVirtualPurchaseProfitFilters() {
    const fileInput = document.getElementById('virtualPurchaseProfitFile');
    if (fileInput) fileInput.value = '';
    
    const content = document.getElementById('reportContent');
    content.innerHTML = '<p style="color: var(--text-secondary); padding: 20px; text-align: center;">Please upload an Excel file with columns: ItemCode, Quantity, Price, Currency, ExchangeRate</p>';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatNumber(num) {
    if (num === null || num === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(num);
}

function loadAverageLastNSalesReport() {
    const content = document.getElementById('reportContent');
    content.innerHTML = '<div class="spinner"></div>';

    const supplierId = document.getElementById('averageLastNSalesSupplier')?.value || '';
    const itemId = document.getElementById('averageLastNSalesItem')?.value || '';

    let url = '/api/reports/average-last-n-sales?';
    if (supplierId) url += `supplier_id=${supplierId}&`;
    if (itemId) url += `item_id=${itemId}&`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                content.innerHTML = `<p style="color: red; padding: 20px;">Error: ${data.error}</p>`;
                return;
            }
            renderAverageLastNSalesReport(data);
        })
        .catch(error => {
            console.error('Error loading average last N sales report:', error);
            content.innerHTML = '<p style="color: red; padding: 20px;">Error loading report: ' + error.message + '</p>';
        });
}

function renderAverageLastNSalesReport(data) {
    const content = document.getElementById('reportContent');
    const items = data.items || [];
    const maxN = data.max_n || 10;

    if (items.length === 0) {
        content.innerHTML = '<p style="color: var(--text-secondary); padding: 20px; text-align: center;">No sales data found for the selected filters.</p>';
        return;
    }

    let html = '<div class="report-table-wrapper">';
    html += `<h3 style="margin-bottom: 20px; color: #1e3a5f;">Average of Last ${maxN} Sales</h3>`;
    html += `<p style="margin-bottom: 15px; color: #666;">For each item: average price from the last ${maxN} sale transactions (or fewer if not available). Formula: Total Revenue ÷ Total Quantity.</p>`;
    html += `<p style="margin-bottom: 15px; color: #666;">Total Items: <strong>${items.length}</strong></p>`;

    html += '<table class="report-table" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">';
    html += '<thead><tr style="background: #1e3a5f; color: white;">';
    html += '<th style="padding: 12px; text-align: left; border: 1px solid #ddd; width: 30px;"></th>';
    html += '<th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Item Code</th>';
    html += '<th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Item Name</th>';
    html += '<th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Supplier</th>';
    html += '<th style="padding: 12px; text-align: center; border: 1px solid #ddd;">Sales Used (N)</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Avg Sale Price</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Total Qty</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Total Revenue</th>';
    html += '</tr></thead><tbody>';

    items.forEach((item, index) => {
        html += `<tr id="item-row-${item.item_id}" style="cursor: pointer; background: ${index % 2 === 0 ? '#fff' : '#f8f9fa'};" onclick="toggleItemDetails(${item.item_id})">`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: center;"><span id="expand-icon-${item.item_id}" style="font-size: 12px;">▶</span></td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">${escapeHtml(item.item_code)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(item.item_name)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(item.supplier_name || 'N/A')}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${item.sales_used}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right; font-weight: bold; color: #1e3a5f;">${formatNumber(item.average_sale_price)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${formatNumber(item.total_quantity_sold)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${formatNumber(item.total_revenue)}</td>`;
        html += '</tr>';

        html += `<tr id="item-details-${item.item_id}" style="display: none;">`;
        html += '<td colspan="8" style="padding: 0; border: 1px solid #ddd; background: #fff;">';
        html += '<div style="padding: 15px; background: #f8f9fa;">';
        html += '<h4 style="margin-top: 0; color: #1e3a5f;">Calculation Details</h4>';
        html += `<p style="margin-bottom: 10px;"><strong>Formula:</strong> Average = Total Revenue ÷ Total Quantity (from last ${item.sales_used} sale(s))</p>`;
        html += `<p style="margin-bottom: 15px;"><strong>Calculation:</strong> ${formatNumber(item.total_revenue)} ÷ ${formatNumber(item.total_quantity_sold)} = <strong>${formatNumber(item.average_sale_price)}</strong></p>`;

        if (item.sales && item.sales.length > 0) {
            html += '<h5 style="margin-top: 15px; margin-bottom: 10px; color: #1e3a5f;">Last ' + item.sales.length + ' Sale(s):</h5>';
            html += '<table style="width: 100%; border-collapse: collapse; background: white; border: 1px solid #ddd;">';
            html += '<thead><tr style="background: #e8e8e8;"><th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Date</th>';
            html += '<th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Invoice</th>';
            html += '<th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Customer</th>';
            html += '<th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Currency</th>';
            html += '<th style="padding: 8px; text-align: right; border: 1px solid #ddd;">Quantity</th>';
            html += '<th style="padding: 8px; text-align: right; border: 1px solid #ddd;">Unit Price</th>';
            html += '<th style="padding: 8px; text-align: right; border: 1px solid #ddd;">Total Price</th></tr></thead><tbody>';
            item.sales.forEach(sale => {
                html += '<tr>';
                html += `<td style="padding: 6px; border: 1px solid #ddd;">${sale.date}</td>`;
                html += `<td style="padding: 6px; border: 1px solid #ddd;">${escapeHtml(sale.invoice_number)}</td>`;
                html += `<td style="padding: 6px; border: 1px solid #ddd;">${escapeHtml(sale.customer_name)}</td>`;
                html += `<td style="padding: 6px; border: 1px solid #ddd;">${escapeHtml(sale.customer_currency)}</td>`;
                html += `<td style="padding: 6px; border: 1px solid #ddd; text-align: right;">${formatNumber(sale.quantity)}</td>`;
                html += `<td style="padding: 6px; border: 1px solid #ddd; text-align: right;">${formatNumber(sale.unit_price)}</td>`;
                html += `<td style="padding: 6px; border: 1px solid #ddd; text-align: right;">${formatNumber(sale.total_price)}</td>`;
                html += '</tr>';
            });
            html += '</tbody></table>';
        }
        html += '</div></td></tr>';
    });

    html += '</tbody></table></div>';
    content.innerHTML = html;
}

function clearAverageLastNSalesFilters() {
    document.getElementById('averageLastNSalesSupplier').value = '';
    document.getElementById('averageLastNSalesItem').value = '';
    loadAverageLastNSalesReport();
}

function loadSuppliersForAverageLastNSales() {
    fetch('/api/companies?category=Supplier')
        .then(response => response.json())
        .then(suppliers => {
            const select = document.getElementById('averageLastNSalesSupplier');
            if (select) {
                select.innerHTML = '<option value="">All Suppliers</option>';
                suppliers.forEach(supplier => {
                    const option = document.createElement('option');
                    option.value = supplier.id;
                    option.textContent = supplier.name;
                    select.appendChild(option);
                });
            }
        })
        .catch(error => console.error('Error loading suppliers:', error));
}

function loadItemsForAverageLastNSales() {
    fetch('/api/items/summary')
        .then(response => response.json())
        .then(items => {
            const select = document.getElementById('averageLastNSalesItem');
            if (select) {
                select.innerHTML = '<option value="">All Items</option>';
                items.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.id;
                    option.textContent = `${item.code} - ${item.name}`;
                    select.appendChild(option);
                });
            }
        })
        .catch(error => console.error('Error loading items:', error));
}

function loadLastPurchasePriceReport() {
    const content = document.getElementById('reportContent');
    content.innerHTML = '<div class="spinner"></div>';

    const supplierId = document.getElementById('lastPurchasePriceSupplier')?.value || '';
    const itemId = document.getElementById('lastPurchasePriceItem')?.value || '';

    let url = '/api/reports/last-purchase-price?';
    if (supplierId) url += `supplier_id=${supplierId}&`;
    if (itemId) url += `item_id=${itemId}&`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                content.innerHTML = `<p style="color: red; padding: 20px;">Error: ${data.error}</p>`;
                return;
            }
            renderLastPurchasePriceReport(data);
        })
        .catch(error => {
            console.error('Error loading last purchase price report:', error);
            content.innerHTML = '<p style="color: red; padding: 20px;">Error loading report: ' + error.message + '</p>';
        });
}

function renderLastPurchasePriceReport(data) {
    const content = document.getElementById('reportContent');
    const items = data.items || [];

    if (items.length === 0) {
        content.innerHTML = '<p style="color: var(--text-secondary); padding: 20px; text-align: center;">No purchase data found for the selected filters.</p>';
        return;
    }

    let html = '<div class="report-table-wrapper">';
    html += '<h3 style="margin-bottom: 20px; color: #1e3a5f;">Last Purchase Price</h3>';
    html += '<p style="margin-bottom: 15px; color: #666;">Unit price from the most recent purchase for each item.</p>';
    html += `<p style="margin-bottom: 15px; color: #666;">Total Items: <strong>${items.length}</strong></p>`;

    html += '<table class="report-table" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">';
    html += '<thead><tr style="background: #1e3a5f; color: white;">';
    html += '<th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Item Code</th>';
    html += '<th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Item Name</th>';
    html += '<th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Supplier</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Last Purchase Price</th>';
    html += '<th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Last Purchase Date</th>';
    html += '<th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Container</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Quantity</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Total Price</th>';
    html += '<th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Currency</th>';
    html += '</tr></thead><tbody>';

    items.forEach((item, index) => {
        html += `<tr style="background: ${index % 2 === 0 ? '#fff' : '#f8f9fa'};">`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">${escapeHtml(item.item_code)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(item.item_name)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(item.supplier_name || 'N/A')}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right; font-weight: bold; color: #1e3a5f;">${formatNumber(item.last_purchase_price)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd;">${item.last_purchase_date || '-'}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(item.container_number || '-')}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${formatNumber(item.quantity)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${formatNumber(item.total_price)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(item.currency || '-')}</td>`;
        html += '</tr>';
    });

    html += '</tbody></table></div>';
    content.innerHTML = html;
}

function clearLastPurchasePriceFilters() {
    document.getElementById('lastPurchasePriceSupplier').value = '';
    document.getElementById('lastPurchasePriceItem').value = '';
    loadLastPurchasePriceReport();
}

function loadSuppliersForLastPurchasePrice() {
    fetch('/api/companies?category=Supplier')
        .then(response => response.json())
        .then(suppliers => {
            const select = document.getElementById('lastPurchasePriceSupplier');
            if (select) {
                select.innerHTML = '<option value="">All Suppliers</option>';
                suppliers.forEach(supplier => {
                    const option = document.createElement('option');
                    option.value = supplier.id;
                    option.textContent = supplier.name;
                    select.appendChild(option);
                });
            }
        })
        .catch(error => console.error('Error loading suppliers:', error));
}

function loadItemsForLastPurchasePrice() {
    fetch('/api/items/summary')
        .then(response => response.json())
        .then(items => {
            const select = document.getElementById('lastPurchasePriceItem');
            if (select) {
                select.innerHTML = '<option value="">All Items</option>';
                items.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.id;
                    option.textContent = `${item.code} - ${item.name}`;
                    select.appendChild(option);
                });
            }
        })
        .catch(error => console.error('Error loading items:', error));
}

function loadAverageSalePriceReport() {
    const content = document.getElementById('reportContent');
    content.innerHTML = '<div class="spinner"></div>';
    
    const startDate = document.getElementById('averageSalePriceStartDate')?.value || '';
    const endDate = document.getElementById('averageSalePriceEndDate')?.value || '';
    const supplierId = document.getElementById('averageSalePriceSupplier')?.value || '';
    const customerId = document.getElementById('averageSalePriceCustomer')?.value || '';
    const itemId = document.getElementById('averageSalePriceItem')?.value || '';
    
    let url = '/api/reports/average-sale-price?';
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    if (supplierId) url += `supplier_id=${supplierId}&`;
    if (customerId) url += `customer_id=${customerId}&`;
    if (itemId) url += `item_id=${itemId}&`;
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                content.innerHTML = `<p style="color: red; padding: 20px;">Error: ${data.error}</p>`;
                return;
            }
            
            renderAverageSalePriceReport(data);
        })
        .catch(error => {
            console.error('Error loading average sale price report:', error);
            content.innerHTML = '<p style="color: red; padding: 20px;">Error loading report: ' + error.message + '</p>';
        });
}

function renderAverageSalePriceReport(data) {
    const content = document.getElementById('reportContent');
    const items = data.items || [];
    
    if (items.length === 0) {
        content.innerHTML = '<p style="color: var(--text-secondary); padding: 20px; text-align: center;">No sales data found for the selected filters.</p>';
        return;
    }
    
    let html = '<div class="report-table-wrapper">';
    html += '<h3 style="margin-bottom: 20px; color: #1e3a5f;">Average Sale Price Report</h3>';
    
    // Show filter info
    const filters = data.filters || {};
    if (filters.start_date || filters.end_date || filters.supplier_id || filters.customer_id || filters.item_id) {
        html += '<div style="background: #f8f9fa; padding: 10px; margin-bottom: 15px; border-radius: 4px; font-size: 14px;">';
        html += '<strong>Filters Applied:</strong> ';
        const filterParts = [];
        if (filters.start_date) filterParts.push(`From: ${filters.start_date}`);
        if (filters.end_date) filterParts.push(`To: ${filters.end_date}`);
        if (filters.supplier_id) filterParts.push(`Supplier ID: ${filters.supplier_id}`);
        if (filters.customer_id) filterParts.push(`Customer ID: ${filters.customer_id}`);
        if (filters.item_id) filterParts.push(`Item ID: ${filters.item_id}`);
        html += filterParts.join(' | ');
        html += '</div>';
    }
    
    html += `<p style="margin-bottom: 15px; color: #666;">Total Items: <strong>${items.length}</strong></p>`;
    
    // Table
    html += '<table class="report-table" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">';
    html += '<thead><tr style="background: #1e3a5f; color: white;">';
    html += '<th style="padding: 12px; text-align: left; border: 1px solid #ddd; width: 30px;"></th>';
    html += '<th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Item Code</th>';
    html += '<th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Item Name</th>';
    html += '<th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Supplier</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Avg Sale Price</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Total Qty Sold</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Total Revenue</th>';
    html += '<th style="padding: 12px; text-align: center; border: 1px solid #ddd;">Transactions</th>';
    html += '</tr></thead><tbody>';
    
    items.forEach((item, index) => {
        const rowId = `item-row-${item.item_id}`;
        const detailsId = `item-details-${item.item_id}`;
        const isExpanded = false;
        
        html += `<tr id="${rowId}" style="cursor: pointer; background: ${index % 2 === 0 ? '#fff' : '#f8f9fa'};" onclick="toggleItemDetails(${item.item_id})">`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: center;">
                    <span id="expand-icon-${item.item_id}" style="font-size: 12px;">▶</span>
                 </td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">${escapeHtml(item.item_code)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(item.item_name)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(item.supplier_name || 'N/A')}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right; font-weight: bold; color: #1e3a5f;">${formatNumber(item.average_sale_price)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${formatNumber(item.total_quantity_sold)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${formatNumber(item.total_revenue)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${item.transaction_count}</td>`;
        html += '</tr>';
        
        // Details row (initially hidden)
        html += `<tr id="${detailsId}" style="display: none;">`;
        html += `<td colspan="8" style="padding: 0; border: 1px solid #ddd; background: #fff;">`;
        html += '<div style="padding: 15px; background: #f8f9fa;">';
        html += '<h4 style="margin-top: 0; color: #1e3a5f;">Calculation Details</h4>';
        html += `<p style="margin-bottom: 10px;"><strong>Formula:</strong> Average Sale Price = Total Revenue ÷ Total Quantity</p>`;
        html += `<p style="margin-bottom: 15px;"><strong>Calculation:</strong> ${formatNumber(item.total_revenue)} ÷ ${formatNumber(item.total_quantity_sold)} = <strong>${formatNumber(item.average_sale_price)}</strong></p>`;
        
        if (item.sales && item.sales.length > 0) {
            html += '<h5 style="margin-top: 15px; margin-bottom: 10px; color: #1e3a5f;">Individual Sales:</h5>';
            html += '<table style="width: 100%; border-collapse: collapse; background: white; border: 1px solid #ddd;">';
            html += '<thead><tr style="background: #e8e8e8;"><th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Date</th>';
            html += '<th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Invoice</th>';
            html += '<th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Customer</th>';
            html += '<th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Currency</th>';
            html += '<th style="padding: 8px; text-align: right; border: 1px solid #ddd;">Quantity</th>';
            html += '<th style="padding: 8px; text-align: right; border: 1px solid #ddd;">Unit Price</th>';
            html += '<th style="padding: 8px; text-align: right; border: 1px solid #ddd;">Total Price</th></tr></thead><tbody>';
            
            item.sales.forEach(sale => {
                html += '<tr>';
                html += `<td style="padding: 6px; border: 1px solid #ddd;">${sale.date}</td>`;
                html += `<td style="padding: 6px; border: 1px solid #ddd;">${escapeHtml(sale.invoice_number)}</td>`;
                html += `<td style="padding: 6px; border: 1px solid #ddd;">${escapeHtml(sale.customer_name)}</td>`;
                html += `<td style="padding: 6px; border: 1px solid #ddd;">${escapeHtml(sale.customer_currency)}</td>`;
                html += `<td style="padding: 6px; border: 1px solid #ddd; text-align: right;">${formatNumber(sale.quantity)}</td>`;
                html += `<td style="padding: 6px; border: 1px solid #ddd; text-align: right;">${formatNumber(sale.unit_price)}</td>`;
                html += `<td style="padding: 6px; border: 1px solid #ddd; text-align: right;">${formatNumber(sale.total_price)}</td>`;
                html += '</tr>';
            });
            
            html += '</tbody></table>';
        }
        
        html += '</div></td></tr>';
    });
    
    html += '</tbody></table>';
    html += '</div>';
    
    content.innerHTML = html;
}

function toggleItemDetails(itemId) {
    const detailsRow = document.getElementById(`item-details-${itemId}`);
    const expandIcon = document.getElementById(`expand-icon-${itemId}`);
    
    if (detailsRow.style.display === 'none') {
        detailsRow.style.display = 'table-row';
        expandIcon.textContent = '▼';
    } else {
        detailsRow.style.display = 'none';
        expandIcon.textContent = '▶';
    }
}

function loadSuppliersForAverageSalePrice() {
    fetch('/api/companies?category=Supplier')
        .then(response => response.json())
        .then(suppliers => {
            const select = document.getElementById('averageSalePriceSupplier');
            if (select) {
                select.innerHTML = '<option value="">All Suppliers</option>';
                suppliers.forEach(supplier => {
                    const option = document.createElement('option');
                    option.value = supplier.id;
                    option.textContent = supplier.name;
                    select.appendChild(option);
                });
            }
        })
        .catch(error => console.error('Error loading suppliers:', error));
}

function loadCustomersForAverageSalePrice() {
    fetch('/api/companies?category=Customer')
        .then(response => response.json())
        .then(customers => {
            const select = document.getElementById('averageSalePriceCustomer');
            if (select) {
                select.innerHTML = '<option value="">All Customers</option>';
                customers.forEach(customer => {
                    const option = document.createElement('option');
                    option.value = customer.id;
                    option.textContent = customer.name;
                    select.appendChild(option);
                });
            }
        })
        .catch(error => console.error('Error loading customers:', error));
}

function loadItemsForAverageSalePrice() {
    fetch('/api/items/summary')
        .then(response => response.json())
        .then(items => {
            const select = document.getElementById('averageSalePriceItem');
            if (select) {
                select.innerHTML = '<option value="">All Items</option>';
                items.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.id;
                    option.textContent = `${item.code} - ${item.name}`;
                    select.appendChild(option);
                });
            }
        })
        .catch(error => console.error('Error loading items:', error));
}

function clearAverageSalePriceFilters() {
    document.getElementById('averageSalePriceStartDate').value = '';
    document.getElementById('averageSalePriceEndDate').value = '';
    document.getElementById('averageSalePriceSupplier').value = '';
    document.getElementById('averageSalePriceCustomer').value = '';
    document.getElementById('averageSalePriceItem').value = '';
    
    // Set default dates (last 30 days)
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    document.getElementById('averageSalePriceStartDate').value = thirtyDaysAgo.toISOString().split('T')[0];
    document.getElementById('averageSalePriceEndDate').value = today.toISOString().split('T')[0];
    
    loadAverageSalePriceReport();
}

function exportAverageSalePriceReport() {
    const startDate = document.getElementById('averageSalePriceStartDate')?.value || '';
    const endDate = document.getElementById('averageSalePriceEndDate')?.value || '';
    const supplierId = document.getElementById('averageSalePriceSupplier')?.value || '';
    const customerId = document.getElementById('averageSalePriceCustomer')?.value || '';
    const itemId = document.getElementById('averageSalePriceItem')?.value || '';
    
    let url = '/api/reports/average-sale-price/export?';
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    if (supplierId) url += `supplier_id=${supplierId}&`;
    if (customerId) url += `customer_id=${customerId}&`;
    if (itemId) url += `item_id=${itemId}&`;
    
    window.location.href = url;
}

function exportAverageLastNSalesReport() {
    const supplierId = document.getElementById('averageLastNSalesSupplier')?.value || '';
    const itemId = document.getElementById('averageLastNSalesItem')?.value || '';
    
    let url = '/api/reports/average-last-n-sales/export?';
    if (supplierId) url += `supplier_id=${supplierId}&`;
    if (itemId) url += `item_id=${itemId}&`;
    
    window.location.href = url;
}

function exportLastPurchasePriceReport() {
    const supplierId = document.getElementById('lastPurchasePriceSupplier')?.value || '';
    const itemId = document.getElementById('lastPurchasePriceItem')?.value || '';
    
    let url = '/api/reports/last-purchase-price/export?';
    if (supplierId) url += `supplier_id=${supplierId}&`;
    if (itemId) url += `item_id=${itemId}&`;
    
    window.location.href = url;
}
