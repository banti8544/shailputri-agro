const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new Database(path.join(__dirname, 'shailputri.db'));

// 1. Tables Creation
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

db.prepare(`
  CREATE TABLE IF NOT EXISTS retailers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_name TEXT,
    username TEXT UNIQUE,
    password_hash TEXT,
    phone TEXT,
    address TEXT,
    state TEXT DEFAULT 'Bihar',
    gstin TEXT,
    scheme_name TEXT DEFAULT 'Regular',
    discount_percent INTEGER DEFAULT 0,
    credit_limit INTEGER DEFAULT 50000
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    sku TEXT,
    pack TEXT DEFAULT 'Standard',
    price INTEGER,
    stock INTEGER DEFAULT 50,
    category TEXT DEFAULT 'General',
    image_url TEXT DEFAULT 'images/placeholder.png',
    hsn TEXT DEFAULT '1006',
    gst_rate INTEGER DEFAULT 5
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    items TEXT,
    total INTEGER,
    created_at TEXT,
    status TEXT DEFAULT 'Pending',
    username TEXT,
    payment_mode TEXT DEFAULT 'Online',
    payment_status TEXT DEFAULT 'Unpaid',
    shipping_address TEXT,
    shipping_phone TEXT,
    shipping_state TEXT DEFAULT 'Bihar'
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS credit_repayments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    amount INTEGER,
    created_at TEXT
  )
`).run();

// 2. Default Permanent Company Profile
const existingConfig = db.prepare('SELECT id FROM company_settings WHERE id = 1').get();
if (!existingConfig) {
  db.prepare(`
    INSERT INTO company_settings (id, company_name, address, state, gstin, fssai, udyam, cin, phone, email, logo_url, signatory_url, bulk_qty_threshold, bulk_discount_percent)
    VALUES (1, 'SHAILPUTRI AGRO FOODS PRIVATE LIMITED', 'Vill-gotlong Naya Basti, Ward No10 Dolabari Tezpur, Sonitpur, Assam - 784027', 'Assam', '18ABUCS6903N1Z5', '10424000001234', 'UDYAM-AS-25-0046796', 'U46201AS2026PTC031042', '8544241851', 'info@shailputriagro.com', 'images/logo.jpg', 'images/logo.jpg', 10, 3)
  `).run();
} else {
  // Update logo if already exists
  db.prepare(`
    UPDATE company_settings 
    SET logo_url = 'images/SAFPL.jpg', signatory_url = 'images/SAFPL.jpg' 
    WHERE id = 1
  `).run();
}
// 3. Remove Existing Duplicates
try {
  db.prepare(`
    DELETE FROM products 
    WHERE id NOT IN (
      SELECT MAX(id) FROM products GROUP BY sku
    )
  `).run();
} catch (e) {}

// 4. Default Products Seed with Real Images
const defaultProducts = [
  { name: 'Sunrise Refined Sunflower Oil 1L', sku: 'SKU-2201', hsn: '1512', gst_rate: 5, price: 1380, stock: 350, category: 'Edible Oils', image_url: 'images/oil.jpg' },
  { name: 'Golden Wheat Atta 5kg', sku: 'SKU-1187', hsn: '1101', gst_rate: 5, price: 1650, stock: 100, category: 'Atta & Flour', image_url: 'images/aata.jpg' },
  { name: 'Farm Fresh Assam Tea 250g', sku: 'SKU-3054', hsn: '0902', gst_rate: 5, price: 2160, stock: 80, category: 'Tea & Beverages', image_url: 'images/tea.jpg' },
  { name: 'Sparkle Dish Wash 500ml', sku: 'SKU-4410', hsn: '3402', gst_rate: 5, price: 1890, stock: 60, category: 'Cleaning Essentials', image_url: 'images/dishwash.jpg' },
  { name: 'MUSTERD CAKE (सरसों खली)', sku: 'SKU-6678', hsn: '2306', gst_rate: 5, price: 1500, stock: 100, category: 'PASU AHAR', image_url: 'images/mustard.jpg' },
  { name: 'Soyabin Refined Sunflower Oil 1L', sku: 'SKU-2202', hsn: '1507', gst_rate: 5, price: 1500, stock: 50, category: 'Edible Oils', image_url: 'images/Soyabin.jpg' },
  { name: 'DALOMOT (दालमोट)', sku: 'SKU-3209', hsn: '2106', gst_rate: 12, price: 750, stock: 50, category: 'Bhujia & Mixtures', image_url: 'images/chanachur.jpg' },
  { name: 'Phool Makhana Grade-A 250g (फूल मखाना)', sku: 'SKU-9901', hsn: '1904', gst_rate: 5, price: 2400, stock: 120, category: 'Dry Fruits & Makhana', image_url: 'images/makhana.jpg' }
];
const checkStmt = db.prepare('SELECT id FROM products WHERE sku = ?');
const updateStmt = db.prepare(`
  UPDATE products 
  SET name = ?, pack = 'Standard', price = ?, stock = ?, category = ?, image_url = ?, hsn = ?, gst_rate = ? 
  WHERE sku = ?
`);
const insertStmt = db.prepare(`
  INSERT INTO products (name, sku, pack, price, stock, category, image_url, hsn, gst_rate) 
  VALUES (?, ?, 'Standard', ?, ?, ?, ?, ?, ?)
`);

defaultProducts.forEach(p => {
  const existing = checkStmt.get(p.sku);
  if (existing) {
    updateStmt.run(p.name, p.price, p.stock, p.category, p.image_url, p.hsn, p.gst_rate, p.sku);
  } else {
    insertStmt.run(p.name, p.sku, p.price, p.stock, p.category, p.image_url, p.hsn, p.gst_rate);
  }
});

module.exports = db;
