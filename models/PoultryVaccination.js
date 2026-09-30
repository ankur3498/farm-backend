const mongoose = require("mongoose");

const poultryVaccinationSchema = new mongoose.Schema(
  {
    flockBatch: { type: mongoose.Schema.Types.ObjectId, ref: "PoultryBatch", default: null },
    brooderBatch: { type: mongoose.Schema.Types.ObjectId, ref: "PoultryBrooder", default: null },
    flockName: { type: String, required: true, trim: true }, // Name or ID of the flock
    vaccineName: { type: String, required: true, trim: true }, // e.g. "ND B1 (Ranikhet)", "IBD Gumboro", "Fowl Pox"
    diseaseTarget: { type: String, default: "", trim: true }, // e.g. "Newcastle Disease", "Gumboro", "Marek's"
    targetAgeDays: { type: Number, required: true, min: 1 }, // e.g. Day 7, Day 14, Day 112 (Wk 16)
    scheduledDate: { type: Date, required: true },
    actualDate: { type: Date, default: null },
    route: {
      type: String,
      enum: ["drinking_water", "eye_drop", "wing_web", "subq", "im", "spray"],
      default: "drinking_water",
    },
    vaccineBrand: { type: String, default: "", trim: true },
    batchLotNo: { type: String, default: "", trim: true },
    dosesCount: { type: Number, default: 0, min: 0 },
    cost: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ["scheduled", "completed", "missed"], default: "scheduled" },
    administeredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    notes: { type: String, default: "" },
    proofPhotoUrl: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PoultryVaccination", poultryVaccinationSchema);
