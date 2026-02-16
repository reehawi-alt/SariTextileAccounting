// Sales page JavaScript

let salesData = [];
let customers = [];
let suppliers = [];
let items = [];
let selectedSales = new Set();

document.addEventListener('DOMContentLoaded', function() {
    // Set default dates (from 2020-01-01 to today) BEFORE loading sales
    const today = new Date();
    const firstDay = new Date('2020-01-01');
    document.getElementById('filterStartDate').value = firstDay.toISOString().split('T')[0];
    document.getElementById('filterEndDate').value = today.toISOString().split('T')[0];
    
    // Load data
    loadSales();
    loadCustomers();
    loadSuppliers();
    makeSortable(document.getElementById('salesTable'));
    
    // Check for sale_id in URL to open sale invoice
    const urlParams = new URLSearchParams(window.location.search);
    const saleId = urlParams.get('sale_id');
    if (saleId) {
        // Wait for sales to load, then open the invoice
        setTimeout(() => {
            showSaleInvoice(parseInt(saleId));
        }, 500);
    }
    
    // Add event listeners to filter inputs for automatic reload
    document.getElementById('filterStartDate').addEventListener('change', function() {
        loadSales();
    });
    document.getElementById('filterEndDate').addEventListener('change', function() {
        loadSales();
    });
    document.getElementById('filterCustomer').addEventListener('change', function() {
        loadSales();
    });
    document.getElementById('filterSupplier').addEventListener('change', function() {
        loadSales();
    });
    
    // Form submission
    document.getElementById('saleForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveSale();
    });
    
    // Calculate total on item changes
    document.addEventListener('input', function(e) {
        if (e.target.classList.contains('item-quantity') || e.target.classList.contains('item-price')) {
            calculateItemTotal(e.target);
            calculateSaleTotal();
        }
        // Update balance when paid amount changes
        if (e.target.id === 'salePaidAmount') {
            updateSaleBalance();
        }
    });
});

function loadSales() {
    const startDate = document.getElementById('filterStartDate').value;
    const endDate = document.getElementById('filterEndDate').value;
    const customerId = document.getElementById('filterCustomer').value;
    const supplierId = document.getElementById('filterSupplier').value;
    
    let url = '/api/sales?';
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    if (customerId) url += `customer_id=${customerId}&`;
    if (supplierId) url += `supplier_id=${supplierId}&`;
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            // Handle both old format (array) and new format (object with sales array)
            const sales = Array.isArray(data) ? data : data.sales;
            const total = Array.isArray(data) ? null : data.total_amount;
            const count = Array.isArray(data) ? data.length : data.count;
            
            salesData = sales;
            renderSalesTable(sales);
            updateSalesTotal(total, count);
        })
        .catch(error => {
            console.error('Error loading sales:', error);
            document.getElementById('salesTableBody').innerHTML = 
                '<tr><td colspan="11" class="empty-state">Error loading sales</td></tr>';
            updateSalesTotal(null, 0);
        });
}

function loadCustomers() {
    fetch('/api/companies?category=Customer')
        .then(response => response.json())
        .then(data => {
            customers = data;
            const select = document.getElementById('filterCustomer');
            const saleSelect = document.getElementById('saleCustomer');
            
            data.forEach(customer => {
                const option1 = document.createElement('option');
                option1.value = customer.id;
                option1.textContent = customer.name;
                select.appendChild(option1);
                
                const option2 = document.createElement('option');
                option2.value = customer.id;
                option2.textContent = customer.name;
                saleSelect.appendChild(option2);
            });
        })
        .catch(error => console.error('Error loading customers:', error));
}

function loadSuppliers() {
    fetch('/api/companies?category=Supplier')
        .then(response => response.json())
        .then(data => {
            suppliers = data;
            const saleSelect = document.getElementById('saleSupplier');
            const filterSelect = document.getElementById('filterSupplier');
            
            // Populate sale supplier dropdown
            saleSelect.innerHTML = '<option value="">Select Supplier</option>';
            data.forEach(supplier => {
                const option = document.createElement('option');
                option.value = supplier.id;
                option.textContent = supplier.name;
                saleSelect.appendChild(option);
            });
            
            // Populate filter supplier dropdown
            if (filterSelect) {
                filterSelect.innerHTML = '<option value="">All Suppliers</option>';
                data.forEach(supplier => {
                    const option = document.createElement('option');
                    option.value = supplier.id;
                    option.textContent = supplier.name;
                    filterSelect.appendChild(option);
                });
            }
        })
        .catch(error => console.error('Error loading suppliers:', error));
}

function loadSupplierItems() {
    const supplierId = document.getElementById('saleSupplier').value;
    
    if (!supplierId) {
        // Clear all item selects
        document.querySelectorAll('.item-select').forEach(select => {
            select.innerHTML = '<option value="">Select Item</option>';
        });
        items = [];
        return Promise.resolve();
    }
    
    return fetch(`/api/items?supplier_id=${supplierId}&include_no_supplier=true`)
        .then(response => response.json())
        .then(data => {
            items = data;
            // Update all item selects
            const selects = document.querySelectorAll('.item-select');
            selects.forEach(select => {
                const currentValue = select.value;
                select.innerHTML = '<option value="">Select Item</option>';
                data.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.id;
                    option.textContent = `${item.code} - ${item.name}`;
                    select.appendChild(option);
                });
                // Restore previous selection if still available
                if (currentValue && data.find(i => i.id == currentValue)) {
                    select.value = currentValue;
                }
            });
            return data;
        })
        .catch(error => {
            console.error('Error loading items:', error);
            items = [];
            return [];
        });
}

function loadItems() {
    // This function is kept for backward compatibility but now requires supplier selection
    const supplierId = document.getElementById('saleSupplier')?.value;
    if (!supplierId) {
        items = [];
        return;
    }
    loadSupplierItems();
}

function renderSalesTable(sales) {
    const tbody = document.getElementById('salesTableBody');
    
    if (sales.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="empty-state">No sales found</td></tr>';
        return;
    }
    
    tbody.innerHTML = sales.map(sale => {
        const isChecked = selectedSales.has(sale.id);
        return `
        <tr>
            <td>
                <input type="checkbox" class="sale-checkbox" data-sale-id="${sale.id}" 
                       ${isChecked ? 'checked' : ''} 
                       onchange="toggleSaleSelection(${sale.id}, this.checked)">
            </td>
            <td>${sale.invoice_number}</td>
            <td>${sale.date}</td>
            <td>${sale.customer_name}</td>
            <td>${sale.supplier_name || '-'}</td>
            <td class="currency">${formatCurrency(sale.total_amount)}</td>
            <td class="currency">${formatCurrency(sale.paid_amount)}</td>
            <td class="currency">${formatCurrency(sale.balance)}</td>
            <td><span class="badge badge-${sale.payment_type.toLowerCase()}">${sale.payment_type}</span></td>
            <td><span class="badge badge-${sale.status.toLowerCase()}">${sale.status}</span></td>
            <td>
                <div class="action-btns">
                    <button class="btn-icon btn-view" onclick="showSaleInvoice(${sale.id})" title="Show Invoice">👁️</button>
                    <button class="btn-icon btn-edit" onclick="editSale(${sale.id})" title="Edit">✏️</button>
                    <button class="btn-icon btn-delete" onclick="deleteSale(${sale.id})" title="Delete">🗑️</button>
                </div>
            </td>
        </tr>
    `;
    }).join('');
    
    updateSelectAllCheckbox();
    updateDeleteButton();
    
    // Restore sort state after table is rendered
    setTimeout(() => {
        const table = document.getElementById('salesTable');
        if (table) {
            restoreTableSort(table);
        }
    }, 150);
}

function openAddSaleModal() {
    document.getElementById('modalTitle').textContent = 'Add Sale';
    document.getElementById('saleId').value = '';
    document.getElementById('saleForm').reset();
    document.getElementById('saleDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('saleSupplier').value = '';
    document.getElementById('salePaidAmount').value = '';
    document.getElementById('saleItems').innerHTML = '';
    document.getElementById('saleTotal').value = '';
    document.getElementById('saleBalance').value = '';
    items = [];
    addItemRow();
    document.getElementById('saleModal').style.display = 'block';
}

function closeSaleModal() {
    document.getElementById('saleModal').style.display = 'none';
}

function addItemRow() {
    const container = document.getElementById('saleItems');
    const row = document.createElement('div');
    row.className = 'sale-item-row';
    row.style.cssText = 'display: grid; grid-template-columns: 2fr 1fr 1fr 1fr auto; gap: 10px; margin-bottom: 10px;';
    
    const itemSelect = document.createElement('select');
    itemSelect.className = 'item-select';
    itemSelect.required = true;
    itemSelect.innerHTML = '<option value="">Select Item</option>';
    items.forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = `${item.code} - ${item.name}`;
        itemSelect.appendChild(option);
    });
    
    const quantityInput = document.createElement('input');
    quantityInput.type = 'number';
    quantityInput.className = 'item-quantity';
    quantityInput.placeholder = 'Qty';
    quantityInput.step = '0.01';
    quantityInput.required = true;
    
    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.className = 'item-price';
    priceInput.placeholder = 'Unit Price';
    priceInput.step = '0.01';
    priceInput.required = true;
    
    const totalInput = document.createElement('input');
    totalInput.type = 'text';
    totalInput.className = 'item-total';
    totalInput.placeholder = 'Total';
    totalInput.readOnly = true;
    
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-danger btn-sm';
    removeBtn.textContent = '×';
    removeBtn.onclick = function() { removeItemRow(this); };
    
    row.appendChild(itemSelect);
    row.appendChild(quantityInput);
    row.appendChild(priceInput);
    row.appendChild(totalInput);
    row.appendChild(removeBtn);
    
    container.appendChild(row);
}

function removeItemRow(button) {
    button.parentElement.remove();
    calculateSaleTotal();
}

function calculateItemTotal(input) {
    const row = input.closest('.sale-item-row');
    const quantity = parseFloat(row.querySelector('.item-quantity').value) || 0;
    const price = parseFloat(row.querySelector('.item-price').value) || 0;
    const total = quantity * price;
    row.querySelector('.item-total').value = total.toFixed(2);
}

function calculateSaleTotal() {
    const rows = document.querySelectorAll('.sale-item-row');
    let total = 0;
    rows.forEach(row => {
        const totalInput = row.querySelector('.item-total');
        total += parseFloat(totalInput.value) || 0;
    });
    document.getElementById('saleTotal').value = formatCurrency(total);
    updateSaleBalance();
}

function updateSaleBalance() {
    const total = parseFloat(document.getElementById('saleTotal').value.replace(/[^\d.-]/g, '')) || 0;
    const paid = parseFloat(document.getElementById('salePaidAmount').value) || 0;
    const balance = total - paid;
    document.getElementById('saleBalance').value = formatCurrency(balance);
}

function saveSale() {
    const saleId = document.getElementById('saleId').value;
    const items = [];
    
    document.querySelectorAll('.sale-item-row').forEach(row => {
        const itemId = row.querySelector('.item-select').value;
        const quantity = row.querySelector('.item-quantity').value;
        const price = row.querySelector('.item-price').value;
        
        if (itemId && quantity && price) {
            items.push({
                item_id: parseInt(itemId),
                quantity: parseFloat(quantity),
                unit_price: parseFloat(price)
            });
        }
    });
    
    if (items.length === 0) {
        alert('Please add at least one item');
        return;
    }
    
    const customerId = document.getElementById('saleCustomer').value;
    if (!customerId) {
        alert('Please select a customer');
        return;
    }
    
    const saleDate = document.getElementById('saleDate').value;
    if (!saleDate) {
        alert('Please select a date');
        return;
    }
    
    const supplierId = document.getElementById('saleSupplier').value;
    const paidAmount = parseFloat(document.getElementById('salePaidAmount').value) || 0;
    
    const saleData = {
        date: saleDate,
        customer_id: parseInt(customerId),
        items: items,
        paid_amount: paidAmount,
        notes: document.getElementById('saleNotes').value || ''
    };
    
    // Add supplier_id only if it's provided (it's optional)
    if (supplierId) {
        saleData.supplier_id = parseInt(supplierId);
    }
    
    const url = saleId ? `/api/sales/${saleId}` : '/api/sales';
    const method = saleId ? 'PUT' : 'POST';
    
    fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(saleData)
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.error || `Server error: ${response.status}`);
            });
        }
        return response.json();
    })
    .then(data => {
        if (data.error) {
            alert('Error: ' + data.error);
        } else {
            closeSaleModal();
            loadSales();
            showNotification('Sale saved successfully', 'success');
        }
    })
    .catch(error => {
        console.error('Error saving sale:', error);
        alert('Error saving sale: ' + error.message);
    });
}

function editSale(saleId) {
    fetch(`/api/sales/${saleId}`)
        .then(response => {
            if (!response.ok) {
                return response.json().then(data => {
                    throw new Error(data.error || 'Failed to load sale');
                });
            }
            return response.json();
        })
        .then(sale => {
            if (sale.error) {
                alert('Error: ' + sale.error);
                return;
            }
            
            document.getElementById('modalTitle').textContent = 'Edit Sale';
            document.getElementById('saleId').value = sale.id;
            document.getElementById('saleDate').value = sale.date;
            document.getElementById('saleCustomer').value = sale.customer_id;
            document.getElementById('salePaidAmount').value = sale.paid_amount || 0;
            document.getElementById('saleNotes').value = sale.notes || '';
            
            // Set supplier and load items
            if (sale.supplier_id) {
                document.getElementById('saleSupplier').value = sale.supplier_id;
                // Load items for this supplier
                loadSupplierItems().then(() => {
                    // After items are loaded, populate the sale items
                    document.getElementById('saleItems').innerHTML = '';
                    if (sale.items && sale.items.length > 0) {
                        sale.items.forEach(item => {
                            addItemRow();
                            const lastRow = document.querySelector('.sale-item-row:last-child');
                            const itemSelect = lastRow.querySelector('.item-select');
                            itemSelect.value = item.item_id;
                            lastRow.querySelector('.item-quantity').value = item.quantity;
                            lastRow.querySelector('.item-price').value = item.unit_price;
                            calculateItemTotal(lastRow.querySelector('.item-quantity'));
                        });
                    }
                    calculateSaleTotal();
                    updateSaleBalance();
                }).catch(error => {
                    console.error('Error loading supplier items:', error);
                    alert('Error loading items for supplier');
                });
            } else {
                // No supplier - clear items
                document.getElementById('saleItems').innerHTML = '';
                alert('Warning: This sale has no supplier assigned. Please select a supplier.');
            }
            
            document.getElementById('saleModal').style.display = 'block';
        })
        .catch(error => {
            console.error('Error loading sale:', error);
            alert('Error loading sale: ' + error.message);
        });
}

function deleteSale(saleId) {
    if (!confirm('Are you sure you want to delete this sale?')) {
        return;
    }
    
    fetch(`/api/sales/${saleId}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert('Error: ' + data.error);
        } else {
            selectedSales.delete(saleId);
            loadSales();
            showNotification('Sale deleted successfully', 'success');
        }
    })
    .catch(error => {
        console.error('Error deleting sale:', error);
        alert('Error deleting sale');
    });
}

function toggleSaleSelection(saleId, isChecked) {
    if (isChecked) {
        selectedSales.add(saleId);
    } else {
        selectedSales.delete(saleId);
    }
    updateSelectAllCheckbox();
    updateDeleteButton();
}

function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const checkboxes = document.querySelectorAll('.sale-checkbox');
    const isChecked = selectAllCheckbox.checked;
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = isChecked;
        const saleId = parseInt(checkbox.getAttribute('data-sale-id'));
        if (isChecked) {
            selectedSales.add(saleId);
        } else {
            selectedSales.delete(saleId);
        }
    });
    
    updateDeleteButton();
}

function updateSelectAllCheckbox() {
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const checkboxes = document.querySelectorAll('.sale-checkbox');
    
    if (checkboxes.length === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
        return;
    }
    
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    
    if (checkedCount === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    } else if (checkedCount === checkboxes.length) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    }
}

function updateDeleteButton() {
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    if (selectedSales.size > 0) {
        deleteBtn.style.display = 'inline-block';
        deleteBtn.textContent = `🗑️ Delete Selected (${selectedSales.size})`;
    } else {
        deleteBtn.style.display = 'none';
    }
}

function deleteSelectedSales() {
    if (selectedSales.size === 0) {
        alert('No sales selected');
        return;
    }
    
    const count = selectedSales.size;
    if (!confirm(`Are you sure you want to delete ${count} sale(s)?\n\nThis action cannot be undone.`)) {
        return;
    }
    
    const salesToDelete = Array.from(selectedSales);
    let deletedCount = 0;
    let errorCount = 0;
    let errors = [];
    
    // Delete sales one by one
    const deletePromises = salesToDelete.map(saleId => {
        return fetch(`/api/sales/${saleId}`, {
            method: 'DELETE'
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                errorCount++;
                errors.push(`Sale ID ${saleId}: ${data.error}`);
            } else {
                deletedCount++;
                selectedSales.delete(saleId);
            }
        })
        .catch(error => {
            errorCount++;
            errors.push(`Sale ID ${saleId}: ${error.message}`);
        });
    });
    
    Promise.all(deletePromises).then(() => {
        let message = `Deleted ${deletedCount} sale(s)`;
        if (errorCount > 0) {
            message += `\n\n${errorCount} sale(s) could not be deleted:\n${errors.slice(0, 5).join('\n')}`;
            if (errors.length > 5) {
                message += `\n... and ${errors.length - 5} more`;
            }
        }
        alert(message);
        
        // Reload sales
        loadSales();
        if (deletedCount > 0) {
            showNotification(`Deleted ${deletedCount} sale(s) successfully`, 'success');
        }
    });
}

function applyFilters() {
    loadSales();
}

function clearFilters() {
    document.getElementById('filterStartDate').value = '';
    document.getElementById('filterEndDate').value = '';
    document.getElementById('filterCustomer').value = '';
    document.getElementById('filterSupplier').value = '';
    loadSales();
}

function openSalesImportModal() {
    const modal = document.getElementById('salesImportModal');
    if (!modal) return;
    const form = document.getElementById('importSalesForm');
    if (form) form.reset();
    modal.style.display = 'block';
    // focus file input
    const fileInput = document.getElementById('salesExcelFile');
    if (fileInput) fileInput.focus();
}

function closeSalesImportModal() {
    const modal = document.getElementById('salesImportModal');
    if (modal) modal.style.display = 'none';
}

// Import Sales from Excel
document.addEventListener('DOMContentLoaded', function() {
    const importForm = document.getElementById('importSalesForm');
    if (importForm) {
        importForm.addEventListener('submit', function(e) {
            e.preventDefault();
            importSales();
        });
    }
    const importBtn = document.getElementById('salesImportBtn');
    if (importBtn) {
        importBtn.addEventListener('click', openSalesImportModal);
    }
});

function importSales() {
    const fileInput = document.getElementById('salesExcelFile');
    if (!fileInput || !fileInput.files || !fileInput.files.length) {
        alert('Please select an Excel file');
        return;
    }

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);

    const submitBtn = document.querySelector('#importSalesForm button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Importing...';

    fetch('/api/sales/import', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(data => { throw new Error(data.error || 'Import failed'); });
        }
        return response.json();
    })
    .then(data => {
        let message = `Imported sales: ${data.sales_created}, items: ${data.items_created}`;
        if (data.errors && data.errors.length > 0) {
            message += `\nErrors:\n${data.errors.slice(0, 5).join('\n')}`;
            if (data.errors.length > 5) {
                message += `\n... and ${data.errors.length - 5} more`;
            }
        }
        alert(message);
        closeSalesImportModal();
        loadSales();
        showNotification('Sales import completed', 'success');
    })
    .catch(error => {
        console.error('Error importing sales:', error);
        alert('Error importing sales: ' + error.message);
    })
    .finally(() => {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        document.getElementById('importSalesForm').reset();
    });
}

function updateSalesTotal(total, count) {
    let totalBox = document.getElementById('salesTotalBox');
    
    // Create total box if it doesn't exist
    if (!totalBox) {
        totalBox = document.createElement('div');
        totalBox.id = 'salesTotalBox';
        totalBox.style.cssText = 'background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;';
        
        const tableContainer = document.querySelector('.table-container');
        if (tableContainer) {
            tableContainer.parentNode.insertBefore(totalBox, tableContainer);
        }
    }
    
    if (total !== null && total !== undefined) {
        totalBox.innerHTML = `
            <div style="display: flex; align-items: center; gap: 20px;">
                <div>
                    <strong style="color: #1e3a5f; font-size: 16px;">Total Sales Amount:</strong>
                    <span style="color: #4caf50; font-size: 18px; font-weight: bold; margin-left: 10px;">${formatCurrency(total)}</span>
                </div>
                <div style="color: #666; font-size: 14px;">
                    (${count} ${count === 1 ? 'sale' : 'sales'})
                </div>
            </div>
        `;
    } else {
        totalBox.innerHTML = `
            <div style="display: flex; align-items: center; gap: 20px;">
                <div>
                    <strong style="color: #1e3a5f; font-size: 16px;">Total Sales Amount:</strong>
                    <span style="color: #999; font-size: 18px; font-weight: bold; margin-left: 10px;">-</span>
                </div>
                <div style="color: #666; font-size: 14px;">
                    (${count} ${count === 1 ? 'sale' : 'sales'})
                </div>
            </div>
        `;
    }
}

let currentMarket = null;

function loadCurrentMarket() {
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

function showSaleInvoice(saleId) {
    // First ensure market is loaded, then load sale
    const marketPromise = currentMarket ? Promise.resolve(currentMarket) : loadCurrentMarket();
    
    Promise.all([
        marketPromise,
        fetch(`/api/sales/${saleId}`)
            .then(response => {
                if (!response.ok) {
                    return response.json().then(data => {
                        throw new Error(data.error || 'Failed to load sale');
                    });
                }
                return response.json();
            })
    ])
    .then(([market, sale]) => {
        if (sale.error) {
            alert('Error: ' + sale.error);
            return;
        }
        
        displayInvoice(sale);
    })
    .catch(error => {
        console.error('Error loading sale:', error);
        alert('Error loading sale: ' + error.message);
    });
}

function displayInvoice(sale) {
    const invoiceContent = document.getElementById('invoiceContent');
    const market = currentMarket || { name: 'Market', address: '', base_currency: 'USD' };
    
    // Format date
    const saleDate = new Date(sale.date).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    // Calculate totals
    const itemsTotal = sale.items.reduce((sum, item) => sum + item.total_price, 0);
    
    // Build invoice HTML
    let invoiceHTML = `
        <div id="invoiceToPrint" style="font-family: Arial, sans-serif; color: #333;">
            <!-- Header -->
            <div style="text-align: center; margin-bottom: 30px; border-bottom: 3px solid #1e3a5f; padding-bottom: 20px;">
                <h1 style="color: #1e3a5f; margin: 0 0 10px 0; font-size: 28px;">SARI TEXTILE WAREHOUSES</h1>
                <p style="margin: 5px 0; color: #666; font-size: 14px;">${market.address || ''}</p>
                <h2 style="color: #1e3a5f; margin: 20px 0 0 0; font-size: 22px;">SALES INVOICE</h2>
            </div>
            
            <!-- Invoice Details -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px;">
                <div>
                    <h3 style="color: #1e3a5f; margin: 0 0 10px 0; font-size: 16px; border-bottom: 2px solid #1e3a5f; padding-bottom: 5px;">Invoice Details</h3>
                    <p style="margin: 5px 0;"><strong>Invoice No:</strong> ${sale.invoice_number}</p>
                    <p style="margin: 5px 0;"><strong>Date:</strong> ${saleDate}</p>
                    <p style="margin: 5px 0;"><strong>Payment Type:</strong> <span class="badge badge-${sale.payment_type.toLowerCase()}">${sale.payment_type}</span></p>
                    <p style="margin: 5px 0;"><strong>Status:</strong> <span class="badge badge-${sale.status.toLowerCase()}">${sale.status}</span></p>
                </div>
                <div>
                    <h3 style="color: #1e3a5f; margin: 0 0 10px 0; font-size: 16px; border-bottom: 2px solid #1e3a5f; padding-bottom: 5px;">Customer Information</h3>
                    <p style="margin: 5px 0;"><strong>Customer:</strong> ${sale.customer_name}</p>
                    ${sale.supplier_name ? `<p style="margin: 5px 0;"><strong>Supplier:</strong> ${sale.supplier_name}</p>` : ''}
                </div>
            </div>
            
            <!-- Items Table -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <thead>
                    <tr style="background-color: #1e3a5f; color: white;">
                        <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">#</th>
                        <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Item Code</th>
                        <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">Item Name</th>
                        <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Quantity</th>
                        <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Unit Price</th>
                        <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">Total</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    sale.items.forEach((item, index) => {
        invoiceHTML += `
                    <tr style="border-bottom: 1px solid #ddd;">
                        <td style="padding: 10px; border: 1px solid #ddd;">${index + 1}</td>
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
                            <td style="padding: 8px; text-align: right; border: 1px solid #ddd;"><strong>Subtotal:</strong></td>
                            <td style="padding: 8px; text-align: right; border: 1px solid #ddd; font-weight: bold;">${formatCurrency(itemsTotal)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; text-align: right; border: 1px solid #ddd;"><strong>Total Amount:</strong></td>
                            <td style="padding: 8px; text-align: right; border: 1px solid #ddd; font-weight: bold; font-size: 18px; color: #1e3a5f;">${formatCurrency(sale.total_amount)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; text-align: right; border: 1px solid #ddd;"><strong>Paid Amount:</strong></td>
                            <td style="padding: 8px; text-align: right; border: 1px solid #ddd; font-weight: bold; color: #4caf50;">${formatCurrency(sale.paid_amount)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; text-align: right; border: 1px solid #ddd;"><strong>Balance:</strong></td>
                            <td style="padding: 8px; text-align: right; border: 1px solid #ddd; font-weight: bold; color: ${sale.balance > 0 ? '#f44336' : '#4caf50'};">${formatCurrency(sale.balance)}</td>
                        </tr>
                    </table>
                </div>
            </div>
    `;
    
    if (sale.notes) {
        invoiceHTML += `
            <div style="margin-top: 20px; padding: 15px; background-color: #f5f5f5; border-radius: 5px;">
                <strong>Notes:</strong>
                <p style="margin: 5px 0 0 0; color: #666;">${sale.notes}</p>
            </div>
        `;
    }
    
    invoiceHTML += `
        </div>
    `;
    
    invoiceContent.innerHTML = invoiceHTML;
    document.getElementById('saleInvoiceModal').style.display = 'block';
}

function closeSaleInvoiceModal() {
    document.getElementById('saleInvoiceModal').style.display = 'none';
}

function printInvoice() {
    const invoiceContent = document.getElementById('invoiceToPrint');
    if (!invoiceContent) {
        alert('Invoice content not found');
        return;
    }
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Invoice - ${document.getElementById('invoiceContent').querySelector('h2')?.textContent || 'Sale Invoice'}</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 20px;
                    color: #333;
                }
                .badge {
                    display: inline-block;
                    padding: 4px 10px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 500;
                }
                .badge-cash {
                    background-color: #4caf50;
                    color: white;
                }
                .badge-credit {
                    background-color: #ff9800;
                    color: white;
                }
                .badge-paid {
                    background-color: #4caf50;
                    color: white;
                }
                .badge-unpaid {
                    background-color: #f44336;
                    color: white;
                }
                .badge-partial {
                    background-color: #ff9800;
                    color: white;
                }
                @media print {
                    body {
                        margin: 0;
                    }
                }
            </style>
        </head>
        <body>
            ${invoiceContent.innerHTML}
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 250);
}

// Load market info on page load
document.addEventListener('DOMContentLoaded', function() {
    loadCurrentMarket();
    
    // Close invoice modal when clicking outside
    window.addEventListener('click', function(event) {
        const modal = document.getElementById('saleInvoiceModal');
        if (event.target == modal) {
            closeSaleInvoiceModal();
        }
    });
});
