const mongoose = require("mongoose");

const poultryRecordSchema = new mongoose.Schema(
  {
    batch: { type: mongoose.Schema.Types.ObjectId, ref: "PoultryBatch", required: true },
    date: { type: Date, required: true }, // normalized to midnight
    ageDay: { type: Number, required: true }, // days since dateOfHatch

    openStock: { type: Number, required: true, min: 0 },
    mortality: { type: Number, default: 0, min: 0 },
    culls: { type: Number, default: 0, min: 0 },
    closingStock: { type: Number, required: true, min: 0 }, // openStock - mortality - culls

    feedKg: { type: Number, default: 0, min: 0 },
    feedPerBirdGms: { type: Number, default: 0 }, // (feedKg * 1000) / closingStock

    // Laying-phase only — leave unset during brooding
    eggCount: { type: Number, default: null },
    eggProductionPercent: { type: Number, default: null }, // eggCount / closingStock * 100

    bodyWeightGms: { type: Number, default: null }, // filled periodically (e.g. weekly)

    remarks: { type: String, default: "" }, // e.g. "MD Vaccination", "Debeaking"
    proof: {
      photoUrl: { type: String },
      videoUrl: { type: String },
    },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// One entry per batch per calendar day
poultryRecordSchema.index({ batch: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("PoultryRecord", poultryRecordSchema);