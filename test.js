const db = require('./db');
db.prepare("UPDATE retailers SET discount_percent = 10, scheme_name = 'Gold Dealer' WHERE username = 'banti1122'").run();
console.log("Updated!");