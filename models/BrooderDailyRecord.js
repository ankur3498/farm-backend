const mongoose = require("mongoose");

const brooderDailyRecordSchema = new mongoose.Schema(
  {
    brooderBatch: { type: mongoose.Schema.Types.ObjectId, ref: "PoultryBrooder", required: true },
    date: { type: Date, required: true },
    ageDay: { type: Number, required: true }, // Day 1, Day 2...
    tempMorningC: { type: Number, default: null },
    tempEveningC: { type: Number, default: null },
    humidityPct: { type: Number, default: null },
    mortality: { type: Number, default: 0, min: 0 },
    culls: { type: Number, default: 0, min: 0 },
    feedKg: { type: Number, default: 0, min: 0 },
    waterLiters: { type: Number, default: 0, min: 0 },
    sampleAvgWeightGms: { type: Number, default: null }, // Average sample body weight in grams
    checklist: [{ type: String }], // e.g. ["vitamin_water", "ring_expanded", "vaccination", "litter_turned"]
    remarks: { type: String, default: "" },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BrooderDailyRecord", brooderDailyRecordSchema);
