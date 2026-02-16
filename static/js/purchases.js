// Purchases page JavaScript

let suppliers = [];
let items = [];

document.addEventListener('DOMContentLoaded', function() {
    loadPurchases();
    loadSuppliers();
    loadServiceCompanies();
    loadItems();
    makeSortable(document.getElementById('purchasesTable'));
    
    // Check for container_id in URL to open container modal
    const urlParams = new URLSearchParams(window.location.search);
    const containerId = urlParams.get('container_id');
    if (containerId) {
        // Wait for purchases to load, then open the container
        setTimeout(() => {
            editContainer(parseInt(containerId));
        }, 500);
    }
    
    // Form submission
    document.getElementById('containerForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveContainer();
    });
    
    // Calculate total on item changes
    document.addEventListener('input', function(e) {
        if (e.target.classList.contains('item-quantity') || e.target.classList.contains('item-price')) {
            calculateContainerItemTotal(e.target);
            calculateContainerTotals();
        }
        // Calculate total expenses when expense amounts change
        if (e.target.id === 'expense1Amount' || e.target.id === 'expense2Amount' || e.target.id === 'expense3Amount' ||
            e.target.id === 'expense2ExchangeRate' || e.target.id === 'expense3ExchangeRate' ||
            e.target.id === 'containerExchangeRate') {
            calculateTotalExpenses();
        }
    });
    
    // Set default date
    document.getElementById('containerDate').value = new Date().toISOString().split('T')[0];
    
    // Import form
    const form = document.getElementById('importPurchasesForm');
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            importPurchases();
        });
    }
});

function loadPurchases() {
    fetch('/api/purchases/containers')
        .then(response => response.json())
        .then(data => {
            renderPurchasesTable(data);
        })
        .catch(error => {
            console.error('Error loading purchases:', error);
        });
}

function loadSuppliers() {
    fetch('/api/companies?category=Supplier')
        .then(response => response.json())
        .then(data => {
            suppliers = data;
            const select = document.getElementById('containerSupplier');
            data.forEach(supplier => {
                const option = document.createElement('option');
                option.value = supplier.id;
                option.textContent = supplier.name;
                select.appendChild(option);
            });
        })
        .catch(error => console.error('Error loading suppliers:', error));
}

function loadServiceCompanies() {
    fetch('/api/companies?category=Service Company')
        .then(response => response.json())
        .then(data => {
            const select = document.getElementById('expense2ServiceCompany');
            data.forEach(company => {
                const option = document.createElement('option');
                option.value = company.id;
                option.textContent = company.name;
                select.appendChild(option);
            });
        })
        .catch(error => console.error('Error loading service companies:', error));
}

function loadItems() {
    fetch('/api/items')
        .then(response => response.json())
        .then(data => {
            items = data;
            const selects = document.querySelectorAll('.item-select');
            selects.forEach(select => {
                data.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.id;
                    option.textContent = `${item.code} - ${item.name}`;
                    select.appendChild(option);
                });
            });
        })
        .catch(error => console.error('Error loading items:', error));
}

function updatePurchasesCount(count) {
    const countEl = document.getElementById('totalPurchasesCount');
    if (countEl) countEl.textContent = count || 0;
}

function renderPurchasesTable(containers) {
    const tbody = document.getElementById('purchasesTableBody');
    
    // Update count
    updatePurchasesCount(containers.length);
    
    if (containers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No purchases found</td></tr>';
        return;
    }
    
    tbody.innerHTML = containers.map(container => `
        <tr>
            <td>${container.container_number}</td>
            <td>${container.date}</td>
            <td>${container.supplier_name}</td>
            <td>${container.currency}</td>
            <td>${container.exchange_rate.toFixed(4)}</td>
            <td class="currency">${formatCurrency(container.total_amount, container.currency)}</td>
            <td>
                <div class="action-btns">
                    <button class="btn-icon btn-edit" onclick="editContainer(${container.id})" title="Edit">✏️</button>
                    <button class="btn-icon btn-delete" onclick="deleteContainer(${container.id})" title="Delete">🗑️</button>
                    <button class="btn-icon btn-view" onclick="viewContainerReport(${container.supplier_id}, ${container.id})" title="View Container Report">📊</button>
                </div>
            </td>
        </tr>
    `).join('');
    
    // Restore sort state after table is rendered
    setTimeout(() => {
        const table = document.getElementById('purchasesTable');
        if (table) {
            restoreTableSort(table);
        }
    }, 150);
}

function openAddContainerModal() {
    document.getElementById('containerModalTitle').textContent = 'Add Container';
    document.getElementById('containerId').value = '';
    document.getElementById('containerForm').reset();
    document.getElementById('containerDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('containerItems').innerHTML = '';
    // Reset expense fields
    document.getElementById('expense1Amount').value = 0;
    document.getElementById('expense2Amount').value = 0;
    document.getElementById('expense2ServiceCompany').value = '';
    document.getElementById('expense2Currency').value = '';
    document.getElementById('expense2ExchangeRate').value = '';
    document.getElementById('expense3Amount').value = 0;
    document.getElementById('expense3Currency').value = '';
    document.getElementById('expense3ExchangeRate').value = '';
    addContainerItemRow();
    const modal = document.getElementById('containerModal');
    modal.style.display = 'block';
    // Use setTimeout to ensure modal is displayed before resetting position
    setTimeout(() => {
        resetContainerModalPosition();
    }, 10);
}

function closeContainerModal(event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    const modal = document.getElementById('containerModal');
    if (modal) {
        modal.style.display = 'none';
        // Reset modal position when closing
        setTimeout(() => {
            resetContainerModalPosition();
        }, 100);
    }
}

function addContainerItemRow() {
    const container = document.getElementById('containerItems');
    const row = document.createElement('div');
    row.className = 'container-item-row';
    row.style.cssText = 'display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1fr auto; gap: 10px; margin-bottom: 10px;';
    
    const itemSelect = document.createElement('select');
    itemSelect.className = 'item-select';
    itemSelect.required = true;
    itemSelect.innerHTML = '<option value="">Select Item</option>';
    items.forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = `${item.code} - ${item.name}`;
        option.dataset.weight = item.weight || 0;
        itemSelect.appendChild(option);
    });
    itemSelect.addEventListener('change', function() {
        updateItemWeight(this);
        calculateContainerItemTotal(this);
        calculateContainerTotals();
    });
    
    const quantityInput = document.createElement('input');
    quantityInput.type = 'number';
    quantityInput.className = 'item-quantity';
    quantityInput.placeholder = 'Qty';
    quantityInput.step = '0.01';
    quantityInput.required = true;
    quantityInput.addEventListener('input', function() {
        calculateContainerItemTotal(this);
        calculateContainerTotals();
    });
    
    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.className = 'item-price';
    priceInput.placeholder = 'Unit Price';
    priceInput.step = '0.01';
    priceInput.required = true;
    priceInput.addEventListener('input', function() {
        calculateContainerItemTotal(this);
    });
    
    const weightInput = document.createElement('input');
    weightInput.type = 'text';
    weightInput.className = 'item-weight';
    weightInput.placeholder = 'Unit Weight';
    weightInput.readOnly = true;
    
    const totalWeightInput = document.createElement('input');
    totalWeightInput.type = 'text';
    totalWeightInput.className = 'item-total-weight';
    totalWeightInput.placeholder = 'Total Weight';
    totalWeightInput.readOnly = true;
    
    const totalInput = document.createElement('input');
    totalInput.type = 'text';
    totalInput.className = 'item-total';
    totalInput.placeholder = 'Total';
    totalInput.readOnly = true;
    
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-danger btn-sm';
    removeBtn.textContent = '×';
    removeBtn.onclick = function() { removeContainerItemRow(this); };
    
    row.appendChild(itemSelect);
    row.appendChild(quantityInput);
    row.appendChild(priceInput);
    row.appendChild(weightInput);
    row.appendChild(totalWeightInput);
    row.appendChild(totalInput);
    row.appendChild(removeBtn);
    
    container.appendChild(row);
}

function updateItemWeight(select) {
    const row = select.closest('.container-item-row');
    const weightInput = row.querySelector('.item-weight');
    const selectedOption = select.options[select.selectedIndex];
    const weight = parseFloat(selectedOption.dataset.weight) || 0;
    weightInput.value = weight.toFixed(2);
    
    // Update total weight
    const quantity = parseFloat(row.querySelector('.item-quantity').value) || 0;
    const totalWeight = weight * quantity;
    row.querySelector('.item-total-weight').value = totalWeight.toFixed(2);
}

function removeContainerItemRow(button) {
    button.parentElement.remove();
    calculateContainerTotals();
}

function calculateContainerItemTotal(input) {
    const row = input.closest('.container-item-row');
    const quantity = parseFloat(row.querySelector('.item-quantity').value) || 0;
    const price = parseFloat(row.querySelector('.item-price').value) || 0;
    const total = quantity * price;
    row.querySelector('.item-total').value = total.toFixed(2);
    
    // Calculate total weight
    const weight = parseFloat(row.querySelector('.item-weight').value) || 0;
    const totalWeight = weight * quantity;
    row.querySelector('.item-total-weight').value = totalWeight.toFixed(2);
}

function calculateContainerTotal() {
    calculateContainerTotals();
}

function calculateContainerTotals() {
    const rows = document.querySelectorAll('.container-item-row');
    let total = 0;
    let totalUnits = 0;
    let totalWeight = 0;
    
    rows.forEach(row => {
        const totalInput = row.querySelector('.item-total');
        total += parseFloat(totalInput.value) || 0;
        
        const quantity = parseFloat(row.querySelector('.item-quantity').value) || 0;
        totalUnits += quantity;
        
        const rowTotalWeight = parseFloat(row.querySelector('.item-total-weight').value) || 0;
        totalWeight += rowTotalWeight;
    });
    
    document.getElementById('containerTotal').value = formatCurrency(total);
    document.getElementById('containerTotalUnits').value = totalUnits.toFixed(2);
    document.getElementById('containerTotalWeight').value = totalWeight.toFixed(2);
}

function calculateTotalExpenses() {
    const containerExchangeRate = parseFloat(document.getElementById('containerExchangeRate').value) || 1;
    const containerCurrency = document.getElementById('containerCurrency').value || '';
    
    // Expense 1 - always in container currency (no conversion needed)
    const expense1Amount = parseFloat(document.getElementById('expense1Amount').value) || 0;
    const expense1Supplier = expense1Amount; // Expense1 is always in container currency
    
    // Expense 2 - convert to supplier currency
    const expense2Amount = parseFloat(document.getElementById('expense2Amount').value) || 0;
    const expense2Currency = document.getElementById('expense2Currency').value || containerCurrency;
    const expense2ExchangeRate = parseFloat(document.getElementById('expense2ExchangeRate').value) || containerExchangeRate;
    let expense2Supplier = 0;
    if (expense2Amount > 0) {
        if (expense2Currency === containerCurrency) {
            // Already in supplier currency
            expense2Supplier = expense2Amount;
        } else {
            // Convert from base currency to supplier currency
            const expense2Base = expense2Amount * expense2ExchangeRate;
            expense2Supplier = expense2Base / containerExchangeRate;
        }
    }
    
    // Expense 3 - convert to supplier currency
    const expense3Amount = parseFloat(document.getElementById('expense3Amount').value) || 0;
    const expense3Currency = document.getElementById('expense3Currency').value || containerCurrency;
    const expense3ExchangeRate = parseFloat(document.getElementById('expense3ExchangeRate').value) || containerExchangeRate;
    let expense3Supplier = 0;
    if (expense3Amount > 0) {
        if (expense3Currency === containerCurrency) {
            // Already in supplier currency
            expense3Supplier = expense3Amount;
        } else {
            // Convert from base currency to supplier currency
            const expense3Base = expense3Amount * expense3ExchangeRate;
            expense3Supplier = expense3Base / containerExchangeRate;
        }
    }
    
    // Total expenses in supplier currency
    const totalExpenses = expense1Supplier + expense2Supplier + expense3Supplier;
    
    document.getElementById('totalExpenses').value = formatCurrency(totalExpenses, containerCurrency);
}

function saveContainer() {
    const containerId = document.getElementById('containerId').value;
    const items = [];
    
    document.querySelectorAll('.container-item-row').forEach(row => {
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
    
    const containerData = {
        container_number: document.getElementById('containerNumber').value,
        date: document.getElementById('containerDate').value,
        supplier_id: parseInt(document.getElementById('containerSupplier').value),
        currency: document.getElementById('containerCurrency').value,
        exchange_rate: parseFloat(document.getElementById('containerExchangeRate').value),
        items: items,
        notes: document.getElementById('containerNotes').value,
        // Expenses
        // Expense1 automatically uses container currency and exchange rate
        expense1_amount: parseFloat(document.getElementById('expense1Amount').value) || 0,
        expense1_currency: document.getElementById('containerCurrency').value.trim(), // Always use container currency
        expense1_exchange_rate: parseFloat(document.getElementById('containerExchangeRate').value), // Always use container exchange rate
        expense2_amount: parseFloat(document.getElementById('expense2Amount').value) || 0,
        expense2_service_company_id: document.getElementById('expense2ServiceCompany').value ? parseInt(document.getElementById('expense2ServiceCompany').value) : null,
        expense2_currency: document.getElementById('expense2Currency').value.trim() || null,
        expense2_exchange_rate: document.getElementById('expense2ExchangeRate').value.trim() ? parseFloat(document.getElementById('expense2ExchangeRate').value) : null,
        expense3_amount: parseFloat(document.getElementById('expense3Amount').value) || 0,
        expense3_currency: document.getElementById('expense3Currency').value.trim() || null,
        expense3_exchange_rate: document.getElementById('expense3ExchangeRate').value.trim() ? parseFloat(document.getElementById('expense3ExchangeRate').value) : null
    };
    
    const url = containerId ? `/api/purchases/containers/${containerId}` : '/api/purchases/containers';
    const method = containerId ? 'PUT' : 'POST';
    
    fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(containerData)
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => {
                throw new Error(err.error || `HTTP error! status: ${response.status}`);
            });
        }
        return response.json();
    })
    .then(data => {
        if (data.error) {
            alert('Error: ' + data.error);
        } else {
            closeContainerModal();
            loadPurchases();
            showNotification('Container saved successfully', 'success');
        }
    })
    .catch(error => {
        console.error('Error saving container:', error);
        console.error('Container data:', containerData);
        alert('Error saving container: ' + error.message);
    });
}

function editContainer(containerId) {
    fetch(`/api/purchases/containers/${containerId}`)
        .then(response => response.json())
        .then(container => {
            document.getElementById('containerModalTitle').textContent = 'Edit Container';
            document.getElementById('containerId').value = container.id;
            document.getElementById('containerNumber').value = container.container_number;
            document.getElementById('containerDate').value = container.date;
            document.getElementById('containerSupplier').value = container.supplier_id;
            document.getElementById('containerCurrency').value = container.currency;
            document.getElementById('containerExchangeRate').value = container.exchange_rate;
            document.getElementById('containerNotes').value = container.notes || '';
            
            // Load expenses
            // Expense1 always uses container currency and exchange rate (no separate fields)
            document.getElementById('expense1Amount').value = container.expense1_amount || 0;
            document.getElementById('expense2Amount').value = container.expense2_amount || 0;
            document.getElementById('expense2ServiceCompany').value = container.expense2_service_company_id || '';
            document.getElementById('expense2Currency').value = container.expense2_currency || '';
            document.getElementById('expense2ExchangeRate').value = container.expense2_exchange_rate ?? '';
            document.getElementById('expense3Amount').value = container.expense3_amount || 0;
            document.getElementById('expense3Currency').value = container.expense3_currency || '';
            document.getElementById('expense3ExchangeRate').value = container.expense3_exchange_rate ?? '';
            
            document.getElementById('containerItems').innerHTML = '';
            container.items.forEach(item => {
                addContainerItemRow();
                const lastRow = document.querySelector('.container-item-row:last-child');
                const itemSelect = lastRow.querySelector('.item-select');
                itemSelect.value = item.item_id;
                // Trigger change event to populate weight
                itemSelect.dispatchEvent(new Event('change'));
                lastRow.querySelector('.item-quantity').value = item.quantity;
                lastRow.querySelector('.item-price').value = item.unit_price;
                calculateContainerItemTotal(lastRow.querySelector('.item-quantity'));
            });
            calculateContainerTotals();
            calculateTotalExpenses();
            
            document.getElementById('containerModal').style.display = 'block';
            // Use setTimeout to ensure modal is displayed before resetting position
            setTimeout(() => {
                resetContainerModalPosition();
            }, 10);
        })
        .catch(error => {
            console.error('Error loading container:', error);
            alert('Error loading container');
        });
}

function deleteContainer(containerId) {
    if (!confirm('Are you sure you want to delete this container?')) {
        return;
    }
    
    fetch(`/api/purchases/containers/${containerId}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert('Error: ' + data.error);
        } else {
            loadPurchases();
            showNotification('Container deleted successfully', 'success');
        }
    })
    .catch(error => {
        console.error('Error deleting container:', error);
        alert('Error deleting container');
    });
}

function viewContainerReport(supplierId, containerId) {
    // Navigate to reports page with container report parameters
    window.location.href = `/reports?report=container&supplier_id=${supplierId}&container_id=${containerId}`;
}

function openImportModal() {
    document.getElementById('importPurchasesForm').reset();
    document.getElementById('importModal').style.display = 'block';
}

function closeImportModal() {
    document.getElementById('importModal').style.display = 'none';
}

// Draggable modal
document.addEventListener('DOMContentLoaded', function() {
    makeModalDraggable('containerModal', 'containerModalContent', 'containerModalHeader');
    
    // Close modal when clicking outside of it
    const modal = document.getElementById('containerModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            // If clicking the modal background (not the content), close it
            if (e.target === modal) {
                closeContainerModal(e);
            }
        });
    }
});

function resetContainerModalPosition() {
    const modalContent = document.getElementById('containerModalContent');
    if (!modalContent) return;
    modalContent.style.left = '50%';
    modalContent.style.top = '5vh';
    modalContent.style.transform = 'translate(-50%, 0)';
}

function makeModalDraggable(modalId, contentId, handleId) {
    const modal = document.getElementById(modalId);
    const content = document.getElementById(contentId);
    const handle = document.getElementById(handleId);
    if (!modal || !content || !handle) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    handle.addEventListener('mousedown', (e) => {
        // Don't start dragging if clicking on the close button or its children
        if (e.target.classList.contains('close') || e.target.closest('.close')) {
            e.stopPropagation();
            return;
        }
        // Don't start dragging if clicking on buttons or inputs
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
            return;
        }
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = content.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        content.style.transform = 'none';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        content.style.left = `${startLeft + dx}px`;
        content.style.top = `${startTop + dy}px`;
    });

    document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.userSelect = '';
    });
}

function importPurchases() {
    const fileInput = document.getElementById('purchasesExcelFile');
    if (!fileInput || !fileInput.files || !fileInput.files.length) {
        alert('Please select an Excel file');
        return;
    }

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);

    const submitBtn = document.querySelector('#importPurchasesForm button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Importing...';

    fetch('/api/purchases/containers/import', {
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
        let message = `Imported containers: ${data.containers_created}, items: ${data.items_created}`;
        if (data.errors && data.errors.length > 0) {
            message += `\nErrors:\n${data.errors.slice(0, 5).join('\n')}`;
            if (data.errors.length > 5) {
                message += `\n... and ${data.errors.length - 5} more`;
            }
        }
        alert(message);
        closeImportModal();
        loadPurchases();
        showNotification('Purchase import completed', 'success');
    })
    .catch(error => {
        console.error('Error importing purchases:', error);
        alert('Error importing purchases: ' + error.message);
    })
    .finally(() => {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        document.getElementById('importPurchasesForm').reset();
    });
}

function exportPurchases() {
    // Create a temporary link and trigger download
    const link = document.createElement('a');
    link.href = '/api/purchases/export';
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification('Export started. File will download shortly.', 'success');
}
