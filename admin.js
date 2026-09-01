// 0. Authentication Check
if (localStorage.getItem("isAdmin") !== "true" && sessionStorage.getItem("adminAuthToken") !== "admin-auth-token-shailputri") {
  window.location.href = "admin-login.html";
}

let globalProducts = [];
let globalOrders = [];
let globalDealers = [];
let companyConfig = {};

// 1. Company Profile, Bank Details & Logos
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

      // Bank Details
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

  // Bank Details
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

// 2. Manage Products & Image Upload
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
  } catch (err) {
    console.error("Error loading products:", err);
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

function filterAdminProducts() {
  const q = document.getElementById("search-products-input").value.toLowerCase();
  const filtered = globalProducts.filter(p => 
    p.name.toLowerCase().includes(q) || 
    (p.sku && p.sku.toLowerCase().includes(q)) || 
    (p.category && p.category.toLowerCase().includes(q)) ||
    (p.hsn && p.hsn.toLowerCase().includes(q))
  );
  renderAdminProducts(filtered);
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
    console.error(err);
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

// 3. Orders Management with WhatsApp Status Notification
async function loadOrders() {
  const tbody = document.getElementById('admin-orders-table');
  if (!tbody) return;

  try {
    const response = await fetch('/api/orders');
    globalOrders = await response.json();

    if (globalOrders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No orders found.</td></tr>';
      return;
    }

    renderAdminOrders(globalOrders);
  } catch (err) {
    console.error("Error loading orders:", err);
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:red;">Failed to load orders.</td></tr>';
  }
}

function renderAdminOrders(list) {
  const tbody = document.getElementById('admin-orders-table');
  if (!tbody) return;

  tbody.innerHTML = list.slice().reverse().map(o => {
    const date = o.created_at ? new Date(o.created_at).toLocaleDateString('en-GB') : '-';
    const sellerState = (companyConfig.state || 'Assam').toLowerCase();
    const buyerState = (o.shipping_state || o.billing_state || 'Bihar').toLowerCase();
    const isSameState = (sellerState === buyerState);
    const taxType = isSameState ? '<span class="stamp stamp-blue">CGST+SGST</span>' : '<span class="stamp stamp-green">IGST</span>';

    return `
      <tr>
        <td><strong>ORD-${o.id}</strong></td>
        <td style="font-size: 0.85rem;">
          <strong>${o.business_name || 'Dealer'}</strong> (@${o.username})<br>
          📞 ${o.shipping_phone || o.phone || 'N/A'}<br>
          📍 State: <strong>${o.shipping_state || o.billing_state || 'Bihar'}</strong>
        </td>
        <td>${taxType}</td>
        <td><strong>₹${Number(o.total).toLocaleString('en-IN')}</strong></td>
        <td><span class="stamp stamp-blue">${o.payment_mode}</span></td>
        <td>${date}</td>
        <td>
          <select id="status-select-${o.id}" style="font-size:0.85rem; padding:3px; width: 100%;">
            <option value="Pending" ${o.status === 'Pending' ? 'selected' : ''}>Pending</option>
            <option value="Processing" ${o.status === 'Processing' ? 'selected' : ''}>Processing</option>
            <option value="Dispatched" ${o.status === 'Dispatched' ? 'selected' : ''}>Dispatched</option>
            <option value="Delivered" ${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
            <option value="Return Requested" ${o.status === 'Return Requested' ? 'selected' : ''}>Return Requested</option>
            <option value="Returned" ${o.status === 'Returned' ? 'selected' : ''}>Returned (Refund)</option>
            <option value="Cancelled" ${o.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </td>
        <td>
          <div style="display: flex; gap: 4px;">
            <button onclick="saveOrderStatusAndNotify(${o.id}, '${o.shipping_phone || o.phone || ''}', '${(o.business_name || o.username || '').replace(/'/g, "\\'")}')" class="btn btn-green" style="background:#15803d; color:white; border:none; padding: 4px 8px; font-size: 0.75rem; border-radius:4px; cursor:pointer; white-space: nowrap;">
              💾 Save & 📲 WA
            </button>
            <button onclick="printGSTInvoice(${o.id})" class="btn" style="background:#102a43; color:white; border:none; padding: 4px 8px; font-size: 0.75rem; border-radius:4px; cursor:pointer;">🖨️ Invoice</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterAdminOrders() {
  const q = document.getElementById("search-orders-input").value.toLowerCase();
  const filtered = globalOrders.filter(o => 
    (`ORD-${o.id}`).toLowerCase().includes(q) || 
    (o.business_name && o.business_name.toLowerCase().includes(q)) || 
    (o.username && o.username.toLowerCase().includes(q)) || 
    (o.shipping_state && o.shipping_state.toLowerCase().includes(q)) || 
    (o.shipping_phone && o.shipping_phone.includes(q))
  );
  renderAdminOrders(filtered);
}

async function saveOrderStatusAndNotify(id, phone, dealerName) {
  const selectElem = document.getElementById(`status-select-${id}`);
  if (!selectElem) return;
  const status = selectElem.value;

  try {
    const res = await fetch(`/api/orders/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status })
    });
    const data = await res.json();
    
    if (data.success) {
      alert(`Order #ORD-${id} status updated to: ${status}`);

      // Automated WhatsApp Notification
      const cleanPhone = (phone || '').replace(/\D/g, '');
      const targetPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

      const text = encodeURIComponent(
        `📦 *SHAILPUTRI AGRO FOODS PVT LTD*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `प्रिय *${dealerName || 'Dealer Partner'}*,\n` +
        `आपके *Order #ORD-${id}* का स्टेटस अपडेट कर दिया गया है:\n\n` +
        `📌 *Status:* ${status}\n\n` +
        `📞 सहायता के लिए संपर्क करें: +91 8544241851\n` +
        `धन्यवाद!`
      );

      if (targetPhone) {
        window.open(`https://wa.me/${targetPhone}?text=${text}`, '_blank');
      } else {
        window.open(`https://wa.me/?text=${text}`, '_blank');
      }

      loadOrders();
    } else {
      alert(data.message || "Failed to update status");
    }
  } catch (e) {
    alert("Server error while updating order status.");
  }
}

// 4. Dealer Management
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
      <td><strong>${d.business_name}</strong><br><small>@${d.username} | 📞 ${d.phone}</small></td>
      <td>
        State: <input type="text" id="state-${d.id}" value="${d.state || 'Bihar'}" style="width: 80px;"><br>
        GSTIN: <input type="text" id="gstin-${d.id}" value="${d.gstin || ''}" placeholder="22AAAAA0000A1Z5" style="width: 120px; margin-top: 3px;">
      </td>
      <td>
        <select id="tier-${d.id}">
          <option value="Regular" ${d.scheme_name === 'Regular' ? 'selected' : ''}>Regular (0%)</option>
          <option value="Silver" ${d.scheme_name.includes('Silver') ? 'selected' : ''}>Silver (5%)</option>
          <option value="Gold" ${d.scheme_name.includes('Gold') ? 'selected' : ''}>Gold (10%)</option>
          <option value="Diamond" ${d.scheme_name.includes('Diamond') ? 'selected' : ''}>Diamond (15%)</option>
        </select>
      </td>
      <td><input type="number" id="disc-${d.id}" value="${d.discount_percent || 0}" style="width: 50px;"> %</td>
      <td>₹<input type="number" id="limit-${d.id}" value="${d.credit_limit || 0}" style="width: 80px;"></td>
      <td><button class="btn btn-green" onclick="saveDealerRow(${d.id})" style="background:#15803d; color:white; border:none; padding: 4px 8px; border-radius:4px; cursor:pointer;">Save</button></td>
    </tr>
  `).join('');
}

async function saveDealerRow(id) {
  const schemeName = document.getElementById(`tier-${id}`).value;
  const discountPercent = document.getElementById(`disc-${id}`).value;
  const creditLimit = document.getElementById(`limit-${id}`).value;
  const state = document.getElementById(`state-${id}`).value;
  const gstin = document.getElementById(`gstin-${id}`).value;

  try {
    await fetch('/api/retailers/update-scheme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, schemeName, discountPercent, creditLimit, state, gstin })
    });
    alert('Dealer Details Saved!');
    loadRetailers();
  } catch (err) {
    alert('Failed to update dealer');
  }
}

// 5. Master Invoice Generator (With Bank Details & Signature Stamp)
function printGSTInvoice(orderId) {
  const order = globalOrders.find(o => o.id === orderId);
  if (!order) return;

  const sellerState = (companyConfig.state || 'Assam').trim().toLowerCase();
  const buyerState = (order.shipping_state || order.billing_state || 'Bihar').trim().toLowerCase();
  const isSameState = (sellerState === buyerState);

  const bulkThreshold = companyConfig.bulk_qty_threshold || 10;
  const bulkExtraPercent = companyConfig.bulk_discount_percent !== undefined ? companyConfig.bulk_discount_percent : 3;

  let rawItems = [];
  try { rawItems = JSON.parse(order.items); } catch(e) { rawItems = [{ name: 'Products', price: order.total }]; }

  const grouped = {};
  rawItems.forEach(i => {
    const k = i.name;
    if (!grouped[k]) grouped[k] = { ...i, qty: 1 };
    else grouped[k].qty += 1;
  });

  let grossCatalogTotal = 0;
  let totalDiscountGiven = 0;
  let netTaxableTotal = 0;
  let totalCGST = 0, totalSGST = 0, totalIGST = 0;
  let rowsHtml = '';

  Object.values(grouped).forEach((item, idx) => {
    const gstRate = item.gst_rate || 5;
    const catalogMRP = item.originalPrice || (item.price > 1200 ? 1380 : item.price);

    let finalPricePerUnit = item.price;
    if (item.qty >= bulkThreshold) {
      finalPricePerUnit = Math.round(item.price * (1 - (bulkExtraPercent / 100)));
    }

    const itemGross = catalogMRP * item.qty;
    const itemFinalTotal = finalPricePerUnit * item.qty;
    const itemDiscount = Math.max(0, itemGross - itemFinalTotal);
    const discountPerCase = (itemDiscount / item.qty);

    grossCatalogTotal += itemGross;
    totalDiscountGiven += itemDiscount;

    const baseTaxable = Math.round((itemFinalTotal / (1 + (gstRate / 100))) * 100) / 100;
    const itemTaxAmount = Math.round((itemFinalTotal - baseTaxable) * 100) / 100;
    netTaxableTotal += baseTaxable;

    let taxBreakup = '';
    if (isSameState) {
      const half = Math.round((itemTaxAmount / 2) * 100) / 100;
      totalCGST += half;
      totalSGST += half;
      taxBreakup = `CGST (${gstRate/2}%): ₹${half}<br>SGST (${gstRate/2}%): ₹${half}`;
    } else {
      totalIGST += itemTaxAmount;
      taxBreakup = `IGST (${gstRate}%): ₹${itemTaxAmount}`;
    }

    rowsHtml += `
      <tr>
        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${idx + 1}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1;"><strong>${item.name}</strong></td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${item.hsn || '1512'}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;"><strong>${item.qty}</strong></td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right;">₹${catalogMRP.toFixed(2)}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right; color: #166534; font-weight:bold;">-₹${discountPerCase.toFixed(2)}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right;">₹${baseTaxable.toFixed(2)}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 0.8rem;">${taxBreakup}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right;"><strong>₹${itemFinalTotal.toFixed(2)}</strong></td>
      </tr>
    `;
  });

  const calculatedGrandTotal = netTaxableTotal + totalCGST + totalSGST + totalIGST;

  const win = window.open('', '_blank');
  win.document.write(`
    <html>
      <head>
        <title>GST Tax Invoice - ORD-${order.id}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 25px; color: #1e293b; font-size: 13px; margin: 0 auto; max-width: 920px; }
          .header-container { text-align: center; border-bottom: 2px solid #102a43; padding-bottom: 12px; margin-bottom: 15px; position: relative; }
          .logo-top { position: absolute; right: 0; top: 0; height: 80px; max-width: 150px; object-fit: contain; }
          .grid-2 { display: flex; justify-content: space-between; gap: 15px; margin-bottom: 12px; }
          .box { flex: 1; border: 1px solid #cbd5e1; padding: 10px; border-radius: 4px; background: #f8fafc; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background: #102a43; color: white; padding: 7px; font-size: 12px; border: 1px solid #102a43; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header-container">
          ${companyConfig.logo_url ? `<img src="${companyConfig.logo_url}" class="logo-top" alt="Logo">` : ''}
          <h1 style="margin: 0 0 4px 0; color: #102a43; font-size: 24px; letter-spacing: 0.5px;">${companyConfig.company_name || 'SHAILPUTRI AGRO FOODS PRIVATE LIMITED'}</h1>
          <p style="margin: 2px 0; font-size: 13px; color: #334155; font-weight: 500;">${companyConfig.address}</p>
          <p style="margin: 4px 0 0 0; font-size: 11.5px; color: #475569;">
            <strong>GSTIN:</strong> ${companyConfig.gstin} &nbsp;|&nbsp; <strong>FSSAI:</strong> ${companyConfig.fssai} &nbsp;|&nbsp; <strong>CIN:</strong> ${companyConfig.cin} &nbsp;|&nbsp; <strong>UDYAM:</strong> ${companyConfig.udyam}
          </p>
        </div>

        <h3 style="text-align: center; margin: 5px 0 12px 0; letter-spacing: 1px; text-decoration: underline; color: #102a43;">TAX INVOICE (${isSameState ? 'INTRA-STATE: CGST + SGST' : 'INTER-STATE: IGST'})</h3>

        <div class="grid-2">
          <div class="box">
            <strong style="color:#102a43; font-size: 13px;">🏢 BILLED TO (Buyer Details):</strong><br>
            <strong style="font-size: 13px;">${order.business_name || 'Dealer'}</strong><br>
            Address: ${order.billing_address || 'N/A'}<br>
            State: <strong>${order.billing_state || 'Bihar'}</strong> | GSTIN: <strong>${order.buyer_gstin || 'Unregistered'}</strong>
          </div>
          <div class="box">
            <strong style="color:#102a43; font-size: 13px;">🚚 SHIPPED TO (Delivery Point):</strong><br>
            Address: ${order.shipping_address}<br>
            Delivery State: <strong>${order.shipping_state || 'Bihar'}</strong><br>
            Contact Mobile: <strong>${order.shipping_phone || order.phone || 'N/A'}</strong>
          </div>
        </div>

        <table style="margin-bottom: 10px;">
          <tr>
            <td><strong>Invoice No:</strong> ORD-${order.id}</td>
            <td><strong>Date:</strong> ${new Date(order.created_at).toLocaleDateString('en-GB')}</td>
            <td><strong>Payment Mode:</strong> <span style="font-weight:bold; color:#0088cc;">${order.payment_mode}</span></td>
            <td><strong>Place of Supply:</strong> ${order.shipping_state || 'Bihar'}</td>
          </tr>
        </table>

        <table>
          <thead>
            <tr>
              <th style="width: 4%;">#</th>
              <th>Item Description</th>
              <th style="width: 8%;">HSN</th>
              <th style="width: 6%; text-align: center;">Qty</th>
              <th style="width: 10%; text-align: right;">MRP (₹)</th>
              <th style="width: 10%; text-align: right;">Disc (₹)</th>
              <th style="width: 12%; text-align: right;">Taxable (₹)</th>
              <th style="width: 22%;">GST Split</th>
              <th style="width: 14%; text-align: right;">Total (₹)</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>

        <div style="display: flex; justify-content: space-between; margin-top: 15px; align-items: flex-start;">
          <!-- Bank Details -->
          <div style="width: 380px; border: 1px dashed #94a3b8; padding: 10px; border-radius: 4px; background: #f8fafc; font-size: 11.5px;">
            <strong style="color: #102a43; font-size: 12px;">🏦 Bank & Payment Details:</strong><br>
            Bank Name: <strong>${companyConfig.bank_name || 'State Bank of India'}</strong><br>
            Account No: <strong>${companyConfig.bank_account_no || '423589123456'}</strong><br>
            IFSC Code: <strong>${companyConfig.bank_ifsc || 'SBIN0001234'}</strong><br>
            Branch: <strong>${companyConfig.bank_branch || 'Purnia Main Branch'}</strong>
          </div>

          <!-- Total Calculations -->
          <div style="width: 350px; border: 1px solid #cbd5e1; padding: 10px; border-radius: 4px; background: #f8fafc;">
            <div style="display: flex; justify-content: space-between;"><span>Gross Total (MRP):</span><span>₹${grossCatalogTotal.toFixed(2)}</span></div>
            <div style="display: flex; justify-content: space-between; color: #166534; font-weight: bold; margin-top: 2px;">
              <span>Total Discount Given:</span><span>-₹${totalDiscountGiven.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; border-top: 1px dashed #cbd5e1; padding-top: 4px; margin-top: 4px;">
              <span>Net Taxable Value:</span><span>₹${netTaxableTotal.toFixed(2)}</span>
            </div>
            ${isSameState ? `
              <div style="display: flex; justify-content: space-between; color: #0369a1; margin-top: 3px;"><span>CGST:</span><span>₹${totalCGST.toFixed(2)}</span></div>
              <div style="display: flex; justify-content: space-between; color: #0369a1; margin-top: 3px;"><span>SGST:</span><span>₹${totalSGST.toFixed(2)}</span></div>
            ` : `
              <div style="display: flex; justify-content: space-between; color: #15803d; margin-top: 3px;"><span>IGST:</span><span>₹${totalIGST.toFixed(2)}</span></div>
            `}
            <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: bold; border-top: 1.5px solid #94a3b8; margin-top: 6px; padding-top: 6px;">
              <span>Grand Invoice Value:</span><span>₹${calculatedGrandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div style="margin-top: 35px; display: flex; justify-content: space-between; align-items: flex-end;">
          <div><small style="color: #64748b;">Thank you for doing wholesale business with Shailputri Agro Foods!</small></div>
          <div style="text-align: center;">
            ${companyConfig.signatory_url ? `<img src="${companyConfig.signatory_url}" style="height: 60px; max-width: 140px; object-fit: contain; margin-bottom: 4px;"><br>` : ''}
            <strong style="font-size: 12px; color: #102a43;">For ${companyConfig.company_name || 'SHAILPUTRI AGRO FOODS PVT LTD'}</strong><br>
            <span style="font-size: 11px; color: #64748b;">Authorized Signatory</span>
          </div>
        </div>

        <div style="text-align: center; margin-top: 25px; display: flex; justify-content: center; gap: 12px;" class="no-print">
          <button onclick="window.print()" style="background:#102a43; color:white; padding:10px 20px; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size: 14px;">
            🖨️ Print / Save PDF
          </button>
        </div>
      </body>
    </html>
  `);
  win.document.close();
}

// Initial Data Load
loadCompanySettings();
loadAdminProducts();
loadOrders();
loadRetailers();
