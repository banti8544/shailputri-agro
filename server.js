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
const uploadImage = upload; // For company settings & products

// 2. GST Lookup API
app.get('/api/gst-lookup/:gstin', (req, res) => {
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
      } catch(e) {}
    }

    // Safely Restore Inventory Stock
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

// API to update product with new image
app.put('/api/products/:id', upload.single('image'), (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, price, moq, unit, stock, description } = req.body;

    let query = `UPDATE products SET name = ?, category = ?, price = ?, stock = ?`;
    let params = [name, category, parseInt(price) || 0, parseInt(stock) || 0];

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

// 7. Update Order Status API (Fixes "Server error while updating order status")
app.post('/api/orders/:id/status', (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Agar status Cancelled ya Returned kiya jaye toh Credit Limit aur Stock restore karein
    if ((status === 'Cancelled' || status === 'Returned') && order.status !== status) {
      if (order.payment_mode === 'Credit' && order.username) {
        try {
          db.prepare('UPDATE retailers SET credit_limit = credit_limit + ? WHERE LOWER(username) = LOWER(?)').run(order.total, order.username);
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

    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, orderId);
    res.json({ success: true, message: `Order #${orderId} status updated to ${status}!` });
  } catch (err) {
    console.error('Order status update error:', err);
    res.status(500).json({ success: false, message: 'Server error while updating status' });
  }
});

// 8. Dealer Credit Statement & Ledger API (Fixes "Failed to load statement")
app.get('/api/credit-statement/:username', (req, res) => {
  try {
    const username = (req.params.username || '').trim();
    const retailer = db.prepare('SELECT * FROM retailers WHERE LOWER(username) = LOWER(?) LIMIT 1').get(username);
    
    if (!retailer) {
      return res.json({ success: false, message: 'Dealer not found' });
    }

    const assignedLimit = retailer.credit_limit || 0;
    const creditOrders = db.prepare(`
      SELECT id, total, created_at, 'Credit Used' as type 
      FROM orders 
      WHERE LOWER(username) = LOWER(?) AND payment_mode = 'Credit' AND status NOT IN ('Cancelled', 'Returned')
      ORDER BY id DESC
    `).all(username) || [];

    const repayments = db.prepare(`
      SELECT id, amount as total, created_at, 'Repayment' as type 
      FROM credit_repayments 
      WHERE LOWER(username) = LOWER(?) 
      ORDER BY id DESC
    `).all(username) || [];

    const transactions = [...creditOrders, ...repayments].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const totalCreditUsed = creditOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalRepaid = repayments.reduce((sum, r) => sum + (r.total || 0), 0);
    const currentUsed = Math.max(0, totalCreditUsed - totalRepaid);
    const availableLimit = Math.max(0, assignedLimit - currentUsed);

    res.json({
      success: true,
      totalLimit: assignedLimit,
      usedLimit: currentUsed,
      availableLimit: availableLimit,
      history: transactions
    });
  } catch (err) {
    console.error('Statement error:', err);
    res.json({ success: false, message: 'Failed to load statement' });
  }
});

// 9. Dealer Credit Repayment API
app.post('/api/repay-credit', (req, res) => {
  try {
    const { username, amount } = req.body;
    const numAmount = parseInt(amount, 10);
    if (!username || !numAmount || numAmount <= 0) {
      return res.json({ success: false, message: 'Invalid payment amount' });
    }

    const createdAt = new Date().toISOString();
    db.prepare('INSERT INTO credit_repayments (username, amount, created_at) VALUES (?, ?, ?)').run(username.trim(), numAmount, createdAt);

    res.json({ success: true, message: `Repayment of ₹${numAmount} recorded successfully!` });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
