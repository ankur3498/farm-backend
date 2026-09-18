const mongoose = require("mongoose");

const scheduleTrackSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: "ScheduleSession", required: true },
    name: { type: String, required: true, trim: true }, // e.g. "Worker 1", "Manager"
    order: { type: Number, default: 0 },
    // Who currently fills this track. Editable any time (e.g. if someone is
    // absent, swap the person here rather than editing every slot).
    defaultAssignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ScheduleTrack", scheduleTrackSchema);