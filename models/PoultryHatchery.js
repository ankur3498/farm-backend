const mongoose = require("mongoose");

const advanceBookingSchema = new mongoose.Schema({
  partyName: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 1 },
  bookingDate: { type: Date, default: Date.now },
  advanceAmount: { type: Number, default: 0, min: 0 },
  contactMobile: { type: String, default: "", trim: true },
  status: { type: String, enum: ["booked", "delivered", "cancelled"], default: "booked" },
});

const poultryHatcherySchema = new mongoose.Schema(
  {
    hatcheryBatchNo: { type: String, required: true, trim: true },
    incubatorNo: { type: String, required: true, trim: true },
    breedName: { type: String, default: "", trim: true }, // e.g. Cobb 500, Ross 308, BV300, Kuroiler
    settingDate: { type: Date, required: true },
    expectedHatchDate: { type: Date },
    actualHatchDate: { type: Date },
    eggsSet: { type: Number, required: true, min: 0 },
    fertileEggs: { type: Number, default: 0 },
    hatchedGradeA: { type: Number, default: 0 },
    hatchedGradeB: { type: Number, default: 0 },
    culls: { type: Number, default: 0 },
    advanceBookings: [advanceBookingSchema],
    status: { type: String, enum: ["incubating", "hatched", "completed"], default: "incubating" },
    notes: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PoultryHatchery", poultryHatcherySchema);
