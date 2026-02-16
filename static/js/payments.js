// Payments page JavaScript

let companies = [];
let sales = [];

document.addEventListener('DOMContentLoaded', function() {
    // Load market info to get base currency
    fetch('/api/current-market')
        .then(response => response.json())
        .then(data => {
            if (data && data.base_currency) {
                baseCurrency = data.base_currency;
            }
            loadPayments();
        })
        .catch(() => {
            // If market API fails, just load payments with default currency
            loadPayments();
        });
    
    loadCompanies();
    makeSortable(document.getElementById('paymentsTable'));
    
    // Form submission
    document.getElementById('paymentForm').addEventListener('submit', function(e) {
        e.preventDefault();
        savePayment();
    });
    
    // Set default date (from 2020-01-01 to today for filters)
    document.getElementById('paymentDate').value = new Date().toISOString().split('T')[0];
    
    // Calculate exchange rate when amounts change
    const paymentAmount = document.getElementById('paymentAmount');
    const paymentAmountBase = document.getElementById('paymentAmountBase');
    const paymentExchangeRate = document.getElementById('paymentExchangeRate');
    
    function calculateExchangeRate() {
        const amount = parseFloat(paymentAmount.value) || 0;
        const amountBase = parseFloat(paymentAmountBase.value) || 0;
        
        if (amount > 0 && amountBase > 0) {
            const rate = amountBase / amount;
            paymentExchangeRate.value = rate.toFixed(4);
        } else {
            paymentExchangeRate.value = '';
        }
    }
    
    paymentAmount.addEventListener('input', calculateExchangeRate);
    paymentAmountBase.addEventListener('input', calculateExchangeRate);
    
    // Auto-populate currency and set default payment type from company when company is selected
    document.getElementById('paymentCompany').addEventListener('change', function() {
        const companyId = this.value;
        if (companyId) {
            const company = companies.find(c => c.id == companyId);
            if (company) {
                document.getElementById('paymentCurrency').value = company.currency;
                // Set default payment type based on company category (but allow manual override)
                const paymentTypeSelect = document.getElementById('paymentType');
                if (paymentTypeSelect && !paymentTypeSelect.value) {
                    if (company.category === 'Customer') {
                        paymentTypeSelect.value = 'In'; // Default: receiving payment from customer
                    } else if (company.category === 'Supplier' || company.category === 'Service Company') {
                        paymentTypeSelect.value = 'Out'; // Default: paying supplier/service
                    }
                }
            }
        }
    });
    
    // Import form
    const importForm = document.getElementById('importPaymentsForm');
    if (importForm) {
        importForm.addEventListener('submit', function(e) {
            e.preventDefault();
            importPayments();
        });
    }
});

function loadPayments() {
    const companyId = document.getElementById('filterCompany')?.value || '';
    
    let url = '/api/payments';
    if (companyId) {
        url += `?company_id=${companyId}`;
    }
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            renderPaymentsTable(data);
        })
        .catch(error => {
            console.error('Error loading payments:', error);
        });
}

function loadCompanies() {
    fetch('/api/companies')
        .then(response => response.json())
        .then(data => {
            companies = data;
            const select = document.getElementById('paymentCompany');
            const filterSelect = document.getElementById('filterCompany');
            
            // Populate both dropdowns
            [select, filterSelect].forEach(selectElement => {
                if (selectElement) {
                    // Clear existing options except first one
                    const firstOption = selectElement.querySelector('option[value=""]');
                    selectElement.innerHTML = '';
                    if (firstOption) {
                        selectElement.appendChild(firstOption);
                    } else {
                        const defaultOption = document.createElement('option');
                        defaultOption.value = '';
                        defaultOption.textContent = selectElement.id === 'filterCompany' ? 'All Companies' : 'Select Company';
                        selectElement.appendChild(defaultOption);
                    }
                    
                    data.forEach(company => {
                        const option = document.createElement('option');
                        option.value = company.id;
                        option.textContent = company.name;
                        selectElement.appendChild(option);
                    });
                }
            });
        })
        .catch(error => console.error('Error loading companies:', error));
}

let baseCurrency = 'CFA'; // Default, will be updated when market is loaded

function renderPaymentsTable(payments) {
    const tbody = document.getElementById('paymentsTableBody');
    
    if (payments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No payments found</td></tr>';
        return;
    }
    
    tbody.innerHTML = payments.map(payment => `
        <tr>
            <td>${payment.date}</td>
            <td>${payment.company_name}</td>
            <td><span class="badge ${payment.payment_type === 'In' ? 'badge-paid' : 'badge-unpaid'}">${payment.payment_type}</span></td>
            <td class="currency">${formatCurrency(payment.amount, payment.currency)}</td>
            <td>${payment.currency}</td>
            <td class="currency">${formatCurrency(payment.amount_base_currency || 0, baseCurrency)}</td>
            <td class="text-right">${(payment.exchange_rate || 0).toFixed(4)}</td>
            <td>${payment.invoice_number || '-'}</td>
            <td>
                <div class="action-btns">
                    <button class="btn-icon btn-edit" onclick="editPayment(${payment.id})" title="Edit">✏️</button>
                    <button class="btn-icon btn-delete" onclick="deletePayment(${payment.id})" title="Delete">🗑️</button>
                </div>
            </td>
        </tr>
    `).join('');
    
    // Restore sort state after table is rendered
    setTimeout(() => {
        const table = document.getElementById('paymentsTable');
        if (table) {
            restoreTableSort(table);
        }
    }, 150);
}

function openAddPaymentModal() {
    document.getElementById('paymentModalTitle').textContent = 'Add Payment';
    document.getElementById('paymentId').value = '';
    document.getElementById('paymentForm').reset();
    document.getElementById('paymentDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('paymentAmount').value = '';
    document.getElementById('paymentAmountBase').value = '';
    document.getElementById('paymentExchangeRate').value = '';
    document.getElementById('paymentLoan').checked = false;
    document.getElementById('paymentModal').style.display = 'block';
}

function editPayment(paymentId) {
    fetch(`/api/payments/${paymentId}`)
        .then(response => response.json())
        .then(payment => {
            if (payment.error) {
                alert('Error: ' + payment.error);
                return;
            }
            document.getElementById('paymentModalTitle').textContent = 'Edit Payment';
            document.getElementById('paymentId').value = payment.id;
            document.getElementById('paymentDate').value = payment.date;
            document.getElementById('paymentCompany').value = payment.company_id;
            document.getElementById('paymentType').value = payment.payment_type;
            document.getElementById('paymentAmount').value = payment.amount;
            // Use the exact stored amount_base_currency value (not recalculated)
            document.getElementById('paymentAmountBase').value = payment.amount_base_currency.toFixed(2);
            document.getElementById('paymentCurrency').value = payment.currency;
            document.getElementById('paymentExchangeRate').value = payment.exchange_rate;
            document.getElementById('paymentInvoice').value = payment.invoice_number || '';
            document.getElementById('paymentNotes').value = payment.notes || '';
            document.getElementById('paymentLoan').checked = payment.loan || false;
            document.getElementById('paymentModal').style.display = 'block';
        })
        .catch(error => {
            console.error('Error loading payment:', error);
            alert('Error loading payment');
        });
}

function closePaymentModal() {
    document.getElementById('paymentModal').style.display = 'none';
}

function savePayment() {
    const paymentId = document.getElementById('paymentId').value;
    const invoiceNumber = document.getElementById('paymentInvoice').value;
    
    let saleId = null;
    if (invoiceNumber) {
        // Find sale by invoice number
        const sale = sales.find(s => s.invoice_number === invoiceNumber);
        if (sale) {
            saleId = sale.id;
        }
    }
    
    const amount = parseFloat(document.getElementById('paymentAmount').value);
    const amountBase = parseFloat(document.getElementById('paymentAmountBase').value);
    
    // Validate amounts
    if (!amount || amount <= 0) {
        alert('Please enter a valid amount in original currency');
        return;
    }
    if (!amountBase || amountBase <= 0) {
        alert('Please enter a valid amount in base currency');
        return;
    }
    
    const paymentData = {
        date: document.getElementById('paymentDate').value,
        company_id: parseInt(document.getElementById('paymentCompany').value),
        payment_type: document.getElementById('paymentType').value,
        amount: amount,
        currency: document.getElementById('paymentCurrency').value,
        amount_base_currency: amountBase,
        notes: document.getElementById('paymentNotes').value,
        loan: document.getElementById('paymentLoan').checked,
        sale_id: saleId
    };
    
    const url = paymentId ? `/api/payments/${paymentId}` : '/api/payments';
    const method = paymentId ? 'PUT' : 'POST';
    
    fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(paymentData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert('Error: ' + data.error);
        } else {
            closePaymentModal();
            loadPayments();
            showNotification('Payment saved successfully', 'success');
        }
    })
    .catch(error => {
        console.error('Error saving payment:', error);
        alert('Error saving payment');
    });
}

function deletePayment(paymentId) {
    if (!confirm('Are you sure you want to delete this payment?')) {
        return;
    }
    
    fetch(`/api/payments/${paymentId}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert('Error: ' + data.error);
        } else {
            loadPayments();
            showNotification('Payment deleted successfully', 'success');
        }
    })
    .catch(error => {
        console.error('Error deleting payment:', error);
        alert('Error deleting payment');
    });
}

function openImportModal() {
    document.getElementById('importPaymentsForm').reset();
    document.getElementById('importModal').style.display = 'block';
}

function closeImportModal() {
    document.getElementById('importModal').style.display = 'none';
}

function clearPaymentFilters() {
    document.getElementById('filterCompany').value = '';
    loadPayments();
}

function exportPayments() {
    // Get current filter values if any filters exist
    const companyId = document.getElementById('paymentCompanyFilter')?.value || '';
    const paymentType = document.getElementById('paymentTypeFilter')?.value || '';
    const startDate = document.getElementById('paymentStartDate')?.value || '';
    const endDate = document.getElementById('paymentEndDate')?.value || '';
    
    let url = '/api/payments/export?';
    if (companyId) url += `company_id=${companyId}&`;
    if (paymentType) url += `payment_type=${paymentType}&`;
    if (startDate) url += `start_date=${startDate}&`;
    if (endDate) url += `end_date=${endDate}&`;
    
    // Create a temporary link and trigger download
    const link = document.createElement('a');
    link.href = url;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification('Export started. File will download shortly.', 'success');
}

function importPayments() {
    const fileInput = document.getElementById('paymentsExcelFile');
    if (!fileInput || !fileInput.files || !fileInput.files.length) {
        alert('Please select an Excel file');
        return;
    }

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);

    const submitBtn = document.querySelector('#importPaymentsForm button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Importing...';

    fetch('/api/payments/import', {
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
        let message = `Imported payments: ${data.payments_created}`;
        if (data.errors && data.errors.length > 0) {
            message += `\nErrors:\n${data.errors.slice(0, 5).join('\n')}`;
            if (data.errors.length > 5) {
                message += `\n... and ${data.errors.length - 5} more`;
            }
        }
        alert(message);
        closeImportModal();
        loadPayments();
        showNotification('Payments import completed', 'success');
    })
    .catch(error => {
        console.error('Error importing payments:', error);
        alert('Error importing payments: ' + error.message);
    })
    .finally(() => {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        document.getElementById('importPaymentsForm').reset();
    });
}
