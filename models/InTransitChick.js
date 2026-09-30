const mongoose = require("mongoose");

const inTransitChickSchema = new mongoose.Schema(
  {
    batchNo: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    distanceKm: { type: Number, default: 0, min: 0 },
    transitHours: { type: Number, default: 0, min: 0 },
    chicksLoaded: { type: Number, required: true, min: 0 },
    transitMortality: { type: Number, required: true, min: 0, default: 0 },
    sourceSupplier: { type: String, default: "", trim: true },
    vehicleDetails: { type: String, default: "", trim: true },
    status: { type: String, enum: ["in_transit", "received", "cancelled"], default: "in_transit" },
    
    // Received details (populated when marked as received)
    dateReceived: { type: Date },
    destinationType: { type: String, enum: ["layer", "breeder", "broiler", "brooder", "unassigned"], default: "unassigned" },
    assignedPen: { type: String, default: "" },
    receivedNotes: { type: String, default: "" },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("InTransitChick", inTransitChickSchema);
