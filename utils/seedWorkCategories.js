// Run once: node utils/seedWorkCategories.js
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const WorkCategory = require("../models/WorkCategory");

const DEFAULTS = ["Cleaning", "Milking", "Cropping", "Feeding", "Medication"];

const seed = async () => {
  await connectDB();

  for (const name of DEFAULTS) {
    await WorkCategory.findOneAndUpdate(
      { name },
      { $setOnInsert: { name, isDefault: true, createdBy: null } },
      { upsert: true }
    );
  }

  console.log("Default work categories seeded:", DEFAULTS.join(", "));
  mongoose.connection.close();
  process.exit(0);
};

seed();