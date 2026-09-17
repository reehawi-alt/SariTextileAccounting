let partnersCache = [];
let marketBaseCurrency = '';

function showPartnersPageSection(section) {
    const main = document.getElementById('partnersMainSection');
    const draw = document.getElementById('partnerDrawingsSection');
    const btnP = document.getElementById('partnersSectionBtn');
    const btnD = document.getElementById('partnerDrawingsSectionBtn');
    if (!main || !draw) return;
    if (section === 'drawings') {
        main.style.display = 'none';
        draw.style.display = 'block';
        if (btnP) btnP.className = 'btn btn-secondary';
        if (btnD) btnD.className = 'btn btn-primary';
        loadDrawings();
    } else {
        main.style.display = 'block';
        draw.style.display = 'none';
        if (btnP) btnP.className = 'btn btn-primary';
        if (btnD) btnD.className = 'btn btn-secondary';
    }
}

function loadMarketMeta() {
    fetch('/api/current-market')
        .then((r) => r.json())
        .then((data) => {
            if (data && data.base_currency) {
                marketBaseCurrency = data.base_currency;
                const el = document.getElementById('drawingBaseCurrencyLabel');
                if (el) el.textContent = marketBaseCurrency;
            }
        })
        .catch(() => {});
}

function loadPartners() {
    fetch('/api/partners')
        .then(r => r.json())
        .then(data => {
            if (data.error) {
                document.getElementById('partnersTableBody').innerHTML =
                    `<tr><td colspan="3" class="empty-state">${data.error}</td></tr>`;
                return;
            }
            partnersCache = data.partners || [];
            updateShareSummary(data.total_share_percent, data.shares_complete);
            const tbody = document.getElementById('partnersTableBody');
            if (!data.partners || data.partners.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No partners yet. Add partners and set percentages to total 100%.</td></tr>';
                return;
            }
            tbody.innerHTML = data.partners.map(p => `
                <tr>
                    <td>${escapeHtml(p.name)}</td>
                    <td class="text-right">${Number(p.share_percent).toFixed(2)}%</td>
                    <td>
                        <button type="button" class="btn btn-sm btn-secondary" onclick="editPartner(${p.id})">Edit</button>
                        <button type="button" class="btn btn-sm btn-danger" onclick="deletePartner(${p.id})">Delete</button>
                    </td>
                </tr>
            `).join('');
        })
        .catch(err => {
            console.error(err);
            document.getElementById('partnersTableBody').innerHTML =
                '<tr><td colspan="3" class="empty-state">Error loading partners</td></tr>';
        })
        .finally(() => {
            fillDrawingPartnerSelect();
        });
}

function loadDrawings() {
    const startEl = document.getElementById('drawingStartDate');
    const endEl = document.getElementById('drawingEndDate');
    let url = '/api/partners/drawings?';
    if (startEl && startEl.value) url += `start_date=${encodeURIComponent(startEl.value)}&`;
    if (endEl && endEl.value) url += `end_date=${encodeURIComponent(endEl.value)}&`;

    fetch(url)
        .then((r) => r.json())
        .then((data) => {
            const tbody = document.getElementById('drawingsTableBody');
            const sumBox = document.getElementById('drawingsSummary');
            const sumText = document.getElementById('drawingsSummaryText');
            if (data.error) {
                if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="empty-state">${escapeHtml(data.error)}</td></tr>`;
                return;
            }
            const list = data.drawings || [];
            const bc = marketBaseCurrency || 'base';
            if (sumBox && sumText) {
                sumBox.style.display = list.length ? 'block' : 'none';
                sumText.textContent = list.length
                    ? `Period total (${bc}): ${Number(data.total_base_currency).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                      })} — ${data.count} drawing(s)`
                    : '';
            }
            if (!tbody) return;
            if (list.length === 0) {
                tbody.innerHTML =
                    '<tr><td colspan="6" class="empty-state">No drawings in this range. Add one to debit the safe.</td></tr>';
                return;
            }
            tbody.innerHTML = list
                .map(
                    (d) => `
                <tr>
                    <td>${escapeHtml(d.date)}</td>
                    <td>${escapeHtml(d.partner_name)}</td>
                    <td>${escapeHtml(d.description)}</td>
                    <td class="text-right">${Number(d.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${escapeHtml(d.currency)}</td>
                    <td class="text-right">${Number(d.amount_base_currency).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td>
                        <button type="button" class="btn btn-sm btn-secondary" onclick="editDrawing(${d.id})">Edit</button>
                        <button type="button" class="btn btn-sm btn-danger" onclick="deleteDrawing(${d.id})">Delete</button>
                    </td>
                </tr>`
                )
                .join('');
        })
        .catch((err) => {
            console.error(err);
            const tbody = document.getElementById('drawingsTableBody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Error loading drawings</td></tr>';
        });
}

function fillDrawingPartnerSelect() {
    const sel = document.getElementById('drawingPartnerId');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML =
        '<option value="">Select partner</option>' +
        partnersCache.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    if (current) sel.value = current;
}

function openDrawingModal() {
    if (!partnersCache.length) {
        alert('Add at least one partner before recording a drawing.');
        return;
    }
    document.getElementById('drawingModalTitle').textContent = 'Add drawing';
    document.getElementById('drawingId').value = '';
    document.getElementById('drawingPartnerId').value = partnersCache[0].id;
    document.getElementById('drawingDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('drawingDescription').value = '';
    document.getElementById('drawingAmount').value = '';
    document.getElementById('drawingCurrency').value = marketBaseCurrency || 'FCFA';
    document.getElementById('drawingExchangeRate').value = '1';
    fillDrawingPartnerSelect();
    document.getElementById('drawingPartnerId').value = String(partnersCache[0].id);
    document.getElementById('drawingModal').style.display = 'block';
}

function editDrawing(id) {
    fetch('/api/partners/drawings')
        .then((r) => r.json())
        .then((data) => {
            const d = (data.drawings || []).find((x) => x.id === id);
            if (!d) {
                alert('Drawing not found');
                return;
            }
            document.getElementById('drawingModalTitle').textContent = 'Edit drawing';
            document.getElementById('drawingId').value = d.id;
            fillDrawingPartnerSelect();
            document.getElementById('drawingPartnerId').value = String(d.partner_id);
            document.getElementById('drawingDate').value = d.date;
            document.getElementById('drawingDescription').value = d.description || '';
            document.getElementById('drawingAmount').value = d.amount;
            document.getElementById('drawingCurrency').value = d.currency;
            document.getElementById('drawingExchangeRate').value = d.exchange_rate;
            document.getElementById('drawingModal').style.display = 'block';
        })
        .catch(() => alert('Could not load drawing'));
}

function closeDrawingModal() {
    document.getElementById('drawingModal').style.display = 'none';
}

function saveDrawing(ev) {
    ev.preventDefault();
    const idVal = document.getElementById('drawingId').value;
    const body = {
        partner_id: parseInt(document.getElementById('drawingPartnerId').value, 10),
        date: document.getElementById('drawingDate').value,
        description: document.getElementById('drawingDescription').value.trim(),
        amount: parseFloat(document.getElementById('drawingAmount').value),
        currency: (document.getElementById('drawingCurrency').value || '').trim() || marketBaseCurrency || 'FCFA',
        exchange_rate: parseFloat(document.getElementById('drawingExchangeRate').value) || 1,
    };
    const url = idVal ? `/api/partners/drawings/${idVal}` : '/api/partners/drawings';
    const method = idVal ? 'PUT' : 'POST';
    fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })
        .then((r) => r.json().then((j) => ({ ok: r.ok, body: j })))
        .then(({ ok, body }) => {
            if (!ok) {
                alert(body.error || 'Save failed');
                return;
            }
            closeDrawingModal();
            loadDrawings();
            if (typeof showNotification === 'function') showNotification('Drawing saved', 'success');
        })
        .catch(() => alert('Network error'));
}

function deleteDrawing(id) {
    if (!confirm('Delete this drawing? The linked safe outflow will be removed and balances recalculated.')) return;
    fetch(`/api/partners/drawings/${id}`, { method: 'DELETE' })
        .then((r) => r.json().then((j) => ({ ok: r.ok, body: j })))
        .then(({ ok, body }) => {
            if (!ok) {
                alert(body.error || 'Delete failed');
                return;
            }
            loadDrawings();
            if (typeof showNotification === 'function') showNotification('Drawing removed', 'success');
        })
        .catch(() => alert('Network error'));
}

function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function updateShareSummary(total, complete) {
    const el = document.getElementById('partnerShareSummaryText');
    const box = document.getElementById('partnerShareSummary');
    if (!el) return;
    const t = Number(total).toFixed(2);
    if (complete) {
        el.innerHTML = `<strong style="color: #2e7d32;">${t}%</strong> — ready for Partner Profit Allocation report.`;
        box.style.borderLeft = '4px solid #2e7d32';
    } else {
        el.innerHTML = `<strong style="color: #c62828;">${t}%</strong> — must total <strong>100%</strong> for allocation report.`;
        box.style.borderLeft = '4px solid #c62828';
    }
}

function openPartnerModal() {
    document.getElementById('partnerModalTitle').textContent = 'Add Partner';
    document.getElementById('partnerId').value = '';
    document.getElementById('partnerName').value = '';
    document.getElementById('partnerSharePercent').value = '';
    document.getElementById('partnerModal').style.display = 'block';
}

function editPartner(id) {
    const p = partnersCache.find(x => x.id === id);
    if (!p) return;
    document.getElementById('partnerModalTitle').textContent = 'Edit Partner';
    document.getElementById('partnerId').value = id;
    document.getElementById('partnerName').value = p.name;
    document.getElementById('partnerSharePercent').value = p.share_percent;
    document.getElementById('partnerModal').style.display = 'block';
}

function closePartnerModal() {
    document.getElementById('partnerModal').style.display = 'none';
}

function savePartner(ev) {
    ev.preventDefault();
    const id = document.getElementById('partnerId').value;
    const body = {
        name: document.getElementById('partnerName').value.trim(),
        share_percent: parseFloat(document.getElementById('partnerSharePercent').value),
    };
    const url = id ? `/api/partners/${id}` : '/api/partners';
    const method = id ? 'PUT' : 'POST';
    fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })
        .then(r => r.json().then(j => ({ ok: r.ok, body: j })))
        .then(({ ok, body }) => {
            if (!ok) {
                alert(body.error || 'Save failed');
                return;
            }
            closePartnerModal();
            loadPartners();
            if (typeof showNotification === 'function') {
                showNotification('Partner saved', 'success');
            }
        })
        .catch(() => alert('Network error'));
}

function deletePartner(id) {
    if (!confirm('Delete this partner?')) return;
    fetch(`/api/partners/${id}`, { method: 'DELETE' })
        .then(r => r.json().then(j => ({ ok: r.ok, body: j })))
        .then(({ ok, body }) => {
            if (!ok) {
                alert(body.error || 'Delete failed');
                return;
            }
            loadPartners();
            if (typeof showNotification === 'function') {
                showNotification('Partner removed', 'success');
            }
        })
        .catch(() => alert('Network error'));
}

document.addEventListener('DOMContentLoaded', () => {
    loadMarketMeta();
    const today = new Date().toISOString().split('T')[0];
    const start = document.getElementById('drawingStartDate');
    const end = document.getElementById('drawingEndDate');
    if (start) start.value = '2020-01-01';
    if (end) end.value = today;
    loadPartners();
    if (window.location.hash === '#drawings') {
        showPartnersPageSection('drawings');
    } else {
        showPartnersPageSection('partners');
    }
});
