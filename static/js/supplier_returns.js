(function () {
    let suppliers = [];
    let itemsBySupplier = {};
    let currentMarket = null;

    function loadCurrentMarket() {
        return fetch('/api/current-market')
            .then(r => r.json())
            .then(data => {
                currentMarket = data;
                return data;
            })
            .catch(() => {
                currentMarket = null;
                return null;
            });
    }

    function el(id) {
        return document.getElementById(id);
    }

    function fmt(n) {
        const x = parseFloat(n);
        if (isNaN(x)) return '0.00';
        return x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function todayYMD() {
        const d = new Date();
        return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
    }

    function loadSuppliers() {
        return fetch('/api/companies?category=Supplier')
            .then(r => r.json())
            .then(list => {
                suppliers = Array.isArray(list) ? list : [];
                const f1 = el('returnFilterSupplier');
                const f2 = el('srSupplier');
                const keep = f1 ? f1.value : '';
                const keepSr = f2 && f2.disabled ? f2.value : '';
                if (f1) {
                    f1.innerHTML = '<option value="">All suppliers</option>' +
                        suppliers.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
                    f1.value = keep;
                }
                if (f2) {
                    f2.innerHTML = '<option value="">Select supplier</option>' +
                        suppliers.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
                    if (f2.disabled && keepSr) {
                        f2.value = keepSr;
                    }
                }
            })
            .catch(e => console.error(e));
    }

    function escapeHtml(t) {
        if (t == null) return '';
        const d = document.createElement('div');
        d.textContent = t;
        return d.innerHTML;
    }

    window.loadSupplierReturns = function () {
        const sid = el('returnFilterSupplier') ? el('returnFilterSupplier').value : '';
        let url = '/api/supplier-returns?';
        if (sid) url += 'supplier_id=' + encodeURIComponent(sid);
        fetch(url)
            .then(r => r.json())
            .then(data => {
                const tbody = el('supplierReturnsTableBody');
                if (data.error) {
                    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${escapeHtml(data.error)}</td></tr>`;
                    return;
                }
                if (!data.length) {
                    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No returns yet</td></tr>';
                    return;
                }
                tbody.innerHTML = data.map(row => {
                    const ref = escapeHtml(row.reference_number || '#' + row.id);
                    return `<tr>
                        <td>${escapeHtml(row.date)}</td>
                        <td>${ref}</td>
                        <td>${escapeHtml(row.supplier_name || '')}</td>
                        <td class="text-right">${fmt(row.total_amount)}</td>
                        <td>${escapeHtml(row.currency || '')}</td>
                        <td>
                            <div class="action-btns">
                                <button type="button" class="btn-icon btn-view" onclick="viewSupplierReturn(${row.id})" title="View">👁️</button>
                                <button type="button" class="btn-icon btn-edit" onclick="editSupplierReturn(${row.id})" title="Edit">✏️</button>
                                <button type="button" class="btn-icon btn-delete" onclick="deleteSupplierReturn(${row.id})" title="Delete">🗑️</button>
                            </div>
                        </td>
                    </tr>`;
                }).join('');
            })
            .catch(() => {
                el('supplierReturnsTableBody').innerHTML =
                    '<tr><td colspan="6" class="empty-state">Error loading returns</td></tr>';
            });
    };

    function fetchItemsForSupplier(supplierId) {
        if (!supplierId) return Promise.resolve([]);
        if (itemsBySupplier[supplierId]) return Promise.resolve(itemsBySupplier[supplierId]);
        return fetch('/api/items/summary?supplier_id=' + encodeURIComponent(supplierId))
            .then(r => r.json())
            .then(rows => {
                itemsBySupplier[supplierId] = rows;
                return rows;
            });
    }

    window.onSrSupplierChange = function () {
        const sid = el('srSupplier').value;
        itemsBySupplier = {};
        el('srLinesBody').innerHTML = '';
        if (sid) addSrLine();
    };

    /**
     * @param {object} [prefill] — optional { item_id, quantity, unit_price }
     * @returns {Promise<void>}
     */
    window.addSrLine = function (prefill) {
        const sid = el('srSupplier').value;
        if (!sid) {
            alert('Select a supplier first');
            return Promise.resolve();
        }
        return fetchItemsForSupplier(sid).then(items => {
            const opts = items.map(i =>
                `<option value="${i.id}" data-price="0">${escapeHtml(i.code)} — ${escapeHtml(i.name)} (avail ${fmt(i.available_quantity)})</option>`
            ).join('');
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><select class="form-control sr-item" required>${opts}</select></td>
                <td><input type="number" class="form-control sr-qty text-right" step="0.01" min="0.01" required></td>
                <td><input type="number" class="form-control sr-price text-right" step="0.01" min="0" required></td>
                <td class="text-right sr-line-total">0.00</td>
                <td><button type="button" class="btn-icon" onclick="this.closest('tr').remove()">✕</button></td>`;
            el('srLinesBody').appendChild(tr);
            const row = tr;
            function recalc() {
                const q = parseFloat(row.querySelector('.sr-qty').value) || 0;
                const p = parseFloat(row.querySelector('.sr-price').value) || 0;
                row.querySelector('.sr-line-total').textContent = fmt(q * p);
            }
            row.querySelector('.sr-qty').addEventListener('input', recalc);
            row.querySelector('.sr-price').addEventListener('input', recalc);
            if (prefill && prefill.item_id) {
                const sel = row.querySelector('.sr-item');
                sel.value = String(prefill.item_id);
                if (prefill.quantity != null) row.querySelector('.sr-qty').value = String(prefill.quantity);
                if (prefill.unit_price != null) row.querySelector('.sr-price').value = String(prefill.unit_price);
            }
            recalc();
        });
    };

    window.openSupplierReturnModal = function () {
        loadSuppliers().then(() => {
            el('srEditId').value = '';
            el('srExchangeRate').value = '1';
            el('supplierReturnModalTitle').textContent = 'New supplier return';
            el('srSupplier').disabled = false;
            el('srDate').value = todayYMD();
            el('srReference').value = '';
            el('srNotes').value = '';
            el('srSupplier').value = '';
            el('srLinesBody').innerHTML = '';
            el('supplierReturnModal').style.display = 'block';
        });
    };

    window.closeSupplierReturnModal = function () {
        el('supplierReturnModal').style.display = 'none';
        el('srSupplier').disabled = false;
    };

    /**
     * Invoice-style document matching sales `displayInvoice` layout (SARI header, grid details, bordered table, total boxes).
     */
    function buildSupplierReturnInvoiceHtml(market, data) {
        const m = market || { name: 'Market', address: '', base_currency: 'USD' };
        const cur = (data.currency || '').trim();
        const retDate = new Date(data.date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
        const lines = data.lines || [];
        const totalQuantity = lines.reduce((sum, item) => sum + parseFloat(item.quantity || 0), 0);
        const displayRef = data.reference_number
            ? escapeHtml(data.reference_number)
            : '#' + escapeHtml(String(data.id));
        const rateStr = data.exchange_rate != null
            ? parseFloat(data.exchange_rate).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 4 })
            : '1';

        let html = `
        <div id="supplierReturnToPrint" style="font-family: Arial, sans-serif; color: #333;">
            <div style="text-align: center; margin-bottom: 30px; border-bottom: 3px solid #1e3a5f; padding-bottom: 20px;">
                <h1 style="color: #1e3a5f; margin: 0 0 10px 0; font-size: 28px;">SARI TEXTILE WAREHOUSES</h1>
                <p style="margin: 5px 0; color: #666; font-size: 14px;">${escapeHtml(m.address || '')}</p>
                <h2 style="color: #1e3a5f; margin: 20px 0 0 0; font-size: 22px;">SUPPLIER RETURN</h2>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px;">
                <div>
                    <h3 style="color: #1e3a5f; margin: 0 0 10px 0; font-size: 16px; border-bottom: 2px solid #1e3a5f; padding-bottom: 5px;">Return details</h3>
                    <p style="margin: 5px 0;"><strong>Return no.:</strong> ${displayRef}</p>
                    <p style="margin: 5px 0;"><strong>Date:</strong> ${escapeHtml(retDate)}</p>
                    <p style="margin: 5px 0;"><strong>Currency:</strong> ${escapeHtml(cur || '—')}</p>
                    <p style="margin: 5px 0;"><strong>Exchange rate:</strong> ${rateStr}</p>
                </div>
                <div>
                    <h3 style="color: #1e3a5f; margin: 0 0 10px 0; font-size: 16px; border-bottom: 2px solid #1e3a5f; padding-bottom: 5px;">Supplier</h3>
                    <p style="margin: 5px 0;"><strong>Name:</strong> ${escapeHtml(data.supplier_name || '')}</p>
                </div>
            </div>

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
                <tbody>`;

        if (!lines.length) {
            html += `
                    <tr style="border-bottom: 1px solid #ddd;">
                        <td colspan="6" style="padding: 10px; border: 1px solid #ddd; color: #666;">No lines</td>
                    </tr>`;
        } else {
            lines.forEach((item, index) => {
                html += `
                    <tr style="border-bottom: 1px solid #ddd;">
                        <td style="padding: 10px; border: 1px solid #ddd;">${index + 1}</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(item.item_code || '')}</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(item.item_name || '')}</td>
                        <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${parseFloat(item.quantity).toFixed(2)}</td>
                        <td style="padding: 10px; text-align: right; border: 1px solid #ddd;">${formatCurrency(item.unit_price, cur)}</td>
                        <td style="padding: 10px; text-align: right; border: 1px solid #ddd; font-weight: bold;">${formatCurrency(item.total_price, cur)}</td>
                    </tr>`;
            });
        }

        html += `
                </tbody>
            </table>

            <div style="display: flex; flex-wrap: wrap; gap: 14px; justify-content: flex-end; margin-bottom: 24px;">
                <div style="min-width: 118px; padding: 14px 18px; border: 1px solid #1e3a5f; border-radius: 8px; background: #f8fafc; text-align: center; box-shadow: 0 1px 2px rgba(30,58,95,0.08);">
                    <div style="font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px; font-weight: 600;">Total Qty</div>
                    <div style="font-size: 19px; font-weight: 700; color: #1e3a5f;">${formatNumber(totalQuantity)}</div>
                </div>
                <div style="min-width: 118px; padding: 14px 18px; border: 1px solid #1e3a5f; border-radius: 8px; background: #f8fafc; text-align: center; box-shadow: 0 1px 2px rgba(30,58,95,0.08);">
                    <div style="font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px; font-weight: 600;">Total</div>
                    <div style="font-size: 19px; font-weight: 700; color: #1e3a5f;">${formatCurrency(data.total_amount, cur)}</div>
                </div>
            </div>`;

        if (data.notes) {
            html += `
            <div style="margin-top: 20px; padding: 15px; background-color: #f5f5f5; border-radius: 5px;">
                <strong>Notes:</strong>
                <p style="margin: 5px 0 0 0; color: #666;">${escapeHtml(data.notes)}</p>
            </div>`;
        }

        html += `
        </div>`;
        return html;
    }

    function displaySupplierReturnDocument(market, data) {
        const container = el('supplierReturnInvoiceContent');
        if (!container) return;
        container.innerHTML = buildSupplierReturnInvoiceHtml(market, data);
        el('supplierReturnViewModal').style.display = 'block';
    }

    window.viewSupplierReturn = function (id) {
        const marketPromise = currentMarket ? Promise.resolve(currentMarket) : loadCurrentMarket();
        Promise.all([
            marketPromise,
            fetch('/api/supplier-returns/' + id).then(r => {
                if (!r.ok) {
                    return r.json().then(j => { throw new Error(j.error || 'Failed to load return'); });
                }
                return r.json();
            }),
        ])
            .then(([market, data]) => {
                if (data.error) {
                    alert(data.error);
                    return;
                }
                displaySupplierReturnDocument(market, data);
            })
            .catch(err => {
                console.error(err);
                alert(err.message || 'Network error');
            });
    };

    window.closeSupplierReturnViewModal = function () {
        el('supplierReturnViewModal').style.display = 'none';
    };

    window.printSupplierReturnDocument = function () {
        const node = document.getElementById('supplierReturnToPrint');
        if (!node) {
            alert('Nothing to print');
            return;
        }
        const printWindow = window.open('', '_blank');
        const title = node.querySelector('h2') ? node.querySelector('h2').textContent : 'Supplier Return';
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${escapeHtml(title)}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
                    @media print { body { margin: 0; } }
                </style>
            </head>
            <body>
                ${node.outerHTML}
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 250);
    };

    window.editSupplierReturn = function (id) {
        fetch('/api/supplier-returns/' + id)
            .then(r => r.json())
            .then(data => {
                if (data.error) {
                    alert(data.error);
                    return;
                }
                const supId = String(data.supplier_id);
                loadSuppliers().then(() => {
                    el('srEditId').value = String(id);
                    el('supplierReturnModalTitle').textContent = 'Edit supplier return';
                    el('srSupplier').value = supId;
                    el('srSupplier').disabled = true;
                    el('srDate').value = (data.date || '').slice(0, 10);
                    el('srReference').value = data.reference_number || '';
                    el('srNotes').value = data.notes || '';
                    el('srExchangeRate').value = data.exchange_rate != null ? String(data.exchange_rate) : '1';
                    itemsBySupplier = {};
                    el('srLinesBody').innerHTML = '';
                    const lines = data.lines || [];
                    const run = lines.reduce(
                        (p, line) => p.then(() => addSrLine({
                            item_id: line.item_id,
                            quantity: line.quantity,
                            unit_price: line.unit_price,
                        })),
                        Promise.resolve()
                    );
                    run.then(() => {
                        if (!lines.length) return addSrLine();
                    }).then(() => {
                        el('supplierReturnModal').style.display = 'block';
                    });
                });
            })
            .catch(() => alert('Network error'));
    };

    window.submitSupplierReturn = function (e) {
        e.preventDefault();
        const supplierId = parseInt(el('srSupplier').value, 10);
        const lines = [];
        el('srLinesBody').querySelectorAll('tr').forEach(tr => {
            const itemId = parseInt(tr.querySelector('.sr-item').value, 10);
            const quantity = parseFloat(tr.querySelector('.sr-qty').value);
            const unitPrice = parseFloat(tr.querySelector('.sr-price').value);
            if (!itemId || quantity <= 0 || unitPrice < 0) return;
            lines.push({ item_id: itemId, quantity, unit_price: unitPrice });
        });
        if (!lines.length) {
            alert('Add at least one valid line');
            return;
        }
        const editId = (el('srEditId').value || '').trim();
        const body = {
            supplier_id: supplierId,
            date: el('srDate').value,
            reference_number: el('srReference').value.trim() || null,
            notes: el('srNotes').value.trim() || '',
            lines,
        };
        const ex = parseFloat(el('srExchangeRate').value);
        if (!isNaN(ex) && ex > 0) body.exchange_rate = ex;

        const url = editId ? '/api/supplier-returns/' + encodeURIComponent(editId) : '/api/supplier-returns';
        const method = editId ? 'PUT' : 'POST';

        fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
            .then(r => r.json().then(j => ({ ok: r.ok, j })))
            .then(({ ok, j }) => {
                if (!ok) {
                    alert(j.error || 'Failed to save');
                    return;
                }
                closeSupplierReturnModal();
                el('srEditId').value = '';
                itemsBySupplier = {};
                loadSupplierReturns();
            })
            .catch(() => alert('Network error'));
    };

    window.deleteSupplierReturn = function (id) {
        if (!confirm('Delete this supplier return? Stock and supplier balance will be reversed.')) return;
        fetch('/api/supplier-returns/' + id, { method: 'DELETE' })
            .then(r => r.json().then(j => ({ ok: r.ok, j })))
            .then(({ ok, j }) => {
                if (!ok) {
                    alert(j.error || 'Delete failed');
                    return;
                }
                itemsBySupplier = {};
                loadSupplierReturns();
            })
            .catch(() => alert('Network error'));
    };

    document.addEventListener('DOMContentLoaded', function () {
        loadCurrentMarket();
        loadSuppliers().then(() => loadSupplierReturns());
        window.addEventListener('click', function (event) {
            const modal = el('supplierReturnViewModal');
            if (modal && event.target === modal) {
                closeSupplierReturnViewModal();
            }
        });
        const importInput = el('srImportFile');
        if (importInput) {
            importInput.addEventListener('change', function () {
                if (!importInput.files || !importInput.files.length) return;
                const msg = el('srImportMessage');
                msg.innerHTML = '<span style="color: var(--text-secondary);">Uploading…</span>';
                const fd = new FormData();
                fd.append('file', importInput.files[0]);
                fetch('/api/supplier-returns/import', { method: 'POST', body: fd })
                    .then(r => r.json().then(j => ({ ok: r.ok, j })))
                    .then(({ ok, j }) => {
                        importInput.value = '';
                        if (!ok) {
                            msg.innerHTML = '<span style="color:#c62828;">' + escapeHtml(j.error || 'Import failed') + '</span>';
                            return;
                        }
                        const errs = j.errors || [];
                        const n = j.returns_created || 0;
                        let html = '<span style="color:#2e7d32;">Imported ' + n + ' return(s).</span>';
                        if (errs.length) {
                            html += ' <span style="color:#c62828;">' + errs.length + ' issue(s):</span><ul style="margin:8px 0 0 18px;font-size:13px;">';
                            errs.slice(0, 15).forEach(function (e) {
                                html += '<li>' + escapeHtml(String(e)) + '</li>';
                            });
                            if (errs.length > 15) html += '<li>…</li>';
                            html += '</ul>';
                        }
                        msg.innerHTML = html;
                        itemsBySupplier = {};
                        loadSupplierReturns();
                    })
                    .catch(function () {
                        importInput.value = '';
                        msg.innerHTML = '<span style="color:#c62828;">Network error</span>';
                    });
            });
        }
    });
})();
