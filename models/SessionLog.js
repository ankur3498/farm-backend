const mongoose = require("mongoose");

const sessionLogSchema = new mongoose.Schema(
  {
    session: { type: mongoose.Schema.Types.ObjectId, ref: "ScheduleSession", required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: Date, required: true }, // normalized to midnight
    status: { type: String, enum: ["in_progress", "completed"], default: "in_progress" },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date },
  },
  { timestamps: true }
);


sessionLogSchema.index({ session: 1, assignedTo: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("SessionLog", sessionLogSchema);