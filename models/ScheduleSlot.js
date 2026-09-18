const mongoose = require("mongoose");

const entrySchema = new mongoose.Schema(
  {
    track: { type: mongoose.Schema.Types.ObjectId, ref: "ScheduleTrack", required: true },
    description: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const scheduleSlotSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: "ScheduleSession", required: true },
    startTime: { type: String, required: true }, // "HH:MM" 24h, from a <input type="time">
    endTime: { type: String, required: true }, // "HH:MM" 24h
    order: { type: Number, default: 0 }, // controls row order within the session
    entries: [entrySchema], // one entry per track, description may be blank
  },
  { timestamps: true }
);

module.exports = mongoose.model("ScheduleSlot", scheduleSlotSchema);