const mongoose = require("mongoose");

const scheduleSessionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "Morning Milking"
    order: { type: Number, required: true, unique: true }, // 1-4, fixed count
    startTime: { type: String, default: "" }, // display label, e.g. "7:00 AM"
    endTime: { type: String, default: "" }, // display label, e.g. "9:30 AM"
  },
  { timestamps: true }
);

module.exports = mongoose.model("ScheduleSession", scheduleSessionSchema);