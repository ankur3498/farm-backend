// Run once: node utils/seedInventory.js
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const InventoryItem = require("../models/InventoryItem");

const ITEMS = [
  { name: "Cattle Feed", category: "feed", unit: "kg", currentQuantity: 500, reorderLevel: 50 },
  { name: "Goat Feed", category: "feed", unit: "kg", currentQuantity: 200, reorderLevel: 30 },
  { name: "Hen Feed", category: "feed", unit: "kg", currentQuantity: 300, reorderLevel: 40 },
  { name: "Dog Feed", category: "feed", unit: "kg", currentQuantity: 20, reorderLevel: 5 },
];

const seed = async () => {
  await connectDB();

  for (const item of ITEMS) {
    await InventoryItem.findOneAndUpdate(
      { name: item.name },
      { $setOnInsert: item },
      { upsert: true }
    );
  }

  console.log(`Seeded ${ITEMS.length} inventory items:`, ITEMS.map((i) => i.name).join(", "));
  console.log("Adjust real starting quantities from the Inventory page any time.");
  mongoose.connection.close();
  process.exit(0);
};

seed();