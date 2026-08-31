const express = require('express');
const app = express();
app.use(express.json());
const PORT = 4000;

// Live working image URLs ke saath data
const busyItems = [
  { 
    name: "Sunrise Refined Sunflower Oil 1L", 
    sku: "SKU-2201", 
    stock: 400, 
    price: 1380, 
    category: "Edible Oils", 
    image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400" 
  },
  { 
    name: "Golden Wheat Atta 5kg", 
    sku: "SKU-1187", 
    stock: 8, 
    price: 1650, 
    category: "Atta, Rice & Dal", 
    image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400" 
  },
  { 
    name: "Farm Fresh Assam Tea 250g", 
    sku: "SKU-3054", 
    stock: 0, 
    price: 2160, 
    category: "Tea, Coffee & Milk Drinks", 
    image: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=400" 
  },
  { 
    name: "Sparkle Dish Wash 500ml", 
    sku: "SKU-4410", 
    stock: 45, 
    price: 1890, 
    category: "Cleaning Essentials", 
    image: "https://images.unsplash.com/photo-1585670210693-e7fdd16b142e?w=400" 
  }
];

app.get('/busy-api/items', (req, res) => {
  console.log("Busy se item list maangi gayi...");
  res.json(busyItems);
});

app.post('/busy-api/sales-order', (req, res) => {
  console.log("Busy ko naya order mila:", req.body);
  res.json({ success: true, busyOrderNumber: "SO-" + Math.floor(Math.random() * 10000) });
});

app.listen(PORT, () => {
  console.log('Mock Busy chal raha hai: http://localhost:' + PORT);
});