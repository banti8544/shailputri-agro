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

// Helper to normalize any rogue GST rate
function sanitizeGst(val) {
  let num = parseInt(val, 10);
  if (isNaN(num) || num < 0) return 5;
  if (num > 100) num = Math.round(num / 100);
  return num;
}

// Auto-heal existing bad GST values in database on startup
try {
  db.prepare(`UPDATE products SET gst_rate = 18 WHERE gst_rate = 1800`).run();
  db.prepare(`UPDATE products SET gst_rate = 5 WHERE gst_rate = 500`).run();
  db.prepare(`UPDATE products SET gst_rate = 12 WHERE gst_rate = 1200`).run();
  db.prepare(`UPDATE products SET gst_rate = 28 WHERE gst_rate = 2800`).run();
} catch(e) {}

// GitHub Image Auto-Commit Function
async function syncImageToGitHub(filePath, fileName) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return;

  const repoOwner = "banti8544";
  const repoName = "shailputri-agro";
  const url = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/images/${fileName}`;

  try {
    const fileContent = fs.readFileSync(filePath, { encoding: 'base64' });
    let sha = null;
    try {
      const checkRes = await fetch(url, {
        headers: { "Authorization": `Bearer ${token}`, "User-Agent": "NodeJS-AutoSync" }
      });
      if (checkRes.ok) {
        const data = await checkRes.json();
        sha = data.sha;
      }
    } catch(e) {}

    const payload = {
      message: `Admin Panel auto-save: ${fileName}`,
      content: fileContent,
      branch: "main",
      ...(sha ? { sha } : {})
    };

    await fetch(url, {
      method: "PUT",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "NodeJS-AutoSync" },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error('❌ GitHub Auto-Sync Error:', err.message);
  }
}

// Database Auto-Sync to GitHub Function
async function syncDatabaseToGitHub() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return;

  const dbPath = path.join(__dirname, 'shailputri.db');
  if (!fs.existsSync(dbPath)) return;

  const repoOwner = "banti8544";
  const repoName = "shailputri-agro";
  const url = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/shailputri.db`;

  try {
    const fileContent = fs.readFileSync(dbPath, { encoding: 'base64' });
    let sha = null;
    try {
      const checkRes = await fetch(url, {
        headers: { "Authorization": `Bearer ${token}`, "User-Agent": "NodeJS-AutoSync" }
      });
      if (checkRes.ok) {
        const data = await checkRes.json();
        sha = data.sha;
      }
    } catch(e) {}

    const payload = {
      message: `Database auto-backup: ${new Date().toISOString()}`,
      content: fileContent,
      branch: "main",
      ...(sha ? { sha } : {})
    };

    await fetch(url, {
      method: "PUT",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "NodeJS-AutoSync" },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error('❌ DB GitHub Sync Error:', err.message);
  }
}

// Safe Schema Migration
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
addCol('products', 'unit', "TEXT DEFAULT 'Pcs.'");
addCol('products', 'gst_rate', 'INTEGER DEFAULT 5');
addCol('products', 'image_url', "TEXT DEFAULT 'images/placeholder.png'");

addCol('orders', 'username', 'TEXT');
addCol('orders', 'payment_mode', "TEXT DEFAULT 'Online'");
addCol('orders', 'payment_status', "TEXT DEFAULT 'Unpaid'");
addCol('orders', 'shipping_address', 'TEXT');
addCol('orders', 'shipping_phone', 'TEXT');
addCol('orders', 'shipping_state', "TEXT DEFAULT 'Bihar'");

addCol('company_settings', 'bulk_qty_threshold', 'INTEGER DEFAULT 10');
addCol('company_settings', 'bulk_discount_percent', 'INTEGER DEFAULT 3');
addCol('company_settings', 'signatory_url', "TEXT DEFAULT 'images/SAFPL.jpg'");
addCol('company_settings', 'logo_url', "TEXT DEFAULT 'images/logo.png'");
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

const uploadImage = multer({ storage: imageStorage });
const upload = multer({ dest: 'uploads/' });

// GST Lookup & Proxy APIs
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

app.get('/api/proxy/gst/:gstin', async (req, res) => {
  try {
    const gstin = req.params.gstin;
    const response = await fetch(`https://api.gstify.in/verify?gstin=${gstin}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ success: false, message: "GST fetch failed from server" });
  }
});

app.get('/api/proxy/pincode/:pincode', async (req, res) => {
  try {
    const pincode = req.params.pincode;
    const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ success: false, message: "Pincode fetch failed from server" });
  }
});

app.get('/api/busy/fetch-gst/:gstin', (req, res) => {
  try {
    const searchGstin = req.params.gstin.trim().toUpperCase();
    const row = db.prepare(`SELECT business_name, state, address FROM retailers WHERE gstin = ?`).get(searchGstin);
    if (!row) {
      return res.json({ success: false, message: "GSTIN BUSY डेटाबेस में नहीं मिला।" });
    }
    res.json({
      success: true,
      businessName: row.business_name,
      state: row.state,
      address: row.address
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error during BUSY GST fetch" });
  }
});

// Admin CSV Upload for Dealers
app.post('/api/admin/upload-busy-dealers', upload.single('busyFile'), (req, res) => {
  if (!req.file) {
    return res.json({ success: false, message: "कोई फाइल अपलोड नहीं की गई!" });
  }

  try {
    const filePath = req.file.path;
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const lines = fileContent.split('\n');
    let importedCount = 0;

    let nameIdx = 0, gstinIdx = -1, addressIdx = -1, stateIdx = -1, phoneIdx = -1;

    lines.forEach((line, index) => {
      if (!line.trim()) return;
      const cols = line.split(',').map(c => c.replace(/(^"|"$)/g, '').trim());

      // हेडर पढ़कर कॉलम पोजीशन सेट करना
      if (index === 0 || cols[0].toLowerCase().includes('name') || cols[0].toLowerCase().includes('party')) {
        cols.forEach((col, idx) => {
          const cLower = col.toLowerCase();
          if (cLower.includes('name') || cLower.includes('party')) nameIdx = idx;
          if (cLower.includes('gst')) gstinIdx = idx;
          if (cLower.includes('address') || cLower.includes('add')) addressIdx = idx;
          if (cLower.includes('state')) stateIdx = idx;
          if (cLower.includes('mob') || cLower.includes('phone')) phoneIdx = idx;
        });
        return;
      }

      const name = cols[nameIdx] || cols[0] || '';
      let gstin = '';
      
      // पूरी लाइन में 15 अंकों का GSTIN ढूँढना
      cols.forEach(col => {
        const clean = col.toUpperCase().trim();
        if (clean.length === 15 && /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(clean)) {
          gstin = clean;
        }
      });
      if (!gstin && gstinIdx !== -1) gstin = (cols[gstinIdx] || '').toUpperCase().trim();

      const address = (addressIdx !== -1 ? cols[addressIdx] : '') || cols[2] || '';
      const state = (stateIdx !== -1 ? cols[stateIdx] : '') || 'Bihar';
      const phone = (phoneIdx !== -1 ? cols[phoneIdx] : '') || '';

      if (gstin && gstin.length === 15 && name && !name.includes('Duties') && !name.includes('Expenses')) {
        // चेक करें कि क्या यह GSTIN पहले से डेटाबेस में है या नहीं
        const existing = db.prepare('SELECT id FROM retailers WHERE gstin = ?').get(gstin);

        if (existing) {
          // अगर है तो अपडेट करें
          db.prepare(`
            UPDATE retailers 
            SET business_name = ?, address = ?, state = ? 
            WHERE gstin = ?
          `).run(name, address, state, gstin);
        } else {
          // अगर नया है तो इंसर्ट करें
          db.prepare(`
            INSERT INTO retailers (business_name, username, password_hash, gstin, address, state, phone, scheme_name, discount_percent, credit_limit) 
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Regular', 0, 50000)
          `).run(name, 'dealer_' + Date.now(), 'no_pass', gstin, address, state, phone);
        }
        importedCount++;
      }
    });

    try { fs.unlinkSync(filePath); } catch(e){}
    res.json({ success: true, message: `सफलतापूर्वक ${importedCount} डीलर्स BUSY से सिंक हो गए!` });
  } catch (err) {
    res.status(500).json({ success: false, message: "फाइल प्रोसेस करने में त्रुटि: " + err.message });
  }
});
// Company Settings APIs
app.get('/api/company-settings', (req, res) => {
  try {
    const config = db.prepare('SELECT * FROM company_settings WHERE id = 1').get();
    res.json(config || {});
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
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
      syncImageToGitHub(req.files['companyLogo'][0].path, req.files['companyLogo'][0].filename);
    }
    if (req.files && req.files['signatoryStamp']) {
      updates.push("signatory_url = ?");
      params.push('images/' + req.files['signatoryStamp'][0].filename);
      syncImageToGitHub(req.files['signatoryStamp'][0].path, req.files['signatoryStamp'][0].filename);
    }

    params.push(1);
    db.prepare(`UPDATE company_settings SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    setImmediate(() => syncDatabaseToGitHub());
    res.json({ success: true, message: 'Settings, Bank Details & Logos saved!' });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// Dealer Auth & Profile APIs
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

    setImmediate(() => syncDatabaseToGitHub());
    res.json({ success: true, message: "Registration successful! Please login." });
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
    
    setImmediate(() => syncDatabaseToGitHub());
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
    
    setImmediate(() => syncDatabaseToGitHub());
    res.json({ success: true, message: 'Dealer details saved!' });
  } catch(e) {
    res.json({ success: false, message: e.message });
  }
});

// Products APIs
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
      const cleanGst = sanitizeGst(p.gst_rate);

      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        pack: p.pack || 'Standard',
        hsn: p.hsn || '1006',
        unit: p.unit || 'Pcs.',
        gst_rate: cleanGst,
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

app.post('/api/products/add', uploadImage.single('image'), (req, res) => {
  try {
    const { name, sku, pack, price, stock, category, hsn, gst_rate, unit } = req.body;
    let imagePath = 'images/placeholder.png';

    if (req.file) {
      imagePath = 'images/' + req.file.filename;
      syncImageToGitHub(req.file.path, req.file.filename);
    }

    const cleanGst = sanitizeGst(gst_rate);
    db.prepare(`
      INSERT INTO products (name, sku, pack, price, stock, category, image_url, hsn, gst_rate, unit) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name || 'New Product', sku || 'SKU-' + Date.now(), pack || "Standard", parseInt(price) || 0, parseInt(stock) || 0, category || "General", imagePath, hsn || "1006", cleanGst, unit || 'Pcs.');

    setImmediate(() => syncDatabaseToGitHub());
    res.json({ success: true, message: "Product added successfully!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

const handleProductUpdate = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ success: false, message: 'Product ID not found' });

    const { name, category, price, stock, hsn, gst_rate, unit } = req.body;
    const finalName = (name !== undefined && name !== '') ? name : existing.name;
    const finalCat = (category !== undefined && category !== '') ? category : existing.category;
    const finalPrice = (price !== undefined && price !== '') ? (parseInt(price) || 0) : existing.price;
    const finalStock = (stock !== undefined && stock !== '') ? (parseInt(stock) || 0) : existing.stock;
    const finalHsn = (hsn !== undefined && hsn !== '') ? hsn : (existing.hsn || '1006');
    const finalUnit = (unit !== undefined && unit !== '') ? unit : (existing.unit || 'Pcs.');
    const finalGst = (gst_rate !== undefined && gst_rate !== '') ? sanitizeGst(gst_rate) : sanitizeGst(existing.gst_rate);

    let finalImageUrl = existing.image_url;
    if (req.file) {
      finalImageUrl = `images/${req.file.filename}`;
      await syncImageToGitHub(req.file.path, req.file.filename);
    }

    db.prepare(`
      UPDATE products 
      SET name = ?, category = ?, price = ?, stock = ?, hsn = ?, gst_rate = ?, unit = ?, image_url = ? 
      WHERE id = ?
    `).run(finalName, finalCat, finalPrice, finalStock, finalHsn, finalGst, finalUnit, finalImageUrl, id);

    setImmediate(() => syncDatabaseToGitHub());
    res.json({ success: true, message: 'Product updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

app.post('/api/products/:id/update-with-image', uploadImage.single('image'), handleProductUpdate);
app.put('/api/products/:id', uploadImage.single('image'), handleProductUpdate);
app.post('/api/products/:id', uploadImage.single('image'), handleProductUpdate);

app.delete('/api/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  setImmediate(() => syncDatabaseToGitHub());
  res.json({ success: true, message: 'Product deleted!' });
});

// Orders APIs
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
      const pid = Number(item.id);
      if (!demandMap[pid]) demandMap[pid] = { id: pid, name: item.name, requiredQty: 0 };
      demandMap[pid].requiredQty += 1;
    });

    for (const pid of Object.keys(demandMap)) {
      const demanded = demandMap[pid];
      const prod = db.prepare('SELECT id, name, stock FROM products WHERE id = ?').get(demanded.id);
      if (!prod || (prod.stock || 0) < demanded.requiredQty) {
        return res.json({ success: false, message: `Insufficient Stock for "${demanded.name}"!` });
      }
    }

    if (paymentMode === 'Credit') {
      const retailer = db.prepare('SELECT credit_limit FROM retailers WHERE LOWER(username) = LOWER(?) OR LOWER(username) = LOWER(?) LIMIT 1').get(cleanUser, '@' + cleanUser);
      if (!retailer || (retailer.credit_limit < total)) {
        return res.json({ success: false, message: 'Insufficient Credit Limit!' });
      }
      db.prepare('UPDATE retailers SET credit_limit = credit_limit - ? WHERE LOWER(username) = LOWER(?) OR LOWER(username) = LOWER(?)').run(total, cleanUser, '@' + cleanUser);
    }

    const deductStmt = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
    for (const pid of Object.keys(demandMap)) {
      deductStmt.run(demandMap[pid].requiredQty, Number(pid));
    }

    const payStatus = (paymentMode === 'Credit') ? 'Unpaid' : 'Paid';
    const result = db.prepare('INSERT INTO orders (items, total, created_at, status, username, payment_mode, payment_status, shipping_address, shipping_phone, shipping_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(JSON.stringify(items), total, createdAt, 'Pending', cleanUser, paymentMode || 'Online', payStatus, finalShipTo, finalShipPhone, finalShipState);

    setImmediate(() => syncDatabaseToGitHub());
    res.json({ success: true, orderId: result.lastInsertRowid });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

const updateStatusHandler = (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const { status, payment_status } = req.body;
    
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const targetStatus = status || order.status;
    const targetPayStatus = payment_status || order.payment_status;

    // अगर आर्डर अब Cancelled या Returned हो रहा है (और पहले नहीं था)
    if ((targetStatus === 'Cancelled' || targetStatus === 'Returned') && order.status !== 'Cancelled' && order.status !== 'Returned' && order.status !== 'Return Requested') {
      
      // 1. यदि यह क्रेडिट ऑर्डर था, तो डीलर की क्रेडिट लिमिट (Total Limit) में पैसा वापस जोड़ें
      if (order.payment_mode === 'Credit' && order.username) {
        const cleanUser = order.username.replace(/^@/, '');
        try {
          db.prepare('UPDATE retailers SET credit_limit = credit_limit + ? WHERE LOWER(username) = LOWER(?) OR LOWER(username) = LOWER(?)').run(order.total, cleanUser, '@' + cleanUser);
        } catch(e) {}
      }

      // 2. प्रोडक्ट्स का स्टॉक वापस रीस्टोर करें
      try {
        const items = JSON.parse(order.items || '[]');
        const restoreMap = {};
        items.forEach(item => {
          const pid = Number(item.id);
          if (pid) restoreMap[pid] = (restoreMap[pid] || 0) + 1;
        });
        const restoreStmt = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
        for (const pid of Object.keys(restoreMap)) {
          restoreStmt.run(restoreMap[pid], Number(pid));
        }
      } catch(e) {}
    }

    // डेटाबेस में नया स्टेटस अपडेट करें
    db.prepare('UPDATE orders SET status = ?, payment_status = ? WHERE id = ?').run(targetStatus, targetPayStatus, orderId);
    
    setImmediate(() => syncDatabaseToGitHub());
    res.json({ success: true, message: `Order #${orderId} updated successfully!` });
  } catch (err) {
    console.error('Order status update error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

app.put('/api/orders/:id/status', updateStatusHandler);
app.post('/api/orders/:id/status', updateStatusHandler);

app.post('/api/orders/:id/cancel', (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    
    if (!order) return res.json({ success: false, message: "Order not found" });
    if (order.status === 'Cancelled') return res.json({ success: false, message: "Already cancelled" });

    // अगर आर्डर क्रेडिट पर था तो लिमिट वापस जोड़ें
    if (order.payment_mode === 'Credit' && order.username) {
      const cleanUser = order.username.replace(/^@/, '');
      try {
        db.prepare('UPDATE retailers SET credit_limit = credit_limit + ? WHERE LOWER(username) = LOWER(?) OR LOWER(username) = LOWER(?)').run(order.total, cleanUser, '@' + cleanUser);
      } catch(e) {}
    }

    // स्टॉक वापस रीस्टोर करें
    try {
      const items = JSON.parse(order.items || '[]');
      const restoreMap = {};
      items.forEach(item => {
        const pid = Number(item.id);
        if (pid) {
          restoreMap[pid] = (restoreMap[pid] || 0) + 1;
        }
      });

      const restoreStmt = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
      for (const pid of Object.keys(restoreMap)) {
        restoreStmt.run(restoreMap[pid], Number(pid));
      }
    } catch(e) {}

    db.prepare("UPDATE orders SET status = 'Cancelled' WHERE id = ?").run(orderId);
    
    setImmediate(() => syncDatabaseToGitHub());
    res.json({ success: true, message: "Order cancelled successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
app.post('/api/orders/:id/return', (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    
    if (!order) return res.json({ success: false, message: "Order not found" });
    if (order.status === 'Return Requested' || order.status === 'Returned') {
      return res.json({ success: false, message: "Return already requested or completed" });
    }

    db.prepare("UPDATE orders SET status = 'Return Requested' WHERE id = ?").run(orderId);
    
    setImmediate(() => syncDatabaseToGitHub());
    res.json({ success: true, message: "Return request submitted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Credit Statement APIs
app.get(['/api/retailers/credit-statement', '/api/credit-statement/:username'], (req, res) => {
  try {
    let rawUser = req.query.username || req.params.username || '';
    let username = rawUser.trim().replace(/^@/, '');
    if (!username) return res.json({ success: false, message: 'Username required' });

    const cleanUser = username.toLowerCase();
    const retailer = db.prepare('SELECT * FROM retailers WHERE LOWER(username) = ? OR LOWER(username) = ? LIMIT 1').get(cleanUser, '@' + cleanUser);
    if (!retailer) return res.json({ success: false, message: 'Dealer not found' });

    const assignedLimit = Number(retailer.credit_limit) || 0;
    const orders = db.prepare(`SELECT id, total, created_at, status, payment_mode FROM orders WHERE (LOWER(username) = ? OR LOWER(username) = ?) AND payment_mode = 'Credit' AND status != 'Cancelled' ORDER BY id DESC`).all(cleanUser, '@' + cleanUser) || [];
    const repayments = db.prepare(`SELECT id, amount, created_at FROM credit_repayments WHERE LOWER(username) = ? OR LOWER(username) = ? ORDER BY id DESC`).all(cleanUser, '@' + cleanUser) || [];

    const totalCreditUsed = orders.reduce((sum, o) => (o.status !== 'Returned' ? sum + (Number(o.total) || 0) : sum), 0);
    const totalRepaid = repayments.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const currentUsed = Math.max(0, totalCreditUsed - totalRepaid);
    const availableLimit = Math.max(0, assignedLimit - currentUsed);

    res.json({ success: true, orders, repayments, totalLimit: assignedLimit, usedLimit: currentUsed, availableLimit });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.post(['/api/retailers/repay-credit', '/api/repay-credit'], (req, res) => {
  try {
    let { username, amount } = req.body;
    let cleanUser = (username || '').trim().replace(/^@/, '').toLowerCase();
    const numAmount = parseInt(amount, 10);
    if (!cleanUser || !numAmount || numAmount <= 0) return res.json({ success: false, message: 'Invalid amount' });

    db.prepare('INSERT INTO credit_repayments (username, amount, created_at) VALUES (?, ?, ?)').run(cleanUser, numAmount, new Date().toISOString());
    setImmediate(() => syncDatabaseToGitHub());
    res.json({ success: true, message: `Repayment recorded successfully!` });
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
      res.json({ success: true, business_name: retailer.business_name, credit_limit: retailer.credit_limit || 0, phone: retailer.phone, address: retailer.address, state: retailer.state, gstin: retailer.gstin });
    } else {
      res.json({ success: false });
    }
  } catch(e) {
    res.json({ success: false });
  }
});

// Database Backup & Export Orders
app.get('/api/admin/backup-db', (req, res) => {
  const dbPath = path.join(__dirname, 'shailputri.db');
  if (fs.existsSync(dbPath)) {
    res.download(dbPath, `shailputri_backup.db`);
  } else {
    res.status(404).send('Database not found');
  }
});

app.get('/api/busy/export-orders', (req, res) => {
  if (req.query.key !== "Shailputri@BusySync2026") return res.status(401).send("Unauthorized");
  try {
    const rawOrders = db.prepare("SELECT * FROM orders WHERE status != 'Cancelled' ORDER BY id DESC").all() || [];
    const retailers = db.prepare("SELECT * FROM retailers").all() || [];
    let csv = "Order No,Date,Party Name,Item Name,Qty,Unit,Price,Total Amount\n";

    rawOrders.forEach(order => {
      const orderDate = new Date(order.created_at || Date.now()).toLocaleDateString('en-GB');
      const cleanOrderUser = (order.username || '').replace(/^@/, '').toLowerCase();
      const uMatch = retailers.find(r => (r.username || '').replace(/^@/, '').toLowerCase() === cleanOrderUser);
      const party = (uMatch ? uMatch.business_name : (order.username || 'Cash Dealer')).replace(/,/g, ' ');

      let parsedItems = [];
      try { parsedItems = JSON.parse(order.items || '[]'); } catch (e) { parsedItems = []; }

      const itemSummary = {};
      parsedItems.forEach(it => {
        const iName = (it.name || 'Agro Item').replace(/,/g, ' ');
        const iPrice = Number(it.price) || 0;
        const iUnit = it.unit || 'Pcs.';
        if (!itemSummary[iName]) itemSummary[iName] = { qty: 0, price: iPrice, unit: iUnit };
        itemSummary[iName].qty += 1;
      });

      for (const [name, data] of Object.entries(itemSummary)) {
        csv += `${order.id},${orderDate},"${party}","${name}",${data.qty},${data.unit},${data.price},${data.qty * data.price}\n`;
      }
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=BUSY_Sales_Orders.csv');
    return res.status(200).send(csv);
  } catch (err) {
    res.status(500).send("Error exporting orders");
  }
});

async function restoreDbFromGitHubOnStartup() {
  const dbPath = path.join(__dirname, 'shailputri.db');
  const token = process.env.GITHUB_TOKEN;
  if (!token) return;

  try {
    const url = `https://api.github.com/repos/banti8544/shailputri-agro/contents/shailputri.db`;
    const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}`, "User-Agent": "NodeJS-AutoSync" } });
    if (res.ok) {
      const data = await res.json();
      if (data && data.content) {
        fs.writeFileSync(dbPath, Buffer.from(data.content, 'base64'));
      }
    }
  } catch(e) {}
}

restoreDbFromGitHubOnStartup().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
// BUSY Direct Catalog Sync Endpoint
app.post('/api/busy/sync-catalog', (req, res) => {
  const secretKey = req.headers['x-busy-key'];
  if (secretKey !== "Shailputri@BusySync2026") {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: "No items provided" });
  }

  try {
    const findStmt = db.prepare('SELECT id, price, category, image_url, hsn, gst_rate, unit FROM products WHERE UPPER(TRIM(sku)) = UPPER(TRIM(?)) OR UPPER(TRIM(name)) = UPPER(TRIM(?))');
    
    const updateStmt = db.prepare(`
      UPDATE products 
      SET stock = ?, 
          price = CASE WHEN ? > 0 THEN ? ELSE price END,
          category = CASE WHEN ? != '' THEN ? ELSE category END,
          hsn = CASE WHEN ? != '' THEN ? ELSE hsn END,
          gst_rate = CASE WHEN ? >= 0 THEN ? ELSE gst_rate END,
          unit = CASE WHEN ? != '' THEN ? ELSE unit END,
          image_url = CASE 
            WHEN ? != '' AND ? NOT LIKE '%placeholder%' THEN ? 
            ELSE image_url 
          END
      WHERE id = ?
    `);

    const insertStmt = db.prepare(`
      INSERT INTO products (name, sku, pack, price, stock, category, image_url, hsn, gst_rate, unit)
      VALUES (?, ?, 'Bulk / Bag', ?, ?, ?, ?, ?, ?, ?)
    `);
    
    let updated = 0;
    let inserted = 0;

    const runTransaction = db.transaction((list) => {
      for (const item of list) {
        const cleanName = (item.name || '').trim();
        const cleanSku = (item.sku || cleanName).trim();
        const stockQty = parseInt(item.stock) || 0;
        const priceVal = parseInt(item.price) || 0;
        const categoryVal = (item.category || 'Agro Commodities').trim();
        const hsnVal = String(item.hsn || '').trim();
        const cleanGst = sanitizeGst(item.gst_rate);
        const unitVal = (item.unit || 'Pcs.').trim();
        const imgVal = (item.image_url || '').trim() || 'images/placeholder.png';

        if (!cleanName) continue;

        const existing = findStmt.get(cleanSku, cleanName);
        if (existing) {
          updateStmt.run(
            stockQty, 
            priceVal, priceVal, 
            categoryVal, categoryVal, 
            hsnVal, hsnVal, 
            cleanGst, cleanGst,
            unitVal, unitVal, 
            imgVal, imgVal, imgVal,
            existing.id
          );
          updated++;
        } else {
          insertStmt.run(
            cleanName, 
            cleanSku, 
            priceVal || 2500, 
            stockQty, 
            categoryVal, 
            imgVal, 
            hsnVal || '1006', 
            cleanGst,
            unitVal
          );
          inserted++;
        }
      }
    });

    runTransaction(items);
    setImmediate(() => syncDatabaseToGitHub());
    res.json({ 
      success: true, 
      message: `Successfully synced! (Updated: ${updated}, Auto-Added: ${inserted})` 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
app.get('/api/admin/backup-json', (req, res) => {
  try {
    const products = db.prepare('SELECT * FROM products').all();
    const retailers = db.prepare('SELECT * FROM retailers').all();
    const orders = db.prepare('SELECT * FROM orders').all();
    const settings = db.prepare('SELECT * FROM company_settings WHERE id = 1').get();
    const repayments = db.prepare('SELECT * FROM credit_repayments').all();

    const fullBackup = {
      backup_date: new Date().toISOString(),
      company_settings: settings,
      products,
      retailers,
      orders,
      credit_repayments: repayments
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-disposition', `attachment; filename=shailputri_data_${timestamp}.json`);
    res.setHeader('Content-type', 'application/json');
    res.send(JSON.stringify(fullBackup, null, 2));
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate JSON backup' });
  }
});
