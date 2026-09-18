const mongoose = require("mongoose");

const inventoryItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "Cattle Feed"
    category: { type: String, enum: ["feed", "medicine", "equipment", "other"], default: "feed" },
    unit: { type: String, default: "kg" }, // kg, litre, pieces, etc.
    currentQuantity: { type: Number, required: true, default: 0 },
    reorderLevel: { type: Number, default: 0 }, // alert threshold
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("InventoryItem", inventoryItemSchema);