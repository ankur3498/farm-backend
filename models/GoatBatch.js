const mongoose = require("mongoose");

const goatBatchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "Batch 1 - Jamunapari", "Goat Group A"
    breed: { type: String, default: "", trim: true }, // e.g. "Jamunapari", "Sirohi", "Barbari"
    entryDate: { type: Date, required: true }, // Date goats arrived / batch started
    goatsReceived: { type: Number, required: true, min: 1 }, // Initial head count
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("GoatBatch", goatBatchSchema);
