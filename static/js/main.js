// Main JavaScript file

// Theme Toggle Function
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    // Update icon
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) {
        themeIcon.textContent = newTheme === 'dark' ? '☀️' : '🌙';
    }
}

// Load and display calculation method
function loadCalculationMethodIndicator() {
    fetch('/api/markets/calculation-method')
        .then(response => response.json())
        .then(data => {
            const method = data.method || 'Average';
            const calcMethodText = document.getElementById('calcMethodText');
            const calcMethodIcon = document.getElementById('calcMethodIndicator');
            
            if (calcMethodText) {
                calcMethodText.textContent = method === 'FIFO' ? 'FIFO' : 'Average';
            }
            
            if (calcMethodIcon) {
                // Update title and styling based on method
                calcMethodIcon.title = `Current Calculation Method: ${method === 'FIFO' ? 'FIFO (First In First Out)' : 'Average Cost'}`;
                if (method === 'FIFO') {
                    calcMethodIcon.style.borderColor = '#4caf50';
                    calcMethodIcon.style.color = '#4caf50';
                } else {
                    calcMethodIcon.style.borderColor = '';
                    calcMethodIcon.style.color = '';
                }
            }
        })
        .catch(error => {
            console.error('Error loading calculation method:', error);
        });
}

// Load calculation method when page loads
document.addEventListener('DOMContentLoaded', function() {
    loadCalculationMethodIndicator();
    
    // Also reload when calculation method might have changed (poll every 30 seconds)
    setInterval(loadCalculationMethodIndicator, 30000);
});

// Initialize theme on page load
// Handle clicks outside searchable dropdowns to close them
function handleBodyClick(event) {
    const stockWrapper = document.getElementById('stockValueDetailsItemWrapper');
    if (stockWrapper && !stockWrapper.contains(event.target)) {
        const dropdown = document.getElementById('stockValueDetailsItemDropdown');
        if (dropdown) {
            dropdown.style.display = 'none';
        }
    }
    const profitLossWrapper = document.getElementById('profitLossItemWrapper');
    if (profitLossWrapper && !profitLossWrapper.contains(event.target)) {
        const profitLossDropdown = document.getElementById('profitLossItemDropdown');
        if (profitLossDropdown) {
            profitLossDropdown.style.display = 'none';
        }
    }
}

// Attach click handler to body
document.addEventListener('DOMContentLoaded', function() {
    document.body.addEventListener('click', handleBodyClick);
});

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    const html = document.documentElement;
    html.setAttribute('data-theme', savedTheme);
    
    // Update icon
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) {
        themeIcon.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
    }
}

// Market Selector
document.addEventListener('DOMContentLoaded', function() {
    // Initialize theme first
    initTheme();
    const marketSelector = document.getElementById('marketSelector');
    const marketModal = document.getElementById('marketModal');
    const closeModal = document.querySelector('.close');
    
    if (marketSelector) {
        marketSelector.addEventListener('click', function() {
            loadMarkets();
            marketModal.style.display = 'block';
        });
    }
    
    if (closeModal) {
        closeModal.addEventListener('click', function() {
            marketModal.style.display = 'none';
        });
    }
    
    window.addEventListener('click', function(event) {
        if (event.target == marketModal) {
            marketModal.style.display = 'none';
        }
    });
    
    // Load current market
    loadCurrentMarket();
});

function loadCurrentMarket() {
    fetch('/api/current-market')
        .then(response => response.json())
        .then(market => {
            if (market && market.name) {
                const currentMarketEl = document.getElementById('currentMarket');
                if (currentMarketEl) {
                    currentMarketEl.textContent = market.name;
                }
            }
        })
        .catch(error => {
            // If no current market, try to get first market from list
            fetch('/api/markets')
                .then(response => response.json())
                .then(markets => {
                    if (markets && markets.length > 0) {
                        const currentMarketEl = document.getElementById('currentMarket');
                        if (currentMarketEl) {
                            currentMarketEl.textContent = markets[0].name;
                        }
                    }
                })
                .catch(err => console.error('Error loading markets:', err));
        });
}

function loadMarkets() {
    fetch('/api/markets')
        .then(response => response.json())
        .then(markets => {
            const marketList = document.getElementById('marketList');
            marketList.innerHTML = '';
            
            markets.forEach(market => {
                const div = document.createElement('div');
                div.className = 'market-item';
                div.style.cssText = 'padding: 15px; cursor: pointer; border-bottom: 1px solid #eee;';
                div.innerHTML = `
                    <div style="font-weight: 600;">${market.name}</div>
                    <div style="font-size: 12px; color: #666;">${market.address || ''}</div>
                    <div style="font-size: 12px; color: #999;">Currency: ${market.base_currency}</div>
                `;
                div.addEventListener('click', function() {
                    switchMarket(market.id);
                });
                marketList.appendChild(div);
            });
        })
        .catch(error => console.error('Error loading markets:', error));
}

function switchMarket(marketId) {
    fetch('/api/switch-market', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ market_id: marketId })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            document.getElementById('currentMarket').textContent = data.market;
            document.getElementById('marketModal').style.display = 'none';
            location.reload();
        }
    })
    .catch(error => console.error('Error switching market:', error));
}

function getCurrentMarketId() {
    // This would typically come from a session or API call
    // For now, we'll get it from the first market
    return null; // Will be set by backend
}

// Table Sorting
function makeSortable(table) {
    if (!table || !table.id) return;
    
    const headers = table.querySelectorAll('th.sortable');
    headers.forEach((header) => {
        header.addEventListener('click', function() {
            // Get the actual column index by finding position among all th elements
            const allHeaders = table.querySelectorAll('th');
            let columnIndex = -1;
            for (let i = 0; i < allHeaders.length; i++) {
                if (allHeaders[i] === header) {
                    columnIndex = i;
                    break;
                }
            }
            if (columnIndex >= 0) {
                sortTable(table, columnIndex);
            }
        });
    });
    
    // Restore saved sort state
    restoreTableSort(table);
}

function getTableSortKey(table) {
    if (!table || !table.id) return null;
    return `table_sort_${table.id}`;
}

function saveTableSort(table, columnIndex, isAsc) {
    const key = getTableSortKey(table);
    if (!key) return;
    try {
        localStorage.setItem(key, JSON.stringify({
            columnIndex: columnIndex,
            isAsc: isAsc
        }));
    } catch (e) {
        console.warn('Could not save sort state:', e);
    }
}

function restoreTableSort(table) {
    const key = getTableSortKey(table);
    if (!key) return;
    
    try {
        const saved = localStorage.getItem(key);
        if (saved) {
            const sortState = JSON.parse(saved);
            const columnIndex = sortState.columnIndex;
            const isAsc = sortState.isAsc;
            
            // Wait for table to be populated before applying sort
            setTimeout(() => {
                const tbody = table.querySelector('tbody');
                if (tbody && tbody.querySelectorAll('tr').length > 0) {
                    // Check if table has data (not empty state)
                    const firstRow = tbody.querySelector('tr');
                    if (firstRow && !firstRow.querySelector('.empty-state')) {
                        // Apply the saved sort
                        applyTableSort(table, columnIndex, isAsc);
                    }
                }
            }, 100);
        }
    } catch (e) {
        console.warn('Could not restore sort state:', e);
    }
}

function applyTableSort(table, columnIndex, isAsc) {
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    
    const rows = Array.from(tbody.querySelectorAll('tr'));
    if (rows.length === 0) return;
    
    const header = table.querySelectorAll('th')[columnIndex];
    if (!header) return;
    
    // Remove all sort classes
    table.querySelectorAll('th').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
    });
    
    // Add appropriate sort class
    header.classList.add(isAsc ? 'sort-asc' : 'sort-desc');
    
    // Sort rows
    rows.sort((a, b) => {
        const aCell = a.querySelectorAll('td')[columnIndex];
        const bCell = b.querySelectorAll('td')[columnIndex];
        
        if (!aCell || !bCell) {
            return 0;
        }
        
        const aText = aCell.textContent.trim();
        const bText = bCell.textContent.trim();
        
        // Handle empty cells
        if (!aText && !bText) return 0;
        if (!aText) return 1;
        if (!bText) return -1;
        
        // Try to parse as number
        const aNum = parseFloat(aText.replace(/[^\d.-]/g, ''));
        const bNum = parseFloat(bText.replace(/[^\d.-]/g, ''));
        
        // If both are valid numbers, sort numerically
        if (!isNaN(aNum) && !isNaN(bNum) && isFinite(aNum) && isFinite(bNum)) {
            return isAsc ? aNum - bNum : bNum - aNum;
        }
        
        // Otherwise sort as text
        return isAsc ? aText.localeCompare(bText) : bText.localeCompare(aText);
    });
    
    // Re-append sorted rows
    rows.forEach(row => tbody.appendChild(row));
}

function sortTable(table, columnIndex) {
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    
    // Skip if no rows or empty state row
    if (rows.length === 0 || rows[0].querySelector('.empty-state')) {
        return;
    }
    
    const header = table.querySelectorAll('th')[columnIndex];
    
    // Determine sort direction
    const isAsc = header.classList.contains('sort-asc');
    
    // Remove all sort classes
    table.querySelectorAll('th').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
    });
    
    // Determine new sort direction
    const newIsAsc = !isAsc;
    
    // Add appropriate sort class
    header.classList.add(newIsAsc ? 'sort-asc' : 'sort-desc');
    
    // Save sort state
    saveTableSort(table, columnIndex, newIsAsc);
    
    // Sort rows
    rows.sort((a, b) => {
        const aCell = a.querySelectorAll('td')[columnIndex];
        const bCell = b.querySelectorAll('td')[columnIndex];
        
        if (!aCell || !bCell) {
            return 0;
        }
        
        const aText = aCell.textContent.trim();
        const bText = bCell.textContent.trim();
        
        // Handle empty cells
        if (!aText && !bText) return 0;
        if (!aText) return 1;
        if (!bText) return -1;
        
        // Try to parse as number - improved regex to handle decimals and negatives
        // Remove all non-numeric characters except decimal point and minus sign
        const aNum = parseFloat(aText.replace(/[^\d.-]/g, ''));
        const bNum = parseFloat(bText.replace(/[^\d.-]/g, ''));
        
        // If both are valid numbers, sort numerically
        if (!isNaN(aNum) && !isNaN(bNum) && isFinite(aNum) && isFinite(bNum)) {
            return newIsAsc ? aNum - bNum : bNum - aNum;
        }
        
        // Otherwise sort as text
        return newIsAsc ? aText.localeCompare(bText) : bText.localeCompare(aText);
    });
    
    // Re-append sorted rows
    rows.forEach(row => tbody.appendChild(row));
}

// Format Currency
function formatCurrency(amount, currency = '') {
    return `${currency} ${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Export to Excel (using SheetJS would require additional library)
function exportToExcel(data, filename) {
    // This is a placeholder - would need SheetJS or similar library
    console.log('Export to Excel:', filename, data);
    alert('Excel export functionality requires additional library. Please implement using SheetJS or similar.');
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        left: 20px;
        padding: 15px 20px;
        background-color: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
        color: white;
        border-radius: 4px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        z-index: 3000;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

