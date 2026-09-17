// Reports page JavaScript

let currentReportType = null;
let currentItemId = null;
let currentItemCode = null;
let currentItemName = null;

/** When set, Movement Details shows only Sale rows matching this unit price + currency (inventory report). */
let inventorySalesPriceFilter = null;
/** { movements, breakdown, itemId } for re-rendering after filter click */
let inventoryReportCache = null;

const INV_SALES_PRICE_EPS = 1e-6;

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

    // Deep links from Partners page (and bookmarks)
    if (reportParam === 'partner-profit') {
        if (typeof showReportCategory === 'function') showReportCategory('financial');
        showPartnerProfitReport();
    } else if (reportParam === 'profit-loss') {
        if (typeof showReportCategory === 'function') showReportCategory('financial');
        showProfitLossReport();
    } else if (reportParam === 'safe') {
        if (typeof showReportCategory === 'function') showReportCategory('safe');
        showSafeReport();
    } else if (reportParam === 'safe-out') {
        if (typeof showReportCategory === 'function') showReportCategory('safe');
        showSafeOutReport();
    }

    const reportContentEl = document.getElementById('reportContent');
    if (reportContentEl) {
        reportContentEl.addEventListener('click', function inventorySalesPriceFilterHandler(e) {
            if (currentReportType !== 'inventory') return;
            const clearBtn = e.target.closest('.inventory-clear-sales-filter-btn');
            if (clearBtn) {
                e.preventDefault();
                inventorySalesPriceFilter = null;
                refreshInventoryReportDom();
                return;
            }
            const row = e.target.closest('.sales-price-breakdown-row');
            if (!row) return;
            const unitRaw = row.getAttribute('data-sp-unit-price');
            const cur = row.getAttribute('data-sp-currency') || '';
            const unit = parseFloat(unitRaw, 10);
            if (Number.isNaN(unit)) return;
            if (inventorySalesPriceFilter &&
                Math.abs(inventorySalesPriceFilter.unit_price - unit) < INV_SALES_PRICE_EPS &&
                inventorySalesPriceFilter.currency === cur) {
                inventorySalesPriceFilter = null;
            } else {
                inventorySalesPriceFilter = { unit_price: unit, currency: cur };
            }
            refreshInventoryReportDom();
        });
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
    hideInventoryStockRelatedFilters();
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('lastPurchaseCogFilters').style.display = 'none';
    document.getElementById('reportArea').style.display = 'block';
    loadItemsForProfitLoss();
    loadReport();
}

function showPartnerProfitReport() {
    currentReportType = 'partner-profit';
    const pdfBtn = document.getElementById('exportPDFBtn');
    if (pdfBtn) pdfBtn.style.display = 'none';
    document.getElementById('reportTitle').textContent = 'Partner Profit Allocation';
    document.getElementById('reportFilters').style.display = 'block';
    document.getElementById('containerReportFilters').style.display = 'none';
    document.getElementById('safeReportTypeFilter').style.display = 'none';
    document.getElementById('inventoryMovementTypeFilter').style.display = 'none';
    document.getElementById('inventoryItemFilter').style.display = 'none';
    document.getElementById('profitLossItemFilter').style.display = 'none';
    hideInventoryStockRelatedFilters();
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('lastPurchaseCogFilters').style.display = 'none';
    document.getElementById('reportArea').style.display = 'block';
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
    hideInventoryStockRelatedFilters();
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('lastPurchaseCogFilters').style.display = 'none';
    document.getElementById('reportArea').style.display = 'block';
    
    // Set default start date to 01/01/2020
    if (window.inventoryDefaultStartDate) {
        const startDateInput = document.getElementById('reportStartDate');
        startDateInput.value = window.inventoryDefaultStartDate;
    }
    
    // Load items for filter (also sets item when currentItemId from URL)
    loadItemsForInventoryReport();
    
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
    hideInventoryStockRelatedFilters();
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('lastPurchaseCogFilters').style.display = 'none';
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
    hideInventoryStockRelatedFilters();
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('lastPurchaseCogFilters').style.display = 'none';
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
    hideInventoryStockRelatedFilters();
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
    hideInventoryStockRelatedFilters();
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'block';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('lastPurchaseCogFilters').style.display = 'none';
    document.getElementById('reportArea').style.display = 'block';
    
    // Show empty state until file is uploaded
    const content = document.getElementById('reportContent');
    content.innerHTML = '<p style="color: var(--text-secondary); padding: 20px; text-align: center;">Please upload an Excel file with columns: ItemCode, Quantity, Price, Currency, ExchangeRate</p>';
}

function setReportDatesByDayOffset(startOffsetDays, endOffsetDays) {
    const fmt = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };
    const base = new Date();
    const start = new Date(base);
    start.setDate(base.getDate() - startOffsetDays);
    const end = new Date(base);
    end.setDate(base.getDate() - endOffsetDays);
    document.getElementById('reportStartDate').value = fmt(start);
    document.getElementById('reportEndDate').value = fmt(end);
}

function showDailySalesReport() {
    currentReportType = 'daily-sales';
    setReportDatesByDayOffset(1, 0); // yesterday → today
    const pdfBtn = document.getElementById('exportPDFBtn');
    if (pdfBtn) pdfBtn.style.display = 'none';
    document.getElementById('reportTitle').textContent = 'Daily Sales Invoice Report';
    document.getElementById('reportFilters').style.display = 'block';
    document.getElementById('containerReportFilters').style.display = 'none';
    document.getElementById('safeReportTypeFilter').style.display = 'none';
    document.getElementById('inventoryMovementTypeFilter').style.display = 'none';
    document.getElementById('inventoryItemFilter').style.display = 'none';
    document.getElementById('profitLossItemFilter').style.display = 'none';
    hideInventoryStockRelatedFilters();
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('lastPurchaseCogFilters').style.display = 'none';
    const repFilter = document.getElementById('reportRepresentativeFilter');
    if (repFilter) repFilter.style.display = 'none';
    document.getElementById('reportArea').style.display = 'block';
    loadDailySalesReport();
}

function showDailyPurchasesReport() {
    currentReportType = 'daily-purchases';
    const pdfBtn = document.getElementById('exportPDFBtn');
    if (pdfBtn) pdfBtn.style.display = 'none';
    document.getElementById('reportTitle').textContent = 'Daily Purchase Invoice Report';
    document.getElementById('reportFilters').style.display = 'block';
    document.getElementById('containerReportFilters').style.display = 'none';
    document.getElementById('safeReportTypeFilter').style.display = 'none';
    document.getElementById('inventoryMovementTypeFilter').style.display = 'none';
    document.getElementById('inventoryItemFilter').style.display = 'none';
    document.getElementById('profitLossItemFilter').style.display = 'none';
    hideInventoryStockRelatedFilters();
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('lastPurchaseCogFilters').style.display = 'none';
    const repFilter = document.getElementById('reportRepresentativeFilter');
    if (repFilter) repFilter.style.display = 'block';
    loadReportRepresentatives();
    document.getElementById('reportArea').style.display = 'block';
    loadDailyPurchasesReport();
}

function showRepresentativeCollectionsReport() {
    currentReportType = 'representative-collections';
    const pdfBtn = document.getElementById('exportPDFBtn');
    if (pdfBtn) pdfBtn.style.display = 'none';
    document.getElementById('reportTitle').textContent = 'Representative Collections Report (Detailed)';
    document.getElementById('reportFilters').style.display = 'block';
    document.getElementById('containerReportFilters').style.display = 'none';
    document.getElementById('safeReportTypeFilter').style.display = 'none';
    document.getElementById('inventoryMovementTypeFilter').style.display = 'none';
    document.getElementById('inventoryItemFilter').style.display = 'none';
    document.getElementById('profitLossItemFilter').style.display = 'none';
    hideInventoryStockRelatedFilters();
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('lastPurchaseCogFilters').style.display = 'none';
    const repFilter = document.getElementById('reportRepresentativeFilter');
    if (repFilter) repFilter.style.display = 'block';
    loadReportRepresentatives();
    document.getElementById('reportArea').style.display = 'block';
    loadRepresentativeCollectionsReport();
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
    hideInventoryStockRelatedFilters();
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'block';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('lastPurchaseCogFilters').style.display = 'none';
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
    hideInventoryStockRelatedFilters();
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'block';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('lastPurchaseCogFilters').style.display = 'none';
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
    document.getElementById('collectedMoneyCustomerFilter').style.display = 'block';
    document.getElementById('collectedMoneyColumnSelector').style.display = 'block';
    setSafeOutColumnSelectorVisible(false);
    setProfitLossColumnSelectorVisible(false);
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
    document.getElementById('collectedMoneyCustomerFilter').style.display = 'none';
    document.getElementById('collectedMoneyColumnSelector').style.display = 'none';
    setProfitLossColumnSelectorVisible(false);
    setSafeOutColumnSelectorVisible(true);
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
    document.getElementById('collectedMoneyCustomerFilter').style.display = 'none';
    document.getElementById('inventoryMovementTypeFilter').style.display = 'none';
    document.getElementById('inventoryItemFilter').style.display = 'none';
    document.getElementById('profitLossItemFilter').style.display = 'none';
    hideInventoryStockRelatedFilters();
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('lastPurchaseCogFilters').style.display = 'none';
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
    hideInventoryStockRelatedFilters();
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('lastPurchaseCogFilters').style.display = 'none';
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
    hideInventoryStockRelatedFilters();
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'block';
    document.getElementById('lastPurchaseCogFilters').style.display = 'none';
    document.getElementById('reportArea').style.display = 'block';
    loadSuppliersForLastPurchasePrice();
    loadItemsForLastPurchasePrice();
    loadLastPurchasePriceReport();
}

function showLastPurchaseCogReport() {
    currentReportType = 'last-purchase-cog';
    const pdfBtn = document.getElementById('exportPDFBtn');
    if (pdfBtn) pdfBtn.style.display = 'none';
    document.getElementById('reportTitle').textContent = 'Last Purchase COG';
    document.getElementById('reportFilters').style.display = 'none';
    document.getElementById('containerReportFilters').style.display = 'none';
    document.getElementById('safeReportTypeFilter').style.display = 'none';
    document.getElementById('inventoryMovementTypeFilter').style.display = 'none';
    document.getElementById('inventoryItemFilter').style.display = 'none';
    document.getElementById('profitLossItemFilter').style.display = 'none';
    hideInventoryStockRelatedFilters();
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('lastPurchaseCogFilters').style.display = 'none';
    document.getElementById('lastPurchaseCogFilters').style.display = 'block';
    document.getElementById('reportArea').style.display = 'block';
    loadSuppliersForLastPurchaseCog();
    loadItemsForLastPurchaseCog();
    loadLastPurchaseCogReport();
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
    hideInventoryStockRelatedFilters();
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'block';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('lastPurchaseCogFilters').style.display = 'none';
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

function hideInventoryStockRelatedFilters() {
    const stock = document.getElementById('inventoryStockFilters');
    if (stock) stock.style.display = 'none';
    const atCost = document.getElementById('inventoryStockAtCostFilters');
    if (atCost) atCost.style.display = 'none';
    const repFilter = document.getElementById('reportRepresentativeFilter');
    if (repFilter) repFilter.style.display = 'none';
}

function clearReportFilters() {
    document.getElementById('reportStartDate').value = '';
    document.getElementById('reportEndDate').value = '';
    const reportRep = document.getElementById('reportRepresentativeId');
    if (reportRep) reportRep.value = '';
    const transactionTypeSelect = document.getElementById('reportTransactionType');
    if (transactionTypeSelect) {
        transactionTypeSelect.value = 'All';
    }
    const collectedMoneyCustomerType = document.getElementById('collectedMoneyCustomerType');
    if (collectedMoneyCustomerType) {
        collectedMoneyCustomerType.value = 'both';
    }
    const movementTypeSelect = document.getElementById('inventoryMovementType');
    if (movementTypeSelect) {
        movementTypeSelect.value = 'both';
    }
    const inventoryReportItemInput = document.getElementById('inventoryReportItem');
    const inventoryReportItemSearch = document.getElementById('inventoryReportItemSearch');
    if (inventoryReportItemInput) inventoryReportItemInput.value = '';
    if (inventoryReportItemSearch) inventoryReportItemSearch.value = '';
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
    setProfitLossColumnSelectorVisible(currentReportType === 'profit-loss');
    setSafeOutColumnSelectorVisible(currentReportType === 'safe-out');
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
        case 'inventory-stock-at-cost':
            loadInventoryStockAtCostReport();
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
        case 'last-purchase-cog':
            loadLastPurchaseCogReport();
            break;
        case 'daily-sales':
            loadDailySalesReport();
            break;
        case 'daily-purchases':
            loadDailyPurchasesReport();
            break;
        case 'representative-collections':
            loadRepresentativeCollectionsReport();
            break;
        case 'safe-out':
            loadSafeOutReport();
            break;
        case 'collected-money':
            loadCollectedMoneyReport();
            break;
        case 'partner-profit':
            loadPartnerProfitReport();
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

function dailySalesUsdRateTitle(day) {
    if (day.usd_rate_from_safe_statement) {
        return `Safe Statement rate: ${day.usd_rate} (base per USD)`;
    }
    return `No Safe Statement rate for this date; using default ${day.usd_rate}`;
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

            const days = Array.isArray(data) ? data : (data.days || []);
            const periodTotalUsd = Array.isArray(data)
                ? days.reduce((sum, day) => sum + parseFloat(day.approx_usd_amount || 0), 0)
                : parseFloat(data.total_usd_amount || 0);
            const periodTotalUsdPaid = Array.isArray(data)
                ? days.reduce((sum, day) => sum + parseFloat(day.approx_usd_paid || 0), 0)
                : parseFloat(data.total_usd_paid || 0);
            const periodTotalUsdBalance = Array.isArray(data)
                ? days.reduce((sum, day) => sum + parseFloat(day.approx_usd_balance || 0), 0)
                : parseFloat(data.total_usd_balance || 0);
            
            if (!days || days.length === 0) {
                document.getElementById('reportContent').innerHTML = '<p style="color: #666; text-align: center; padding: 40px;">No sales found for the selected period.</p>';
                return;
            }
            
            let periodTotalQty = 0;
            let periodTotalAmount = 0;
            let periodTotalPaid = 0;
            let periodTotalBalance = 0;

            days.forEach(day => {
                periodTotalQty += parseFloat(day.total_quantity || 0);
                periodTotalAmount += parseFloat(day.total_amount || 0);
                periodTotalPaid += parseFloat(day.total_paid || 0);
                periodTotalBalance += parseFloat(day.total_balance || 0);
            });

            const hidePaidAndBalanceInSummary = Math.abs(periodTotalPaid - periodTotalAmount) < 0.005;
            const paidSummaryHtml = hidePaidAndBalanceInSummary ? '' : `
                        <div>
                            <label style="display: block; font-size: 12px; color: #666; margin-bottom: 4px;">≈USD Paid</label>
                            <div style="font-size: 20px; font-weight: bold; color: #4caf50;">${formatCurrency(periodTotalUsdPaid, 'USD')}</div>
                        </div>`;
            const balanceSummaryHtml = hidePaidAndBalanceInSummary ? '' : `
                        <div>
                            <label style="display: block; font-size: 12px; color: #666; margin-bottom: 4px;">≈USD Balance</label>
                            <div style="font-size: 20px; font-weight: bold; color: #f44336;">${formatCurrency(periodTotalUsdBalance, 'USD')}</div>
                        </div>`;

            let html = `
                <div class="report-summary" style="margin-bottom: 20px;">
                    <h3 style="color: #1e3a5f; margin-bottom: 12px;">Summary</h3>
                    <div style="display: flex; gap: 24px; flex-wrap: wrap; align-items: center;">
                        <div>
                            <label style="display: block; font-size: 12px; color: #666; margin-bottom: 4px;">Total Amount</label>
                            <div style="font-size: 20px; font-weight: bold; color: #1e3a5f;">${formatCurrency(periodTotalAmount)}</div>
                        </div>
                        <div>
                            <label style="display: block; font-size: 12px; color: #666; margin-bottom: 4px;">≈USD Total</label>
                            <div style="font-size: 20px; font-weight: bold; color: #1565c0;">${formatCurrency(periodTotalUsd, 'USD')}</div>
                        </div>
                        ${paidSummaryHtml}
                        ${balanceSummaryHtml}
                    </div>
                </div>
                <div class="table-container">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background-color: #1e3a5f; color: white;">
                                <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Date</th>
                                <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Customers</th>
                                <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Suppliers</th>
                                <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Total Qty</th>
                                <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Total Amount</th>
                                <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">≈USD Amount</th>
                                <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Total Paid</th>
                                <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Balance</th>
                                <th style="padding: 12px; text-align: center; border: 1px solid #ddd;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            days.forEach(day => {
                const date = new Date(day.date).toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
                const customers = day.customers.join(', ') || '-';
                const suppliers = day.suppliers.join(', ') || '-';
                const approxUsd = day.approx_usd_amount != null ? formatCurrency(day.approx_usd_amount, 'USD') : '-';
                
                html += `
                    <tr style="border-bottom: 1px solid #ddd;">
                        <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">${date}</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${customers}</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${suppliers}</td>
                        <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${formatNumber(day.total_quantity != null ? day.total_quantity : 0)}</td>
                        <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${formatCurrency(day.total_amount)}</td>
                        <td style="padding: 10px; text-align: right; border: 1px solid #ddd; color: #1565c0;" title="${dailySalesUsdRateTitle(day)}">${approxUsd}</td>
                        <td style="padding: 10px; text-align: right; border: 1px solid #ddd; color: #4caf50;">${formatCurrency(day.total_paid)}</td>
                        <td style="padding: 10px; text-align: right; border: 1px solid #ddd; color: ${day.total_balance > 0 ? '#f44336' : '#4caf50'};">${formatCurrency(day.total_balance)}</td>
                        <td style="padding: 10px; text-align: center; border: 1px solid #ddd;">
                            <button class="btn btn-primary btn-sm" onclick="showDailyInvoice('${day.date}', ${JSON.stringify(day).replace(/'/g, "\\'").replace(/"/g, '&quot;')})">View Invoice</button>
                        </td>
                    </tr>
                `;
            });

            html += `
                    <tr class="total-row">
                        <td colspan="3" style="padding: 10px; border: 1px solid #ddd;"><strong>TOTAL</strong></td>
                        <td style="padding: 10px; text-align: right; border: 1px solid #ddd;"><strong>${formatNumber(periodTotalQty)}</strong></td>
                        <td style="padding: 10px; text-align: right; border: 1px solid #ddd;"><strong>${formatCurrency(periodTotalAmount)}</strong></td>
                        <td style="padding: 10px; text-align: right; border: 1px solid #ddd; color: #1565c0;"><strong>${formatCurrency(periodTotalUsd, 'USD')}</strong></td>
                        <td style="padding: 10px; text-align: right; border: 1px solid #ddd; color: #4caf50;"><strong>${formatCurrency(periodTotalPaid)}</strong></td>
                        <td style="padding: 10px; text-align: right; border: 1px solid #ddd; color: ${periodTotalBalance > 0 ? '#f44336' : '#4caf50'};"><strong>${formatCurrency(periodTotalBalance)}</strong></td>
                        <td style="padding: 10px; border: 1px solid #ddd;"></td>
                    </tr>
            `;
            
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
                    customer_name: sale.customer_name
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
                        <p style="margin: 5px 0;"><strong>Total Quantity (day):</strong> ${formatNumber(dayData.total_quantity != null ? dayData.total_quantity : 0)}</p>
                    </div>
                    <div>
                        <h3 style="color: #1e3a5f; margin: 0 0 10px 0; font-size: 16px; border-bottom: 2px solid #1e3a5f; padding-bottom: 5px;">Summary</h3>
                        <p style="margin: 5px 0;"><strong>Customers:</strong> ${dayData.customers.join(', ') || '-'}</p>
                    </div>
                </div>
                
                <!-- Items Table -->
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <thead>
                        <tr style="background-color: #1e3a5f; color: white;">
                            <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">#</th>
                            <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Customer</th>
                            <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Item / Type</th>
                            <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Quantity</th>
                            <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Unit Price</th>
                            <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        const totalQuantity = allItems.reduce((sum, item) => sum + parseFloat(item.quantity || 0), 0);
        
        allItems.forEach((item, index) => {
            invoiceHTML += `
                        <tr style="border-bottom: 1px solid #ddd;">
                            <td style="padding: 10px; border: 1px solid #ddd;">${index + 1}</td>
                            <td style="padding: 10px; border: 1px solid #ddd;">${item.customer_name}</td>
                            <td style="padding: 10px; border: 1px solid #ddd;">${item.is_fast_line ? '<span style="color:#1565c0;font-weight:600;">Fast</span>' : escapeHtml(item.item_code || '—')}</td>
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
                                <td style="padding: 8px; text-align: right; border: 1px solid #ddd;"><strong>Total Quantity:</strong></td>
                                <td style="padding: 8px; text-align: right; border: 1px solid #ddd; font-weight: bold;">${formatNumber(totalQuantity)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; text-align: right; border: 1px solid #ddd;"><strong>Total Amount:</strong></td>
                                <td style="padding: 8px; text-align: right; border: 1px solid #ddd; font-weight: bold; font-size: 18px; color: #1e3a5f;">${formatCurrency(dayData.total_amount)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; text-align: right; border: 1px solid #ddd;"><strong>≈USD Total Amount:</strong></td>
                                <td style="padding: 8px; text-align: right; border: 1px solid #ddd; font-weight: bold; font-size: 16px; color: #1565c0;" title="${dailySalesUsdRateTitle(dayData)}">${dayData.approx_usd_amount != null ? formatCurrency(dayData.approx_usd_amount, 'USD') : '-'}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; text-align: right; border: 1px solid #ddd;"><strong>Total Paid:</strong></td>
                                <td style="padding: 8px; text-align: right; border: 1px solid #ddd; font-weight: bold; color: #4caf50;">${formatCurrency(dayData.total_paid)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; text-align: right; border: 1px solid #ddd;"><strong>≈USD Total Paid:</strong></td>
                                <td style="padding: 8px; text-align: right; border: 1px solid #ddd; font-weight: bold; font-size: 16px; color: #4caf50;" title="${dailySalesUsdRateTitle(dayData)}">${dayData.approx_usd_paid != null ? formatCurrency(dayData.approx_usd_paid, 'USD') : '-'}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; text-align: right; border: 1px solid #ddd;"><strong>Balance:</strong></td>
                                <td style="padding: 8px; text-align: right; border: 1px solid #ddd; font-weight: bold; color: ${dayData.total_balance > 0 ? '#f44336' : '#4caf50'};">${formatCurrency(dayData.total_balance)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; text-align: right; border: 1px solid #ddd;"><strong>≈USD Balance:</strong></td>
                                <td style="padding: 8px; text-align: right; border: 1px solid #ddd; font-weight: bold; font-size: 16px; color: #f44336;" title="${dailySalesUsdRateTitle(dayData)}">${dayData.approx_usd_balance != null ? formatCurrency(dayData.approx_usd_balance, 'USD') : '-'}</td>
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
        const title = currentReportType === 'daily-purchases' ? 'Daily Purchase Invoice' : 'Daily Sales Invoice';
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${title}</title>
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

function loadReportRepresentatives() {
    const select = document.getElementById('reportRepresentativeId');
    if (!select) return Promise.resolve();
    const current = select.value;
    return fetch('/api/representatives')
        .then(r => r.json())
        .then(data => {
            const reps = data.representatives || [];
            select.innerHTML = '<option value="">All Representatives</option>';
            reps.forEach(rep => {
                const opt = document.createElement('option');
                opt.value = rep.id;
                opt.textContent = rep.is_active ? rep.name : `${rep.name} (inactive)`;
                select.appendChild(opt);
            });
            if (current) select.value = current;
        })
        .catch(err => console.error('Error loading representatives:', err));
}

function loadDailyPurchasesReport() {
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    const repId = document.getElementById('reportRepresentativeId')?.value || '';

    let url = '/api/reports/daily-purchases?';
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    if (repId) url += `representative_id=${repId}&`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                document.getElementById('reportContent').innerHTML = `<p style="color: red;">Error: ${data.error}</p>`;
                return;
            }

            const days = Array.isArray(data) ? data : (data.days || []);
            const periodTotalUsd = Array.isArray(data)
                ? days.reduce((sum, day) => sum + parseFloat(day.approx_usd_amount || 0), 0)
                : parseFloat(data.total_usd_amount || 0);

            if (!days || days.length === 0) {
                document.getElementById('reportContent').innerHTML = '<p style="color: #666; text-align: center; padding: 40px;">No purchases found for the selected period.</p>';
                return;
            }

            let periodTotalQty = 0;
            let periodTotalAmount = 0;

            days.forEach(day => {
                periodTotalQty += parseFloat(day.total_quantity || 0);
                periodTotalAmount += parseFloat(day.total_amount || 0);
            });

            let html = `
                <div class="report-summary" style="margin-bottom: 20px;">
                    <h3 style="color: #1e3a5f; margin-bottom: 12px;">Summary</h3>
                    <div style="display: flex; gap: 24px; flex-wrap: wrap; align-items: center;">
                        <div>
                            <label style="display: block; font-size: 12px; color: #666; margin-bottom: 4px;">Total Amount (base)</label>
                            <div style="font-size: 20px; font-weight: bold; color: #1e3a5f;">${formatCurrency(periodTotalAmount)}</div>
                        </div>
                        <div>
                            <label style="display: block; font-size: 12px; color: #666; margin-bottom: 4px;">≈USD Total</label>
                            <div style="font-size: 20px; font-weight: bold; color: #1565c0;">${formatCurrency(periodTotalUsd, 'USD')}</div>
                        </div>
                    </div>
                </div>
                <div class="table-container">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background-color: #1e3a5f; color: white;">
                                <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Date</th>
                                <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Representatives</th>
                                <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Total Qty</th>
                                <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Total Amount</th>
                                <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">≈USD Amount</th>
                                <th style="padding: 12px; text-align: center; border: 1px solid #ddd;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            days.forEach(day => {
                const date = new Date(day.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                const representatives = (day.representatives || []).join(', ') || '—';
                const approxUsd = day.approx_usd_amount != null ? formatCurrency(day.approx_usd_amount, 'USD') : '-';

                html += `
                    <tr style="border-bottom: 1px solid #ddd;">
                        <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">${date}</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${representatives}</td>
                        <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${formatNumber(day.total_quantity != null ? day.total_quantity : 0)}</td>
                        <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${formatCurrency(day.total_amount)}</td>
                        <td style="padding: 10px; text-align: right; border: 1px solid #ddd; color: #1565c0;" title="${dailySalesUsdRateTitle(day)}">${approxUsd}</td>
                        <td style="padding: 10px; text-align: center; border: 1px solid #ddd;">
                            <button class="btn btn-primary btn-sm" onclick="showDailyPurchaseInvoice('${day.date}', ${JSON.stringify(day).replace(/'/g, "\\'").replace(/"/g, '&quot;')})">View Invoice</button>
                        </td>
                    </tr>
                `;
            });

            html += `
                    <tr class="total-row">
                        <td colspan="2" style="padding: 10px; border: 1px solid #ddd;"><strong>TOTAL</strong></td>
                        <td style="padding: 10px; text-align: right; border: 1px solid #ddd;"><strong>${formatNumber(periodTotalQty)}</strong></td>
                        <td style="padding: 10px; text-align: right; border: 1px solid #ddd;"><strong>${formatCurrency(periodTotalAmount)}</strong></td>
                        <td style="padding: 10px; text-align: right; border: 1px solid #ddd; color: #1565c0;"><strong>${formatCurrency(periodTotalUsd, 'USD')}</strong></td>
                        <td style="padding: 10px; border: 1px solid #ddd;"></td>
                    </tr>
            `;

            html += `
                        </tbody>
                    </table>
                </div>
            `;

            document.getElementById('reportContent').innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading daily purchases report:', error);
            document.getElementById('reportContent').innerHTML = '<p style="color: red;">Error loading report</p>';
        });
}

function showDailyPurchaseInvoice(date, dayDataStr) {
    const dayData = typeof dayDataStr === 'string' ? JSON.parse(dayDataStr.replace(/&quot;/g, '"')) : dayDataStr;

    let marketPromise = Promise.resolve(currentMarket);
    if (!currentMarket) {
        marketPromise = loadCurrentMarketForReports();
    }

    marketPromise.then(market => {
        const marketData = market || { name: 'Market', address: '', base_currency: 'USD' };
        const purchaseDate = new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const purchaseList = dayData.purchases || dayData.sales || [];
        const allItems = [];
        purchaseList.forEach(purchase => {
            (purchase.items || []).forEach(item => {
                allItems.push({
                    ...item,
                    representative_name: purchase.representative_name || '—',
                    invoice_number: purchase.invoice_number
                });
            });
        });

        let invoiceHTML = `
            <div id="dailyInvoiceToPrint" style="font-family: Arial, sans-serif; color: #333;">
                <div style="text-align: center; margin-bottom: 30px; border-bottom: 3px solid #1e3a5f; padding-bottom: 20px;">
                    <h1 style="color: #1e3a5f; margin: 0 0 10px 0; font-size: 28px;">SARI TEXTILE WAREHOUSES</h1>
                    <p style="margin: 5px 0; color: #666; font-size: 14px;">${marketData.address || ''}</p>
                    <h2 style="color: #1e3a5f; margin: 20px 0 0 0; font-size: 22px;">DAILY PURCHASE INVOICE</h2>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px;">
                    <div>
                        <h3 style="color: #1e3a5f; margin: 0 0 10px 0; font-size: 16px; border-bottom: 2px solid #1e3a5f; padding-bottom: 5px;">Invoice Details</h3>
                        <p style="margin: 5px 0;"><strong>Date:</strong> ${purchaseDate}</p>
                        <p style="margin: 5px 0;"><strong>Total Purchases:</strong> ${purchaseList.length}</p>
                        <p style="margin: 5px 0;"><strong>Total Quantity (day):</strong> ${formatNumber(dayData.total_quantity != null ? dayData.total_quantity : 0)}</p>
                    </div>
                    <div>
                        <h3 style="color: #1e3a5f; margin: 0 0 10px 0; font-size: 16px; border-bottom: 2px solid #1e3a5f; padding-bottom: 5px;">Summary</h3>
                        <p style="margin: 5px 0;"><strong>Representatives:</strong> ${(dayData.representatives || []).join(', ') || '—'}</p>
                    </div>
                </div>

                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <thead>
                        <tr style="background-color: #1e3a5f; color: white;">
                            <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">#</th>
                            <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Container No</th>
                            <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Representative</th>
                            <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Item / Type</th>
                            <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Description</th>
                            <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Quantity</th>
                            <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Unit Price</th>
                            <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        const totalQuantity = allItems.reduce((sum, item) => sum + parseFloat(item.quantity || 0), 0);

        allItems.forEach((item, index) => {
            invoiceHTML += `
                        <tr style="border-bottom: 1px solid #ddd;">
                            <td style="padding: 10px; border: 1px solid #ddd;">${index + 1}</td>
                            <td style="padding: 10px; border: 1px solid #ddd;">${item.invoice_number}</td>
                            <td style="padding: 10px; border: 1px solid #ddd;">${item.representative_name || '—'}</td>
                            <td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(item.item_code || '—')}</td>
                            <td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(item.item_name || '—')}</td>
                            <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${parseFloat(item.quantity).toFixed(2)}</td>
                            <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${formatCurrency(item.unit_price, item.currency)}</td>
                            <td style="padding: 10px; text-align: right; border: 1px solid #ddd; font-weight: bold;">${formatCurrency(item.total_price, item.currency)}</td>
                        </tr>
            `;
        });

        invoiceHTML += `
                    </tbody>
                </table>

                <div style="display: flex; justify-content: flex-end; margin-bottom: 20px;">
                    <div style="width: 300px;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px; text-align: right; border: 1px solid #ddd;"><strong>Total Quantity:</strong></td>
                                <td style="padding: 8px; text-align: right; border: 1px solid #ddd; font-weight: bold;">${formatNumber(totalQuantity)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; text-align: right; border: 1px solid #ddd;"><strong>Total Amount (base):</strong></td>
                                <td style="padding: 8px; text-align: right; border: 1px solid #ddd; font-weight: bold; font-size: 18px; color: #1e3a5f;">${formatCurrency(dayData.total_amount)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px; text-align: right; border: 1px solid #ddd;"><strong>≈USD Total Amount:</strong></td>
                                <td style="padding: 8px; text-align: right; border: 1px solid #ddd; font-weight: bold; font-size: 16px; color: #1565c0;" title="${dailySalesUsdRateTitle(dayData)}">${dayData.approx_usd_amount != null ? formatCurrency(dayData.approx_usd_amount, 'USD') : '-'}</td>
                            </tr>
                        </table>
                    </div>
                </div>
            </div>
        `;

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

function loadRepresentativeCollectionsReport() {
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    const repId = document.getElementById('reportRepresentativeId')?.value || '';

    let url = '/api/reports/representative-collections?';
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    if (repId) url += `representative_id=${repId}&`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                document.getElementById('reportContent').innerHTML = `<p style="color: red;">Error: ${data.error}</p>`;
                return;
            }

            const reps = data.representatives || [];
            if (!reps.length) {
                document.getElementById('reportContent').innerHTML = '<p style="color: #666; text-align: center; padding: 40px;">No tagged collections found for the selected period. Tag a representative on purchase containers to see them here.</p>';
                return;
            }

            let periodLineCount = 0;
            reps.forEach(rep => {
                (rep.containers || []).forEach(c => {
                    periodLineCount += (c.items || []).length;
                });
            });

            let html = `
                <div class="report-summary" style="margin-bottom: 20px;">
                    <h3 style="color: #1e3a5f; margin-bottom: 12px;">Summary</h3>
                    <div style="display: flex; gap: 24px; flex-wrap: wrap;">
                        <div>
                            <label style="display: block; font-size: 12px; color: #666; margin-bottom: 4px;">Containers</label>
                            <div style="font-size: 20px; font-weight: bold; color: #1e3a5f;">${data.container_count || 0}</div>
                        </div>
                        <div>
                            <label style="display: block; font-size: 12px; color: #666; margin-bottom: 4px;">Item Lines</label>
                            <div style="font-size: 20px; font-weight: bold; color: #1e3a5f;">${periodLineCount}</div>
                        </div>
                        <div>
                            <label style="display: block; font-size: 12px; color: #666; margin-bottom: 4px;">Total Quantity</label>
                            <div style="font-size: 20px; font-weight: bold; color: #1e3a5f;">${formatNumber(data.total_quantity || 0)}</div>
                        </div>
                        <div>
                            <label style="display: block; font-size: 12px; color: #666; margin-bottom: 4px;">Total Amount (base)</label>
                            <div style="font-size: 20px; font-weight: bold; color: #1e3a5f;">${formatCurrency(data.total_amount_base || 0)}</div>
                        </div>
                    </div>
                </div>
            `;

            reps.forEach(rep => {
                html += `
                    <div style="margin-bottom: 32px; border: 1px solid #dce5f0; border-radius: 6px; overflow: hidden;">
                        <div style="background: #1e3a5f; color: white; padding: 12px 16px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                            <strong style="font-size: 16px;">${escapeHtml(rep.representative_name)}</strong>
                            <span>${rep.container_count} container(s) · Qty ${formatNumber(rep.total_quantity)} · ${formatCurrency(rep.total_amount_base)}</span>
                        </div>
                `;

                (rep.containers || []).forEach(c => {
                    const items = c.items || [];
                    html += `
                        <div style="padding: 12px 14px 4px; background: #f4f7fb; border-top: 1px solid #dce5f0;">
                            <div style="display: flex; flex-wrap: wrap; gap: 8px 18px; font-size: 13px; color: #2a3a4d;">
                                <span><strong>Date:</strong> ${c.date}</span>
                                <span><strong>Container:</strong> ${escapeHtml(c.container_number)}</span>
                                <span><strong>Qty:</strong> ${formatNumber(c.total_quantity)}</span>
                                <span><strong>Amount:</strong> ${formatCurrency(c.total_amount_original, c.currency)}
                                    <span style="color:#666;">(${formatCurrency(c.total_amount_base)} base)</span>
                                </span>
                                <span><strong>Rate:</strong> ${parseFloat(c.exchange_rate || 1).toFixed(4)}</span>
                            </div>
                        </div>
                        <div class="table-container" style="margin: 0;">
                            <table style="width: 100%; border-collapse: collapse;">
                                <thead>
                                    <tr style="background: #e8eef6;">
                                        <th style="padding: 8px 10px; text-align: left; border: 1px solid #ddd; font-size: 12px;">#</th>
                                        <th style="padding: 8px 10px; text-align: left; border: 1px solid #ddd; font-size: 12px;">Item Code</th>
                                        <th style="padding: 8px 10px; text-align: left; border: 1px solid #ddd; font-size: 12px;">Item Name</th>
                                        <th style="padding: 8px 10px; text-align: right; border: 1px solid #ddd; font-size: 12px;">Quantity</th>
                                        <th style="padding: 8px 10px; text-align: right; border: 1px solid #ddd; font-size: 12px;">Unit Price</th>
                                        <th style="padding: 8px 10px; text-align: right; border: 1px solid #ddd; font-size: 12px;">Line Total</th>
                                        <th style="padding: 8px 10px; text-align: right; border: 1px solid #ddd; font-size: 12px;">Line Total (base)</th>
                                    </tr>
                                </thead>
                                <tbody>
                    `;

                    if (!items.length) {
                        html += `
                                    <tr>
                                        <td colspan="7" style="padding: 10px; border: 1px solid #ddd; color: #666; text-align: center;">No items in this container</td>
                                    </tr>
                        `;
                    } else {
                        items.forEach((item, idx) => {
                            html += `
                                    <tr>
                                        <td style="padding: 8px 10px; border: 1px solid #ddd;">${idx + 1}</td>
                                        <td style="padding: 8px 10px; border: 1px solid #ddd;">${escapeHtml(item.item_code || '—')}</td>
                                        <td style="padding: 8px 10px; border: 1px solid #ddd;">${escapeHtml(item.item_name || '—')}</td>
                                        <td style="padding: 8px 10px; text-align: right; border: 1px solid #ddd;">${formatNumber(item.quantity)}</td>
                                        <td style="padding: 8px 10px; text-align: right; border: 1px solid #ddd;">${formatCurrency(item.unit_price, item.currency || c.currency)}</td>
                                        <td style="padding: 8px 10px; text-align: right; border: 1px solid #ddd;">${formatCurrency(item.total_price, item.currency || c.currency)}</td>
                                        <td style="padding: 8px 10px; text-align: right; border: 1px solid #ddd;">${formatCurrency(item.total_price_base != null ? item.total_price_base : (item.total_price * (c.exchange_rate || 1)))}</td>
                                    </tr>
                            `;
                        });
                    }

                    html += `
                                </tbody>
                                <tfoot>
                                    <tr style="background: #f8fafc; font-weight: 600;">
                                        <td colspan="3" style="padding: 8px 10px; border: 1px solid #ddd; text-align: right;">Container total</td>
                                        <td style="padding: 8px 10px; text-align: right; border: 1px solid #ddd;">${formatNumber(c.total_quantity)}</td>
                                        <td style="padding: 8px 10px; border: 1px solid #ddd;"></td>
                                        <td style="padding: 8px 10px; text-align: right; border: 1px solid #ddd;">${formatCurrency(c.total_amount_original, c.currency)}</td>
                                        <td style="padding: 8px 10px; text-align: right; border: 1px solid #ddd;">${formatCurrency(c.total_amount_base)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    `;
                });

                html += `
                        <div style="padding: 10px 14px; background: #eef3f9; border-top: 2px solid #1e3a5f; display: flex; justify-content: flex-end; gap: 24px; flex-wrap: wrap; font-weight: 700; color: #1e3a5f;">
                            <span>${escapeHtml(rep.representative_name)} total qty: ${formatNumber(rep.total_quantity)}</span>
                            <span>Total (base): ${formatCurrency(rep.total_amount_base)}</span>
                        </div>
                    </div>
                `;
            });

            document.getElementById('reportContent').innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading representative collections:', error);
            document.getElementById('reportContent').innerHTML = '<p style="color: red;">Error loading report</p>';
        });
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
        case 'inventory-stock-at-cost':
            url = `/api/reports/inventory-stock-at-cost/export`;
            const supplierAtCostId = document.getElementById('inventoryStockAtCostSupplier')?.value;
            if (supplierAtCostId) url += `?supplier_id=${supplierAtCostId}`;
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
            const collectedMoneyCustomerType = document.getElementById('collectedMoneyCustomerType')?.value || 'both';
            url += `customer_type=${collectedMoneyCustomerType}&`;
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
        case 'last-purchase-cog':
            const lastPurchaseCogSupplierId = document.getElementById('lastPurchaseCogSupplier')?.value || '';
            const lastPurchaseCogItemId = document.getElementById('lastPurchaseCogItem')?.value || '';
            url = `/api/reports/last-purchase-cog/export?`;
            if (lastPurchaseCogSupplierId) url += `supplier_id=${lastPurchaseCogSupplierId}&`;
            if (lastPurchaseCogItemId) url += `item_id=${lastPurchaseCogItemId}&`;
            break;
    }
    
    if (url) {
        window.location.href = url;
    }
}

function setProfitLossColumnSelectorVisible(visible) {
    const el = document.getElementById('profitLossColumnSelector');
    if (el) el.style.display = visible ? 'block' : 'none';
}

function setSafeOutColumnSelectorVisible(visible) {
    const el = document.getElementById('safeOutColumnSelector');
    if (el) el.style.display = visible ? 'block' : 'none';
}

function getDefaultProfitLossColumnVisibility() {
    return {
        item_code: true,
        quantity_sold: true,
        total_sales: true,
        cog: true,
        average_purchase_price: true,
        avg_purchase_price_supplier: true,
        total_cost: true,
        profit: true,
        profit_margin: true,
        notes: true
    };
}

function getProfitLossColumnVisibility() {
    const saved = localStorage.getItem('profitLossColumnVisibility');
    if (saved) {
        try {
            return { ...getDefaultProfitLossColumnVisibility(), ...JSON.parse(saved) };
        } catch (e) {
            console.error('Error parsing profit loss column visibility:', e);
        }
    }
    return getDefaultProfitLossColumnVisibility();
}

function isProfitLossColumnActive(column, visibility, isFIFO) {
    if ((column === 'average_purchase_price' || column === 'avg_purchase_price_supplier') && isFIFO) {
        return false;
    }
    return visibility[column] !== false;
}

function countActiveProfitLossColumns(visibility, isFIFO) {
    return Object.keys(getDefaultProfitLossColumnVisibility()).filter(
        col => isProfitLossColumnActive(col, visibility, isFIFO)
    ).length;
}

function profitLossHeaderCell(column, label, className = '') {
    const classes = ['sortable', className].filter(Boolean).join(' ');
    return `<th class="${classes}" data-column="${column}">${label}<span class="resizer"></span></th>`;
}

function profitLossSortAttr(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function profitLossTd(column, content, sortValue, className = '', style = '') {
    const cls = className ? ` class="${className}"` : '';
    const sty = style ? ` style="${style}"` : '';
    const sortVal = sortValue !== undefined && sortValue !== null ? profitLossSortAttr(sortValue) : '';
    const sortAttr = sortVal !== '' ? ` data-sort-value="${sortVal}"` : '';
    return `<td data-column="${column}"${sortAttr}${cls}${sty}>${content}</td>`;
}

function buildProfitLossTableHeader(visibility, isFIFO) {
    let html = '<div class="report-table-wrapper" id="profitLossReportTable"><table id="profitLossTable"><thead><tr>';
    if (isProfitLossColumnActive('item_code', visibility, isFIFO)) {
        html += profitLossHeaderCell('item_code', 'Item Code');
    }
    if (isProfitLossColumnActive('quantity_sold', visibility, isFIFO)) {
        html += profitLossHeaderCell('quantity_sold', 'Quantity Sold', 'text-right');
    }
    if (isProfitLossColumnActive('total_sales', visibility, isFIFO)) {
        html += profitLossHeaderCell('total_sales', 'Total Sales', 'text-right');
    }
    if (isProfitLossColumnActive('cog', visibility, isFIFO)) {
        html += profitLossHeaderCell('cog', 'COG', 'text-right');
    }
    if (isProfitLossColumnActive('average_purchase_price', visibility, isFIFO)) {
        html += profitLossHeaderCell('average_purchase_price', 'Average Purchase Price', 'text-right');
    }
    if (isProfitLossColumnActive('avg_purchase_price_supplier', visibility, isFIFO)) {
        html += profitLossHeaderCell('avg_purchase_price_supplier', 'Avg Purchase Price (Supplier Curr.)', 'text-right');
    }
    if (isProfitLossColumnActive('total_cost', visibility, isFIFO)) {
        html += profitLossHeaderCell('total_cost', 'Total Cost', 'text-right');
    }
    if (isProfitLossColumnActive('profit', visibility, isFIFO)) {
        html += profitLossHeaderCell('profit', 'Profit', 'text-right');
    }
    if (isProfitLossColumnActive('profit_margin', visibility, isFIFO)) {
        html += profitLossHeaderCell('profit_margin', 'Profit Margin %', 'text-right');
    }
    if (isProfitLossColumnActive('notes', visibility, isFIFO)) {
        html += profitLossHeaderCell('notes', 'Notes');
    }
    html += '</tr></thead><tbody>';
    return html;
}

function buildProfitLossItemRow(item, index, visibility, isFIFO) {
    const provStyle = item.provisional_cost
        ? 'background: #ffebee; color: #b71c1c;'
        : '';
    let html = `<tr class="item-row" data-item-index="${index}" style="${provStyle}">`;

    if (isProfitLossColumnActive('item_code', visibility, isFIFO)) {
        html += profitLossTd('item_code', item.item_code || '', item.item_code || '');
    }
    if (isProfitLossColumnActive('quantity_sold', visibility, isFIFO)) {
        html += profitLossTd('quantity_sold', item.quantity_sold.toFixed(2), item.quantity_sold, 'text-right');
    }
    if (isProfitLossColumnActive('total_sales', visibility, isFIFO)) {
        html += profitLossTd('total_sales', formatCurrency(item.total_sales), item.total_sales, 'text-right');
    }
    if (isProfitLossColumnActive('cog', visibility, isFIFO)) {
        html += profitLossTd('cog', formatCurrency(item.cog || 0), item.cog || 0, 'text-right');
    }
    if (isProfitLossColumnActive('average_purchase_price', visibility, isFIFO)) {
        html += profitLossTd('average_purchase_price', formatCurrency(item.average_purchase_price || 0), item.average_purchase_price || 0, 'text-right');
    }
    if (isProfitLossColumnActive('avg_purchase_price_supplier', visibility, isFIFO)) {
        const avgSupplier = item.average_purchase_price_supplier_currency != null
            ? formatCurrency(item.average_purchase_price_supplier_currency, item.supplier_currency || '')
            : '-';
        const avgSort = item.average_purchase_price_supplier_currency != null
            ? item.average_purchase_price_supplier_currency
            : '';
        html += profitLossTd('avg_purchase_price_supplier', avgSupplier, avgSort, 'text-right');
    }
    if (isProfitLossColumnActive('total_cost', visibility, isFIFO)) {
        html += profitLossTd('total_cost', formatCurrency(item.total_cost), item.total_cost, 'text-right');
    }
    if (isProfitLossColumnActive('profit', visibility, isFIFO)) {
        html += profitLossTd(
            'profit',
            formatCurrency(item.profit),
            item.profit,
            'text-right',
            `color: ${item.profit >= 0 ? '#4caf50' : '#f44336'}; font-weight: 600;`
        );
    }
    if (isProfitLossColumnActive('profit_margin', visibility, isFIFO)) {
        html += profitLossTd('profit_margin', `${item.profit_margin.toFixed(2)}%`, item.profit_margin, 'text-right');
    }
    if (isProfitLossColumnActive('notes', visibility, isFIFO)) {
        const noteText = item.provisional_cost ? 'Last purchase cost (book stock ≤ 0)' : '';
        html += profitLossTd('notes', noteText, noteText, '', 'font-size: 12px;');
    }

    html += '</tr>';
    return html;
}

function buildProfitLossTotalRow(data, visibility, isFIFO) {
    let html = '<tr class="total-row">';

    let labelColspan = 0;
    if (isProfitLossColumnActive('item_code', visibility, isFIFO)) labelColspan++;
    labelColspan = Math.max(1, labelColspan);

    if (isProfitLossColumnActive('item_code', visibility, isFIFO)) {
        html += `<td colspan="${labelColspan}" data-column="item_code"><strong>TOTAL</strong></td>`;
    } else {
        html += '<td><strong>TOTAL</strong></td>';
    }

    if (isProfitLossColumnActive('quantity_sold', visibility, isFIFO)) {
        html += `<td class="text-right" data-column="quantity_sold">${data.items.reduce((sum, item) => sum + item.quantity_sold, 0).toFixed(2)}</td>`;
    }
    if (isProfitLossColumnActive('total_sales', visibility, isFIFO)) {
        html += `<td class="text-right" data-column="total_sales"><strong>${formatCurrency(data.totals.total_sales)}</strong></td>`;
    }
    if (isProfitLossColumnActive('cog', visibility, isFIFO)) {
        html += `<td class="text-right" data-column="cog"><strong>${formatCurrency(data.totals.total_cog || 0)}</strong></td>`;
    }
    if (isProfitLossColumnActive('average_purchase_price', visibility, isFIFO)) {
        html += '<td class="text-right" data-column="average_purchase_price">-</td>';
    }
    if (isProfitLossColumnActive('avg_purchase_price_supplier', visibility, isFIFO)) {
        html += '<td class="text-right" data-column="avg_purchase_price_supplier">-</td>';
    }
    if (isProfitLossColumnActive('total_cost', visibility, isFIFO)) {
        html += `<td class="text-right" data-column="total_cost"><strong>${formatCurrency(data.totals.total_cost)}</strong></td>`;
    }
    if (isProfitLossColumnActive('profit', visibility, isFIFO)) {
        html += `<td class="text-right" data-column="profit" style="color: ${data.totals.total_profit >= 0 ? '#4caf50' : '#f44336'}"><strong>${formatCurrency(data.totals.total_profit)}</strong></td>`;
    }
    if (isProfitLossColumnActive('profit_margin', visibility, isFIFO)) {
        html += `<td class="text-right" data-column="profit_margin"><strong>${data.totals.profit_margin.toFixed(2)}%</strong></td>`;
    }
    if (isProfitLossColumnActive('notes', visibility, isFIFO)) {
        html += '<td data-column="notes"></td>';
    }

    html += '</tr>';
    return html;
}

const PROFIT_LOSS_SORT_STORAGE_KEY = 'profitLossTableSort';

function getProfitLossSortValue(row, column) {
    const cell = row.querySelector(`td[data-column="${column}"]`);
    if (!cell) return '';
    if (cell.hasAttribute('data-sort-value')) {
        return cell.getAttribute('data-sort-value');
    }
    return cell.textContent.trim();
}

function compareProfitLossSortValues(aVal, bVal, isAsc) {
    if (aVal === '' && bVal === '') return 0;
    if (aVal === '') return 1;
    if (bVal === '') return -1;

    const aNum = parseFloat(aVal);
    const bNum = parseFloat(bVal);
    if (!isNaN(aNum) && !isNaN(bNum) && isFinite(aNum) && isFinite(bNum)) {
        return isAsc ? aNum - bNum : bNum - aNum;
    }

    const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true, sensitivity: 'base' });
    return isAsc ? cmp : -cmp;
}

function sortProfitLossTableByColumn(column, isAsc) {
    const table = document.getElementById('profitLossTable');
    if (!table) return;

    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    const itemRows = Array.from(tbody.querySelectorAll('tr.item-row'));
    if (itemRows.length === 0) return;

    const batchRowsByIndex = {};
    tbody.querySelectorAll('tr.batch-details-row').forEach(row => {
        batchRowsByIndex[row.getAttribute('data-item-index')] = row;
    });
    const totalRow = tbody.querySelector('tr.total-row');

    itemRows.sort((a, b) => {
        const aVal = getProfitLossSortValue(a, column);
        const bVal = getProfitLossSortValue(b, column);
        return compareProfitLossSortValues(aVal, bVal, isAsc);
    });

    itemRows.forEach(row => {
        tbody.appendChild(row);
        const itemIndex = row.getAttribute('data-item-index');
        if (itemIndex && batchRowsByIndex[itemIndex]) {
            tbody.appendChild(batchRowsByIndex[itemIndex]);
        }
    });

    if (totalRow) {
        tbody.appendChild(totalRow);
    }
}

function saveProfitLossSort(column, isAsc) {
    try {
        localStorage.setItem(PROFIT_LOSS_SORT_STORAGE_KEY, JSON.stringify({ column, isAsc }));
    } catch (e) {
        console.warn('Could not save profit loss sort state:', e);
    }
}

function restoreProfitLossSort() {
    const table = document.getElementById('profitLossTable');
    if (!table) return;

    try {
        const saved = localStorage.getItem(PROFIT_LOSS_SORT_STORAGE_KEY);
        if (!saved) return;

        const { column, isAsc } = JSON.parse(saved);
        const header = table.querySelector(`thead th[data-column="${column}"]`);
        if (!header || header.style.display === 'none') return;

        table.querySelectorAll('thead th').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
        });
        header.classList.add(isAsc ? 'sort-asc' : 'sort-desc');
        sortProfitLossTableByColumn(column, isAsc);
    } catch (e) {
        console.warn('Could not restore profit loss sort state:', e);
    }
}

function initializeProfitLossTableSorting() {
    const table = document.getElementById('profitLossTable');
    if (!table) return;

    table.querySelectorAll('thead th.sortable').forEach(th => {
        th.style.cursor = 'pointer';
        th.title = 'Click to sort';

        th.addEventListener('click', (e) => {
            if (e.target.closest('.resizer')) return;

            const column = th.getAttribute('data-column');
            if (!column) return;

            const tbody = table.querySelector('tbody');
            const firstRow = tbody?.querySelector('tr');
            if (!firstRow || firstRow.querySelector('.empty-state')) return;

            const isAsc = th.classList.contains('sort-asc');
            const newIsAsc = !isAsc;

            table.querySelectorAll('thead th').forEach(header => {
                header.classList.remove('sort-asc', 'sort-desc');
            });
            th.classList.add(newIsAsc ? 'sort-asc' : 'sort-desc');

            saveProfitLossSort(column, newIsAsc);
            sortProfitLossTableByColumn(column, newIsAsc);
        });
    });

    restoreProfitLossSort();
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
            
            if (data.has_provisional_costs) {
                html += `<div style="margin-bottom: 16px; padding: 12px 14px; background: #ffebee; border-left: 4px solid #c62828; border-radius: 4px; color: #b71c1c; font-size: 14px; line-height: 1.5;">
                    <strong>Provisional cost:</strong> Red rows use <strong>last purchase</strong> unit cost (base currency) because book stock is zero or negative and reported COGS from ${isFIFO ? 'FIFO' : 'average cost'} was zero. Margins are indicative only for those lines.
                </div>`;
            }
            
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
            
            const columnVisibility = getProfitLossColumnVisibility();
            const visibleColumnCount = countActiveProfitLossColumns(columnVisibility, isFIFO);

            html += buildProfitLossTableHeader(columnVisibility, isFIFO);
            
            if (data.items.length === 0) {
                html += `<tr><td colspan="${Math.max(1, visibleColumnCount)}" class="empty-state">No data available</td></tr>`;
            } else {
                data.items.forEach((item, index) => {
                    html += buildProfitLossItemRow(item, index, columnVisibility, isFIFO);
                    
                    if (isFIFO && item.batch_details && item.batch_details.length > 0) {
                        html += `<tr class="batch-details-row" data-item-index="${index}" style="background-color: #f5f5f5; display: none;">
                            <td colspan="${Math.max(1, visibleColumnCount)}" style="padding: 15px;">
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
                
                html += buildProfitLossTotalRow(data, columnVisibility, isFIFO);
            }
            
            html += '</tbody></table></div>';
            html += generateReportFooter();
            
            document.getElementById('reportContent').innerHTML = html;

            setTimeout(() => {
                initializeReportColumnResizing('profitLossReportTable');
                applySavedProfitLossColumnVisibility();
                initializeProfitLossTableSorting();
            }, 100);
            
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

let inventoryReportItems = [];

function loadItemsForInventoryReport() {
    fetch('/api/items')
        .then(response => response.json())
        .then(data => {
            inventoryReportItems = data;
            filterInventoryReportItems('');
            // Set selected item if currentItemId is set
            if (currentItemId) {
                const item = data.find(i => String(i.id) === String(currentItemId));
                const displayText = item ? `${item.code || ''} ${item.name || ''}`.trim() || 'Unnamed Item' : '';
                selectInventoryReportItem(currentItemId, displayText);
            }
        })
        .catch(error => console.error('Error loading items:', error));
}

function showInventoryReportItemDropdown() {
    const dropdown = document.getElementById('inventoryReportItemDropdown');
    if (dropdown) dropdown.style.display = 'block';
}

function hideInventoryReportItemDropdown() {
    const dropdown = document.getElementById('inventoryReportItemDropdown');
    if (dropdown) dropdown.style.display = 'none';
}

function filterInventoryReportItems(searchTerm) {
    const dropdown = document.getElementById('inventoryReportItemDropdown');
    if (!dropdown) return;
    const searchLower = (searchTerm || '').toLowerCase();
    const filteredItems = inventoryReportItems.filter(item => {
        const code = (item.code || '').toLowerCase();
        const name = (item.name || '').toLowerCase();
        return `${code} ${name}`.trim().includes(searchLower);
    });
    dropdown.innerHTML = '';
    const allDiv = document.createElement('div');
    allDiv.className = 'dropdown-item';
    allDiv.textContent = 'All Items';
    allDiv.style.cssText = 'padding: 10px; cursor: pointer; border-bottom: 1px solid var(--border-color);';
    allDiv.onclick = () => selectInventoryReportItem('', 'All Items');
    dropdown.appendChild(allDiv);
    filteredItems.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'dropdown-item';
        itemDiv.style.cssText = 'padding: 10px; cursor: pointer; border-bottom: 1px solid var(--border-color);';
        const displayText = `${item.code || ''} ${item.name || ''}`.trim() || 'Unnamed Item';
        itemDiv.textContent = displayText;
        itemDiv.onclick = () => selectInventoryReportItem(item.id, displayText);
        dropdown.appendChild(itemDiv);
    });
    if (searchTerm || filteredItems.length > 0) showInventoryReportItemDropdown();
}

function selectInventoryReportItem(itemId, displayText) {
    const hiddenInput = document.getElementById('inventoryReportItem');
    const searchInput = document.getElementById('inventoryReportItemSearch');
    if (hiddenInput) hiddenInput.value = itemId || '';
    if (searchInput) searchInput.value = displayText || '';
    hideInventoryReportItemDropdown();
    if (currentReportType === 'inventory') loadInventoryReport();
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

function filterMovementsBySalesPrice(movements, filter) {
    if (!filter || !movements) return movements || [];
    return movements.filter((m) => {
        if (m.type !== 'Sale') return false;
        if (String(m.currency || '') !== String(filter.currency || '')) return false;
        return Math.abs(Number(m.unit_price) - Number(filter.unit_price)) < INV_SALES_PRICE_EPS;
    });
}

function salesPriceBreakdownRowSelected(price, filter) {
    if (!filter) return false;
    if (String(price.currency || '') !== String(filter.currency || '')) return false;
    return Math.abs(Number(price.unit_price) - Number(filter.unit_price)) < INV_SALES_PRICE_EPS;
}

function escapeHtmlAttr(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;');
}

function renderInventoryMovementDetailRowsHtml(movements, emptyMessage) {
    const emptyMsg = emptyMessage || 'No movements found';
    let html = '';
    if (!movements || movements.length === 0) {
        html += `<tr><td colspan="9" class="empty-state">${emptyMsg}</td></tr>`;
    } else {
        movements.forEach((movement) => {
            let referenceLink = '';
            if (movement.type === 'Purchase' && movement.container_id) {
                referenceLink = `<a href="/purchases?container_id=${movement.container_id}" style="color: #1e3a5f; text-decoration: underline; cursor: pointer;" title="View Purchase Container">${movement.container_number || 'N/A'}</a>`;
            } else if (movement.type === 'Sale' && movement.sale_id) {
                referenceLink = `<a href="/sales?sale_id=${movement.sale_id}&edit=1" target="_blank" rel="noopener noreferrer" style="color: #1e3a5f; text-decoration: underline; cursor: pointer;" title="Edit sale (opens in new tab)">${movement.invoice_number || 'N/A'}</a>`;
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
    return html;
}

function buildInventoryReportHtml(movements, breakdown, itemId) {
    let html = '';
    if (itemId && breakdown) {
        html += '<div style="margin-bottom: 30px;">';

        if (breakdown.purchase_prices && breakdown.purchase_prices.length > 0) {
            html += '<h3 style="color: var(--text-primary); margin-bottom: 15px; transition: color 0.3s ease;">Purchase Prices Breakdown</h3>';
            html += '<p style="margin: 0 0 10px 0; font-size: 13px; color: var(--text-secondary);">Unit cost = unit price + COG allocated from container expenses (supplier currency).</p>';
            html += '<div class="table-container" style="margin-bottom: 20px;"><table><thead><tr>';
            html += '<th class="text-right">Unit Price</th><th class="text-right">Unit Cost</th><th>Currency</th><th class="text-right">Total Quantity</th><th class="text-right">Total Amount</th>';
            html += '</tr></thead><tbody>';
            breakdown.purchase_prices.forEach((price) => {
                const uc = price.unit_cost != null && price.unit_cost !== undefined ? price.unit_cost : (Number(price.unit_price) || 0);
                html += `<tr>
                    <td class="text-right">${formatCurrency(price.unit_price, price.currency)}</td>
                    <td class="text-right">${formatCurrency(uc, price.currency)}</td>
                    <td>${price.currency}</td>
                    <td class="text-right">${price.total_quantity.toFixed(2)}</td>
                    <td class="text-right">${formatCurrency(price.total_amount, price.currency)}</td>
                </tr>`;
            });
            html += '</tbody></table></div>';
        }

        if (breakdown.sales_prices && breakdown.sales_prices.length > 0) {
            html += '<h3 style="color: var(--text-primary); margin-bottom: 15px; transition: color 0.3s ease;">Sales Prices Breakdown</h3>';
            html += '<p style="margin: 0 0 10px 0; font-size: 13px; color: var(--text-secondary);">Click a row to show only those sale lines in Movement Details below. Click again to clear.</p>';
            html += '<div class="table-container" style="margin-bottom: 20px;"><table><thead><tr>';
            html += '<th class="text-right">Unit Price</th><th>Currency</th><th class="text-right">Total Quantity</th><th class="text-right">Total Amount</th>';
            html += '</tr></thead><tbody>';
            breakdown.sales_prices.forEach((price) => {
                const sel = salesPriceBreakdownRowSelected(price, inventorySalesPriceFilter);
                html += `<tr class="sales-price-breakdown-row${sel ? ' sales-price-breakdown-row--selected' : ''}" data-sp-unit-price="${price.unit_price}" data-sp-currency="${escapeHtmlAttr(price.currency)}" title="Filter Movement Details to this sale price">
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

    const displayMovements = filterMovementsBySalesPrice(movements, inventorySalesPriceFilter);
    const movementDetailsEmptyMsg = inventorySalesPriceFilter
 ? 'No movements match this filter'
        : 'No movements found';
    if (inventorySalesPriceFilter) {
        const f = inventorySalesPriceFilter;
        html += `<div class="inventory-sales-price-filter-banner">
            Showing only sales at <strong>${formatCurrency(f.unit_price, f.currency)}</strong> (${escapeHtmlAttr(f.currency)}).
            <button type="button" class="btn btn-secondary inventory-clear-sales-filter-btn" style="margin-left: 10px;">Show all movements</button>
        </div>`;
    }

    html += renderMovementSummary(displayMovements);
    html += '<h3 style="color: var(--text-primary); margin-bottom: 15px; transition: color 0.3s ease;">Movement Details</h3>';
    html += '<div class="table-container"><table><thead><tr>';
    html += '<th>Date</th><th>Type</th><th>Item Code</th><th>Item Name</th><th class="text-right">Quantity</th><th class="text-right">Unit Price</th><th class="text-right">Total Price</th><th>Currency</th><th>Reference</th>';
    html += '</tr></thead><tbody>';
    html += renderInventoryMovementDetailRowsHtml(displayMovements, movementDetailsEmptyMsg);
    html += '</tbody></table></div>';
    return html;
}

function refreshInventoryReportDom() {
    if (!inventoryReportCache) return;
    const { movements, breakdown, itemId } = inventoryReportCache;
    const el = document.getElementById('reportContent');
    if (el) el.innerHTML = buildInventoryReportHtml(movements, breakdown, itemId);
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
    
    inventorySalesPriceFilter = null;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                document.getElementById('reportContent').innerHTML = `<p style="color: red;">Error: ${data.error}</p>`;
                return;
            }

            if (itemId) {
                fetch(`/api/items/${itemId}/price-breakdown?start_date=${startDate || ''}&end_date=${endDate || ''}`)
                    .then(response => response.json())
                    .then(breakdown => {
                        const bc = breakdown && !breakdown.error ? breakdown : null;
                        inventoryReportCache = { movements: data, breakdown: bc, itemId };
                        document.getElementById('reportContent').innerHTML = buildInventoryReportHtml(data, bc, itemId);
                    })
                    .catch(error => {
                        console.error('Error loading price breakdown:', error);
                        inventoryReportCache = { movements: data, breakdown: null, itemId };
                        document.getElementById('reportContent').innerHTML = buildInventoryReportHtml(data, null, itemId);
                    });
            } else {
                inventoryReportCache = null;
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
    hideInventoryStockRelatedFilters();
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

function showInventoryStockAtCostReport() {
    currentReportType = 'inventory-stock-at-cost';
    const pdfBtn = document.getElementById('exportPDFBtn');
    if (pdfBtn) pdfBtn.style.display = 'none';
    document.getElementById('reportTitle').textContent = 'Inventory Stock at Cost Report';
    document.getElementById('reportFilters').style.display = 'none';
    document.getElementById('containerReportFilters').style.display = 'none';
    document.getElementById('safeReportTypeFilter').style.display = 'none';
    document.getElementById('inventoryMovementTypeFilter').style.display = 'none';
    document.getElementById('inventoryItemFilter').style.display = 'none';
    document.getElementById('profitLossItemFilter').style.display = 'none';
    hideInventoryStockRelatedFilters();
    document.getElementById('inventoryStockAtCostFilters').style.display = 'block';
    document.getElementById('inventorySnapshotFilters').style.display = 'none';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('reportArea').style.display = 'block';

    fetch('/api/companies?category=Supplier')
        .then(response => response.json())
        .then(suppliers => {
            const select = document.getElementById('inventoryStockAtCostSupplier');
            if (select) {
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

    loadInventoryStockAtCostReport();
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
    hideInventoryStockRelatedFilters();
    document.getElementById('inventorySnapshotFilters').style.display = 'block';
    document.getElementById('itemStatementFilters').style.display = 'none';
    document.getElementById('stockValueDetailsFilters').style.display = 'none';
    document.getElementById('virtualPurchaseProfitFilters').style.display = 'none';
    document.getElementById('averageSalePriceFilters').style.display = 'none';
    document.getElementById('averageLastNSalesFilters').style.display = 'none';
    document.getElementById('lastPurchasePriceFilters').style.display = 'none';
    document.getElementById('lastPurchaseCogFilters').style.display = 'none';
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
    hideInventoryStockRelatedFilters();
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

function loadInventoryStockAtCostReport() {
    const supplierId = document.getElementById('inventoryStockAtCostSupplier')?.value || '';

    let url = '/api/reports/inventory-stock-at-cost';
    if (supplierId) url += `?supplier_id=${supplierId}`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                document.getElementById('reportContent').innerHTML = `<p style="color: red;">Error: ${data.error}</p>`;
                return;
            }

            let filterHtml = '';
            if (!document.getElementById('inventoryStockAtCostSupplier')) {
                filterHtml = `
                    <div class="filters" style="margin-bottom: 20px;">
                        <div class="filters-row">
                            <div class="form-group">
                                <label>Supplier</label>
                                <select id="inventoryStockAtCostSupplier" class="form-control" onchange="loadInventoryStockAtCostReport()">
                                    <option value="">All Suppliers</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <button class="btn btn-secondary" onclick="clearInventoryStockAtCostFilters()">Clear</button>
                            </div>
                        </div>
                    </div>
                `;
                fetch('/api/companies?category=Supplier')
                    .then(r => r.json())
                    .then(suppliers => {
                        const select = document.getElementById('inventoryStockAtCostSupplier');
                        if (select) {
                            suppliers.forEach(s => {
                                const option = document.createElement('option');
                                option.value = s.id;
                                option.textContent = s.name;
                                if (supplierId && String(s.id) === String(supplierId)) option.selected = true;
                                select.appendChild(option);
                            });
                        }
                    });
            }

            let html = filterHtml;
            html += `<p style="margin-bottom: 12px; font-size: 13px; color: var(--text-secondary);">Avg unit total cost is the quantity-weighted average of (purchase unit price + allocated container COG), same rules as Stock Value Details. Stock at landed cost = available quantity × that average. Mixed purchase currencies are combined like average purchase on Inventory Stock.</p>`;
            html += `<div style="margin-bottom: 15px; padding: 10px; background: var(--bg-tertiary); border-radius: 4px; color: var(--text-primary); transition: background-color 0.3s ease, color 0.3s ease;">
                <strong>Total Items:</strong> ${data.total_items} | 
                <strong>Total Quantity:</strong> ${data.total_quantity.toFixed(2)} | 
                <strong>Total Weight:</strong> ${data.total_weight.toFixed(2)} |
                <strong>Total Stock at Landed Cost:</strong> ${(data.total_stock_at_landed_cost != null ? data.total_stock_at_landed_cost : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>`;
            html += '<div class="table-container"><table><thead><tr>';
            html += '<th>Item Code</th><th>Item Name</th><th>Supplier</th><th>Grade</th><th>Category 1</th><th>Category 2</th>';
            html += '<th class="text-right">Unit Weight</th><th class="text-right">Total Purchases</th><th class="text-right">Total Sales</th><th class="text-right">Available Quantity</th><th class="text-right">Total Weight</th>';
            html += '<th class="text-right">Avg Unit Total Cost</th><th class="text-right">Stock at Landed Cost</th><th class="text-right">Avg Sales Price</th>';
            html += '</tr></thead><tbody>';

            if (!data.items || data.items.length === 0) {
                html += '<tr><td colspan="14" class="empty-state">No items found</td></tr>';
            } else {
                data.items.forEach((item) => {
                    const avgUC = item.avg_unit_total_cost || 0;
                    const stockL = item.stock_at_landed_cost != null ? item.stock_at_landed_cost : 0;
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
                        <td class="text-right">${(item.total_purchases || 0) <= 0 ? '-' : parseFloat(avgUC).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                        <td class="text-right">${(item.available_quantity || 0) === 0 ? '-' : parseFloat(stockL).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td class="text-right">${avgSalesPrice > 0 ? parseFloat(avgSalesPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
                    </tr>`;
                });

                const totalLanded = data.total_stock_at_landed_cost != null ? data.total_stock_at_landed_cost : data.items.reduce((sum, i) => sum + (i.stock_at_landed_cost || 0), 0);
                html += `<tr class="total-row">
                    <td colspan="7"><strong>TOTAL</strong></td>
                    <td class="text-right"><strong>${data.items.reduce((sum, i) => sum + i.total_purchases, 0).toFixed(2)}</strong></td>
                    <td class="text-right"><strong>${data.items.reduce((sum, i) => sum + i.total_sales, 0).toFixed(2)}</strong></td>
                    <td class="text-right"><strong>${data.total_quantity.toFixed(2)}</strong></td>
                    <td class="text-right"><strong>${data.total_weight.toFixed(2)}</strong></td>
                    <td class="text-right">-</td>
                    <td class="text-right"><strong>${Number(totalLanded).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    <td class="text-right">-</td>
                </tr>`;
            }

            html += '</tbody></table></div>';
            document.getElementById('reportContent').innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading inventory stock at cost report:', error);
            document.getElementById('reportContent').innerHTML = '<p style="color: red;">Error loading report</p>';
        });
}

function clearInventoryStockAtCostFilters() {
    const select = document.getElementById('inventoryStockAtCostSupplier');
    if (select) select.value = '';
    loadInventoryStockAtCostReport();
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
    const customerType = document.getElementById('collectedMoneyCustomerType')?.value || 'both';
    
    let url = '/api/safe/collected-money-report?';
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    url += `group_by=${groupBy}&customer_type=${customerType}`;
    
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
                    <div class="report-summary-item" style="border: 2px solid #1565c0;">
                        <label>≈ USD Total</label>
                        <div class="value" style="color: #1565c0; font-size: 24px;">${data.total_usd_amount != null ? formatCurrency(data.total_usd_amount, 'USD') : '-'}</div>
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
                        <td data-column="date" colspan="5">${group.date} - Total</td>
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
                        <td data-column="date" colspan="5">${group.customer_name} - Total</td>
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
            html += '<th data-column="date">Date<span class="resizer"></span></th>';
            html += '<th data-column="type">Type<span class="resizer"></span></th>';
            html += '<th data-column="description">Description<span class="resizer"></span></th>';
            html += '<th data-column="category">Category<span class="resizer"></span></th>';
            html += '<th data-column="invoice">Invoice<span class="resizer"></span></th>';
            html += '<th class="text-right" data-column="amount">Amount<span class="resizer"></span></th>';
            html += '<th class="text-right" data-column="amount_base">Amount (Base)<span class="resizer"></span></th>';
            html += '<th data-column="notes">Notes<span class="resizer"></span></th>';
            html += '</tr></thead><tbody>';

            const transactions = data.transactions || [];
            if (transactions.length === 0) {
                html += '<tr><td colspan="8" class="empty-state">No transactions found</td></tr>';
            } else {
                transactions.forEach(txn => {
                    html += `<tr>
                        <td data-column="date">${txn.date}</td>
                        <td data-column="type"><span class="badge badge-${txn.type.toLowerCase()}">${txn.type}</span></td>
                        <td data-column="description">${escapeHtml(txn.description)}</td>
                        <td data-column="category">${escapeHtml(txn.category)}</td>
                        <td data-column="invoice">${txn.invoice_number || '-'}</td>
                        <td class="text-right" data-column="amount">${formatCurrency(txn.amount)} ${txn.currency || ''}</td>
                        <td class="text-right" data-column="amount_base" style="color: #f44336; font-weight: 600;">${formatCurrency(txn.amount_base_currency)}</td>
                        <td data-column="notes">${escapeHtml(txn.notes || '-')}</td>
                    </tr>`;
                });
            }

            html += '</tbody></table></div>';
            html += generateReportFooter();
            document.getElementById('reportContent').innerHTML = html;

            setTimeout(() => {
                initializeReportColumnResizing('safeOutTable');
                applySavedSafeOutColumnVisibility();
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
        .then(response => response.json().then(data => ({ ok: response.ok, data })))
        .then(({ ok, data }) => {
            if (!ok || data.error) {
                content.innerHTML = `<p style="color: red;">Error: ${data.error || 'Failed to load report'}</p>`;
                return;
            }
            
            const startDateDisplay = startDate ? new Date(startDate).toLocaleDateString() : 'All';
            const endDateDisplay = endDate ? new Date(endDate).toLocaleDateString() : 'All';
            const supplierName = data.supplier_name ? ` - ${data.supplier_name}` : '';
            const itemLabel = data.item ? ` — ${data.item.code} ${data.item.name}` : '';
            const fmtQty = (v) => parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            
            let html = generateReportHeader('Item Statement Report' + supplierName + itemLabel, {
                startDate: startDateDisplay,
                endDate: endDateDisplay
            });
            
            const summary = data.summary || {};
            html += `<div class="report-summary" style="margin-bottom: 20px;">
                <h3>Stock Summary (Qty)</h3>
                <div class="report-summary-grid">
                    <div class="report-summary-item" style="background: #fff8e1; border-color: #ffc107;">
                        <label style="color: #f57f17;">Opening Stock</label>
                        <div class="value" style="color: #f57f17; font-size: 20px;">${fmtQty(summary.opening_quantity)}</div>
                        <small style="color: #666;">Before ${startDateDisplay}</small>
                    </div>
                    <div class="report-summary-item" style="background: #e8f5e9; border-color: #4caf50;">
                        <label style="color: #2e7d32;">Total IN</label>
                        <div class="value" style="color: #2e7d32; font-size: 20px;">${fmtQty(summary.total_in)}</div>
                    </div>
                    <div class="report-summary-item" style="background: #ffebee; border-color: #f44336;">
                        <label style="color: #c62828;">Total OUT</label>
                        <div class="value" style="color: #c62828; font-size: 20px;">${fmtQty(summary.total_out)}</div>
                    </div>
                    <div class="report-summary-item" style="background: #e3f2fd; border-color: #2196f3;">
                        <label style="color: #1976d2;">Net Change</label>
                        <div class="value" style="color: #1976d2; font-size: 20px;">${fmtQty(summary.net_change)}</div>
                    </div>
                    <div class="report-summary-item" style="background: #e8eaf6; border-color: #3f51b5;">
                        <label style="color: #283593;">Closing Stock</label>
                        <div class="value" style="color: #283593; font-size: 20px; font-weight: 700;">${fmtQty(summary.closing_quantity)}</div>
                        <small style="color: #666;">As of ${endDateDisplay}</small>
                    </div>
                </div>
            </div>`;
            
            // Transactions
            if (!data.statement || data.statement.length === 0) {
                html += '<p style="color: var(--text-secondary); padding: 20px; text-align: center;">No transactions found for the selected filters.</p>';
            } else {
                html += '<div class="table-container"><table><thead><tr>';
                html += '<th>Date</th><th>Type</th><th>Movement</th><th>Item Code</th><th>Item Name</th>';
                html += '<th class="text-right">Quantity</th><th class="text-right">Balance After</th>';
                html += '<th class="text-right">Unit Price</th><th class="text-right">Total Amount</th><th>Currency</th><th>Reference</th>';
                html += '</tr></thead><tbody>';
                
                data.statement.forEach((transaction) => {
                    const txType = transaction.transaction_type || transaction.type || 'IN';
                    const typeColor = txType === 'IN' ? '#4caf50' : '#f44336';
                    const typeBg = txType === 'IN' ? '#e8f5e9' : '#ffebee';
                    
                    html += `<tr>
                        <td>${new Date(transaction.date).toLocaleDateString()}</td>
                        <td><span style="background: ${typeBg}; color: ${typeColor}; padding: 4px 8px; border-radius: 4px; font-weight: 600;">${txType}</span></td>
                        <td>${transaction.movement_kind || '-'}</td>
                        <td>${transaction.item_code || '-'}</td>
                        <td>${transaction.item_name || '-'}</td>
                        <td class="text-right">${fmtQty(transaction.quantity)}</td>
                        <td class="text-right" style="font-weight: 600;">${fmtQty(transaction.balance_after)}</td>
                        <td class="text-right">${transaction.unit_price ? formatCurrency(transaction.unit_price, transaction.currency) : '-'}</td>
                        <td class="text-right" style="font-weight: 600;">${transaction.total_amount ? formatCurrency(transaction.total_amount, transaction.currency) : '-'}</td>
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

function updateCollectedMoneyGroupHeaderColspans(visibility) {
    const table = document.getElementById('collectedMoneyTable');
    if (!table) return;

    const allHeaders = table.querySelectorAll('thead th[data-column]');
    let totalVisible = 0;
    let amountVisible = true;

    allHeaders.forEach(th => {
        const col = th.getAttribute('data-column');
        const isVisible = visibility
            ? (!visibility.hasOwnProperty(col) || visibility[col] !== false)
            : th.style.display !== 'none';
        if (isVisible) {
            totalVisible++;
            if (col === 'amount') {
                amountVisible = true;
            }
        } else if (col === 'amount') {
            amountVisible = false;
        }
    });

    const labelColspan = amountVisible ? Math.max(1, totalVisible - 1) : totalVisible;
    table.querySelectorAll('tr.group-header-row').forEach(row => {
        const firstCell = row.querySelector('td[data-column]');
        if (firstCell) {
            firstCell.setAttribute('colspan', labelColspan);
        }
    });
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
            
            updateCollectedMoneyGroupHeaderColspans(visibility);
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

// Profit & Loss Report Column Visibility Functions
function toggleProfitLossColumnSelector() {
    const dropdown = document.getElementById('profitLossColumnSelectorDropdown');
    if (dropdown) {
        const isVisible = dropdown.style.display === 'block';
        dropdown.style.display = isVisible ? 'none' : 'block';

        if (!isVisible) {
            loadSavedProfitLossColumnVisibility();
            updateProfitLossColumnSelectorBadge();
            setTimeout(() => {
                document.addEventListener('click', closeProfitLossColumnSelectorOutside, true);
            }, 0);
        } else {
            document.removeEventListener('click', closeProfitLossColumnSelectorOutside, true);
        }
    }
}

function closeProfitLossColumnSelectorOutside(event) {
    const dropdown = document.getElementById('profitLossColumnSelectorDropdown');
    const button = event.target.closest('button[onclick*="toggleProfitLossColumnSelector"]');

    if (dropdown && !dropdown.contains(event.target) && !button) {
        dropdown.style.display = 'none';
        document.removeEventListener('click', closeProfitLossColumnSelectorOutside, true);
    }
}

function selectAllProfitLossColumns() {
    document.querySelectorAll('.profit-loss-column-checkbox').forEach(cb => { cb.checked = true; });
    updateProfitLossColumnSelectorBadge();
}

function deselectAllProfitLossColumns() {
    document.querySelectorAll('.profit-loss-column-checkbox').forEach(cb => { cb.checked = false; });
    updateProfitLossColumnSelectorBadge();
}

function updateProfitLossColumnSelectorBadge() {
    const checkboxes = document.querySelectorAll('.profit-loss-column-checkbox');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    const totalCount = checkboxes.length;
    const badge = document.getElementById('profitLossColumnSelectorBadge');

    if (badge) {
        if (checkedCount < totalCount) {
            badge.textContent = totalCount - checkedCount;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }
}

function saveProfitLossColumnVisibility() {
    const visibility = {};
    document.querySelectorAll('.profit-loss-column-checkbox').forEach(cb => {
        visibility[cb.getAttribute('data-column')] = cb.checked;
    });
    localStorage.setItem('profitLossColumnVisibility', JSON.stringify(visibility));
}

function loadSavedProfitLossColumnVisibility() {
    const saved = localStorage.getItem('profitLossColumnVisibility');
    if (saved) {
        try {
            const visibility = JSON.parse(saved);
            document.querySelectorAll('.profit-loss-column-checkbox').forEach(cb => {
                const column = cb.getAttribute('data-column');
                if (Object.prototype.hasOwnProperty.call(visibility, column)) {
                    cb.checked = visibility[column] !== false;
                }
            });
        } catch (e) {
            console.error('Error loading profit loss column visibility:', e);
        }
    } else {
        document.querySelectorAll('.profit-loss-column-checkbox').forEach(cb => { cb.checked = true; });
    }
}

function applySavedProfitLossColumnVisibility() {
    const saved = localStorage.getItem('profitLossColumnVisibility');
    if (!saved) return;

    try {
        const visibility = JSON.parse(saved);
        const table = document.getElementById('profitLossReportTable');
        if (!table) return;

        table.querySelectorAll('thead th[data-column]').forEach(th => {
            const column = th.getAttribute('data-column');
            th.style.display = (visibility.hasOwnProperty(column) && visibility[column] === false) ? 'none' : '';
        });

        table.querySelectorAll('tbody td[data-column]').forEach(cell => {
            const column = cell.getAttribute('data-column');
            cell.style.display = (visibility.hasOwnProperty(column) && visibility[column] === false) ? 'none' : '';
        });
    } catch (e) {
        console.error('Error applying profit loss column visibility:', e);
    }
}

function applyProfitLossColumnVisibility() {
    saveProfitLossColumnVisibility();
    const dropdown = document.getElementById('profitLossColumnSelectorDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
    document.removeEventListener('click', closeProfitLossColumnSelectorOutside, true);
    loadProfitLossReport();
}

// Safe Out Report Column Visibility Functions
function toggleSafeOutColumnSelector() {
    const dropdown = document.getElementById('safeOutColumnSelectorDropdown');
    if (dropdown) {
        const isVisible = dropdown.style.display === 'block';
        dropdown.style.display = isVisible ? 'none' : 'block';

        if (!isVisible) {
            loadSavedSafeOutColumnVisibility();
            updateSafeOutColumnSelectorBadge();
            setTimeout(() => {
                document.addEventListener('click', closeSafeOutColumnSelectorOutside, true);
            }, 0);
        } else {
            document.removeEventListener('click', closeSafeOutColumnSelectorOutside, true);
        }
    }
}

function closeSafeOutColumnSelectorOutside(event) {
    const dropdown = document.getElementById('safeOutColumnSelectorDropdown');
    const button = event.target.closest('button[onclick*="toggleSafeOutColumnSelector"]');

    if (dropdown && !dropdown.contains(event.target) && !button) {
        dropdown.style.display = 'none';
        document.removeEventListener('click', closeSafeOutColumnSelectorOutside, true);
    }
}

function selectAllSafeOutColumns() {
    document.querySelectorAll('.safe-out-column-checkbox').forEach(cb => { cb.checked = true; });
    updateSafeOutColumnSelectorBadge();
}

function deselectAllSafeOutColumns() {
    document.querySelectorAll('.safe-out-column-checkbox').forEach(cb => { cb.checked = false; });
    updateSafeOutColumnSelectorBadge();
}

function updateSafeOutColumnSelectorBadge() {
    const checkboxes = document.querySelectorAll('.safe-out-column-checkbox');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    const totalCount = checkboxes.length;
    const badge = document.getElementById('safeOutColumnSelectorBadge');

    if (badge) {
        if (checkedCount < totalCount) {
            badge.textContent = totalCount - checkedCount;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }
}

function saveSafeOutColumnVisibility() {
    const visibility = {};
    document.querySelectorAll('.safe-out-column-checkbox').forEach(cb => {
        visibility[cb.getAttribute('data-column')] = cb.checked;
    });
    localStorage.setItem('safeOutColumnVisibility', JSON.stringify(visibility));
}

function loadSavedSafeOutColumnVisibility() {
    const saved = localStorage.getItem('safeOutColumnVisibility');
    if (saved) {
        try {
            const visibility = JSON.parse(saved);
            document.querySelectorAll('.safe-out-column-checkbox').forEach(cb => {
                const column = cb.getAttribute('data-column');
                if (Object.prototype.hasOwnProperty.call(visibility, column)) {
                    cb.checked = visibility[column] !== false;
                }
            });
        } catch (e) {
            console.error('Error loading safe out column visibility:', e);
        }
    } else {
        document.querySelectorAll('.safe-out-column-checkbox').forEach(cb => { cb.checked = true; });
    }
}

function applySavedSafeOutColumnVisibility() {
    const saved = localStorage.getItem('safeOutColumnVisibility');
    if (!saved) return;

    try {
        const visibility = JSON.parse(saved);
        const table = document.getElementById('safeOutTable');
        if (!table) return;

        table.querySelectorAll('thead th[data-column]').forEach(th => {
            const column = th.getAttribute('data-column');
            th.style.display = (visibility.hasOwnProperty(column) && visibility[column] === false) ? 'none' : '';
        });

        table.querySelectorAll('tbody td[data-column]').forEach(cell => {
            const column = cell.getAttribute('data-column');
            cell.style.display = (visibility.hasOwnProperty(column) && visibility[column] === false) ? 'none' : '';
        });

        updateSafeOutColumnSelectorBadge();
    } catch (e) {
        console.error('Error applying safe out column visibility:', e);
    }
}

function applySafeOutColumnVisibility() {
    saveSafeOutColumnVisibility();
    const dropdown = document.getElementById('safeOutColumnSelectorDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
    document.removeEventListener('click', closeSafeOutColumnSelectorOutside, true);
    applySavedSafeOutColumnVisibility();
    updateSafeOutColumnSelectorBadge();
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
    html += '<th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Supplier</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Last Purchase Price</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Last COG Per Unit</th>';
    html += '<th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Last Purchase Date</th>';
    html += '<th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Container</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Quantity</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Total Price</th>';
    html += '<th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Currency</th>';
    html += '</tr></thead><tbody>';

    items.forEach((item, index) => {
        html += `<tr style="background: ${index % 2 === 0 ? '#fff' : '#f8f9fa'};">`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">${escapeHtml(item.item_code)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(item.supplier_name || 'N/A')}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right; font-weight: bold; color: #1e3a5f;">${formatNumber(item.last_purchase_price)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${formatNumber(item.last_cog_per_unit ?? 0)}</td>`;
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

function loadLastPurchaseCogReport() {
    const content = document.getElementById('reportContent');
    content.innerHTML = '<div class="spinner"></div>';
    
    const supplierId = document.getElementById('lastPurchaseCogSupplier')?.value || '';
    const itemId = document.getElementById('lastPurchaseCogItem')?.value || '';
    
    let url = '/api/reports/last-purchase-cog?';
    if (supplierId) url += `supplier_id=${supplierId}&`;
    if (itemId) url += `item_id=${itemId}&`;
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                content.innerHTML = `<p style="color: red; padding: 20px;">Error: ${data.error}</p>`;
                return;
            }
            renderLastPurchaseCogReport(data);
        })
        .catch(error => {
            console.error('Error loading last purchase COG report:', error);
            content.innerHTML = '<p style="color: red; padding: 20px;">Error loading report: ' + error.message + '</p>';
        });
}

function renderLastPurchaseCogReport(data) {
    const content = document.getElementById('reportContent');
    const items = data.items || [];
    const baseCurrency = data.base_currency || '';
    
    if (items.length === 0) {
        content.innerHTML = '<p style="color: var(--text-secondary); padding: 20px; text-align: center;">No items with purchases found for the selected filters.</p>';
        return;
    }
    
    let html = '<div class="report-table-wrapper">';
    html += '<h3 style="margin-bottom: 20px; color: #1e3a5f;">Last Purchase COG</h3>';
    html += '<p style="margin-bottom: 15px; color: #666;">COG from the most recent purchase of each item (not the average of all purchases).</p>';
    html += `<p style="margin-bottom: 15px; color: #666;">Total Items: <strong>${items.length}</strong></p>`;
    
    html += '<table class="report-table" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">';
    html += '<thead><tr style="background: #1e3a5f; color: white;">';
    html += '<th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Item Code</th>';
    html += '<th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Item Name</th>';
    html += '<th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Supplier</th>';
    html += '<th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Last Purchase Date</th>';
    html += '<th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Container</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Available Qty</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Quantity</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Unit Price</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">COG Per Unit</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Total COG</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Cost Per Unit</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Total Cost</th>';
    html += '<th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Total Cost (' + baseCurrency + ')</th>';
    html += '<th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Currency</th>';
    html += '</tr></thead><tbody>';
    
    items.forEach((item, index) => {
        html += `<tr style="background: ${index % 2 === 0 ? '#fff' : '#f8f9fa'};">`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">${escapeHtml(item.item_code)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(item.item_name)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(item.supplier_name || 'N/A')}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd;">${item.last_purchase_date || '-'}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(item.container_number || '-')}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${formatNumber(item.available_quantity)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${formatNumber(item.quantity)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${formatNumber(item.unit_price)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right; font-weight: bold; color: #1e3a5f;">${formatNumber(item.cog_per_unit)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${formatNumber(item.total_cog)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${formatNumber(item.cost_per_unit)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${formatNumber(item.total_cost)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${formatNumber(item.total_cost_base_currency)}</td>`;
        html += `<td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(item.currency || '-')}</td>`;
        html += '</tr>';
    });
    
    html += '</tbody></table></div>';
    content.innerHTML = html;
}

function clearLastPurchaseCogFilters() {
    document.getElementById('lastPurchaseCogSupplier').value = '';
    document.getElementById('lastPurchaseCogItem').value = '';
    loadLastPurchaseCogReport();
}

function loadSuppliersForLastPurchaseCog() {
    fetch('/api/companies?category=Supplier')
        .then(response => response.json())
        .then(suppliers => {
            const select = document.getElementById('lastPurchaseCogSupplier');
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

function loadItemsForLastPurchaseCog() {
    fetch('/api/items/summary')
        .then(response => response.json())
        .then(items => {
            const select = document.getElementById('lastPurchaseCogItem');
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

function loadPartnerProfitReport() {
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    let url = '/api/reports/partner-profit-allocation?';
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                document.getElementById('reportContent').innerHTML = `
                    <div style="padding: 20px; max-width: 640px;">
                        <p style="color: #c62828; font-weight: 600;">${data.error}</p>
                        <p style="margin-top: 16px; color: var(--text-secondary);">Set partners on the Partners page so profit-share percentages total exactly 100%.</p>
                        <a href="/partners" class="btn btn-primary" style="margin-top: 12px; display: inline-block;">Manage partners</a>
                    </div>`;
                return;
            }

            const bc = data.base_currency || '';
            const fmt = (v) => formatCurrency(v, bc);
            const startD = startDate ? new Date(startDate).toLocaleDateString() : 'All';
            const endD = endDate ? new Date(endDate).toLocaleDateString() : 'All';

            if (window.__partnerProfitCharts) {
                window.__partnerProfitCharts.forEach((c) => {
                    try {
                        c.destroy();
                    } catch (e) {
                        /* ignore */
                    }
                });
            }
            window.__partnerProfitCharts = [];

            let html = generateReportHeader('Partner Profit Allocation', { startDate: startD, endDate: endD });
            html += `<p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 16px; max-width: 900px;">
                ${data.disclaimer || ''}
                <a href="/partners">Manage partners</a>
            </p>`;

            const totalDraw = data.total_partner_drawings != null ? data.total_partner_drawings : 0;
            const afterDraw = data.operating_profit_after_drawings != null ? data.operating_profit_after_drawings : data.operating_profit;
            html += `<div class="report-summary" style="margin-bottom: 20px;">
                <h3>Summary (${bc})</h3>
                <div class="report-summary-grid">
                    <div class="report-summary-item"><label>Revenue (P&amp;L sales)</label><div class="value">${fmt(data.revenue)}</div></div>
                    <div class="report-summary-item"><label>Purchases (period)</label><div class="value">${fmt(data.purchases_amount != null ? data.purchases_amount : data.cogs)}</div></div>
                    <div class="report-summary-item"><label>Gross profit</label><div class="value" style="color:#1565c0;">${fmt(data.gross_profit)}</div></div>
                    <div class="report-summary-item"><label>General expenses (base)</label><div class="value">${fmt(data.operating_expenses)}</div></div>
                    <div class="report-summary-item"><label>Operating profit (before tax)</label><div class="value" style="font-weight:700;color:${data.operating_profit >= 0 ? '#2e7d32' : '#c62828'};">${fmt(data.operating_profit)}</div></div>
                    <div class="report-summary-item"><label>Partner drawings (cash, period)</label><div class="value">${fmt(totalDraw)}</div></div>
                    <div class="report-summary-item"><label>Operating profit after drawings</label><div class="value" style="font-weight:700;color:${afterDraw >= 0 ? '#2e7d32' : '#c62828'};">${fmt(afterDraw)}</div></div>
                </div>
            </div>`;

            html += `<div class="partner-profit-charts" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; margin-bottom: 28px;">
                <div style="background: var(--bg-secondary, #fff); padding: 16px; border-radius: 8px; border: 1px solid var(--border-color, #e0e0e0);">
                    <h4 style="margin: 0 0 12px 0; color: #1e3a5f;">P&amp;L bridge (amounts)</h4>
                    <div style="position: relative; height: 300px;"><canvas id="partnerProfitBarChart"></canvas></div>
                </div>
                <div style="background: var(--bg-secondary, #fff); padding: 16px; border-radius: 8px; border: 1px solid var(--border-color, #e0e0e0);">
                    <h4 style="margin: 0 0 12px 0; color: #1e3a5f;">Net after drawings by partner</h4>
                    <div style="position: relative; height: 280px;"><canvas id="partnerProfitPieChart"></canvas></div>
                </div>
            </div>`;

            html += '<div class="table-container"><table><thead><tr><th>Partner</th><th class="text-right">Share %</th><th class="text-right">Allocated profit</th><th class="text-right">Drawings</th><th class="text-right">Net after drawings</th></tr></thead><tbody>';
            data.partners.forEach((p) => {
                const dw = p.drawings != null ? p.drawings : 0;
                const net = p.net_after_drawings != null ? p.net_after_drawings : p.allocated_profit;
                html += `<tr><td>${escapeHtml(p.name)}</td><td class="text-right">${Number(p.share_percent).toFixed(2)}%</td><td class="text-right" style="font-weight:600;">${fmt(p.allocated_profit)}</td><td class="text-right">${fmt(dw)}</td><td class="text-right" style="font-weight:700;color:${net >= 0 ? '#2e7d32' : '#c62828'};">${fmt(net)}</td></tr>`;
            });
            html += '</tbody></table></div>';
            html += generateReportFooter();

            document.getElementById('reportContent').innerHTML = html;

            if (typeof Chart === 'undefined') {
                return;
            }

            const barEl = document.getElementById('partnerProfitBarChart');
            const pieEl = document.getElementById('partnerProfitPieChart');
            if (barEl) {
                const c1 = new Chart(barEl.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: ['Revenue', 'Purchases', 'Gen. expenses', 'Operating profit', 'Drawings', 'After drawings'],
                        datasets: [{
                            label: `Amount (${bc})`,
                            data: [
                                data.revenue,
                                -Math.abs(data.purchases_amount != null ? data.purchases_amount : data.cogs),
                                -Math.abs(data.operating_expenses),
                                data.operating_profit,
                                -Math.abs(totalDraw),
                                afterDraw,
                            ],
                            backgroundColor: ['#43a047', '#e57373', '#ffb74d', '#1e88e5', '#8d6e63', '#00695c'],
                        }],
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: {
                                ticks: {
                                    callback: (val) => (Number.isFinite(val) ? val.toLocaleString() : ''),
                                },
                            },
                        },
                    },
                });
                window.__partnerProfitCharts.push(c1);
            }

            if (pieEl && data.partners.length > 0) {
                const nets = data.partners.map((p) => Number(p.net_after_drawings != null ? p.net_after_drawings : p.allocated_profit) || 0);
                const posSum = nets.filter((n) => n > 0).reduce((a, b) => a + b, 0);
                const pieData =
                    posSum > 0
                        ? nets.map((n) => Math.max(0, n))
                        : data.partners.map((p) => Number(p.share_percent) || 0);
                const pieLabels = data.partners.map((p) => p.name);
                const palette = ['#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#6d4c41', '#00838f'];
                const c2 = new Chart(pieEl.getContext('2d'), {
                    type: 'doughnut',
                    data: {
                        labels: pieLabels,
                        datasets: [
                            {
                                data: pieData,
                                backgroundColor: data.partners.map((_, i) => palette[i % palette.length]),
                            },
                        ],
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'bottom' },
                            tooltip: {
                                callbacks: {
                                    label: (ctx) => {
                                        const i = ctx.dataIndex;
                                        const p = data.partners[i];
                                        const net = p.net_after_drawings != null ? p.net_after_drawings : p.allocated_profit;
                                        const dw = p.drawings != null ? p.drawings : 0;
                                        return `${p.name}: net ${fmt(net)} (alloc. ${fmt(p.allocated_profit)}, drawings ${fmt(dw)})`;
                                    },
                                },
                            },
                        },
                    },
                });
                window.__partnerProfitCharts.push(c2);
            }
        })
        .catch((err) => {
            console.error(err);
            document.getElementById('reportContent').innerHTML =
                '<p style="color: red;">Error loading partner profit report</p>';
        });
}
