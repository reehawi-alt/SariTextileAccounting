// Items page JavaScript

let itemsSummary = [];
let suppliers = [];
let selectedItems = new Set();

document.addEventListener('DOMContentLoaded', function() {
    loadSuppliers();
    loadItemsSummary();
    makeSortable(document.getElementById('itemsTable'));
    
    document.getElementById('itemForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveItem();
    });
    
    document.getElementById('importForm').addEventListener('submit', function(e) {
        e.preventDefault();
        importItems();
    });
});

function loadSuppliers() {
    fetch('/api/companies?category=Supplier')
        .then(response => response.json())
        .then(data => {
            suppliers = data;
            const select = document.getElementById('filterSupplier');
            // Keep the "ALL" option and add suppliers
            data.forEach(supplier => {
                const option = document.createElement('option');
                option.value = supplier.id;
                option.textContent = supplier.name;
                select.appendChild(option);
            });
        })
        .catch(error => console.error('Error loading suppliers:', error));
}

function loadItemsSummary(supplierId = null, nameFilter = '') {
    let url = '/api/items/summary';
    if (supplierId) {
        url += `?supplier_id=${supplierId}`;
    }
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            // Filter by name/code if provided
            let filteredData = data;
            if (nameFilter) {
                filteredData = data.filter(item => {
                    const name = (item.name || '').toLowerCase();
                    const code = (item.code || '').toLowerCase();
                    return name.includes(nameFilter) || code.includes(nameFilter);
                });
            }
            
            itemsSummary = filteredData;
            renderItemsTable(filteredData);
        })
        .catch(error => {
            console.error('Error loading items:', error);
        });
}

function applyFilters() {
    const supplierId = document.getElementById('filterSupplier').value;
    const nameFilter = document.getElementById('filterName').value.trim().toLowerCase();
    
    // Load items and then filter by name
    loadItemsSummary(supplierId || null, nameFilter);
}

function clearFilters() {
    document.getElementById('filterSupplier').value = '';
    document.getElementById('filterName').value = '';
    loadItemsSummary();
}

function applySupplierFilter() {
    applyFilters();
}

function clearSupplierFilter() {
    clearFilters();
}

function renderItemsTable(items) {
    const tbody = document.getElementById('itemsTableBody');
    
    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="empty-state">No items found</td></tr>';
        selectedItems.clear();
        updateRemoveButton();
        updateItemCounts(items.length);
        return;
    }
    
    // Create supplier lookup map
    const supplierMap = {};
    suppliers.forEach(s => supplierMap[s.id] = s.name);
    
    tbody.innerHTML = items.map(item => {
        const isSelected = selectedItems.has(item.id);
        return `
        <tr onclick="viewMovement(${item.id}, '${encodeURIComponent(item.code)}', '${encodeURIComponent(item.name)}')" style="cursor: pointer;">
            <td onclick="event.stopPropagation();">
                <input type="checkbox" class="item-checkbox" data-item-id="${item.id}" 
                       ${isSelected ? 'checked' : ''} 
                       onchange="toggleItemSelection(${item.id}, this.checked)">
            </td>
            <td>${item.code}</td>
            <td>${item.name}</td>
            <td>${item.supplier_id ? (supplierMap[item.supplier_id] || 'N/A') : 'N/A'}</td>
            <td>${item.weight}</td>
            <td>${item.grade || '-'}</td>
            <td>${item.category1 || '-'}</td>
            <td>${item.category2 || '-'}</td>
            <td>${(item.total_purchases || 0).toFixed(2)}</td>
            <td>${(item.total_sales || 0).toFixed(2)}</td>
            <td>${(item.available_quantity || 0).toFixed(2)}</td>
            <td onclick="event.stopPropagation();">
                <div class="action-btns">
                    <button class="btn-icon btn-edit" onclick="editItem(${item.id})" title="Edit">✏️</button>
                    <button class="btn-icon btn-delete" onclick="deleteItem(${item.id})" title="Delete">🗑️</button>
                </div>
            </td>
        </tr>
    `;
    }).join('');
    
    updateSelectAllCheckbox();
    updateRemoveButton();
    updateItemCounts(items.length);
    
    // Restore sort state after table is rendered
    setTimeout(() => {
        const table = document.getElementById('itemsTable');
        if (table) {
            restoreTableSort(table);
        }
    }, 150);
}

function toggleItemSelection(itemId, isChecked) {
    if (isChecked) {
        selectedItems.add(itemId);
    } else {
        selectedItems.delete(itemId);
    }
    updateSelectAllCheckbox();
    updateRemoveButton();
    updateSelectedCount();
}

function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const checkboxes = document.querySelectorAll('.item-checkbox');
    const isChecked = selectAllCheckbox.checked;
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = isChecked;
        const itemId = parseInt(checkbox.getAttribute('data-item-id'));
        if (isChecked) {
            selectedItems.add(itemId);
        } else {
            selectedItems.delete(itemId);
        }
    });
    
    updateRemoveButton();
    updateSelectedCount();
}

function updateSelectAllCheckbox() {
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const checkboxes = document.querySelectorAll('.item-checkbox');
    
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

function updateRemoveButton() {
    const removeBtn = document.getElementById('removeSelectedBtn');
    if (selectedItems.size > 0) {
        removeBtn.style.display = 'inline-block';
        removeBtn.textContent = `🗑️ Remove Selected (${selectedItems.size})`;
    } else {
        removeBtn.style.display = 'none';
    }
    updateSelectedCount();
}

function updateItemCounts(totalItems) {
    const totalEl = document.getElementById('totalItemsCount');
    if (totalEl) totalEl.textContent = totalItems || 0;
    updateSelectedCount();
}

function updateSelectedCount() {
    const selectedEl = document.getElementById('selectedItemsCount');
    if (selectedEl) selectedEl.textContent = selectedItems.size || 0;
}
function removeSelectedItems() {
    if (selectedItems.size === 0) {
        alert('No items selected');
        return;
    }
    
    const count = selectedItems.size;
    if (!confirm(`Are you sure you want to delete ${count} item(s)?\n\nThis action cannot be undone.`)) {
        return;
    }
    
    const itemsToDelete = Array.from(selectedItems);
    let deletedCount = 0;
    let errorCount = 0;
    let errors = [];
    
    // Delete items one by one
    const deletePromises = itemsToDelete.map(itemId => {
        return fetch(`/api/items/${itemId}`, {
            method: 'DELETE'
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                errorCount++;
                errors.push(`Item ID ${itemId}: ${data.error}`);
            } else {
                deletedCount++;
                selectedItems.delete(itemId);
            }
        })
        .catch(error => {
            errorCount++;
            errors.push(`Item ID ${itemId}: ${error.message}`);
        });
    });
    
    Promise.all(deletePromises).then(() => {
        let message = `Deleted ${deletedCount} item(s)`;
        if (errorCount > 0) {
            message += `\n\n${errorCount} item(s) could not be deleted:\n${errors.slice(0, 5).join('\n')}`;
            if (errors.length > 5) {
                message += `\n... and ${errors.length - 5} more`;
            }
        }
        alert(message);
        
        // Reload items
        const supplierId = document.getElementById('filterSupplier').value;
        loadItemsSummary(supplierId || null);
        showNotification(`${deletedCount} item(s) deleted successfully`, 'success');
    });
}

function viewMovement(itemId, codeEnc, nameEnc) {
    window.location.href = `/reports?report=inventory&item_id=${itemId}&item_code=${codeEnc}&item_name=${nameEnc}`;
}

function openAddItemModal() {
    document.getElementById('itemModalTitle').textContent = 'Add Item';
    document.getElementById('itemId').value = '';
    document.getElementById('itemForm').reset();
    document.getElementById('itemModal').style.display = 'block';
}

function closeItemModal() {
    document.getElementById('itemModal').style.display = 'none';
}

function openImportModal() {
    document.getElementById('importModal').style.display = 'block';
}

function closeImportModal() {
    document.getElementById('importModal').style.display = 'none';
}

function saveItem() {
    const itemId = document.getElementById('itemId').value;
    const data = {
        code: document.getElementById('itemCode').value,
        name: document.getElementById('itemName').value,
        weight: parseFloat(document.getElementById('itemWeight').value),
        grade: document.getElementById('itemGrade').value || null,
        category1: document.getElementById('itemCategory1').value || null,
        category2: document.getElementById('itemCategory2').value || null
    };
    
    const url = itemId ? `/api/items/${itemId}` : '/api/items';
    const method = itemId ? 'PUT' : 'POST';
    
    fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert('Error: ' + data.error);
        } else {
            closeItemModal();
            loadItemsSummary();
            showNotification('Item saved successfully', 'success');
        }
    })
    .catch(error => {
        console.error('Error saving item:', error);
        alert('Error saving item');
    });
}

function editItem(itemId) {
    fetch(`/api/items/${itemId}`)
        .then(response => response.json())
        .then(item => {
            document.getElementById('itemModalTitle').textContent = 'Edit Item';
            document.getElementById('itemId').value = item.id;
            document.getElementById('itemCode').value = item.code;
            document.getElementById('itemName').value = item.name;
            document.getElementById('itemWeight').value = item.weight;
            document.getElementById('itemGrade').value = item.grade || '';
            document.getElementById('itemCategory1').value = item.category1 || '';
            document.getElementById('itemCategory2').value = item.category2 || '';
            document.getElementById('itemModal').style.display = 'block';
        })
        .catch(error => {
            console.error('Error loading item:', error);
            alert('Error loading item');
        });
}

function deleteItem(itemId) {
    if (!confirm('Are you sure you want to delete this item?')) {
        return;
    }
    
    fetch(`/api/items/${itemId}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert('Error: ' + data.error);
        } else {
            loadItemsSummary();
            showNotification('Item deleted successfully', 'success');
        }
    })
    .catch(error => {
        console.error('Error deleting item:', error);
        alert('Error deleting item');
    });
}

function importItems() {
    const fileInput = document.getElementById('excelFile');
    if (!fileInput || !fileInput.files || !fileInput.files.length) {
        alert('Please select a file');
        return;
    }
    
    const file = fileInput.files[0];
    if (!file) {
        alert('Please select a file');
        return;
    }
    
    // Validate file type
    const validExtensions = ['.xlsx', '.xls'];
    const fileName = file.name.toLowerCase();
    const isValidFile = validExtensions.some(ext => fileName.endsWith(ext));
    
    if (!isValidFile) {
        alert('Please select a valid Excel file (.xlsx or .xls)');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    // Show loading state
    const submitBtn = document.querySelector('#importForm button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Importing...';
    
    fetch('/api/items/import', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.error || 'Import failed');
            });
        }
        return response.json();
    })
    .then(data => {
        if (data.error) {
            alert('Error: ' + data.error);
        } else {
            let message = '';
            if (data.imported > 0) {
                message = `Successfully imported ${data.imported} new item(s)`;
            } else {
                message = 'No new items were imported';
            }
            
            if (data.errors && data.errors.length > 0) {
                message += `\n\nSkipped ${data.errors.length} item(s) (duplicates or errors):\n${data.errors.slice(0, 5).join('\n')}`;
                if (data.errors.length > 5) {
                    message += `\n... and ${data.errors.length - 5} more`;
                }
            }
            alert(message);
            closeImportModal();
            
            // Reload items with current filters
            const supplierId = document.getElementById('filterSupplier').value;
            const nameFilter = document.getElementById('filterName').value.trim().toLowerCase();
            loadItemsSummary(supplierId || null, nameFilter);
            
            if (data.imported > 0) {
                showNotification(`Imported ${data.imported} item(s) successfully`, 'success');
            }
        }
    })
    .catch(error => {
        console.error('Error importing items:', error);
        alert('Error importing items: ' + error.message);
    })
    .finally(() => {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        // Reset form
        document.getElementById('importForm').reset();
    });
}

// Navigate to item movement report
function viewMovement(itemId) {
    window.location.href = `/reports?report=inventory&item_id=${itemId}`;
}

function exportItems() {
    const supplierId = document.getElementById('filterSupplier').value;
    
    let url = '/api/items/export?';
    if (supplierId) {
        url += `supplier_id=${supplierId}&`;
    }
    
    // Create a temporary link and trigger download
    const link = document.createElement('a');
    link.href = url;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification('Export started. File will download shortly.', 'success');
}
