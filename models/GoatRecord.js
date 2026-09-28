const mongoose = require("mongoose");

const goatRecordSchema = new mongoose.Schema(
  {
    batch: { type: mongoose.Schema.Types.ObjectId, ref: "GoatBatch", required: true },
    date: { type: Date, required: true }, // normalized to midnight
    ageDay: { type: Number, required: true }, // days since entryDate

    openStock: { type: Number, required: true, min: 0 },
    mortality: { type: Number, default: 0, min: 0 },
    culls: { type: Number, default: 0, min: 0 },
    closingStock: { type: Number, required: true, min: 0 }, // openStock - mortality - culls

    feedKg: { type: Number, default: 0, min: 0 },
    sampleWeightKg: { type: Number, default: null }, // average or batch sample weight in Kg

    remarks: { type: String, default: "" }, // e.g. "PPR Vaccination", "Deworming", "General Checkup"
    proof: {
      photoUrl: { type: String },
      videoUrl: { type: String },
    },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// One entry per batch per calendar day
goatRecordSchema.index({ batch: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("GoatRecord", goatRecordSchema);
