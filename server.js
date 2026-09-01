const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, '../')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

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
addCol('products', 'image_url', "TEXT DEFAULT 'images/placeholder.png'");

addCol('orders', 'username', 'TEXT');
addCol('orders', 'payment_mode', "TEXT DEFAULT 'Online'");
addCol('orders', 'payment_status', "TEXT DEFAULT 'Unpaid'");
addCol('orders', 'shipping_address', 'TEXT');
addCol('orders', 'shipping_phone', 'TEXT');
addCol('orders', 'shipping_state', "TEXT DEFAULT 'Bihar'");

// Company Settings Migrations
addCol('company_settings', 'bulk_qty_threshold', 'INTEGER DEFAULT 10');
addCol('company_settings', 'bulk_discount_percent', 'INTEGER DEFAULT 3');
addCol('company_settings', 'signatory_url', "TEXT DEFAULT 'images/SAFPL.jpg'");
addCol('company_settings', 'logo_url', "TEXT DEFAULT 'images/SAFPL.jpg'");
addCol('company_settings', 'bank_name', "TEXT DEFAULT 'State Bank of India'");
addCol('company_settings', 'bank_account_no', "TEXT DEFAULT '423589123456'");
addCol('company_settings', 'bank_ifsc', "TEXT DEFAULT 'SBIN0001234'");
addCol('company_settings', 'bank_branch', "TEXT DEFAULT 'Purnia Main Branch'");

// Uploads / Images Directory Setup
const uploadDir = path.join(__dirname, 'images');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `prod_${Date.now()}_${Math.round(Math.random() * 1E9)}${ext}`);
  }
});

const upload = multer({ storage: imageStorage });
const uploadImage = upload;

// 2. GST Lookup API
app.get(['/api/gst-lookup/:gstin', '/api/fetch-gst/:gstin'], (req, res) => {
  const gstin = (req.params.gstin || '').toUpperCase().trim();

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

// 3. Company Settings APIs (GET, PUT & POST with Files)
app.get('/api/company-settings', (req, res) => {
  try {
    const config = db.prepare('SELECT * FROM company_settings WHERE id = 1').get();
    res.json(config || {});
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

app.put('/api/company-settings', (req, res) => {
  try {
    const { 
      company_name, address, state, gstin, fssai, udyam, cin, phone, email, 
      bulk_qty_threshold, bulk_discount_percent,
      bank_name, bank_account_no, bank_ifsc, bank_branch
    } = req.body;

    db.prepare(`
      UPDATE company_settings 
      SET company_name = ?, address = ?, state = ?, gstin = ?, fssai = ?, udyam = ?, cin = ?, 
          phone = ?, email = ?, bulk_qty_threshold = ?, bulk_discount_percent = ?,
          bank_name = ?, bank_account_no = ?, bank_ifsc = ?, bank_branch = ?
      WHERE id = 1
    `).run(
      company_name, address, state, gstin, fssai, udyam, cin, phone, email, 
      parseInt(bulk_qty_threshold) || 10, parseInt(bulk_discount_percent) || 3,
      bank_name || '', bank_account_no || '', bank_ifsc || '', bank_branch || ''
    );

    res.json({ success: true, message: 'Settings & Bank Details updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/company-settings', uploadImage.fields([{ name: 'companyLogo', maxCount: 1 }, { name: 'signatoryStamp', maxCount: 1 }]), (req, res) => {
  try {
    const { 
      company_name, address, state, gstin, fssai, udyam, cin, phone, email, 
      bulk_qty_threshold, bulk_discount_percent,
      bank_name, bank_account_no, bank_ifsc, bank_branch 
    } = req.body;
    
    let updates = [
      "company_name = ?", "address = ?", "state = ?", "gstin = ?", "fssai = ?", 
      "udyam = ?", "cin = ?", "phone = ?", "email = ?", "bulk_qty_threshold = ?", "bulk_discount_percent = ?",
      "bank_name = ?", "bank_account_no = ?", "bank_ifsc = ?", "bank_branch = ?"
    ];
    let params = [
      company_name, address, state, gstin, fssai, 
      udyam, cin, phone, email, parseInt(bulk_qty_threshold) || 10, parseInt(bulk_discount_percent) || 3,
      bank_name || '', bank_account_no || '', bank_ifsc || '', bank_branch || ''
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

    res.json({ success: true, message: 'Settings, Bank Details & Logos saved!' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// 4. Dealer Authentication & Profile
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if ((username || '').toLowerCase() === 'admin' && password === 'Admin@123') {
    res.json({ success: true, token: 'admin-auth-token-shailputri' });
  } else {
    res.json({ success: false, message: 'Invalid admin credentials' });
  }
});

app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, message: "Username & Password required" });

    const cleanUser = username.trim().replace(/^@/, '');
    const retailer = db.prepare('SELECT * FROM retailers WHERE LOWER(username) = LOWER(?) OR LOWER(username) = LOWER(?) LIMIT 1').get(cleanUser, '@' + cleanUser);
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

    const cleanUser = username.trim().replace(/^@/, '');
    const existing = db.prepare('SELECT * FROM retailers WHERE LOWER(username) = LOWER(?) OR LOWER(username) = LOWER(?) LIMIT 1').get(cleanUser, '@' + cleanUser);
    if (existing) return res.json({ success: false, message: "Username already exists! Please login." });

    const hashedPassword = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO retailers (business_name, username, password_hash, phone, address, state, gstin, scheme_name, discount_percent, credit_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(businessName || 'Dealer', cleanUser, hashedPassword, phone || '', address || '', state || 'Bihar', gstin || '', 'Regular', 0, 0);

    res.json({ success: true, message: "Registration successful! Please login." });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.post('/api/forgot-password', (req, res) => {
  try {
    const { username, phone, newPassword } = req.body;
    if (!username || !phone || !newPassword) return res.json({ success: false, message: "All fields are required!" });

    const cleanUser = username.trim().replace(/^@/, '');
    const retailer = db.prepare('SELECT * FROM retailers WHERE LOWER(username) = LOWER(?) OR LOWER(username) = LOWER(?) LIMIT 1').get(cleanUser, '@' + cleanUser);
    if (!retailer) return res.json({ success: false, message: "User not found!" });

    const userPhoneClean = (retailer.phone || '').replace(/\D/g, '').slice(-10);
    const inputPhoneClean = (phone || '').replace(/\D/g, '').slice(-10);

    if (userPhoneClean && inputPhoneClean && userPhoneClean !== inputPhoneClean) {
      return res.json({ success: false, message: "Phone number did not match!" });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE retailers SET password_hash = ? WHERE LOWER(username) = LOWER(?) OR LOWER(username) = LOWER(?)').run(hashedPassword, cleanUser, '@' + cleanUser);

    res.json({ success: true, message: "Password reset successfully!" });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.post('/api/profile/update', (req, res) => {
  try {
    const { username, businessName, phone, address, state, gstin } = req.body;
    const cleanUser = (username || '').trim().replace(/^@/, '');
    db.prepare('UPDATE retailers SET business_name = ?, phone = ?, address = ?, state = ?, gstin = ? WHERE LOWER(username) = LOWER(?) OR LOWER(username) = LOWER(?)')
      .run(businessName, phone, address, state, gstin, cleanUser, '@' + cleanUser);
    res.json({ success: true, message: 'Profile updated successfully!' });
  } catch(e) {
    res.json({ success: false, message: e.message });
  }
});

app.get('/api/retailers', (req, res) => {
  try {
    const list = db.prepare('SELECT id, business_name, username, phone, address, state, gstin, scheme_name, discount_percent, credit_limit FROM retailers').all() || [];
    res.json(list);
  } catch(e) {
    res.json([]);
  }
});

app.post('/api/retailers/update-scheme', (req, res) => {
  try {
    const { id, schemeName, discountPercent, creditLimit, state, gstin } = req.body;
    db.prepare('UPDATE retailers SET scheme_name = ?, discount_percent = ?, credit_limit = ?, state = ?, gstin = ? WHERE id = ?')
      .run(schemeName, parseInt(discountPercent) || 0, parseInt(creditLimit) || 0, state, gstin, id);
    res.json({ success: true, message: 'Dealer details saved!' });
  } catch(e) {
    res.json({ success: false, message: e.message });
  }
});

// 5. Products APIs
app.get('/api/products', (req, res) => {
  try {
    const rawUser = req.query.username || '';
    const cleanUser = rawUser.trim().replace(/^@/, '');
    const products = db.prepare('SELECT * FROM products').all() || [];
    let discountPercent = 0, schemeName = "Regular (0%)", creditLimit = 0;

    if (cleanUser) {
      const retailer = db.prepare('SELECT * FROM retailers WHERE LOWER(username) = LOWER(?) OR LOWER(username) = LOWER(?) LIMIT 1').get(cleanUser, '@' + cleanUser);
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

app.put('/api/products/:id', upload.single('image'), (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, price, stock, hsn, gst_rate } = req.body;

    let query = `UPDATE products SET name = ?, category = ?, price = ?, stock = ?, hsn = ?, gst_rate = ?`;
    let params = [name, category, parseInt(price) || 0, parseInt(stock) || 0, hsn || '1006', parseInt(gst_rate) || 5];

    if (req.file) {
      query += `, image_url = ?`;
      params.push(`images/${req.file.filename}`);
    }

    query += ` WHERE id = ?`;
    params.push(id);

    db.prepare(query).run(...params);
    res.json({ success: true, message: 'Product & Image updated successfully' });
  } catch (err) {
    console.error('Update Product Error:', err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// 6. Orders APIs
app.get('/api/orders', (req, res) => {
  try {
    const rawOrders = db.prepare('SELECT * FROM orders').all() || [];
    const retailers = db.prepare('SELECT * FROM retailers').all() || [];

    const enrichedOrders = rawOrders.map(o => {
      const cleanOrderUser = (o.username || '').replace(/^@/, '').toLowerCase();
      const uMatch = retailers.find(r => (r.username || '').replace(/^@/, '').toLowerCase() === cleanOrderUser);
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
    const cleanUser = (username || '').trim().replace(/^@/, '');
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
      const retailer = db.prepare('SELECT credit_limit FROM retailers WHERE LOWER(username) = LOWER(?) OR LOWER(username) = LOWER(?) LIMIT 1').get(cleanUser, '@' + cleanUser);
      if (!retailer || (retailer.credit_limit < total)) {
        return res.json({ success: false, message: 'Insufficient Credit Limit!' });
      }
      db.prepare('UPDATE retailers SET credit_limit = credit_limit - ? WHERE LOWER(username) = LOWER(?) OR LOWER(username) = LOWER(?)').run(total, cleanUser, '@' + cleanUser);
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
      .run(JSON.stringify(items), total, createdAt, 'Pending', cleanUser, paymentMode || 'Online', payStatus, finalShipTo, finalShipPhone, finalShipState);

    res.json({ success: true, orderId: result.lastInsertRowid });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.post('/api/orders/:id/cancel', (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    
    if (!order) return res.json({ success: false, message: "Order not found" });
    if (order.status === 'Cancelled') return res.json({ success: false, message: "Already cancelled" });

    if (order.payment_mode === 'Credit' && order.username) {
      const cleanUser = order.username.replace(/^@/, '');
      try {
        db.prepare('UPDATE retailers SET credit_limit = credit_limit + ? WHERE LOWER(username) = LOWER(?) OR LOWER(username) = LOWER(?)').run(order.total, cleanUser, '@' + cleanUser);
      } catch(e) {}
    }

    try {
      const items = JSON.parse(order.items || '[]');
      items.forEach(item => {
        if (item.id) {
          db.prepare('UPDATE products SET stock = stock + 1 WHERE id = ?').run(item.id);
        }
      });
    } catch(e) {}

    db.prepare("UPDATE orders SET status = 'Cancelled' WHERE id = ?").run(orderId);
    res.json({ success: true, message: "Order cancelled successfully" });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.post('/api/orders/:id/return', (req, res) => {
  try {
    const orderId = Number(req.params.id);
    db.prepare("UPDATE orders SET status = 'Return Requested' WHERE id = ?").run(orderId);
    res.json({ success: true, message: "Return request submitted successfully" });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// Update Order Status & Payment Status (PUT & POST Supported)
const updateStatusHandler = (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const { status, payment_status } = req.body;

    if (!status && !payment_status) {
      return res.status(400).json({ success: false, message: 'Status or Payment Status is required' });
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const targetStatus = status || order.status;
    const targetPayStatus = payment_status || order.payment_status;

    if ((targetStatus === 'Cancelled' || targetStatus === 'Returned') && order.status !== targetStatus) {
      if (order.payment_mode === 'Credit' && order.username) {
        const cleanUser = order.username.replace(/^@/, '');
        try {
          db.prepare('UPDATE retailers SET credit_limit = credit_limit + ? WHERE LOWER(username) = LOWER(?) OR LOWER(username) = LOWER(?)').run(order.total, cleanUser, '@' + cleanUser);
        } catch(e) {}
      }

      try {
        const items = JSON.parse(order.items || '[]');
        items.forEach(item => {
          if (item.id) {
            db.prepare('UPDATE products SET stock = stock + 1 WHERE id = ?').run(item.id);
          }
        });
      } catch(e) {}
    }

    db.prepare('UPDATE orders SET status = ?, payment_status = ? WHERE id = ?').run(targetStatus, targetPayStatus, orderId);
    res.json({ success: true, message: `Order #${orderId} updated to [${targetStatus} | ${targetPayStatus}]!` });
  } catch (err) {
    console.error('Order status update error:', err);
    res.status(500).json({ success: false, message: 'Server error while updating status' });
  }
};

app.put('/api/orders/:id/status', updateStatusHandler);
app.post('/api/orders/:id/status', updateStatusHandler);

// 7. Statement, Repayments & Profile Me
app.get(['/api/retailers/credit-statement', '/api/credit-statement/:username'], (req, res) => {
  try {
    let rawUser = req.query.username || req.params.username || '';
    let username = rawUser.trim().replace(/^@/, '');

    if (!username) {
      return res.json({ success: false, message: 'Username required', orders: [], repayments: [] });
    }

    const cleanUser = username.toLowerCase();
    const retailer = db.prepare('SELECT * FROM retailers WHERE LOWER(username) = ? OR LOWER(username) = ? LIMIT 1').get(cleanUser, '@' + cleanUser);

    if (!retailer) {
      return res.json({ success: false, message: 'Dealer not found', orders: [], repayments: [] });
    }

    const assignedLimit = Number(retailer.credit_limit) || 0;

    let orders = [];
    try {
      orders = db.prepare(`
        SELECT id, total, created_at, status, payment_mode
        FROM orders 
        WHERE (LOWER(username) = ? OR LOWER(username) = ?) AND payment_mode = 'Credit' AND status != 'Cancelled'
        ORDER BY id DESC
      `).all(cleanUser, '@' + cleanUser) || [];
    } catch(e) {
      orders = [];
    }

    let repayments = [];
    try {
      repayments = db.prepare(`
        SELECT id, amount, created_at 
        FROM credit_repayments 
        WHERE LOWER(username) = ? OR LOWER(username) = ?
        ORDER BY id DESC
      `).all(cleanUser, '@' + cleanUser) || [];
    } catch(e) {
      repayments = [];
    }

    const totalCreditUsed = orders.reduce((sum, o) => (o.status !== 'Returned' ? sum + (Number(o.total) || 0) : sum), 0);
    const totalRepaid = repayments.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const currentUsed = Math.max(0, totalCreditUsed - totalRepaid);
    const availableLimit = Math.max(0, assignedLimit - currentUsed);

    res.json({
      success: true,
      orders: orders,
      repayments: repayments,
      totalLimit: assignedLimit,
      usedLimit: currentUsed,
      availableLimit: availableLimit
    });
  } catch (err) {
    console.error('Statement error:', err);
    res.json({ success: false, message: 'Failed to load statement', orders: [], repayments: [] });
  }
});

app.post(['/api/retailers/repay-credit', '/api/repay-credit'], (req, res) => {
  try {
    let { username, amount } = req.body;
    let cleanUser = (username || '').trim().replace(/^@/, '').toLowerCase();
    const numAmount = parseInt(amount, 10);

    if (!cleanUser || !numAmount || numAmount <= 0) {
      return res.json({ success: false, message: 'Invalid payment amount' });
    }

    const createdAt = new Date().toISOString();
    db.prepare('INSERT INTO credit_repayments (username, amount, created_at) VALUES (?, ?, ?)').run(cleanUser, numAmount, createdAt);

    res.json({ success: true, message: `Repayment of ₹${numAmount.toLocaleString('en-IN')} recorded successfully!` });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.get('/api/retailers/me', (req, res) => {
  try {
    let rawUser = req.query.username || '';
    let username = rawUser.trim().replace(/^@/, '').toLowerCase();
    const retailer = db.prepare('SELECT * FROM retailers WHERE LOWER(username) = ? OR LOWER(username) = ? LIMIT 1').get(username, '@' + username);
    if (retailer) {
      res.json({
        success: true,
        business_name: retailer.business_name,
        credit_limit: retailer.credit_limit || 0,
        phone: retailer.phone,
        address: retailer.address,
        state: retailer.state,
        gstin: retailer.gstin
      });
    } else {
      res.json({ success: false });
    }
  } catch(e) {
    res.json({ success: false });
  }
});

// 8. Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
