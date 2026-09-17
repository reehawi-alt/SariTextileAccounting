// General Expenses page JavaScript

let categories = [];
let marketBaseCurrency = null;

function formatLocalYMD(d) {
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

function defaultExpensePeriodDates() {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 1);
    return { start: formatLocalYMD(start), end: formatLocalYMD(end) };
}

document.addEventListener('DOMContentLoaded', function() {
    const period = defaultExpensePeriodDates();
    document.getElementById('expenseStartDate').value = period.start;
    document.getElementById('expenseEndDate').value = period.end;
    
    loadExpenses();
    loadCategories();
    makeSortable(document.getElementById('expensesTable'));
    
    // Form submission
    document.getElementById('expenseForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveExpense();
    });
    
    // Set default date
    document.getElementById('expenseDate').value = new Date().toISOString().split('T')[0];
    
    // Load market base currency
    loadMarketCurrency();
    
    // Import form
    const importForm = document.getElementById('importExpensesForm');
    if (importForm) {
        importForm.addEventListener('submit', function(e) {
            e.preventDefault();
            importExpenses();
        });
    }
});

function loadMarketCurrency() {
    fetch('/api/current-market')
        .then(response => response.json())
        .then(data => {
            if (data.base_currency) {
                marketBaseCurrency = data.base_currency;
                document.getElementById('expenseCurrency').value = data.base_currency;
            }
        })
        .catch(error => console.error('Error loading market:', error));
}

function escapeExpenseHtml(text) {
    if (text == null || text === '') return '';
    const d = document.createElement('div');
    d.textContent = String(text);
    return d.innerHTML;
}

function escapeExpenseAttr(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

function getSelectedExpenseCategories() {
    return Array.from(document.querySelectorAll('.expense-category-filter-cb:checked')).map(cb => cb.value);
}

function renderExpenseCategoryFilter() {
    const wrap = document.getElementById('expenseCategoryFilterWrap');
    if (!wrap) return;
    const selected = new Set(getSelectedExpenseCategories());
    if (categories.length === 0) {
        wrap.innerHTML = '<span style="color:var(--text-secondary,#666);font-size:0.9em;">No categories yet.</span>';
        return;
    }
    wrap.innerHTML = categories.map(cat => {
        const checked = selected.has(cat) ? ' checked' : '';
        return `<label class="expense-category-chip"><input type="checkbox" class="expense-category-filter-cb expense-category-chip-input" value="${escapeExpenseAttr(cat)}"${checked}><span class="expense-category-chip-label">${escapeExpenseHtml(cat)}</span></label>`;
    }).join('');
}

function selectAllExpenseFilterCategories() {
    document.querySelectorAll('.expense-category-filter-cb').forEach(cb => { cb.checked = true; });
}

function clearExpenseFilterCategories() {
    document.querySelectorAll('.expense-category-filter-cb').forEach(cb => { cb.checked = false; });
}

function loadExpenses() {
    const startDate = document.getElementById('expenseStartDate').value;
    const endDate = document.getElementById('expenseEndDate').value;
    
    let url = '/api/expenses?';
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    getSelectedExpenseCategories().forEach(cat => {
        url += `category=${encodeURIComponent(cat)}&`;
    });
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            // Handle both old format (array) and new format (object with expenses array)
            const expenses = Array.isArray(data) ? data : data.expenses;
            const total = Array.isArray(data) ? null : data.total_base_currency;
            const totalUsd = Array.isArray(data) ? null : data.total_usd;
            const count = Array.isArray(data) ? data.length : data.count;
            
            renderExpensesTable(expenses);
            updateExpensesTotal(total, totalUsd, count);
        })
        .catch(error => {
            console.error('Error loading expenses:', error);
            document.getElementById('expensesTableBody').innerHTML = '<tr><td colspan="6" class="empty-state">Error loading expenses</td></tr>';
            updateExpensesTotal(null, null, 0);
        });
}

function loadCategories() {
    fetch('/api/expenses/categories')
        .then(response => response.json())
        .then(data => {
            categories = data;
            const formSelect = document.getElementById('expenseCategory');
            formSelect.innerHTML = '<option value="">Select or Type Category</option>';
            data.forEach(category => {
                const formOption = document.createElement('option');
                formOption.value = category;
                formOption.textContent = category;
                formSelect.appendChild(formOption);
            });
            renderExpenseCategoryFilter();
        })
        .catch(error => console.error('Error loading categories:', error));
}

function renderExpensesTable(expenses) {
    const tbody = document.getElementById('expensesTableBody');
    
    if (expenses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No expenses found</td></tr>';
        return;
    }
    
    tbody.innerHTML = expenses.map(expense => `
        <tr>
            <td>${expense.date}</td>
            <td>${expense.description}</td>
            <td><span class="badge badge-unpaid">${expense.category}</span></td>
            <td class="currency">${formatCurrency(expense.amount, expense.currency)}</td>
            <td class="text-right currency" title="${expense.usd_rate_from_safe_statement ? `Safe Statement rate: ${expense.usd_rate} (base per USD)` : `No Safe Statement rate for this date; using default ${expense.usd_rate}`}">${expense.approx_usd != null ? formatCurrency(expense.approx_usd, 'USD') : '-'}</td>
            <td>
                <div class="action-btns">
                    <button class="btn-icon btn-edit" onclick="editExpense(${expense.id})" title="Edit">✏️</button>
                    <button class="btn-icon btn-delete" onclick="deleteExpense(${expense.id})" title="Delete">🗑️</button>
                </div>
            </td>
        </tr>
    `).join('');
    
    // Restore sort state after table is rendered
    setTimeout(() => {
        const table = document.getElementById('expensesTable');
        if (table) {
            restoreTableSort(table);
        }
    }, 150);
}

function updateExpensesTotal(total, totalUsd, count) {
    let totalBox = document.getElementById('expensesTotalBox');
    
    // Create total box if it doesn't exist
    if (!totalBox) {
        totalBox = document.createElement('div');
        totalBox.id = 'expensesTotalBox';
        totalBox.style.cssText = 'background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;';
        
        const tableContainer = document.querySelector('.table-container');
        if (tableContainer) {
            tableContainer.parentNode.insertBefore(totalBox, tableContainer);
        }
    }

    function renderTotals(baseCurrency) {
        const baseTotalHtml = total !== null && total !== undefined
            ? formatCurrency(total, baseCurrency)
            : '-';
        const usdTotalHtml = totalUsd !== null && totalUsd !== undefined
            ? formatCurrency(totalUsd, 'USD')
            : '-';
        totalBox.innerHTML = `
            <div>
                <strong>Total Expenses (${count} ${count === 1 ? 'expense' : 'expenses'}):</strong>
            </div>
            <div style="display: flex; gap: 24px; flex-wrap: wrap; align-items: center;">
                <div style="font-size: 18px; font-weight: bold; color: #d32f2f;">
                    ${baseTotalHtml}
                </div>
                <div style="font-size: 18px; font-weight: bold; color: #1565c0;">
                    ≈USD Total: ${usdTotalHtml}
                </div>
            </div>
        `;
    }
    
    if (total !== null && total !== undefined) {
        if (marketBaseCurrency) {
            renderTotals(marketBaseCurrency);
        } else {
            fetch('/api/current-market')
                .then(response => response.json())
                .then(data => {
                    marketBaseCurrency = data.base_currency || 'USD';
                    renderTotals(marketBaseCurrency);
                })
                .catch(() => {
                    renderTotals('');
                });
        }
    } else {
        totalBox.innerHTML = `
            <div>
                <strong>Total Expenses:</strong>
            </div>
            <div style="display: flex; gap: 24px; flex-wrap: wrap; align-items: center;">
                <div style="font-size: 18px; font-weight: bold; color: #d32f2f;">-</div>
                <div style="font-size: 18px; font-weight: bold; color: #1565c0;">≈USD Total: -</div>
            </div>
        `;
    }
}

function openAddExpenseModal() {
    document.getElementById('expenseModalTitle').textContent = 'Add Expense';
    document.getElementById('expenseId').value = '';
    document.getElementById('expenseForm').reset();
    document.getElementById('expenseDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('expenseExchangeRate').value = '1';
    loadMarketCurrency();
    document.getElementById('expenseModal').style.display = 'block';
}

function editExpense(expenseId) {
    fetch(`/api/expenses/${expenseId}`)
        .then(response => response.json())
        .then(expense => {
            if (expense.error) {
                alert('Error: ' + expense.error);
                return;
            }
            document.getElementById('expenseModalTitle').textContent = 'Edit Expense';
            document.getElementById('expenseId').value = expense.id;
            document.getElementById('expenseDate').value = expense.date;
            document.getElementById('expenseDescription').value = expense.description;
            document.getElementById('expenseCategory').value = expense.category;
            document.getElementById('expenseAmount').value = expense.amount;
            document.getElementById('expenseCurrency').value = expense.currency;
            document.getElementById('expenseExchangeRate').value = expense.exchange_rate;
            document.getElementById('expenseModal').style.display = 'block';
        })
        .catch(error => {
            console.error('Error loading expense:', error);
            alert('Error loading expense');
        });
}

function closeExpenseModal() {
    document.getElementById('expenseModal').style.display = 'none';
}

function saveExpense() {
    const expenseId = document.getElementById('expenseId').value;
    const expenseData = {
        date: document.getElementById('expenseDate').value,
        description: document.getElementById('expenseDescription').value,
        category: document.getElementById('expenseCategory').value,
        amount: parseFloat(document.getElementById('expenseAmount').value),
        currency: document.getElementById('expenseCurrency').value,
        exchange_rate: parseFloat(document.getElementById('expenseExchangeRate').value) || 1
    };
    
    if (!expenseData.category) {
        alert('Please select or enter a category');
        return;
    }
    
    const url = expenseId ? `/api/expenses/${expenseId}` : '/api/expenses';
    const method = expenseId ? 'PUT' : 'POST';
    
    fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(expenseData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert('Error: ' + data.error);
        } else {
            closeExpenseModal();
            loadExpenses();
            loadCategories(); // Reload categories in case new one was added
            showNotification('Expense saved successfully', 'success');
        }
    })
    .catch(error => {
        console.error('Error saving expense:', error);
        alert('Error saving expense: ' + error.message);
    });
}

function deleteExpense(expenseId) {
    if (!confirm('Are you sure you want to delete this expense?')) {
        return;
    }
    
    fetch(`/api/expenses/${expenseId}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert('Error: ' + data.error);
        } else {
            loadExpenses();
            showNotification('Expense deleted successfully', 'success');
        }
    })
    .catch(error => {
        console.error('Error deleting expense:', error);
        alert('Error deleting expense');
    });
}

function addNewCategory() {
    const categoryInput = prompt('Enter new category name:');
    if (categoryInput && categoryInput.trim()) {
        const category = categoryInput.trim();
        const select = document.getElementById('expenseCategory');
        
        // Check if category already exists
        const existingOption = Array.from(select.options).find(opt => opt.value === category);
        if (existingOption) {
            select.value = category;
            return;
        }
        
        // Add new option
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        select.appendChild(option);
        select.value = category;
    }
}

function clearExpenseFilters() {
    const period = defaultExpensePeriodDates();
    document.getElementById('expenseStartDate').value = period.start;
    document.getElementById('expenseEndDate').value = period.end;
    clearExpenseFilterCategories();
    loadExpenses();
}

function openImportModal() {
    document.getElementById('importExpensesForm').reset();
    document.getElementById('importModal').style.display = 'block';
}

function closeImportModal() {
    document.getElementById('importModal').style.display = 'none';
}

function exportExpenses() {
    const startDate = document.getElementById('expenseStartDate').value;
    const endDate = document.getElementById('expenseEndDate').value;
    
    let url = '/api/expenses/export?';
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    getSelectedExpenseCategories().forEach(cat => {
        url += `category=${encodeURIComponent(cat)}&`;
    });
    
    // Create a temporary link and trigger download
    const link = document.createElement('a');
    link.href = url;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification('Export started. File will download shortly.', 'success');
}

function importExpenses() {
    const fileInput = document.getElementById('expensesExcelFile');
    if (!fileInput || !fileInput.files || !fileInput.files.length) {
        alert('Please select an Excel file');
        return;
    }

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);

    const submitBtn = document.querySelector('#importExpensesForm button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Importing...';

    fetch('/api/expenses/import', {
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
        let message = `Imported expenses: ${data.expenses_created}`;
        if (data.errors && data.errors.length > 0) {
            message += `\nErrors:\n${data.errors.slice(0, 5).join('\n')}`;
            if (data.errors.length > 5) {
                message += `\n... and ${data.errors.length - 5} more`;
            }
        }
        alert(message);
        closeImportModal();
        loadExpenses();
        loadCategories(); // Reload categories in case new ones were added
        showNotification('Expenses import completed', 'success');
    })
    .catch(error => {
        console.error('Error importing expenses:', error);
        alert('Error importing expenses: ' + error.message);
    })
    .finally(() => {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        document.getElementById('importExpensesForm').reset();
    });
}

