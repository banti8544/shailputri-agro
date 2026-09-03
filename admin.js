if (localStorage.getItem("isAdmin") !== "true" && sessionStorage.getItem("adminAuthToken") !== "admin-auth-token-shailputri") {
  window.location.href = "admin-login.html";
}

let globalProducts = [];
let globalOrders = [];
let globalDealers = [];
let companyConfig = {};

async function loadCompanySettings() {
  try {
    const res = await fetch('/api/company-settings');
    companyConfig = await res.json();
    if (companyConfig.company_name) {
      if (document.getElementById("cfg-name")) document.getElementById("cfg-name").value = companyConfig.company_name || '';
      if (document.getElementById("cfg-gstin")) document.getElementById("cfg-gstin").value = companyConfig.gstin || '';
      if (document.getElementById("cfg-fssai")) document.getElementById("cfg-fssai").value = companyConfig.fssai || '';
      if (document.getElementById("cfg-udyam")) document.getElementById("cfg-udyam").value = companyConfig.udyam || '';
      if (document.getElementById("cfg-cin")) document.getElementById("cfg-cin").value = companyConfig.cin || '';
      if (document.getElementById("cfg-state")) document.getElementById("cfg-state").value = companyConfig.state || 'Assam';
      if (document.getElementById("cfg-address")) document.getElementById("cfg-address").value = companyConfig.address || '';
      if (document.getElementById("cfg-bulk-qty")) document.getElementById("cfg-bulk-qty").value = companyConfig.bulk_qty_threshold || 10;
      if (document.getElementById("cfg-bulk-disc")) document.getElementById("cfg-bulk-disc").value = companyConfig.bulk_discount_percent !== undefined ? companyConfig.bulk_discount_percent : 3;

      if (document.getElementById("cfg-bank-name")) document.getElementById("cfg-bank-name").value = companyConfig.bank_name || '';
      if (document.getElementById("cfg-bank-acc")) document.getElementById("cfg-bank-acc").value = companyConfig.bank_account_no || '';
      if (document.getElementById("cfg-bank-ifsc")) document.getElementById("cfg-bank-ifsc").value = companyConfig.bank_ifsc || '';
      if (document.getElementById("cfg-bank-branch")) document.getElementById("cfg-bank-branch").value = companyConfig.bank_branch || '';
    }
  } catch (err) {
    console.error("Error loading company settings:", err);
  }
}

async function saveCompanySettings(e) {
  e.preventDefault();
  const formData = new FormData();
  formData.append('company_name', document.getElementById("cfg-name")?.value || '');
  formData.append('gstin', document.getElementById("cfg-gstin")?.value || '');
  formData.append('fssai', document.getElementById("cfg-fssai")?.value || '');
  formData.append('udyam', document.getElementById("cfg-udyam")?.value || '');
  formData.append('cin', document.getElementById("cfg-cin")?.value || '');
  formData.append('state', document.getElementById("cfg-state")?.value || 'Assam');
  formData.append('address', document.getElementById("cfg-address")?.value || '');
  formData.append('bulk_qty_threshold', document.getElementById("cfg-bulk-qty")?.value || 10);
  formData.append('bulk_discount_percent', document.getElementById("cfg-bulk-disc")?.value || 3);
  formData.append('phone', '8544241851');
  formData.append('email', 'info@shailputriagro.com');

  formData.append('bank_name', document.getElementById("cfg-bank-name")?.value || '');
  formData.append('bank_account_no', document.getElementById("cfg-bank-acc")?.value || '');
  formData.append('bank_ifsc', document.getElementById("cfg-bank-ifsc")?.value || '');
  formData.append('bank_branch', document.getElementById("cfg-bank-branch")?.value || '');

  const logoFile = document.getElementById("cfg-logo-file");
  if (logoFile && logoFile.files.length > 0) formData.append('companyLogo', logoFile.files[0]);

  const stampFile = document.getElementById("cfg-stamp-file");
  if (stampFile && stampFile.files.length > 0) formData.append('signatoryStamp', stampFile.files[0]);

  try {
    const res = await fetch('/api/company-settings', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    alert(data.message || 'Settings Saved!');
    loadCompanySettings();
  } catch (err) {
    alert('Failed to save settings');
  }
}

async function loadAdminProducts() {
  const tableBody = document.getElementById("admin-products-table");
  if (!tableBody) return;

  try {
    const res = await fetch('/api/products');
    const data = await res.json();
    globalProducts = data.products || [];

    if (globalProducts.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="9" style="text-align:center;">No products found.</td></tr>';
      return;
    }

    renderAdminProducts(globalProducts);
    
    // 🟢 2. एडमिन पैनल में Low Stock Alert ट्रिगर करना
    if (typeof checkLowStockAlerts === 'function') {
      checkLowStockAlerts(globalProducts);
    }
  } catch (err) {
    tableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:red;">Failed to load products.</td></tr>';
  }
}

function renderAdminProducts(list) {
  const tableBody = document.getElementById("admin-products-table");
  if (!tableBody) return;

  tableBody.innerHTML = list.map(p => {
    const imgPath = p.imageUrl ? '/' + p.imageUrl : '/images/placeholder.png';
    return `
      <tr id="row-${p.id}">
        <td>${p.id}</td>
        <td><strong>${p.name}</strong></td>
        <td><input type="text" id="cat-${p.id}" value="${p.category || 'General'}" style="width: 90px; padding: 4px;"></td>
        <td><input type="text" id="hsn-${p.id}" value="${p.hsn || '1006'}" style="width: 70px; padding: 4px;"></td>
        <td>
          <select id="gst-${p.id}" style="padding: 4px;">
            <option value="0" ${p.gst_rate === 0 ? 'selected' : ''}>0%</option>
            <option value="5" ${p.gst_rate === 5 ? 'selected' : ''}>5%</option>
            <option value="12" ${p.gst_rate === 12 ? 'selected' : ''}>12%</option>
            <option value="18" ${p.gst_rate === 18 ? 'selected' : ''}>18%</option>
          </select>
        </td>
        <td><input type="number" id="price-${p.id}" value="${p.price || p.originalPrice || 0}" style="width: 75px; padding: 4px;"></td>
        <td><input type="number" id="stock-${p.id}" value="${p.stock ?? 0}" style="width: 55px; padding: 4px;"></td>
        <td>
          <div style="display: flex; align-items: center; gap: 6px;">
            <img src="${imgPath}" id="preview-${p.id}" style="width: 35px; height: 35px; object-fit: cover; border-radius: 4px; border: 1px solid #ccc;">
            <input type="file" id="file-${p.id}" accept="image/*" style="font-size: 11px; width: 130px;" onchange="previewProductImage(event, ${p.id})">
          </div>
        </td>
        <td>
          <button class="btn btn-green" style="background:#15803d; color:white; border:none; padding: 4px 8px; border-radius:4px; cursor:pointer;" onclick="saveProductRow(${p.id}, '${p.name.replace(/'/g, "\\'")}')">Save</button>
          <button class="btn" style="background:#c5221f; color:white; border:none; padding: 4px 8px; border-radius:4px; cursor:pointer;" onclick="deleteProductRow(${p.id})">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

// 🟢 2. Low Stock Alert फंक्शन
function checkLowStockAlerts(productsList) {
  const lowItems = productsList.filter(p => (p.stock || 0) <= 10);
  const banner = document.getElementById("low-stock-alert-banner");
  const namesSpan = document.getElementById("low-stock-names");

  if (lowItems.length > 0 && banner && namesSpan) {
    namesSpan.innerHTML = lowItems.map(p => `• <b>${p.name}</b> (स्टॉक: <b>${p.stock}</b>)`).join('<br>');
    banner.style.display = "block";
  } else if (banner) {
    banner.style.display = "none";
  }
}

function previewProductImage(event, id) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.getElementById(`preview-${id}`);
      if (img) img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
}

async function saveProductRow(id, name) {
  const price = document.getElementById(`price-${id}`).value;
  const stock = document.getElementById(`stock-${id}`).value;
  const hsn = document.getElementById(`hsn-${id}`).value;
  const gst_rate = document.getElementById(`gst-${id}`).value;
  const category = document.getElementById(`cat-${id}`).value;
  const fileInput = document.getElementById(`file-${id}`);

  const formData = new FormData();
  formData.append('name', name);
  formData.append('category', category);
  formData.append('price', price);
  formData.append('stock', stock);
  formData.append('hsn', hsn);
  formData.append('gst_rate', gst_rate);

  if (fileInput && fileInput.files && fileInput.files[0]) {
    formData.append('image', fileInput.files[0]);
  }

  try {
    const res = await fetch(`/api/products/${id}`, {
      method: 'PUT',
      body: formData
    });
    const result = await res.json();
    if (result.success) {
      alert('Product & Image updated successfully!');
      loadAdminProducts();
    } else {
      alert('Error: ' + (result.message || result.error || 'Failed to update'));
    }
  } catch (err) {
    alert('Failed to save changes.');
  }
}

async function deleteProductRow(id) {
  if (!confirm('Are you sure you want to delete this product?')) return;
  try {
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      alert('Product deleted successfully');
      loadAdminProducts();
    }
  } catch (err) {
    alert('Failed to delete product');
  }
}

async function loadOrders() {
  const tbody = document.getElementById('admin-orders-table');
  if (!tbody) return;

  try {
    const response = await fetch('/api/orders');
    globalOrders = await response.json();
    renderAdminOrders(globalOrders);
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:red;">Failed to load orders.</td></tr>';
  }
}

function renderAdminOrders(list) {
  const tbody = document.getElementById('admin-orders-table');
  if (!tbody) return;

  tbody.innerHTML = list.slice().reverse().map(o => {
    const date = o.created_at ? new Date(o.created_at).toLocaleDateString('en-GB') : '-';
    return `
      <tr>
        <td><strong>ORD-${o.id}</strong></td>
        <td><strong>${o.business_name || 'Dealer'}</strong> (@${o.username})</td>
        <td><strong>₹${Number(o.total).toLocaleString('en-IN')}</strong></td>
        <td>${o.payment_mode}</td>
        <td>${date}</td>
        <td><span class="stamp stamp-blue">${o.status}</span></td>
        <td>
          <button onclick="printGSTInvoice(${o.id})" class="btn" style="background:#102a43; color:white; padding: 4px 8px; border-radius:4px; cursor:pointer;">🖨️ Invoice</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function loadRetailers() {
  const tbody = document.getElementById('retailers-table');
  if (!tbody) return;

  try {
    const res = await fetch('/api/retailers');
    globalDealers = await res.json();
    renderAdminDealers(globalDealers);
  } catch (err) {
    console.error("Error loading dealers:", err);
  }
}

function renderAdminDealers(list) {
  const tbody = document.getElementById('retailers-table');
  if (!tbody) return;

  if (list.length === 0) { 
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No matching dealers.</td></tr>'; 
    return; 
  }

  tbody.innerHTML = list.map(d => `
    <tr>
      <td>
        <strong>${d.business_name}</strong><br><small>@${d.username} | 📞 ${d.phone}</small><br>
        <!-- 🟢 3. Payment Reminder Button with Username/ID -->
        <button onclick="sendPaymentReminder('${d.phone}', '${d.business_name}', '${d.username}')" style="background:#25D366; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; font-weight:bold; margin-top:4px; font-size:0.75rem;">💬 Send Reminder</button>
      </td>
      <td>State: ${d.state || 'Bihar'}</td>
      <td>${d.scheme_name || 'Regular'}</td>
      <td>${d.discount_percent || 0}%</td>
      <td>₹${d.credit_limit || 0}</td>
      <td><button class="btn btn-green" onclick="saveDealerRow(${d.id})" style="background:#15803d; color:white; border:none; padding: 4px 8px; border-radius:4px;">Save</button></td>
    </tr>
  `).join('');
}

// 🟢 3. सटीक बकाया राशि (Udhaari) के साथ WhatsApp Payment Reminder
window.sendPaymentReminder = async function(phone, businessName, username) {
  let cleanPhone = (phone || '').replace(/\D/g, '');
  if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

  if (!cleanPhone || cleanPhone.length < 12) {
    alert("Invalid phone number for this dealer.");
    return;
  }

  let dueBalance = 0;
  try {
    const cleanUser = (username || '').replace(/^@/, '').trim();
    const res = await fetch('/api/retailers/credit-statement?username=' + encodeURIComponent(cleanUser));
    const data = await res.json();
    const orders = data.orders || [];
    const repayments = data.repayments || [];

    let totalDebit = 0;
    orders.forEach(o => { if (o.status !== 'Cancelled' && o.status !== 'Returned') totalDebit += (o.total || 0); });
    let totalRepaid = 0;
    repayments.forEach(r => totalRepaid += (r.amount || 0));
    dueBalance = Math.max(0, totalDebit - totalRepaid);
  } catch (e) {
    console.error("Could not fetch due balance", e);
  }

  const message = `*🔔 भुगतान रिमाइंडर (Payment Reminder)*\n` +
                  `प्रिय *${businessName}* जी,\n\n` +
                  `शैलपुत्री एग्रो फूड्स प्राइवेट लिमिटेड की ओर से सूचित किया जाता है कि आपकी कुल बकाया उधारी (Outstanding Due): *₹${dueBalance.toLocaleString('en-IN')}* शेष है।\n\n` +
                  `कृपया जल्द से जल्द भुगतान करने की कृपा करें।\n\n` +
                  `हेल्पलाइन: +91 8544241851`;

  const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
};

async function loadDealerSalesSummary() {
  const container = document.getElementById("dealer-sales-summary-box");
  if (!container) return;

  try {
    const resOrders = await fetch('/api/orders');
    const orders = await resOrders.json();
    const resRetailers = await fetch('/api/retailers');
    const retailers = await resRetailers.json();

    const summaryMap = {};
    retailers.forEach(r => {
      summaryMap[r.business_name] = { totalOrders: 0, totalAmount: 0 };
    });

    (orders || []).forEach(o => {
      if (o.status !== 'Cancelled' && o.status !== 'Returned') {
        const firm = o.business_name || 'Cash Dealer';
        if (!summaryMap[firm]) summaryMap[firm] = { totalOrders: 0, totalAmount: 0 };
        summaryMap[firm].totalOrders += 1;
        summaryMap[firm].totalAmount += (o.total || 0);
      }
    });

    let html = `<table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                  <tr style="background:#f1f5f9;">
                    <th style="padding:6px; border:1px solid #cbd5e1; text-align:left;">Dealer / Firm Name</th>
                    <th style="padding:6px; border:1px solid #cbd5e1; text-align:center;">Total Orders</th>
                    <th style="padding:6px; border:1px solid #cbd5e1; text-align:right;">Total Purchase (₹)</th>
                  </tr>`;
    
    let hasData = false;
    for (const [firm, data] of Object.entries(summaryMap)) {
      if (data.totalOrders > 0) {
        hasData = true;
        html += `<tr><td style="padding:6px; border:1px solid #cbd5e1;"><strong>${firm}</strong></td><td style="padding:6px; border:1px solid #cbd5e1; text-align:center;">${data.totalOrders}</td><td style="padding:6px; border:1px solid #cbd5e1; text-align:right; color:#15803d; font-weight:bold;">₹${data.totalAmount.toLocaleString('en-IN')}</td></tr>`;
      }
    }

    if (!hasData) {
      html += `<tr><td colspan="3" style="text-align:center; padding:10px; color:#64748b;">No active dealer sales found.</td></tr>`;
    }

    html += `</table>`;
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<p style="color:red;">Failed to load sales summary.</p>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadCompanySettings();
  loadAdminProducts();
  loadOrders();
  loadRetailers();
  loadDealerSalesSummary();
});
