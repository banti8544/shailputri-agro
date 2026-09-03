let allProducts = [];
let cart = JSON.parse(localStorage.getItem("shailputri_cart") || "[]");
let currentCreditLimit = 0;
let currentDueBalance = 0;
let loggedInUser = (localStorage.getItem("username") || "").replace(/^@/, '').trim();
let loggedInBusiness = localStorage.getItem("businessName") || "";
let activeModalProduct = null;
let companyBulkConfig = { threshold: 10, discount: 1 };
const UPI_ID = "8544241851.ibz@icici";

document.addEventListener("DOMContentLoaded", async () => {
  renderAuthHeader();
  await loadCompanyBulkConfig();
  await loadProducts();
  syncUserProfile();
  updateCartUI();
});

document.addEventListener("DOMContentLoaded", () => {
  const printBtn = document.getElementById("print-ledger-btn");
  if (printBtn) {
    printBtn.addEventListener("click", printLedgerStatement);
  }
});

async function loadCompanyBulkConfig() {
  try {
    const res = await fetch('/api/company-settings');
    const cfg = await res.json();
    if (cfg.bulk_qty_threshold) companyBulkConfig.threshold = cfg.bulk_qty_threshold;
    if (cfg.bulk_discount_percent !== undefined) companyBulkConfig.discount = cfg.bulk_discount_percent;
  } catch (e) {}
}

function renderAuthHeader() {
  const slot = document.getElementById("auth-header-slot");
  if (!slot) return;

  if (loggedInUser) {
    slot.innerHTML = `
      <div class="user-pill" style="background:#f8fafc; border:1px solid #cbd5e1; padding:6px 12px; border-radius:4px; font-size:0.85rem; line-height:1.3;">
        👤 <strong>${loggedInBusiness || loggedInUser}</strong> (@${loggedInUser})<br>
        <small>💳 Credit Limit: <strong>₹${Number(currentCreditLimit).toLocaleString('en-IN')}</strong></small>
        <a href="javascript:void(0)" onclick="openCreditLedgerModal()" style="color:#0284c7; margin-left:6px; text-decoration:underline;">Statement</a> |
        <a href="javascript:void(0)" onclick="logout()" style="color:#ef4444; margin-left:4px; font-weight:bold;">Logout</a>
      </div>
    `;
  } else {
    slot.innerHTML = `
      <div style="display:flex; gap:8px;">
        <a href="login.html" style="background:#102a43; color:white; padding:6px 14px; border-radius:4px; text-decoration:none; font-weight:bold; font-size:0.85rem;">Dealer Login</a>
        <a href="signup.html" style="background:#70b028; color:white; padding:6px 14px; border-radius:4px; text-decoration:none; font-weight:bold; font-size:0.85rem;">Register</a>
      </div>
    `;
  }
}

async function syncUserProfile() {
  if (!loggedInUser) return;
  try {
    const res = await fetch('/api/retailers/me?username=' + encodeURIComponent(loggedInUser));
    const data = await res.json();
    if (data && data.success) {
      loggedInBusiness = data.business_name || loggedInBusiness;
      currentCreditLimit = data.credit_limit || 0;
      localStorage.setItem("businessName", loggedInBusiness);
      if (data.phone) localStorage.setItem("phone", data.phone);
      if (data.address) localStorage.setItem("address", data.address);
      if (data.state) localStorage.setItem("state", data.state);
      if (data.gstin) localStorage.setItem("gstin", data.gstin);
      renderAuthHeader();
    }
  } catch (e) {}
}

async function loadProducts(retryCount = 0) {
  const container = document.getElementById("catalog-grid-container");
  try {
    const response = await fetch('/api/products' + (loggedInUser ? '?username=' + encodeURIComponent(loggedInUser) : ''));
    if (!response.ok) throw new Error("Server not ready");
    const data = await response.json();
    allProducts = data.products || [];
    currentCreditLimit = data.creditLimit || 0;

    const schemeInfo = document.getElementById("scheme-info");
    if (schemeInfo && loggedInUser) {
      schemeInfo.textContent = `Tier: ${data.schemeName || 'Regular'} (${data.discountPercent || 0}% Off Active)`;
    }

    renderCategoriesSidebar(allProducts);
    renderProducts(allProducts);
    renderAuthHeader();
  } catch (err) {
    if (retryCount < 3) {
      setTimeout(() => loadProducts(retryCount + 1), 2000);
    } else if (container) {
      container.innerHTML = "<p style='color:red;'>Could not load products. Please refresh.</p>";
    }
  }
}

function renderCategoriesSidebar(products) {
  const list = document.getElementById("sidebar-categories");
  if (!list) return;
  const categories = ["ALL", ...new Set(products.map(p => p.category).filter(Boolean))];
  list.innerHTML = categories.map(c => `
    <li onclick="filterByCategory('${c}', this)" class="${c === 'ALL' ? 'active' : ''}">
      <span>${c === 'ALL' ? 'All Wholesale Items' : c}</span>
      <small style="color:#94a3b8;">(${c === 'ALL' ? products.length : products.filter(p => p.category === c).length})</small>
    </li>
  `).join('');
}

function filterByCategory(cat, element) {
  const items = document.querySelectorAll("#sidebar-categories li");
  items.forEach(li => li.classList.remove("active"));
  if (element) element.classList.add("active");

  const heading = document.getElementById("catalog-heading");
  if (heading) heading.textContent = (cat === 'ALL') ? 'All Wholesale Products' : `${cat} Wholesale Range`;

  if (cat === "ALL") {
    renderProducts(allProducts);
  } else {
    renderProducts(allProducts.filter(p => p.category === cat));
  }
}

function renderProducts(products) {
  const container = document.getElementById("catalog-grid-container");
  if (!container) return;

  if (products.length === 0) {
    container.innerHTML = '<p style="padding: 2rem; color: #64748b;">No products available.</p>';
    return;
  }

  container.innerHTML = products.map(p => {
    const discountAmount = Math.max(0, (p.originalPrice || p.price) - p.price);
    const badgeHtml = discountAmount > 0 ? `<div class="badge-discount">-₹${discountAmount}</div>` : '';
    let rawImg = p.imageUrl || 'images/placeholder.png';
    let cleanImg = rawImg.startsWith('http') ? rawImg : '/' + rawImg.replace(/^\/+/, '');
    const unitText = p.unit || 'case';

    return `
      <div class="product-card">
        ${badgeHtml}
        <div class="img-wrap">
          <img src="${cleanImg}" alt="${p.name}" onerror="this.onerror=null; this.src='/images/placeholder.png';">
          <button class="btn-quickview" onclick="openQuickView(${p.id})">Quick View</button>
        </div>

        <div class="card-info">
          <h4 title="${p.name}">${p.name}</h4>
          <div class="price-row">
             ${(p.originalPrice && p.originalPrice > p.price) ? `<span class="orig-price">₹${p.originalPrice}</span>` : ''}
            <span class="final-price">₹${p.price}</span> <small style="font-size:0.75rem; color:#64748b;">/ ${unitText}</small>
          </div>
          <button class="btn-add-cart" onclick="addToCartDirect(${p.id})">Add to cart</button>
        </div>
      </div>
    `;
  }).join('');
}

function filterProducts() {
  const query = (document.getElementById("search-input").value || "").toLowerCase();
  const filtered = allProducts.filter(p => p.name.toLowerCase().includes(query) || (p.sku && p.sku.toLowerCase().includes(query)) || (p.category && p.category.toLowerCase().includes(query)));
  renderProducts(filtered);
}

function openQuickView(productId) {
  const item = allProducts.find(p => p.id === productId);
  if (!item) return;

  activeModalProduct = item;
  document.getElementById("qv-name").textContent = item.name;

  let rawImg = item.imageUrl || 'images/placeholder.png';
  let cleanImg = rawImg.startsWith('http') ? rawImg : '/' + rawImg.replace(/^\/+/, '');
  document.getElementById("qv-img").src = cleanImg;

  let finalGst = 5;
  if (item.gst_rate !== undefined && item.gst_rate !== null) {
    let parsed = parseInt(String(item.gst_rate).replace(/[^0-9]/g, ''), 10);
    if (parsed > 100) parsed = Math.round(parsed / 100);
    finalGst = isNaN(parsed) ? 5 : parsed;
  }

  document.getElementById("qv-meta").textContent = `SKU: ${item.sku} | HSN: ${item.hsn || '1006'} | GST: ${finalGst}% | Unit: ${item.unit || 'Pcs.'} | Category: ${item.category}`;

  const discountAmount = Math.max(0, (item.originalPrice || item.price) - item.price);
  const qvBadge = document.getElementById("qv-badge");
  if (qvBadge) {
    qvBadge.textContent = `-₹${discountAmount}`;
    qvBadge.style.display = discountAmount > 0 ? 'block' : 'none';
  }

  document.getElementById("qv-orig-price").textContent = (item.originalPrice && item.originalPrice > item.price) ? `₹${item.originalPrice}` : '';
  document.getElementById("qv-final-price").textContent = `₹${item.price}`;

  const bulkQty = companyBulkConfig.threshold || 10;
  const bulkDiscPercent = companyBulkConfig.discount || 3;
  const bulkPrice = Math.round(item.price * (1 - (bulkDiscPercent / 100)));

  const t1Row = document.querySelector(".tier-table tbody tr:nth-child(1) td:nth-child(1)");
  const t2Row = document.querySelector(".tier-table tbody tr:nth-child(2) td:nth-child(1)");
  const t2Disc = document.querySelector(".tier-table tbody tr:nth-child(2) td:nth-child(2)");

  if (t1Row) t1Row.textContent = `1 - ${bulkQty - 1} ${item.unit || 'cases'}`;
  if (t2Row) t2Row.textContent = `${bulkQty}+ ${item.unit || 'cases'} (Bulk)`;
  if (t2Disc) t2Disc.textContent = `Extra ${bulkDiscPercent}%`;

  document.getElementById("qv-tier1-price").textContent = `₹${item.price}`;
  document.getElementById("qv-tier2-price").textContent = `₹${bulkPrice}`;

  document.getElementById("qv-qty-input").value = 1;
  document.getElementById("quickview-modal").style.display = "flex";
}

function closeQuickView() {
  document.getElementById("quickview-modal").style.display = "none";
  activeModalProduct = null;
}

function modalChangeQty(delta) {
  const input = document.getElementById("qv-qty-input");
  let val = parseInt(input.value) || 1;
  val = Math.max(1, val + delta);
  input.value = val;
}

function confirmModalAddToCart() {
  if (!activeModalProduct) return;
  const qty = parseInt(document.getElementById("qv-qty-input").value) || 1;
  pushToCart(activeModalProduct, qty);
  closeQuickView();
}

function addToCartDirect(productId) {
  const item = allProducts.find(p => p.id === productId);
  if (item) pushToCart(item, 1);
}

function pushToCart(item, qty) {
  const existing = cart.find(c => c.id === item.id);
  const currentInCart = existing ? existing.qty : 0;
  const maxStock = item.stock !== undefined ? item.stock : 9999;

  if (currentInCart + qty > maxStock) {
    alert(`Cannot add ${qty} ${item.unit || 'case(s)'}! Only ${maxStock} in stock (Already in cart: ${currentInCart}).`);
    return;
  }

  let itemGSTRate = 5;
  if (item.gst_rate !== undefined && item.gst_rate !== null) {
    let parsed = parseInt(String(item.gst_rate).replace(/[^0-9]/g, ''), 10);
    if (parsed > 100) parsed = Math.round(parsed / 100);
    itemGSTRate = isNaN(parsed) ? 5 : parsed;
  }

  const itemUnit = item.unit || 'Pcs.';

  if (existing) {
    existing.qty += qty;
    existing.gst_rate = itemGSTRate;
    existing.unit = itemUnit;
    existing.hsn = item.hsn || existing.hsn || '1006';
  } else {
    cart.push({
      id: item.id,
      name: item.name,
      originalPrice: item.originalPrice || item.price,
      baseDiscountedPrice: item.price,
      price: item.price,
      sku: item.sku,
      hsn: item.hsn || '1006',
      gst_rate: itemGSTRate,
      unit: itemUnit,
      qty: qty,
      stock: maxStock
    });
  }

  localStorage.setItem("shailputri_cart", JSON.stringify(cart));
  updateCartUI();
  alert(`🛒 ${qty} x ${item.name} added to cart!`);
}

function changeQty(index, delta) {
  if (!cart[index]) return;
  const item = cart[index];
  const newQty = item.qty + delta;

  const catalogItem = allProducts.find(p => p.id === item.id);
  const availableStock = catalogItem ? catalogItem.stock : (item.stock || 9999);

  if (newQty <= 0) {
    cart.splice(index, 1);
  } else if (newQty > availableStock) {
    alert(`Cannot exceed available stock! Only ${availableStock} ${item.unit || 'case(s)'} available.`);
    return;
  } else {
    item.qty = newQty;
  }

  localStorage.setItem("shailputri_cart", JSON.stringify(cart));
  updateCartUI();
}

function removeFromCart(index) {
  cart.splice(index, 1);
  localStorage.setItem("shailputri_cart", JSON.stringify(cart));
  updateCartUI();
}

function getEffectiveItemPrice(item) {
  const bulkQty = companyBulkConfig.threshold || 10;
  const bulkDisc = companyBulkConfig.discount || 3;
  const basePrice = item.baseDiscountedPrice || item.price;
  
  if (item.qty >= bulkQty) {
    return Math.round(basePrice * (1 - (bulkDisc / 100)));
  }
  return basePrice;
}

function updateCartUI() {
  const totalCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const cartNav = document.getElementById("cart-nav-badge");
  if (cartNav) cartNav.textContent = `Cart (${totalCount})`;

  const itemsContainer = document.getElementById("cart-items");
  const totalDisplay = document.getElementById("cart-total-display");
  const guestPrompt = document.getElementById("guest-checkout-prompt");
  const placeOrderBtn = document.getElementById("place-order-btn");
  const shippingBox = document.getElementById("shipping-address-box");
  const paymentBox = document.getElementById("payment-mode-box");

  if (!itemsContainer) return;

  if (cart.length === 0) {
    itemsContainer.innerHTML = "<p style='color:#64748b;'>Your wholesale cart is empty.</p>";
    totalDisplay.textContent = "Total: ₹0";
    if (guestPrompt) guestPrompt.style.display = "none";
    if (placeOrderBtn) placeOrderBtn.style.display = "none";
    if (shippingBox) shippingBox.style.display = "none";
    if (paymentBox) paymentBox.style.display = "none";
    return;
  }

  let total = 0;
  itemsContainer.innerHTML = cart.map((item, index) => {
    const effectivePrice = getEffectiveItemPrice(item);
    item.price = effectivePrice;
    const subtotal = effectivePrice * item.qty;
    total += subtotal;

    const isBulkApplied = item.qty >= (companyBulkConfig.threshold || 10);
    const itemGst = item.gst_rate > 100 ? Math.round(item.gst_rate / 100) : (item.gst_rate ?? 5);

    return `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:0.8rem 0; border-bottom:1px solid #e2e8f0;">
        <div style="flex:1;">
          <strong style="color:#102a43;">${item.name}</strong><br>
          <small style="color:#64748b;">
            MRP: <s>₹${item.originalPrice || item.price}</s> | Effective: <strong>₹${effectivePrice}</strong> / ${item.unit || 'case'} (GST: ${itemGst}%)
            ${isBulkApplied ? `<span style="color:#15803d; font-weight:bold; margin-left:4px;">(Bulk ${companyBulkConfig.discount}% Off Applied)</span>` : ''}
          </small>
        </div>
        
        <div style="display:flex; align-items:center; gap:8px; margin:0 1.5rem;">
          <button onclick="changeQty(${index}, -1)" style="width:28px; height:28px; border:1px solid #cbd5e1; background:#f1f5f9; border-radius:4px; font-weight:bold; cursor:pointer;">-</button>
          <span style="font-weight:bold; min-width:20px; text-align:center;">${item.qty}</span>
          <button onclick="changeQty(${index}, 1)" style="width:28px; height:28px; border:1px solid #cbd5e1; background:#f1f5f9; border-radius:4px; font-weight:bold; cursor:pointer;">+</button>
        </div>

        <div style="text-align:right; min-width:90px;">
          <span style="font-weight:bold; color:#5c9320;">₹${subtotal.toLocaleString('en-IN')}</span><br>
          <button onclick="removeFromCart(${index})" style="background:none; border:none; color:#c5221f; font-size:0.8rem; cursor:pointer; text-decoration:underline;">Remove</button>
        </div>
      </div>
    `;
  }).join('');

  totalDisplay.textContent = `Total: ₹${total.toLocaleString('en-IN')}`;

  if (!loggedInUser) {
    if (guestPrompt) guestPrompt.style.display = "block";
    if (placeOrderBtn) placeOrderBtn.style.display = "none";
    if (shippingBox) shippingBox.style.display = "none";
    if (paymentBox) paymentBox.style.display = "none";
  } else {
    if (guestPrompt) guestPrompt.style.display = "none";
    if (placeOrderBtn) placeOrderBtn.style.display = "block";
    if (shippingBox) {
      shippingBox.style.display = "block";
      const shipInput = document.getElementById("cart-shipping-address");
      const phoneInput = document.getElementById("cart-shipping-phone");
      if (shipInput && !shipInput.value) shipInput.value = localStorage.getItem("address") || "";
      if (phoneInput && !phoneInput.value) phoneInput.value = localStorage.getItem("phone") || "";
    }
    if (paymentBox) paymentBox.style.display = "block";
  }
}

function placeOrder() {
  if (!loggedInUser) {
    alert("Please login to place wholesale orders!");
    window.location.href = "login.html";
    return;
  }
  if (cart.length === 0) return alert("Your cart is empty!");

  const paymentMode = document.querySelector('input[name="paymentMethod"]:checked')?.value || "Online";
  let total = 0;
  cart.forEach(item => {
    const effPrice = getEffectiveItemPrice(item);
    total += (effPrice * item.qty);
  });

  if (paymentMode === "Credit" && total > currentCreditLimit) {
    return alert(`Cannot place order on Credit! Order Total exceeds available Credit Limit (₹${currentCreditLimit}).`);
  }

  if (paymentMode === "Online") {
    const gatewayModal = document.getElementById("payment-gateway-modal");
    if (gatewayModal) {
      document.getElementById("gateway-total-display").textContent = `₹${total.toLocaleString('en-IN')}`;
      const upiLink = `upi://pay?pa=${UPI_ID}&pn=Shailputri%20Agro&am=${total}&cu=INR`;
      document.getElementById("gateway-upi-qr").src = `https://api.qrserver.com/v1/create-qr-code/?size=165x165&data=${encodeURIComponent(upiLink)}`;
      
      const utrInput = document.getElementById("upi-utr-input");
      if (utrInput) utrInput.value = "";

      switchPaymentTab('upi');
      gatewayModal.style.display = "flex";
    }
  } else {
    executeFinalOrder(paymentMode);
  }
}

function closePaymentGateway() {
  const modal = document.getElementById("payment-gateway-modal");
  if (modal) modal.style.display = "none";
}

function switchPaymentTab(tab) {
  const tabUpi = document.getElementById("pg-tab-upi");
  const tabCards = document.getElementById("pg-tab-cards");
  const tabNet = document.getElementById("pg-tab-netbanking");

  const btnUpi = document.getElementById("tab-btn-upi");
  const btnCards = document.getElementById("tab-btn-cards");
  const btnNet = document.getElementById("tab-btn-netbanking");

  if (tabUpi) tabUpi.style.display = (tab === 'upi') ? 'block' : 'none';
  if (tabCards) tabCards.style.display = (tab === 'cards') ? 'block' : 'none';
  if (tabNet) tabNet.style.display = (tab === 'netbanking') ? 'block' : 'none';

  if (btnUpi) { btnUpi.style.background = (tab === 'upi') ? '#102a43' : '#e2e8f0'; btnUpi.style.color = (tab === 'upi') ? '#fff' : '#334155'; }
  if (btnCards) { btnCards.style.background = (tab === 'cards') ? '#102a43' : '#e2e8f0'; btnCards.style.color = (tab === 'cards') ? '#fff' : '#334155'; }
  if (btnNet) { btnNet.style.background = (tab === 'netbanking') ? '#102a43' : '#e2e8f0'; btnNet.style.color = (tab === 'netbanking') ? '#fff' : '#334155'; }
}

function confirmUpiPayment() {
  const utr = (document.getElementById("upi-utr-input")?.value || "").trim();
  closePaymentGateway();
  const modeText = utr ? `Online UPI (UTR: ${utr})` : `Online UPI (QR Paid)`;
  executeFinalOrder(modeText);
}

function handleCardPayment(e) {
  e.preventDefault();
  const cardNum = (document.getElementById("card-num")?.value || "").slice(-4);
  closePaymentGateway();
  executeFinalOrder(`Card Payment (Ending in •••• ${cardNum || 'XXXX'})`);
}

function handleNetBankingPayment() {
  const bank = document.getElementById("netbank-select")?.value || "Net Banking";
  closePaymentGateway();
  executeFinalOrder(`Net Banking (${bank})`);
}

async function executeFinalOrder(finalPaymentMode) {
  let total = 0;
  const orderedItems = [];
  cart.forEach(item => {
    const effPrice = getEffectiveItemPrice(item);
    total += (effPrice * item.qty);
    for (let i = 0; i < item.qty; i++) {
      let rawGst = item.gst_rate;
      if (rawGst > 100) rawGst = Math.round(rawGst / 100);
      orderedItems.push({
        id: item.id,
        name: item.name,
        originalPrice: item.originalPrice || item.price,
        price: effPrice,
        sku: item.sku,
        hsn: item.hsn || '1006',
        unit: item.unit || 'Pcs.',
        gst_rate: rawGst || 5
      });
    }
  });

  const shipTextarea = document.getElementById("cart-shipping-address");
  const shipPhoneInput = document.getElementById("cart-shipping-phone");
  const shipStateSelect = document.getElementById("cart-shipping-state");

  const shippingAddress = shipTextarea?.value.trim() || localStorage.getItem("address") || "Same as Billing Address";
  const shippingPhone = shipPhoneInput?.value.trim() || localStorage.getItem("phone") || "";
  const shippingState = shipStateSelect ? shipStateSelect.value : "Bihar";

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        items: orderedItems, 
        total, 
        username: loggedInUser, 
        paymentMode: finalPaymentMode, 
        shippingAddress, 
        shippingPhone, 
        shippingState 
      })
    });
    const data = await res.json();

    if (data.success) {
      cart = [];
      localStorage.removeItem("shailputri_cart");
      updateCartUI();
      await loadProducts();

      document.getElementById("place-order-btn").style.display = "none";
      const actionsDiv = document.getElementById("order-success-actions");
      actionsDiv.style.display = "block";
      actionsDiv.innerHTML = `
        <div style="background:#e6f4ea; padding:1.5rem; border-radius:8px; text-align:center; border:1px solid #c6ebd0;">
          <h3 style="color:#137333; margin:0 0 0.5rem 0;">🎉 Order #ORD-${data.orderId} Confirmed!</h3>
          <p style="margin:0 0 0.4rem 0; color:#1e293b;">Payment Method: <strong>${finalPaymentMode}</strong></p>
          <p style="margin:0 0 1rem 0; color:#475569;">Total Amount: <strong>₹${total.toLocaleString('en-IN')}</strong></p>
          <div style="display:flex; justify-content:center; gap:10px;">
            <button onclick="showSection('ledger')" style="background:#102a43; color:white; border:none; padding:8px 16px; border-radius:4px; font-weight:bold; cursor:pointer;">📄 View in Ledger</button>
            <button onclick="sendWhatsAppInvoice(${data.orderId})" style="background:#25D366; color:white; border:none; padding:8px 16px; border-radius:4px; font-weight:bold; cursor:pointer;">📲 WhatsApp Receipt</button>
          </div>
        </div>
      `;

      window.sendWhatsAppInvoice(data.orderId);
    } else {
      alert(data.message || "Order failed.");
    }
  } catch (err) {
    alert("Server error while placing order.");
  }
}

function showSection(sectionId) {
  document.getElementById("catalog-section").style.display = (sectionId === 'catalog') ? 'block' : 'none';
  document.getElementById("cart-section").style.display = (sectionId === 'cart') ? 'block' : 'none';
  document.getElementById("ledger-section").style.display = (sectionId === 'ledger') ? 'block' : 'none';
  document.getElementById("profile-section").style.display = (sectionId === 'profile') ? 'block' : 'none';

  if (sectionId === 'ledger') loadLedgerOrders();
  if (sectionId === 'profile') loadProfileForm();
  if (sectionId === 'cart') updateCartUI();
}

async function loadLedgerOrders() {
  const invoiceList = document.getElementById('recent-orders-list');
  if (!invoiceList) return;
  
  if (!loggedInUser) {
    invoiceList.innerHTML = '<p>Please <a href="login.html">Login</a> to view ledger.</p>';
    return;
  }

  invoiceList.innerHTML = '<p>Loading your orders...</p>';

  try {
    const res = await fetch('/api/orders');
    const orders = await res.json();
    const cleanUser = loggedInUser.replace(/^@/, '').toLowerCase();
    const userOrders = (orders || []).filter(o => (o.username || '').replace(/^@/, '').toLowerCase() === cleanUser);

    const totalAmt = userOrders.reduce((sum, o) => o.status !== 'Cancelled' && o.status !== 'Returned' ? sum + o.total : sum, 0);
    document.getElementById('ledger-total-orders').textContent = userOrders.length;
    document.getElementById('ledger-total-amount').textContent = `₹${totalAmt.toLocaleString('en-IN')}`;

    if (userOrders.length === 0) {
      invoiceList.innerHTML = '<p style="color:#64748b;">No previous orders found.</p>';
      return;
    }

    invoiceList.innerHTML = userOrders.slice().reverse().map(order => {
      const isPending = (order.status === 'Pending');
      const isDelivered = (order.status === 'Delivered');
      const date = order.created_at ? new Date(order.created_at).toLocaleDateString('en-GB') : '-';

      return `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:0.9rem; border-bottom:1px solid #e2e8f0; flex-wrap:wrap; gap:10px;">
          <div>
            <strong>ORD-${order.id}</strong> (${order.payment_mode})<br>
            <small style="color:#64748b;">📅 ${date} &middot; 📍 ${order.shipping_state || 'Bihar'}</small>
          </div>

          <div><strong>₹${Number(order.total).toLocaleString('en-IN')}</strong></div>
          
          <div>
            <span class="stamp ${order.status === 'Delivered' ? 'stamp-green' : (order.status === 'Cancelled' || order.status === 'Returned' ? 'stamp-red' : 'stamp-blue')}">${order.status}</span>
          </div>

          <div style="display:flex; gap:6px;">
            <button onclick="printCustomerInvoice(${order.id})" style="background:#102a43; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:0.8rem; font-weight:bold;">📄 Invoice</button>
            <button onclick="sendWhatsAppInvoice(${order.id})" style="background:#25D366; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:0.8rem; font-weight:bold;">📲 WhatsApp</button>
            
            ${isPending ? `
              <button onclick="cancelCustomerOrder(${order.id})" style="background:#dc2626; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:0.8rem; font-weight:bold;">❌ Cancel</button>
            ` : ''}

            ${isDelivered ? `
              <button onclick="returnCustomerOrder(${order.id})" style="background:#d97706; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:0.8rem; font-weight:bold;">🔄 Return</button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    invoiceList.innerHTML = '<p style="color:red;">Error loading ledger.</p>';
  }
}

window.cancelCustomerOrder = async function(orderId) {
  if (!confirm(`Are you sure you want to cancel Order #ORD-${orderId}? Your credit limit and item stock will be restored.`)) return;

  try {
    const res = await fetch(`/api/orders/${orderId}/cancel`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      await loadProducts();
      await syncUserProfile();
      loadLedgerOrders();
    } else {
      alert(data.message || "Could not cancel order.");
    }
  } catch (err) {
    alert("Server error while cancelling order.");
  }
};

window.returnCustomerOrder = async function(orderId) {
  if (!confirm(`Submit a Return Request for delivered Order #ORD-${orderId}?`)) return;

  try {
    const res = await fetch(`/api/orders/${orderId}/return`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      loadLedgerOrders();
    } else {
      alert(data.message || "Could not process return request.");
    }
  } catch (err) {
    alert("Server error while requesting return.");
  }
};

async function printCustomerInvoice(orderId) {
  let order = null;
  try {
    const res = await fetch('/api/orders');
    const allOrders = await res.json();
    order = allOrders.find(o => o.id === orderId);
  } catch (err) {
    console.error("Error fetching order:", err);
  }

  if (!order) {
    alert("Order details could not be loaded.");
    return;
  }

  let config = {};
  try {
    const cfgRes = await fetch('/api/company-settings');
    config = await cfgRes.json();
  } catch(e) {
    config = {};
  }

  const sellerState = (config.state || 'Assam').trim().toLowerCase();
  const buyerState = (order.shipping_state || order.billing_state || localStorage.getItem("state") || '').trim().toLowerCase();
  const isSameState = buyerState ? (sellerState === buyerState) : true;

  const bulkThreshold = config.bulk_qty_threshold || 10;
  const bulkExtraPercent = config.bulk_discount_percent !== undefined ? config.bulk_discount_percent : 3;

  let rawItems = [];
  try { 
    rawItems = typeof order.items === 'string' ? JSON.parse(order.items) : order.items; 
  } catch(e) { 
    rawItems = [{ name: 'Products', price: order.total }]; 
  }

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
    let gstRate = item.gst_rate;
    if (gstRate > 100) gstRate = Math.round(gstRate / 100);
    gstRate = gstRate || 5;

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
        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;"><strong>${item.qty} ${item.unit || 'Pcs.'}</strong></td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right;">₹${catalogMRP.toFixed(2)}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right; color: #166534; font-weight:bold;">-₹${discountPerCase.toFixed(2)}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right;">₹${baseTaxable.toFixed(2)}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; font-size: 0.8rem;">${taxBreakup}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right;"><strong>₹${itemFinalTotal.toFixed(2)}</strong></td>
      </tr>
    `;
  });

  const calculatedGrandTotal = netTaxableTotal + totalCGST + totalSGST + totalIGST;

  const buyerBusiness = order.business_name || loggedInBusiness || 'Dealer Partner';
  const buyerAddress = order.billing_address || localStorage.getItem("address") || 'N/A';
  const buyerStateDisplay = order.billing_state || localStorage.getItem("state") || 'Bihar';
  const buyerGST = order.buyer_gstin || localStorage.getItem("gstin") || 'Unregistered';

  const win = window.open('', '_blank');
  win.document.write(`
    <html>
      <head>
        <title>GST Tax Invoice - ORD-${order.id}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 25px; color: #1e293b; font-size: 13px; margin: 0 auto; max-width: 920px; }
          .header-container { text-align: center; border-bottom: 2px solid #102a43; padding-bottom: 12px; margin-bottom: 15px; position: relative; }
          .logo-top { position: absolute; right: 0; top: 0; height: 75px; max-width: 140px; object-fit: contain; }
          .grid-2 { display: flex; justify-content: space-between; gap: 15px; margin-bottom: 12px; }
          .box { flex: 1; border: 1px solid #cbd5e1; padding: 10px; border-radius: 4px; background: #f8fafc; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background: #102a43; color: white; padding: 7px; font-size: 12px; border: 1px solid #102a43; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header-container">
          <img src="${config.logo_url || 'images/logo.png'}" class="logo-top" alt="Logo" onerror="this.src='images/placeholder.png'">
          <h1 style="margin: 0 0 4px 0; color: #102a43; font-size: 22px; letter-spacing: 0.5px;">${config.company_name || 'SHAILPUTRI AGRO FOODS PRIVATE LIMITED'}</h1>
          <p style="margin: 2px 0; font-size: 12px; color: #334155; font-weight: 500;">${config.address || 'Tezpur, Assam - 784027'}</p>
        </div>
        <h3 style="text-align: center; margin: 5px 0 12px 0; text-decoration: underline; color: #102a43;">TAX INVOICE (${isSameState ? 'INTRA-STATE: CGST + SGST' : 'INTER-STATE: IGST'})</h3>
        <table>
          <thead>
            <tr>
              <th>#</th><th>Item Description</th><th>HSN</th><th>Qty</th><th>Total (₹)</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div style="text-align: right; margin-top: 15px; font-size: 15px; font-weight: bold;">
          Grand Invoice Value: ₹${calculatedGrandTotal.toFixed(2)}
        </div>
        <div style="margin-top: 25px; text-align: center;" class="no-print">
          <button onclick="window.print()" style="padding: 10px 20px; background: #102a43; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">🖨️ Print / Save as PDF</button>
        </div>
      </body>
    </html>
  `);
  win.document.close();
}

// 🟢 1. WhatsApp पर ऑटोमैटिक इनवॉइस समरी भेजना (PDF-Style Text)
window.sendWhatsAppInvoice = async function(orderId) {
  try {
    const res = await fetch('/api/orders');
    const orders = await res.json();
    const order = orders.find(o => o.id === orderId);
    if (!order) return alert("Order details not found!");

    let rawPhone = (order.shipping_phone || order.phone || '').replace(/\D/g, '');
    if (rawPhone.length === 10) rawPhone = '91' + rawPhone;
    if (!rawPhone || rawPhone.length < 10) rawPhone = '918544241851';

    let itemsList = "• Wholesale Groceries / Agro Products";
    try {
      const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
      const grouped = {};
      items.forEach(i => {
        const u = i.unit || 'case(s)';
        if (!grouped[i.name]) grouped[i.name] = { qty: 0, unit: u, price: i.price };
        grouped[i.name].qty += 1;
      });
      itemsList = Object.entries(grouped).map(([name, d]) => `▪️ ${name} x ${d.qty} ${d.unit} (₹${d.price * d.qty})`).join('\n');
    } catch (e) {}

    const textMessage = 
`*📦 SHAILPUTRI AGRO FOODS PVT LTD*
*Official GST Tax Invoice / Summary*
━━━━━━━━━━━━━━━━━━━━━
*Order ID:* ORD-${order.id}
*Customer/Firm:* ${order.business_name || 'Dealer Partner'}
*Status:* ${order.status}
*Payment Mode:* ${order.payment_mode}
*Shipping State:* ${order.shipping_state || 'Bihar'}
━━━━━━━━━━━━━━━━━━━━━
*Ordered Items:*
${itemsList}
━━━━━━━━━━━━━━━━━━━━━
*Grand Total Amount: ₹${Number(order.total).toLocaleString('en-IN')}*
━━━━━━━━━━━━━━━━━━━━━
🙏 Thank you for doing wholesale business with us!
Helpline / Support: +91 8544241851`;

    const encodedMsg = encodeURIComponent(textMessage);
    window.open(`https://wa.me/${rawPhone}?text=${encodedMsg}`, '_blank');
  } catch (err) {
    console.error('WhatsApp Error:', err);
    alert("Could not open WhatsApp invoice.");
  }
};

function loadProfileForm() {
  if (!loggedInUser) return;
  document.getElementById("edit-username").value = loggedInUser;
  document.getElementById("edit-business").value = loggedInBusiness;
  document.getElementById("edit-phone").value = localStorage.getItem("phone") || "";
  document.getElementById("edit-address").value = localStorage.getItem("address") || "";
  document.getElementById("edit-state").value = localStorage.getItem("state") || "Bihar";
  document.getElementById("edit-gstin").value = localStorage.getItem("gstin") || "";
}

async function saveCustomerProfile(e) {
  e.preventDefault();
  const updatedData = {
    username: loggedInUser,
    businessName: document.getElementById("edit-business").value.trim(),
    phone: document.getElementById("edit-phone").value.trim(),
    address: document.getElementById("edit-address").value.trim(),
    state: document.getElementById("edit-state").value.trim(),
    gstin: document.getElementById("edit-gstin").value.trim().toUpperCase()
  };
  await fetch('/api/profile/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updatedData)
  });
  localStorage.setItem("businessName", updatedData.businessName);
  localStorage.setItem("phone", updatedData.phone);
  localStorage.setItem("address", updatedData.address);
  localStorage.setItem("state", updatedData.state);
  localStorage.setItem("gstin", updatedData.gstin);
  document.getElementById("profile-msg").textContent = "✅ Profile saved!";
  renderAuthHeader();
}

window.openCreditLedgerModal = async function() {
  const modal = document.getElementById("credit-modal");
  if (!modal) return;
  modal.style.display = "flex";

  const container = document.getElementById("credit-transactions-list");
  container.innerHTML = "<p>Loading credit statement...</p>";

  try {
    const res = await fetch('/api/retailers/credit-statement?username=' + encodeURIComponent(loggedInUser));
    const data = await res.json();
    const orders = data.orders || [];
    const repayments = data.repayments || [];

    let totalDebit = 0;
    orders.forEach(o => { if (o.status !== 'Cancelled' && o.status !== 'Returned') totalDebit += (o.total || 0); });
    let totalRepaid = 0;
    repayments.forEach(r => totalRepaid += (r.amount || 0));

    currentDueBalance = Math.max(0, totalDebit - totalRepaid);
    
    document.getElementById("modal-avail-limit").textContent = Number(currentCreditLimit).toLocaleString('en-IN');
    document.getElementById("modal-used-limit").textContent = Number(currentDueBalance).toLocaleString('en-IN');
    document.getElementById("modal-total-limit").textContent = Number(currentCreditLimit + currentDueBalance).toLocaleString('en-IN');

    const allTx = [];
    orders.forEach(o => allTx.push({ type: o.status === 'Returned' ? 'RETURN' : 'DEBIT', desc: `Order #ORD-${o.id}`, amount: o.total, date: o.created_at, status: o.status }));
    repayments.forEach(r => allTx.push({ type: 'PAY', desc: 'Paid Due Balance', amount: r.amount, date: r.created_at, status: 'Paid' }));
    allTx.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (allTx.length === 0) {
      container.innerHTML = "<p style='color:#64748b; text-align:center;'>No transactions found.</p>";
      return;
    }

    let html = `<table style="width: 100%; font-size: 0.9rem; border-collapse: collapse;"><thead><tr style="background:#f1f5f9;"><th style="padding:6px; border:1px solid #cbd5e1;">Date</th><th style="padding:6px; border:1px solid #cbd5e1;">Description</th><th style="padding:6px; border:1px solid #cbd5e1;">Amount</th><th style="padding:6px; border:1px solid #cbd5e1;">Status</th></tr></thead><tbody>`;
    allTx.forEach(tx => {
      const date = tx.date ? new Date(tx.date).toLocaleDateString('en-GB') : '-';
      const isPay = (tx.type === 'PAY' || tx.type === 'RETURN');
      html += `<tr><td style="padding:6px; border:1px solid #cbd5e1;">${date}</td><td style="padding:6px; border:1px solid #cbd5e1;">${tx.desc}</td><td style="padding:6px; border:1px solid #cbd5e1; color:${isPay ? '#137333' : '#c5221f'}; font-weight:bold;">${isPay ? '+' : '-'}₹${Number(tx.amount).toLocaleString('en-IN')}</td><td style="padding:6px; border:1px solid #cbd5e1;"><span class="stamp stamp-blue">${tx.status}</span></td></tr>`;
    });
    html += `</tbody></table>`;
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = "<p style='color:red;'>Failed to load statement.</p>";
  }
};

window.closeCreditLedgerModal = function() {
  const modal = document.getElementById("credit-modal");
  if (!modal) return;
  modal.style.display = "none";
};

window.toggleRepaySection = function() {
  const repaySec = document.getElementById("repay-section");
  if (!repaySec) return;
  if (currentDueBalance <= 0) {
    alert("No due balance (उधारी) to repay!");
    return;
  }
  repaySec.style.display = (repaySec.style.display === "block") ? "none" : "block";
  document.getElementById("repay-amount-input").value = currentDueBalance;
  window.updateRepayQR();
};

window.updateRepayQR = function() {
  let amount = parseInt(document.getElementById("repay-amount-input").value) || 0;
  if (amount > currentDueBalance) {
    document.getElementById("repay-amount-input").value = currentDueBalance;
    amount = currentDueBalance;
  }
  const qrImg = document.getElementById("repay-qr-img");
  if (qrImg) qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(`upi://pay?pa=${UPI_ID}&pn=Shailputri&am=${amount}&cu=INR`)}`;
};

window.submitCreditRepayment = async function() {
  const amount = parseInt(document.getElementById("repay-amount-input").value);
  if (!amount || amount <= 0 || amount > currentDueBalance) {
    alert("Invalid amount! Amount cannot exceed current due balance.");
    return;
  }

  try {
    const res = await fetch('/api/retailers/repay-credit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: loggedInUser, amount: amount })
    });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      document.getElementById("repay-section").style.display = "none";
      await loadProducts();
      await syncUserProfile();
      window.openCreditLedgerModal();
    } else {
      alert(data.message || "Failed to record payment.");
    }
  } catch (e) {
    alert("Server error while recording payment.");
  }
};

window.printLedgerStatement = async function() {
  if (!loggedInUser) {
    alert("Please login to print statement.");
    return;
  }

  try {
    const res = await fetch('/api/retailers/credit-statement?username=' + encodeURIComponent(loggedInUser));
    const data = await res.json();
    const orders = data.orders || [];
    const repayments = data.repayments || [];

    let totalDebit = 0;
    orders.forEach(o => { if (o.status !== 'Cancelled' && o.status !== 'Returned') totalDebit += (o.total || 0); });
    let totalRepaid = 0;
    repayments.forEach(r => totalRepaid += (r.amount || 0));
    const currentDue = Math.max(0, totalDebit - totalRepaid);

    const win = window.open('', '_blank');
    win.document.write(`<html><body><h2>Ledger Statement</h2><p>Outstanding Due: ₹${currentDue}</p></body></html>`);
    win.document.close();
  } catch (err) {
    alert("Failed to generate ledger statement.");
  }
};

window.logout = function() {
  localStorage.removeItem("username");
  localStorage.removeItem("businessName");
  localStorage.removeItem("phone");
  localStorage.removeItem("address");
  localStorage.removeItem("state");
  localStorage.removeItem("gstin");
  loggedInUser = "";
  loggedInBusiness = "";
  window.location.href = "login.html";
};
