const mongoose = require("mongoose");

const poultryBrooderSchema = new mongoose.Schema(
  {
    brooderBatchNo: { type: String, required: true, trim: true },
    brooderHouseNo: { type: String, required: true, trim: true }, // e.g. "Brooder Shed 1 / Ring A"
    placementDate: { type: Date, required: true },
    chicksPlaced: { type: Number, required: true, min: 0 },
    heatSource: { type: String, default: "Infrared Lamp", trim: true }, // Gas Brooder, Infrared Lamp, Bukhari, Diesel Heater
    targetTempC: { type: Number, default: 33 }, // Day 1 target temp
    starterFeedType: { type: String, default: "Pre-Starter Crumb" },
    receivedRef: { type: mongoose.Schema.Types.ObjectId, ref: "InTransitChick", default: null },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    status: { type: String, enum: ["active", "transferred", "completed"], default: "active" },
    transferredToType: { type: String, enum: ["layer", "broiler", "breeder", ""], default: "" },
    transferredDate: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PoultryBrooder", poultryBrooderSchema);
