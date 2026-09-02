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
    bulk_discount_percent INTEGER DEFAULT 3,
    bank_name TEXT DEFAULT 'State Bank of India',
    bank_account_no TEXT DEFAULT '423589123456',
    bank_ifsc TEXT DEFAULT 'SBIN0001234',
    bank_branch TEXT DEFAULT 'Purnia Main Branch'
  )
`).run();

// Migration if columns missing
try { db.prepare("ALTER TABLE company_settings ADD COLUMN bank_name TEXT DEFAULT 'State Bank of India'").run(); } catch(e){}
try { db.prepare("ALTER TABLE company_settings ADD COLUMN bank_account_no TEXT DEFAULT '423589123456'").run(); } catch(e){}
try { db.prepare("ALTER TABLE company_settings ADD COLUMN bank_ifsc TEXT DEFAULT 'SBIN0001234'").run(); } catch(e){}
try { db.prepare("ALTER TABLE company_settings ADD COLUMN bank_branch TEXT DEFAULT 'Purnia Main Branch'").run(); } catch(e){}

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

// 2. Default Company Profile with Distinct Logo, Signature Stamp & Bank Info
const existingConfig = db.prepare('SELECT id FROM company_settings WHERE id = 1').get();
if (!existingConfig) {
  db.prepare(`
    INSERT INTO company_settings (id, company_name, address, state, gstin, fssai, udyam, cin, phone, email, logo_url, signatory_url, bulk_qty_threshold, bulk_discount_percent, bank_name, bank_account_no, bank_ifsc, bank_branch)
    VALUES (1, 'SHAILPUTRI AGRO FOODS PRIVATE LIMITED', 'Vill-gotlong Naya Basti, Ward No10 Dolabari Tezpur, Sonitpur, Assam - 784027', 'Assam', '18ABUCS6903N1Z5', '10424000001234', 'UDYAM-AS-25-0046796', 'U46201AS2026PTC031042', '8544241851', 'info@shailputriagro.com', 'images/logo.png', 'images/SAFPL.jpg', 10, 3, 'State Bank of India', '423589123456', 'SBIN0001234', 'Purnia Main Branch')
  `).run();
} else {
  db.prepare(`
    UPDATE company_settings 
    SET logo_url = 'images/logo.png', signatory_url = 'images/SAFPL.jpg' 
    WHERE id = 1
  `).run();
}

// 3. Clean Duplicate Products
try {
  db.prepare(`
    DELETE FROM products 
    WHERE id NOT IN (
      SELECT MAX(id) FROM products GROUP BY sku
    )
  `).run();
} catch (e) {}

module.exports = db;
