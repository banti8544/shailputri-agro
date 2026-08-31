const Database = require('better-sqlite3');
const db = new Database('shailputri.db');

// Products table banao agar exist nahi karti
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    sku TEXT,
    pack TEXT,
    price INTEGER
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    items TEXT,
    total INTEGER,
    created_at TEXT
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS retailers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_name TEXT,
    username TEXT UNIQUE,
    password_hash TEXT
  )
`);
// Retailers table mein scheme columns add karo (agar pehle se na hon)
try {
  db.exec("ALTER TABLE retailers ADD COLUMN discount_percent INTEGER DEFAULT 4");
} catch (e) {
  // Column already exists, ignore
}
// Products table mein stock column add karo (agar pehle se na ho)
try {
  db.exec("ALTER TABLE products ADD COLUMN stock INTEGER DEFAULT 100");
} catch (e) {
  // Column already exists, ignore
}
// Orders table mein status column add karo (agar pehle se na ho)
try {
  db.exec("ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'Pending'");
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec("ALTER TABLE retailers ADD COLUMN scheme_name TEXT DEFAULT 'Silver Dealer'");
} catch (e) {
  // Column already exists, ignore
}

// Check karo table khaali hai ya nahi, agar khaali hai toh data daalo
const count = db.prepare('SELECT COUNT(*) as total FROM products').get();

if (count.total === 0) {
  const insert = db.prepare('INSERT INTO products (name, sku, pack, price) VALUES (?, ?, ?, ?)');

  insert.run("Sunrise Refined Sunflower Oil 1L", "SKU-2201", "12 pcs / case", 1380);
  insert.run("Golden Wheat Atta 5kg", "SKU-1187", "6 pcs / case", 1650);
  insert.run("Farm Fresh Assam Tea 250g", "SKU-3054", "24 pcs / case", 2160);
  insert.run("Sparkle Dish Wash 500ml", "SKU-4410", "18 pcs / case", 1890);

  console.log("Products table mein starting data daal diya gaya.");
}
try {
  db.exec("ALTER TABLE products ADD COLUMN category TEXT DEFAULT 'General'");
} catch (e) {
  // Column already exists, ignore
}
try {
  db.exec("ALTER TABLE products ADD COLUMN image_url TEXT DEFAULT ''");
} catch (e) {
  // Column already exists, ignore
}

module.exports = db;