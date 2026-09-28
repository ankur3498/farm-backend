const mongoose = require("mongoose");

const poultryBatchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "Batch A - IB H120"
    breed: { type: String, default: "", trim: true }, // e.g. "IB H120"
    dateOfHatch: { type: Date, required: true },
    chicksReceived: { type: Number, required: true, min: 0 },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    isActive: { type: Boolean, default: true }, // false once the batch is culled/sold off
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PoultryBatch", poultryBatchSchema);