const mongoose = require("mongoose");

const assetSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // Item name
    category: {
      type: String,
      enum: ["Equipment", "Vehicle", "Tool", "Electronics", "Other"],
      default: "Equipment",
    },
    photoUrl: { type: String, default: "" }, // reference photo of the asset itself
    responsiblePerson: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    isActive: { type: Boolean, default: true },
    lastInspectedAt: { type: Date, default: null }, // set when an inspection task is completed
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Asset", assetSchema);