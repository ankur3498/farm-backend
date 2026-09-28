// Run once: node utils/fixWorkTaskIndex.js
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");

const fix = async () => {
  await connectDB();
  const collection = mongoose.connection.db.collection("worktasks");

  const indexes = await collection.indexes();
  console.log("Current indexes on worktasks:", indexes.map((i) => i.name));

  const staleIndexName = "assignedTo_1_category_1_date_1"; // old 3-field unique index
  const hasStale = indexes.some((i) => i.name === staleIndexName);

  if (hasStale) {
    await collection.dropIndex(staleIndexName);
    console.log(`Dropped stale index: ${staleIndexName}`);
  } else {
    console.log("Stale index not found — nothing to drop (already clean).");
  }

  const afterIndexes = await collection.indexes();
  console.log("Indexes now:", afterIndexes.map((i) => i.name));

  mongoose.connection.close();
  process.exit(0);
};

fix();