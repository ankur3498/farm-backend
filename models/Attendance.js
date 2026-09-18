const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema(
  {
    time: { type: Date },
    latitude: { type: Number },
    longitude: { type: Number },
    address: { type: String, default: "" },
  },
  { _id: false }
);

const editRequestSchema = new mongoose.Schema(
  {
    requested: { type: Boolean, default: false },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    proposedTimeIn: { type: Date },
    proposedTimeOut: { type: Date },
    reason: { type: String },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    reviewNote: { type: String },
  },
  { _id: false }
);

const leaveRequestSchema = new mongoose.Schema(
  {
    requested: { type: Boolean, default: false },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reason: { type: String },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    reviewNote: { type: String },
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // Normalized to midnight — one record per user per calendar day
    date: { type: Date, required: true },
    timeIn: locationSchema,
    timeOut: locationSchema,
    status: {
      type: String,
      enum: ["present", "half-day", "leave"],
      default: "present",
    },
    editRequest: { type: editRequestSchema, default: () => ({}) },
    leaveRequest: { type: leaveRequestSchema, default: () => ({}) },
  },
  { timestamps: true }
);

// One attendance record per user per day
attendanceSchema.index({ user: 1, date: 1 }, { unique: true });

// Virtual: total worked hours (only meaningful once both timeIn and timeOut exist)
attendanceSchema.virtual("workedHours").get(function () {
  if (!this.timeIn?.time || !this.timeOut?.time) return null;
  const ms = new Date(this.timeOut.time) - new Date(this.timeIn.time);
  return Math.round((ms / (1000 * 60 * 60)) * 100) / 100;
});

attendanceSchema.set("toJSON", { virtuals: true });
attendanceSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Attendance", attendanceSchema);