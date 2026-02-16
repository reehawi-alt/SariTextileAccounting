// Companies page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    loadCompanies();
    makeSortable(document.getElementById('companiesTable'));
    
    document.getElementById('companyForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveCompany();
    });
});

function loadCompanies() {
    const category = document.getElementById('filterCategory').value;
    let url = '/api/companies';
    if (category) url += `?category=${category}`;
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            renderCompaniesTable(data);
        })
        .catch(error => {
            console.error('Error loading companies:', error);
        });
}

function renderCompaniesTable(companies) {
    const tbody = document.getElementById('companiesTableBody');
    
    if (companies.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No companies found</td></tr>';
        document.getElementById('totalBalancesSummary').style.display = 'none';
        return;
    }
    
    tbody.innerHTML = companies.map(company => `
        <tr>
            <td>${company.name}</td>
            <td>${company.address || ''}</td>
            <td>${company.category}</td>
            <td>${company.payment_type || '-'}</td>
            <td>${company.currency}</td>
            <td class="currency">${formatCurrency(company.balance, company.currency)}</td>
            <td>
                <div class="action-btns">
                    <button class="btn-icon btn-edit" onclick="editCompany(${company.id})" title="Edit">✏️</button>
                    <button class="btn-icon btn-delete" onclick="deleteCompany(${company.id})" title="Delete">🗑️</button>
                    <button class="btn-icon btn-edit" onclick="viewStatement(${company.id})" title="Statement">📄</button>
                </div>
            </td>
        </tr>
    `).join('');
    
    // Calculate and display total balances by currency
    calculateTotalBalances(companies);
    
    // Restore sort state after table is rendered
    setTimeout(() => {
        const table = document.getElementById('companiesTable');
        if (table) {
            restoreTableSort(table);
        }
    }, 150);
}

function calculateTotalBalances(companies) {
    // Group balances by currency
    const balancesByCurrency = {};
    const countByCurrency = {};
    
    companies.forEach(company => {
        const currency = company.currency || 'Unknown';
        if (!balancesByCurrency[currency]) {
            balancesByCurrency[currency] = 0;
            countByCurrency[currency] = 0;
        }
        balancesByCurrency[currency] += company.balance || 0;
        countByCurrency[currency] += 1;
    });
    
    // Get the filtered category
    const category = document.getElementById('filterCategory').value;
    const categoryLabel = category || 'All Categories';
    const totalCount = companies.length;
    
    // Display the summary
    const summaryDiv = document.getElementById('totalBalancesSummary');
    const gridDiv = document.getElementById('totalBalancesGrid');
    
    if (Object.keys(balancesByCurrency).length === 0) {
        summaryDiv.style.display = 'none';
        return;
    }
    
    summaryDiv.style.display = 'block';
    
    // Create summary items for each currency
    gridDiv.innerHTML = `
        <div class="report-summary-item" style="border: 2px solid #1e3a5f; background: var(--bg-secondary);">
            <label>Total Companies (${categoryLabel})</label>
            <div class="value" style="color: #1e3a5f;">${totalCount}</div>
        </div>
    `;
    
    gridDiv.innerHTML += Object.entries(balancesByCurrency)
        .map(([currency, total]) => `
            <div class="report-summary-item">
                <label>Total Balance (${currency})</label>
                <div class="value">${formatCurrency(total, currency)}</div>
                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
                    ${countByCurrency[currency]} ${countByCurrency[currency] === 1 ? 'company' : 'companies'}
                </div>
            </div>
        `).join('');
}

function openAddCompanyModal() {
    document.getElementById('modalTitle').textContent = 'Add Company';
    document.getElementById('companyId').value = '';
    document.getElementById('companyForm').reset();
    document.getElementById('paymentTypeGroup').style.display = 'none';
    document.getElementById('companyModal').style.display = 'block';
}

function closeCompanyModal() {
    document.getElementById('companyModal').style.display = 'none';
}

function togglePaymentType() {
    const category = document.getElementById('companyCategory').value;
    const paymentTypeGroup = document.getElementById('paymentTypeGroup');
    if (category === 'Customer') {
        paymentTypeGroup.style.display = 'block';
    } else {
        paymentTypeGroup.style.display = 'none';
    }
}

function saveCompany() {
    const companyId = document.getElementById('companyId').value;
    const data = {
        name: document.getElementById('companyName').value,
        address: document.getElementById('companyAddress').value,
        category: document.getElementById('companyCategory').value,
        payment_type: document.getElementById('companyPaymentType').value || null,
        currency: document.getElementById('companyCurrency').value
    };
    
    const url = companyId ? `/api/companies/${companyId}` : '/api/companies';
    const method = companyId ? 'PUT' : 'POST';
    
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
            closeCompanyModal();
            loadCompanies();
            showNotification('Company saved successfully', 'success');
        }
    })
    .catch(error => {
        console.error('Error saving company:', error);
        alert('Error saving company');
    });
}

function editCompany(companyId) {
    fetch(`/api/companies/${companyId}`)
        .then(response => response.json())
        .then(company => {
            document.getElementById('modalTitle').textContent = 'Edit Company';
            document.getElementById('companyId').value = company.id;
            document.getElementById('companyName').value = company.name;
            document.getElementById('companyAddress').value = company.address || '';
            document.getElementById('companyCategory').value = company.category;
            document.getElementById('companyPaymentType').value = company.payment_type || '';
            document.getElementById('companyCurrency').value = company.currency;
            togglePaymentType();
            document.getElementById('companyModal').style.display = 'block';
        })
        .catch(error => {
            console.error('Error loading company:', error);
            alert('Error loading company');
        });
}

function deleteCompany(companyId) {
    if (!confirm('Are you sure you want to delete this company?')) {
        return;
    }
    
    fetch(`/api/companies/${companyId}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert('Error: ' + data.error);
        } else {
            loadCompanies();
            showNotification('Company deleted successfully', 'success');
        }
    })
    .catch(error => {
        console.error('Error deleting company:', error);
        alert('Error deleting company');
    });
}

function viewStatement(companyId) {
    window.location.href = `/companies/${companyId}/statement`;
}

