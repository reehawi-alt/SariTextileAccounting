// General Expenses page JavaScript

let categories = [];
let marketBaseCurrency = null;

document.addEventListener('DOMContentLoaded', function() {
    // Set default dates (from 2020-01-01 to today)
    const today = new Date();
    const firstDay = new Date('2020-01-01');
    document.getElementById('expenseStartDate').value = firstDay.toISOString().split('T')[0];
    document.getElementById('expenseEndDate').value = today.toISOString().split('T')[0];
    
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

function loadExpenses() {
    const startDate = document.getElementById('expenseStartDate').value;
    const endDate = document.getElementById('expenseEndDate').value;
    const category = document.getElementById('expenseCategoryFilter').value;
    
    let url = '/api/expenses?';
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    if (category) url += `category=${encodeURIComponent(category)}&`;
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            // Handle both old format (array) and new format (object with expenses array)
            const expenses = Array.isArray(data) ? data : data.expenses;
            const total = Array.isArray(data) ? null : data.total_base_currency;
            const count = Array.isArray(data) ? data.length : data.count;
            
            renderExpensesTable(expenses);
            updateExpensesTotal(total, count);
        })
        .catch(error => {
            console.error('Error loading expenses:', error);
            document.getElementById('expensesTableBody').innerHTML = '<tr><td colspan="6" class="empty-state">Error loading expenses</td></tr>';
            updateExpensesTotal(null, 0);
        });
}

function loadCategories() {
    fetch('/api/expenses/categories')
        .then(response => response.json())
        .then(data => {
            categories = data;
            const filterSelect = document.getElementById('expenseCategoryFilter');
            const formSelect = document.getElementById('expenseCategory');
            
            // Clear existing options (except first)
            filterSelect.innerHTML = '<option value="">All Categories</option>';
            formSelect.innerHTML = '<option value="">Select or Type Category</option>';
            
            data.forEach(category => {
                // Filter dropdown
                const filterOption = document.createElement('option');
                filterOption.value = category;
                filterOption.textContent = category;
                filterSelect.appendChild(filterOption);
                
                // Form dropdown
                const formOption = document.createElement('option');
                formOption.value = category;
                formOption.textContent = category;
                formSelect.appendChild(formOption);
            });
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
            <td>${expense.currency}</td>
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

function updateExpensesTotal(total, count) {
    let totalBox = document.getElementById('expensesTotalBox');
    
    // Create total box if it doesn't exist
    if (!totalBox) {
        totalBox = document.createElement('div');
        totalBox.id = 'expensesTotalBox';
        totalBox.style.cssText = 'background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;';
        
        const tableContainer = document.querySelector('.table-container');
        if (tableContainer) {
            tableContainer.parentNode.insertBefore(totalBox, tableContainer);
        }
    }
    
    if (total !== null && total !== undefined) {
        // Use cached currency if available, otherwise fetch
        if (marketBaseCurrency) {
            totalBox.innerHTML = `
                <div>
                    <strong>Total Expenses (${count} ${count === 1 ? 'expense' : 'expenses'}):</strong>
                </div>
                <div style="font-size: 18px; font-weight: bold; color: #d32f2f;">
                    ${formatCurrency(total, marketBaseCurrency)}
                </div>
            `;
        } else {
            // Get base currency from market
            fetch('/api/current-market')
                .then(response => response.json())
                .then(data => {
                    marketBaseCurrency = data.base_currency || 'USD';
                    totalBox.innerHTML = `
                        <div>
                            <strong>Total Expenses (${count} ${count === 1 ? 'expense' : 'expenses'}):</strong>
                        </div>
                        <div style="font-size: 18px; font-weight: bold; color: #d32f2f;">
                            ${formatCurrency(total, marketBaseCurrency)}
                        </div>
                    `;
                })
                .catch(() => {
                    // Fallback if API fails
                    totalBox.innerHTML = `
                        <div>
                            <strong>Total Expenses (${count} ${count === 1 ? 'expense' : 'expenses'}):</strong>
                        </div>
                        <div style="font-size: 18px; font-weight: bold; color: #d32f2f;">
                            ${parseFloat(total).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </div>
                    `;
                });
        }
    } else {
        totalBox.innerHTML = `
            <div>
                <strong>Total Expenses:</strong>
            </div>
            <div style="font-size: 18px; font-weight: bold; color: #d32f2f;">
                -
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
    const today = new Date();
    const firstDay = new Date('2020-01-01');
    document.getElementById('expenseStartDate').value = firstDay.toISOString().split('T')[0];
    document.getElementById('expenseEndDate').value = today.toISOString().split('T')[0];
    document.getElementById('expenseCategoryFilter').value = '';
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
    const category = document.getElementById('expenseCategoryFilter').value;
    
    let url = '/api/expenses/export?';
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    if (category) url += `category=${encodeURIComponent(category)}&`;
    
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

