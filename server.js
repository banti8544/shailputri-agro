const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../')));

// 1. Safe Schema Migration
function addCol(table, col, def) {
  try {
    const info = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!info.includes(col)) {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`).run();
    }
  } catch(e) {}
}

addCol('retailers', 'phone', 'TEXT');
addCol('retailers', 'address', 'TEXT');
addCol('retailers', 'state', "TEXT DEFAULT 'Bihar'");
addCol('retailers', 'gstin', 'TEXT');
addCol('retailers', 'scheme_name', "TEXT DEFAULT 'Regular'");
addCol('retailers', 'discount_percent', 'INTEGER DEFAULT 0');
addCol('retailers', 'credit_limit', 'INTEGER DEFAULT 50000');

addCol('products', 'hsn', "TEXT DEFAULT '1006'");
addCol('products', 'gst_rate', 'INTEGER DEFAULT 5');

addCol('orders', 'username', 'TEXT');
addCol('orders', 'payment_mode', "TEXT DEFAULT 'Online'");
addCol('orders', 'payment_status', "TEXT DEFAULT 'Unpaid'");
addCol('orders', 'shipping_address', 'TEXT');
addCol('orders', 'shipping_phone', 'TEXT');
addCol('orders', 'shipping_state', "TEXT DEFAULT 'Bihar'");

// Credit Repayments Table
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS credit_repayments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      amount INTEGER,
      created_at TEXT
    )
  `).run();
} catch (e) {}

// Company Settings Table
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS company_settings (
      id INTEGER PRIMARY KEY,
      company_name TEXT,
      address TEXT,
      state TEXT,
      gstin TEXT,
      fssai TEXT,
      udyam TEXT,
      cin TEXT,
      phone TEXT,
      email TEXT,
      logo_url TEXT,
      signatory_url TEXT,
      bulk_qty_threshold INTEGER DEFAULT 10,
      bulk_discount_percent INTEGER DEFAULT 3
    )
  `).run();

  const cfg = db.prepare('SELECT * FROM company_settings WHERE id = 1').get();
  if (!cfg) {
    db.prepare(`
      INSERT INTO company_settings (id, company_name, address, state, gstin, fssai, udyam, cin, phone, email, logo_url, signatory_url, bulk_qty_threshold, bulk_discount_percent)
      VALUES (1, 'SHAILPUTRI AGRO FOODS PRIVATE LIMITED', 'Vill-gotlong Naya Basti, Ward No10 Dolabari Tezpur, Sonitpur, Assam - 784027', 'Assam', '18ABUCS6903N1Z5', '10424000001234', 'UDYAM-AS-25-0046796', 'U46201AS2026PTC031042', '8544241851', 'info@shailputriagro.com', 'images/placeholder.png', 'images/placeholder.png', 10, 3)
    `).run();
  }
} catch(e) {}

addCol('company_settings', 'bulk_qty_threshold', 'INTEGER DEFAULT 10');
addCol('company_settings', 'bulk_discount_percent', 'INTEGER DEFAULT 3');
addCol('company_settings', 'signatory_url', 'TEXT');
addCol('company_settings', 'logo_url', 'TEXT');

// Multer Storage Setup
const imageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const imagesDir = path.join(__dirname, '../images');
    if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
    cb(null, imagesDir);
  },
  filename: function (req, file, cb) {
    cb(null, 'img-' + Date.now() + path.extname(file.originalname));
  }
});
const uploadImage = multer({ storage: imageStorage });

// 2. GST Proxy Lookup API
app.get('/api/fetch-gst/:gstin', async (req, res) => {
  const gstin = (req.params.gstin || '').trim().toUpperCase();
  if (!gstin || gstin.length < 2) return res.json({ success: false, message: 'Invalid GSTIN' });

  const GST_STATE_CODES = {
    "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
    "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan",
    "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
    "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura",
    "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand",
    "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
    "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "32": "Kerala",
    "33": "Tamil Nadu", "36": "Telangana", "37": "Andhra Pradesh"
  };

  const stateCode = gstin.substring(0, 2);
  const detectedState = GST_STATE_CODES[stateCode] || "Bihar";
  let firmName = '', fullAddress = '';

  if (gstin === '10EVXPK6787A1Z8') {
    firmName = "MAA GAYATRI TRADERS";
    fullAddress = "Bhawanipur Rajdham, Purnia, Bihar - 854204";
  } else if (gstin === '10BMTPK3094E1Z3') {
    firmName = "MEHARSHI MENHI TRADING COMPANY";
    fullAddress = "Dubbatol, Aurahi Gobindpur, Barhara Kothi, Purnia, Bihar - 854202";
  } else {
    try {
      const match = db.prepare('SELECT * FROM retailers WHERE UPPER(gstin) = ? LIMIT 1').get(gstin);
      if (match) {
        firmName = match.business_name;
        fullAddress = match.address;
      }
    } catch (e) {}
  }

  res.json({ success: true, firmName, address: fullAddress, state: detectedState, stateCode });
});

// 3. Company Settings APIs
app.get('/api/company-settings', (req, res) => {
  const config = db.prepare('SELECT * FROM company_settings WHERE id = 1').get();
  res.json(config || {});
});

app.post('/api/company-settings', uploadImage.fields([{ name: 'companyLogo', maxCount: 1 }, { name: 'signatoryStamp', maxCount: 1 }]), (req, res) => {
  try {
    const { company_name, address, state, gstin, fssai, udyam, cin, phone, email, bulk_qty_threshold, bulk_discount_percent } = req.body;
    
    let updates = [
      "company_name = ?", "address = ?", "state = ?", "gstin = ?", "fssai = ?", 
      "udyam = ?", "cin = ?", "phone = ?", "email = ?", "bulk_qty_threshold = ?", "bulk_discount_percent = ?"
    ];
    let params = [
      company_name, address, state, gstin, fssai, 
      udyam, cin, phone, email, parseInt(bulk_qty_threshold) || 10, parseInt(bulk_discount_percent) || 3
    ];

    if (req.files && req.files['companyLogo']) {
      updates.push("logo_url = ?");
      params.push('images/' + req.files['companyLogo'][0].filename);
    }
    if (req.files && req.files['signatoryStamp']) {
      updates.push("signatory_url = ?");
      params.push('images/' + req.files['signatoryStamp'][0].filename);
    }

    params.push(1);
    db.prepare(`UPDATE company_settings SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    res.json({ success: true, message: 'Settings, Bulk Margins & Logos saved!' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 4. Dealer Authentication
app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, message: "Username & Password required" });

    const retailer = db.prepare('SELECT * FROM retailers WHERE LOWER(username) = LOWER(?) LIMIT 1').get(username.trim());
    if (!retailer) return res.json({ success: false, message: "Dealer not found!" });

    let isMatch = false;
    if (retailer.password_hash) {
      try {
        isMatch = bcrypt.compareSync(password, retailer.password_hash);
      } catch(e) {
        isMatch = (password === retailer.password_hash);
      }
    }

    if (!isMatch) return res.json({ success: false, message: "Incorrect password!" });

    res.json({
      success: true,
      businessName: retailer.business_name || 'Dealer Partner',
      username: retailer.username,
      phone: retailer.phone || '8544241851',
      address: retailer.address || 'Gulabbagh, Purnia',
      state: retailer.state || 'Bihar',
      gstin: retailer.gstin || '',
      schemeName: retailer.scheme_name || 'Regular',
      discountPercent: retailer.discount_percent || 0,
      creditLimit: retailer.credit_limit || 0
    });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.post('/api/signup', (req, res) => {
  try {
    const { businessName, username, password, phone, address, state, gstin } = req.body;
    if (!username || !password) return res.json({ success: false, message: "Username & Password required" });

    const existing = db.prepare('SELECT * FROM retailers WHERE LOWER(username) = LOWER(?) LIMIT 1').get(username.trim());
    if (existing) return res.json({ success: false, message: "Username already exists! Please login." });

    const hashedPassword = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO retailers (business_name, username, password_hash, phone, address, state, gstin, scheme_name, discount_percent, credit_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(businessName || 'Dealer', username.trim(), hashedPassword, phone || '', address || '', state || 'Bihar', gstin || '', 'Regular', 0, 0);

    res.json({ success: true, message: "Registration successful! Please login." });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.post('/api/forgot-password', (req, res) => {
  try {
    const { username, phone, newPassword } = req.body;
    if (!username || !phone || !newPassword) return res.json({ success: false, message: "All fields are required!" });

    const retailer = db.prepare('SELECT * FROM retailers WHERE LOWER(username) = LOWER(?) LIMIT 1').get(username.trim());
    if (!retailer) return res.json({ success: false, message: "User not found!" });

    const userPhoneClean = (retailer.phone || '').replace(/\D/g, '').slice(-10);
    const inputPhoneClean = (phone || '').replace(/\D/g, '').slice(-10);

    if (userPhoneClean && inputPhoneClean && userPhoneClean !== inputPhoneClean) {
      return res.json({ success: false, message: "Phone number did not match!" });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE retailers SET password_hash = ? WHERE LOWER(username) = LOWER(?)').run(hashedPassword, username.trim());

    res.json({ success: true, message: "Password reset successfully!" });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 5. Products APIs
app.get('/api/products', (req, res) => {
  try {
    const username = req.query.username || '';
    const products = db.prepare('SELECT * FROM products').all() || [];
    let discountPercent = 0, schemeName = "Regular (0%)", creditLimit = 0;

    if (username) {
      const retailer = db.prepare('SELECT * FROM retailers WHERE LOWER(username) = LOWER(?) LIMIT 1').get(username);
      if (retailer) {
        discountPercent = retailer.discount_percent || 0;
        schemeName = `${retailer.scheme_name || "Regular"} (${discountPercent}%)`;
        creditLimit = retailer.credit_limit || 0;
      }
    }

    const productsWithPricing = products.map(p => {
      const origPrice = p.price || 0;
      const discountedPrice = Math.round(origPrice * (100 - discountPercent) / 100);
      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        pack: p.pack || 'Standard',
        hsn: p.hsn || '1006',
        gst_rate: p.gst_rate ?? 5,
        originalPrice: origPrice,
        price: discountedPrice,
        stock: p.stock ?? 50,
        category: p.category || 'General',
        imageUrl: p.image_url || 'images/placeholder.png'
      };
    });

    res.json({ products: productsWithPricing, schemeName, discountPercent, creditLimit });
  } catch (err) {
    res.json({ products: [] });
  }
});

app.post('/api/products/add', uploadImage.single('productImage'), (req, res) => {
  const { name, sku, pack, price, stock, category, hsn, gst_rate } = req.body;
  let imagePath = req.file ? 'images/' + req.file.filename : 'images/placeholder.png';
  db.prepare('INSERT INTO products (name, sku, pack, price, stock, category, image_url, hsn, gst_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(name, sku, pack || "Standard", parseInt(price), parseInt(stock) || 0, category || "General", imagePath, hsn || "1006", parseInt(gst_rate) || 5);
  res.json({ success: true, message: "Product added!" });
});

app.post('/api/products/update', (req, res) => {
  const { id, price, stock, hsn, gst_rate } = req.body;
  db.prepare('UPDATE products SET price = ?, stock = ?, hsn = ?, gst_rate = ? WHERE id = ?')
    .run(parseInt(price), parseInt(stock), hsn, parseInt(gst_rate) || 0, parseInt(id));
  res.json({ success: true, message: 'Product updated!' });
});

app.delete('/api/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Product deleted!' });
});

// 6. Orders APIs
app.get('/api/orders', (req, res) => {
  try {
    const rawOrders = db.prepare('SELECT * FROM orders').all() || [];
    const retailers = db.prepare('SELECT * FROM retailers').all() || [];

    const enrichedOrders = rawOrders.map(o => {
      const uMatch = retailers.find(r => (r.username || '').toLowerCase() === (o.username || '').toLowerCase());
      return {
        id: o.id,
        items: o.items,
        total: o.total,
        created_at: o.created_at,
        status: o.status || 'Pending',
        username: o.username || 'Dealer',
        payment_mode: o.payment_mode || 'Online',
        payment_status: o.payment_status || 'Unpaid',
        shipping_address: o.shipping_address || (uMatch ? uMatch.address : 'N/A'),
        shipping_phone: o.shipping_phone || (uMatch ? uMatch.phone : 'N/A'),
        shipping_state: o.shipping_state || (uMatch ? uMatch.state : 'Bihar'),
        business_name: uMatch ? uMatch.business_name : 'MEHARSHI MENHI TRADING COMPANY',
        phone: uMatch ? uMatch.phone : '8544241851',
        billing_address: uMatch ? uMatch.address : 'N/A',
        billing_state: uMatch ? uMatch.state : 'Bihar',
        buyer_gstin: uMatch ? uMatch.gstin : ''
      };
    });

    res.json(enrichedOrders);
  } catch (err) {
    res.json([]);
  }
});

app.post('/api/orders', (req, res) => {
  try {
    const { items, total, username, paymentMode, shippingAddress, shippingPhone, shippingState } = req.body;
    const createdAt = new Date().toISOString();
    const finalShipTo = shippingAddress || 'Same as Billing Address';
    const finalShipPhone = shippingPhone || '';
    const finalShipState = shippingState || 'Bihar';

    if (!Array.isArray(items) || items.length === 0) {
      return res.json({ success: false, message: 'Cart is empty!' });
    }

    const demandMap = {};
    items.forEach(item => {
      const pid = item.id;
      if (!demandMap[pid]) demandMap[pid] = { id: pid, name: item.name, requiredQty: 0 };
      demandMap[pid].requiredQty += 1;
    });

    for (const pid of Object.keys(demandMap)) {
      const demanded = demandMap[pid];
      let prod = null;
      if (demanded.id) {
        prod = db.prepare('SELECT id, name, stock FROM products WHERE id = ?').get(demanded.id);
      } else {
        prod = db.prepare('SELECT id, name, stock FROM products WHERE name = ?').get(demanded.name);
      }

      if (!prod) {
        return res.json({ success: false, message: `Product "${demanded.name}" not found in catalog!` });
      }

      const availableStock = prod.stock || 0;
      if (availableStock < demanded.requiredQty) {
        return res.json({ 
          success: false, 
          message: `Insufficient Stock for "${prod.name}"! Available Stock: ${availableStock} case(s), but requested: ${demanded.requiredQty} case(s).` 
        });
      }
    }

    if (paymentMode === 'Credit') {
      const retailer = db.prepare('SELECT credit_limit FROM retailers WHERE LOWER(username) = LOWER(?) LIMIT 1').get(username);
      if (!retailer || (retailer.credit_limit < total)) {
        return res.json({ success: false, message: 'Insufficient Credit Limit!' });
      }
      db.prepare('UPDATE retailers SET credit_limit = credit_limit - ? WHERE LOWER(username) = LOWER(?)').run(total, username);
    }

    for (const pid of Object.keys(demandMap)) {
      const demanded = demandMap[pid];
      if (demanded.id) {
        db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(demanded.requiredQty, demanded.id);
      } else {
        db.prepare('UPDATE products SET stock = stock - ? WHERE name = ?').run(demanded.requiredQty, demanded.name);
      }
    }

    const payStatus = (paymentMode === 'Credit') ? 'Unpaid' : 'Paid';
    const result = db.prepare('INSERT INTO orders (items, total, created_at, status, username, payment_mode, payment_status, shipping_address, shipping_phone, shipping_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(JSON.stringify(items), total, createdAt, 'Pending', username || '', paymentMode || 'Online', payStatus, finalShipTo, finalShipPhone, finalShipState);

    res.json({ success: true, orderId: result.lastInsertRowid });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// Safe Cancel Order (Restores Stock & Credit)
app.post('/api/orders/:id/cancel', (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    
    if (!order) return res.json({ success: false, message: "Order not found" });
    if (order.status === 'Cancelled') return res.json({ success: false, message: "Already cancelled" });

    // Restore Credit Limit
    if (order.payment_mode === 'Credit' && order.username) {
      try {
        db.prepare('UPDATE retailers SET credit_limit = credit_limit + ? WHERE LOWER(username) = LOWER(?)').run(order.total, order.username);
      } catch(e){}
    }

    // Safely Restore Inventory Stock
    try {
      let items = [];
      if (typeof order.items === 'string') items = JSON.parse(order.items);
      else if (Array.isArray(order.items)) items = order.items;

      if (Array.isArray(items)) {
        items.forEach(item => {
          if (item && item.id) db.prepare('UPDATE products SET stock = stock + 1 WHERE id = ?').run(item.id);
          else if (item && item.name) db.prepare('UPDATE products SET stock = stock + 1 WHERE name = ?').run(item.name);
        });
      }
    } catch (e) {}

    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('Cancelled', orderId);
    return res.json({ success: true, message: `Order #ORD-${orderId} cancelled & stock restored!` });
  } catch (err) {
    return res.json({ success: false, message: "Server error: " + err.message });
  }
});

// Safe Customer Return Request
app.post('/api/orders/:id/return', (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) return res.json({ success: false, message: "Order not found" });
    
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('Return Requested', orderId);
    return res.json({ success: true, message: `Return request submitted for Order #ORD-${orderId}!` });
  } catch (err) {
    return res.json({ success: false, message: err.message });
  }
});

// Safe Admin Order Status Update
app.post('/api/orders/:id/status', (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const { status } = req.body || {};
    
    if (!status) return res.json({ success: false, message: "Status is required" });

    const current = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!current) return res.json({ success: false, message: "Order not found" });

    if ((status === 'Returned' || status === 'Cancelled') && current.status !== 'Returned' && current.status !== 'Cancelled') {
      if (current.payment_mode === 'Credit' && current.username) {
        try {
          db.prepare('UPDATE retailers SET credit_limit = credit_limit + ? WHERE LOWER(username) = LOWER(?)').run(current.total, current.username);
        } catch(e){}
      }
      try {
        let items = [];
        if (typeof current.items === 'string') items = JSON.parse(current.items);
        else if (Array.isArray(current.items)) items = current.items;

        if (Array.isArray(items)) {
          items.forEach(item => {
            if (item && item.id) db.prepare('UPDATE products SET stock = stock + 1 WHERE id = ?').run(item.id);
            else if (item && item.name) db.prepare('UPDATE products SET stock = stock + 1 WHERE name = ?').run(item.name);
          });
        }
      } catch (e) {}
    }

    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, orderId);
    return res.json({ success: true, message: `Order #ORD-${orderId} marked as "${status}"!` });
  } catch (err) {
    return res.json({ success: false, message: "Server error: " + err.message });
  }
});

// 7. Credit Statement & Repayment
app.get('/api/retailers/credit-statement', (req, res) => {
  try {
    const username = req.query.username || '';
    if (!username) return res.json({ orders: [], repayments: [] });
    const orders = db.prepare("SELECT * FROM orders WHERE LOWER(username) = LOWER(?) AND payment_mode = 'Credit'").all(username) || [];
    const repayments = db.prepare("SELECT * FROM credit_repayments WHERE LOWER(username) = LOWER(?)").all(username) || [];
    res.json({ orders, repayments });
  } catch (err) {
    res.json({ orders: [], repayments: [] });
  }
});

app.post('/api/retailers/repay-credit', (req, res) => {
  try {
    const { username, amount } = req.body;
    const payAmount = parseInt(amount);
    if (!username || !payAmount || payAmount <= 0) return res.json({ success: false, message: "Invalid amount" });

    const orders = db.prepare("SELECT * FROM orders WHERE LOWER(username) = LOWER(?) AND payment_mode = 'Credit'").all(username);
    const repayments = db.prepare("SELECT * FROM credit_repayments WHERE LOWER(username) = LOWER(?)").all(username);

    let totalDebit = 0;
    orders.forEach(o => { if (o.status !== 'Cancelled' && o.status !== 'Returned') totalDebit += (o.total || 0); });
    let totalRepaid = 0;
    repayments.forEach(r => totalRepaid += (r.amount || 0));
    let currentDue = Math.max(0, totalDebit - totalRepaid);

    if (payAmount > currentDue) {
      return res.json({ success: false, message: `Cannot exceed due balance (₹${currentDue})` });
    }

    db.prepare('INSERT INTO credit_repayments (username, amount, created_at) VALUES (?, ?, ?)')
      .run(username, payAmount, new Date().toISOString());

    db.prepare('UPDATE retailers SET credit_limit = credit_limit + ? WHERE LOWER(username) = LOWER(?)')
      .run(payAmount, username);

    res.json({ success: true, message: `Payment of ₹${payAmount} recorded successfully!` });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 8. Retailer Profile APIs
app.get('/api/retailers/me', (req, res) => {
  const username = req.query.username || 'banti1122';
  const retailer = db.prepare('SELECT * FROM retailers WHERE LOWER(username) = LOWER(?) LIMIT 1').get(username);
  if (retailer) {
    res.json({
      success: true,
      business_name: retailer.business_name || 'Dealer Partner',
      username: retailer.username,
      phone: retailer.phone || '8544241851',
      address: retailer.address || 'Gulabbagh, Purnia',
      state: retailer.state || 'Bihar',
      gstin: retailer.gstin || '',
      scheme_name: retailer.scheme_name || 'Regular',
      discount_percent: retailer.discount_percent || 0,
      credit_limit: retailer.credit_limit || 0
    });
  } else {
    res.json({ success: false });
  }
});

app.get('/api/retailers', (req, res) => {
  res.json(db.prepare('SELECT * FROM retailers').all() || []);
});

app.post('/api/retailers/update-scheme', (req, res) => {
  const { id, schemeName, discountPercent, creditLimit, state, gstin } = req.body;
  db.prepare('UPDATE retailers SET scheme_name = ?, discount_percent = ?, credit_limit = ?, state = ?, gstin = ? WHERE id = ?')
    .run(schemeName, parseInt(discountPercent) || 0, parseInt(creditLimit) || 0, state || 'Bihar', gstin || '', parseInt(id));
  res.json({ success: true, message: 'Updated!' });
});

app.post('/api/profile/update', (req, res) => {
  const { username, businessName, phone, address, state, gstin } = req.body;
  db.prepare('UPDATE retailers SET business_name = ?, phone = ?, address = ?, state = ?, gstin = ? WHERE LOWER(username) = LOWER(?)')
    .run(businessName, phone, address, state || 'Bihar', gstin || '', username);
  res.json({ success: true, message: "Profile updated!" });
});

// Direct Admin Login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  const ADMIN_USER = "admin";
  const ADMIN_PASS = "Admin@123";

  if ((username || '').trim().toLowerCase() === ADMIN_USER && (password || '').trim() === ADMIN_PASS) {
    return res.json({ success: true, token: "admin-auth-token-shailputri" });
  }
  return res.json({ success: false, message: "Invalid Admin Username or Password!" });
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));