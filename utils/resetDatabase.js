// Run once: node utils/resetDatabase.js
// Clears ALL operational/data collections so you can start fresh after the
// schema changes (tracks now per-session, slots use startTime/endTime, etc).
// Does NOT touch the "users" collection — staff accounts and admin login
// stay exactly as they are.
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");

// Collection names as Mongoose pluralizes them (all lowercase)
const COLLECTIONS_TO_CLEAR = [
  "attendances",
  "worktasks",
  "workrecurrings",
  "workcategories",
  "schedulesessions",
  "scheduletracks",
  "scheduleslots",
  "sessionlogs",
  "inventoryitems",
  "stocklogs",
];

const reset = async () => {
  await connectDB();
  const db = mongoose.connection.db;

  for (const name of COLLECTIONS_TO_CLEAR) {
    try {
      const result = await db.collection(name).deleteMany({});
      console.log(`Cleared ${name}: ${result.deletedCount} documents removed`);
    } catch (error) {
      console.log(`Skipped ${name} (collection may not exist yet): ${error.message}`);
    }
  }

  console.log("\nDatabase reset complete. 'users' collection was left untouched.");
  console.log("Next steps:");
  console.log("  node utils/seedWorkCategories.js");
  console.log("  node utils/seedSchedule.js");
  console.log("  node utils/seedInventory.js");

  mongoose.connection.close();
  process.exit(0);
};

reset();