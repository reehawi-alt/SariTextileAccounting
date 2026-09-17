let currentMarket = null;

function formatCurrency(n) {
    const x = parseFloat(n);
    if (isNaN(x)) return '0.00';
    return x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function loadCurrentMarket() {
    return fetch('/api/current-market')
        .then(r => r.json())
        .then(data => { currentMarket = data; return data; })
        .catch(() => null);
}

document.addEventListener('DOMContentLoaded', function() {
    const today = new Date();
    const start = new Date('2020-01-01');
    document.getElementById('fastFilterStartDate').value = start.toISOString().split('T')[0];
    document.getElementById('fastFilterEndDate').value = today.toISOString().split('T')[0];

    loadCustomersAndSuppliers();
    loadFastSales();

    document.getElementById('fastSaleForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveFastSale();
    });
    document.getElementById('fastImportForm').addEventListener('submit', function(e) {
        e.preventDefault();
        importFastSales();
    });
    document.addEventListener('input', function(e) {
        if (e.target.classList.contains('fast-line-qty') || e.target.classList.contains('fast-line-price')) {
            recalcFastLine(e.target.closest('.fast-line-row'));
            calculateFastSaleTotal();
        }
        if (e.target.id === 'fastSalePaidAmount') updateFastSaleBalance();
    });
});

function loadCustomersAndSuppliers() {
    Promise.all([
        fetch('/api/companies?category=Customer').then(r => r.json()),
        fetch('/api/companies?category=Supplier').then(r => r.json())
    ]).then(([customers, suppliers]) => {
        const fc = document.getElementById('fastFilterCustomer');
        const fs = document.getElementById('fastFilterSupplier');
        const sc = document.getElementById('fastSaleCustomer');
        const ss = document.getElementById('fastSaleSupplier');
        customers.forEach(c => {
            fc.appendChild(new Option(c.name, c.id));
            sc.appendChild(new Option(c.name, c.id));
        });
        suppliers.forEach(s => {
            fs.appendChild(new Option(s.name, s.id));
            ss.appendChild(new Option(s.name, s.id));
        });
    }).catch(console.error);
}

function fastSalesQueryUrl() {
    const s = document.getElementById('fastFilterStartDate').value;
    const e = document.getElementById('fastFilterEndDate').value;
    const c = document.getElementById('fastFilterCustomer').value;
    const sup = document.getElementById('fastFilterSupplier').value;
    let url = '/api/sales?fast_only=1&';
    if (s) url += `start_date=${encodeURIComponent(s)}&`;
    if (e) url += `end_date=${encodeURIComponent(e)}&`;
    if (c) url += `customer_id=${encodeURIComponent(c)}&`;
    if (sup) url += `supplier_id=${encodeURIComponent(sup)}&`;
    return url;
}

function loadFastSales() {
    const body = document.getElementById('fastSalesTableBody');
    body.innerHTML = '<tr><td colspan="10" class="empty-state"><div class="spinner"></div>Loading…</td></tr>';
    fetch(fastSalesQueryUrl())
        .then(r => r.json())
        .then(data => {
            if (data.error) {
                body.innerHTML = `<tr><td colspan="10" class="empty-state">${data.error}</td></tr>`;
                return;
            }
            const sales = data.sales || [];
            if (sales.length === 0) {
                body.innerHTML = '<tr><td colspan="10" class="empty-state">No fast sales in this range.</td></tr>';
                return;
            }
            body.innerHTML = sales.map(sale => `
                <tr>
                    <td>${sale.invoice_number}</td>
                    <td>${sale.date}</td>
                    <td>${sale.customer_name}</td>
                    <td>${sale.supplier_name || '—'}</td>
                    <td class="currency">${formatCurrency(sale.total_amount)}</td>
                    <td class="currency">${formatCurrency(sale.paid_amount)}</td>
                    <td class="currency">${formatCurrency(sale.balance)}</td>
                    <td><span class="badge badge-${sale.payment_type.toLowerCase()}">${sale.payment_type}</span></td>
                    <td><span class="badge badge-${sale.status.toLowerCase()}">${sale.status}</span></td>
                    <td>
                        <div class="action-btns">
                            <button type="button" class="btn-icon btn-view" onclick="showFastInvoice(${sale.id})" title="Invoice">👁️</button>
                            <button type="button" class="btn-icon btn-edit" onclick="editFastSale(${sale.id})" title="Edit">✏️</button>
                            <button type="button" class="btn-icon btn-delete" onclick="deleteFastSale(${sale.id})" title="Delete">🗑️</button>
                        </div>
                    </td>
                </tr>
            `).join('');
        })
        .catch(err => {
            console.error(err);
            body.innerHTML = '<tr><td colspan="10" class="empty-state">Error loading sales</td></tr>';
        });
}

function clearFastFilters() {
    document.getElementById('fastFilterStartDate').value = '';
    document.getElementById('fastFilterEndDate').value = '';
    document.getElementById('fastFilterCustomer').value = '';
    document.getElementById('fastFilterSupplier').value = '';
    loadFastSales();
}

function addFastLineRow(desc, qty, price) {
    const wrap = document.getElementById('fastSaleLines');
    const row = document.createElement('div');
    row.className = 'fast-line-row';
    row.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:10px;margin-bottom:10px;align-items:center;';
    const inpDesc = document.createElement('input');
    inpDesc.type = 'text';
    inpDesc.className = 'form-control fast-line-desc';
    inpDesc.placeholder = 'Description';
    inpDesc.value = desc != null && desc !== '' ? String(desc) : '';
    const inpQty = document.createElement('input');
    inpQty.type = 'number';
    inpQty.className = 'form-control fast-line-qty';
    inpQty.step = '0.01';
    inpQty.placeholder = 'Qty';
    if (qty != null && qty !== '') inpQty.value = qty;
    const inpPrice = document.createElement('input');
    inpPrice.type = 'number';
    inpPrice.className = 'form-control fast-line-price';
    inpPrice.step = '0.01';
    inpPrice.placeholder = 'Unit price';
    if (price != null && price !== '') inpPrice.value = price;
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'btn btn-danger btn-sm';
    rm.textContent = '×';
    rm.addEventListener('click', () => { row.remove(); calculateFastSaleTotal(); });
    row.appendChild(inpDesc);
    row.appendChild(inpQty);
    row.appendChild(inpPrice);
    row.appendChild(rm);
    wrap.appendChild(row);
    recalcFastLine(row);
}

function recalcFastLine(row) {
    if (!row) return;
    const q = parseFloat(row.querySelector('.fast-line-qty').value) || 0;
    const p = parseFloat(row.querySelector('.fast-line-price').value) || 0;
    /* total per line shown implicitly in sum — optional small total cell could be added */
}

function calculateFastSaleTotal() {
    let total = 0;
    document.querySelectorAll('.fast-line-row').forEach(row => {
        const q = parseFloat(row.querySelector('.fast-line-qty').value) || 0;
        const p = parseFloat(row.querySelector('.fast-line-price').value) || 0;
        total += q * p;
    });
    document.getElementById('fastSaleTotal').value = formatCurrency(total);
    updateFastSaleBalance();
}

function updateFastSaleBalance() {
    const total = parseFloat(document.getElementById('fastSaleTotal').value.replace(/[^\d.-]/g, '')) || 0;
    const paid = parseFloat(document.getElementById('fastSalePaidAmount').value) || 0;
    document.getElementById('fastSaleBalance').value = formatCurrency(total - paid);
}

function openAddFastSaleModal() {
    document.getElementById('fastModalTitle').textContent = 'Add Fast Sale';
    document.getElementById('fastSaleId').value = '';
    document.getElementById('fastSaleDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('fastSaleCustomer').value = '';
    document.getElementById('fastSaleSupplier').value = '';
    document.getElementById('fastSaleNotes').value = '';
    document.getElementById('fastSaleLines').innerHTML = '';
    addFastLineRow();
    document.getElementById('fastSalePaidAmount').value = '';
    calculateFastSaleTotal();
    document.getElementById('fastSaleModal').style.display = 'block';
}

function closeFastSaleModal() {
    document.getElementById('fastSaleModal').style.display = 'none';
}

function saveFastSale() {
    const saleId = document.getElementById('fastSaleId').value;
    const items = [];
    document.querySelectorAll('.fast-line-row').forEach(row => {
        const desc = (row.querySelector('.fast-line-desc').value || '').trim();
        const qty = row.querySelector('.fast-line-qty').value;
        const price = row.querySelector('.fast-line-price').value;
        if (desc && qty && price) {
            items.push({
                line_description: desc,
                quantity: parseFloat(qty),
                unit_price: parseFloat(price)
            });
        }
    });
    if (items.length === 0) {
        alert('Add at least one line with description, quantity, and price.');
        return;
    }
    const customerId = document.getElementById('fastSaleCustomer').value;
    if (!customerId) {
        alert('Select a customer.');
        return;
    }
    const supplierVal = document.getElementById('fastSaleSupplier').value;
    const paidAmount = parseFloat(document.getElementById('fastSalePaidAmount').value) || 0;
    const saleData = {
        date: document.getElementById('fastSaleDate').value,
        customer_id: parseInt(customerId, 10),
        items,
        paid_amount: paidAmount,
        notes: document.getElementById('fastSaleNotes').value || ''
    };
    if (supplierVal) saleData.supplier_id = parseInt(supplierVal, 10);
    else saleData.supplier_id = null;

    const url = saleId ? `/api/sales/${saleId}` : '/api/sales';
    const method = saleId ? 'PUT' : 'POST';

    fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saleData)
    })
        .then(r => {
            if (!r.ok) return r.json().then(d => { throw new Error(d.error || r.status); });
            return r.json();
        })
        .then(() => {
            closeFastSaleModal();
            loadFastSales();
            if (typeof showNotification === 'function') showNotification('Saved', 'success');
        })
        .catch(err => {
            console.error(err);
            alert('Error: ' + err.message);
        });
}

function editFastSale(saleId) {
    fetch(`/api/sales/${saleId}`)
        .then(r => {
            if (!r.ok) return r.json().then(d => { throw new Error(d.error); });
            return r.json();
        })
        .then(sale => {
            const bad = (sale.items || []).some(i => i.item_id != null);
            if (bad) {
                alert('This invoice includes catalog items. Edit it on the Sales page.');
                return;
            }
            document.getElementById('fastModalTitle').textContent = 'Edit Fast Sale';
            document.getElementById('fastSaleId').value = sale.id;
            document.getElementById('fastSaleDate').value = sale.date;
            document.getElementById('fastSaleCustomer').value = sale.customer_id;
            document.getElementById('fastSaleSupplier').value = sale.supplier_id || '';
            document.getElementById('fastSalePaidAmount').value = sale.paid_amount || 0;
            document.getElementById('fastSaleNotes').value = sale.notes || '';
            document.getElementById('fastSaleLines').innerHTML = '';
            (sale.items || []).forEach(i => {
                addFastLineRow(i.line_description || '', i.quantity, i.unit_price);
            });
            if ((sale.items || []).length === 0) addFastLineRow();
            calculateFastSaleTotal();
            document.getElementById('fastSaleModal').style.display = 'block';
        })
        .catch(err => alert(err.message));
}

function deleteFastSale(saleId) {
    if (!confirm('Delete this sale?')) return;
    fetch(`/api/sales/${saleId}`, { method: 'DELETE' })
        .then(r => r.json())
        .then(data => {
            if (data.error) alert(data.error);
            else {
                loadFastSales();
                if (typeof showNotification === 'function') showNotification('Deleted', 'success');
            }
        })
        .catch(() => alert('Delete failed'));
}

function exportFastSales() {
    window.location.href = fastSalesQueryUrl().replace('/api/sales?', '/api/sales/export?');
}

function openFastImportModal() {
    document.getElementById('fastImportForm').reset();
    document.getElementById('fastImportModal').style.display = 'block';
}

function closeFastImportModal() {
    document.getElementById('fastImportModal').style.display = 'none';
}

function importFastSales() {
    const input = document.getElementById('fastExcelFile');
    if (!input.files || !input.files.length) {
        alert('Choose a file');
        return;
    }
    const fd = new FormData();
    fd.append('file', input.files[0]);
    const btn = document.querySelector('#fastImportForm button[type="submit"]');
    const t = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Importing…';
    fetch('/api/sales/import-fast', { method: 'POST', body: fd })
        .then(r => {
            if (!r.ok) return r.json().then(d => { throw new Error(d.error || 'Failed'); });
            return r.json();
        })
        .then(data => {
            let msg = `Sales: ${data.sales_created}, lines: ${data.items_created}`;
            if (data.errors && data.errors.length) {
                msg += '\n' + data.errors.slice(0, 8).join('\n');
                if (data.errors.length > 8) msg += `\n…+${data.errors.length - 8}`;
            }
            alert(msg);
            closeFastImportModal();
            loadFastSales();
            if (typeof showNotification === 'function') showNotification('Import done', 'success');
        })
        .catch(e => alert(e.message))
        .finally(() => {
            btn.disabled = false;
            btn.textContent = t;
        });
}

function showFastInvoice(saleId) {
    const pm = currentMarket ? Promise.resolve(currentMarket) : loadCurrentMarket();
    Promise.all([pm, fetch(`/api/sales/${saleId}`).then(r => {
        if (!r.ok) return r.json().then(d => { throw new Error(d.error); });
        return r.json();
    })])
        .then(([, sale]) => displayFastInvoice(sale))
        .catch(e => alert(e.message));
}

function displayFastInvoice(sale) {
    const market = currentMarket || { name: 'Market', address: '', base_currency: 'USD' };
    const saleDate = new Date(sale.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const totalQty = sale.items.reduce((s, i) => s + parseFloat(i.quantity || 0), 0);

    let rows = '';
    sale.items.forEach((item, index) => {
        rows += `
            <tr style="border-bottom:1px solid #ddd;">
                <td style="padding:10px;border:1px solid #ddd;">${index + 1}</td>
                <td style="padding:10px;border:1px solid #ddd;">${item.item_code || '—'}</td>
                <td style="padding:10px;border:1px solid #ddd;">${item.item_name || item.line_description || ''}</td>
                <td style="padding:10px;text-align:right;border:1px solid #ddd;">${parseFloat(item.quantity).toFixed(2)}</td>
                <td style="padding:10px;text-align:right;border:1px solid #ddd;">${formatCurrency(item.unit_price)}</td>
                <td style="padding:10px;text-align:right;border:1px solid #ddd;font-weight:bold;">${formatCurrency(item.total_price)}</td>
            </tr>`;
    });

    document.getElementById('fastInvoiceContent').innerHTML = `
        <div id="fastInvoiceToPrint" style="font-family:Arial,sans-serif;color:#333;">
            <div style="text-align:center;margin-bottom:30px;border-bottom:3px solid #1e3a5f;padding-bottom:20px;">
                <h1 style="color:#1e3a5f;">SARI TEXTILE WAREHOUSES</h1>
                <p style="color:#666;">${market.address || ''}</p>
                <h2 style="color:#1e3a5f;">FAST SALE INVOICE</h2>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-bottom:20px;">
                <div>
                    <p><strong>Invoice:</strong> ${sale.invoice_number}</p>
                    <p><strong>Date:</strong> ${saleDate}</p>
                    <p><strong>Payment:</strong> ${sale.payment_type}</p>
                </div>
                <div>
                    <p><strong>Customer:</strong> ${sale.customer_name}</p>
                    ${sale.supplier_name ? `<p><strong>Supplier:</strong> ${sale.supplier_name}</p>` : ''}
                </div>
            </div>
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="background:#1e3a5f;color:white;">
                        <th style="padding:12px;text-align:left;border:1px solid #ddd;">#</th>
                        <th style="padding:12px;text-align:left;border:1px solid #ddd;">Code</th>
                        <th style="padding:12px;text-align:left;border:1px solid #ddd;">Description</th>
                        <th style="padding:12px;text-align:right;border:1px solid #ddd;">Qty</th>
                        <th style="padding:12px;text-align:right;border:1px solid #ddd;">Price</th>
                        <th style="padding:12px;text-align:right;border:1px solid #ddd;">Total</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
            <div style="display:flex;flex-wrap:wrap;gap:14px;justify-content:flex-end;margin-top:20px;margin-bottom:8px;">
                <div style="min-width:118px;padding:14px 18px;border:1px solid #1e3a5f;border-radius:8px;background:#f8fafc;text-align:center;box-shadow:0 1px 2px rgba(30,58,95,0.08);">
                    <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;font-weight:600;">Total Qty</div>
                    <div style="font-size:19px;font-weight:700;color:#1e3a5f;">${totalQty.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
                </div>
                <div style="min-width:118px;padding:14px 18px;border:1px solid #1e3a5f;border-radius:8px;background:#f8fafc;text-align:center;box-shadow:0 1px 2px rgba(30,58,95,0.08);">
                    <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;font-weight:600;">Total</div>
                    <div style="font-size:19px;font-weight:700;color:#1e3a5f;">${formatCurrency(sale.total_amount)}</div>
                </div>
                <div style="min-width:118px;padding:14px 18px;border:1px solid #2e7d32;border-radius:8px;background:#f1f8f4;text-align:center;box-shadow:0 1px 2px rgba(46,125,50,0.12);">
                    <div style="font-size:11px;color:#547857;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;font-weight:600;">Paid</div>
                    <div style="font-size:19px;font-weight:700;color:#2e7d32;">${formatCurrency(sale.paid_amount)}</div>
                </div>
                <div style="min-width:118px;padding:14px 18px;border:1px solid ${sale.balance > 0 ? '#c62828' : '#2e7d32'};border-radius:8px;background:${sale.balance > 0 ? '#fff8f8' : '#f1f8f4'};text-align:center;box-shadow:0 1px 2px rgba(0,0,0,0.06);">
                    <div style="font-size:11px;color:${sale.balance > 0 ? '#b71c1c' : '#547857'};text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;font-weight:600;">Balance</div>
                    <div style="font-size:19px;font-weight:700;color:${sale.balance > 0 ? '#c62828' : '#2e7d32'};">${formatCurrency(sale.balance)}</div>
                </div>
            </div>
            ${sale.notes ? `<div style="margin-top:16px;padding:12px;background:#f5f5f5;"><strong>Notes:</strong> ${sale.notes}</div>` : ''}
        </div>`;
    document.getElementById('fastInvoiceModal').style.display = 'block';
}

function closeFastInvoiceModal() {
    document.getElementById('fastInvoiceModal').style.display = 'none';
}

function printFastInvoice() {
    const el = document.getElementById('fastInvoiceToPrint');
    if (!el) return;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Invoice</title></head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    w.print();
}
