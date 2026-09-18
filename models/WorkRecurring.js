const mongoose = require("mongoose");

const workRecurringSchema = new mongoose.Schema(
  {
    category: { type: String, required: true, trim: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    isActive: { type: Boolean, default: true },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WorkRecurring", workRecurringSchema);