const mongoose = require("mongoose");

const workTaskSchema = new mongoose.Schema(
  {
    category: { type: String, required: true, trim: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // null = auto-assigned
    source: { type: String, enum: ["manual", "auto", "schedule", "asset"], default: "manual" },
    date: { type: Date, required: true }, // normalized to midnight — which day this task belongs to
    notes: { type: String, default: "" }, // instructions from admin/manager

    // Present only for weekly asset-inspection tasks
    relatedAsset: { type: mongoose.Schema.Types.ObjectId, ref: "Asset", default: null },

    // Present only for field-patch tasks
    relatedFieldPatch: { type: mongoose.Schema.Types.ObjectId, ref: "FieldPatch", default: null },

    // Present only for tasks generated from the Daily Schedule module —
    // lets the UI show "Morning Milking · 7:00–7:10 · Worker 1" context.
    session: { type: String, default: "" },
    timeLabel: { type: String, default: "" },
    track: { type: String, default: "" },

    status: {
      type: String,
      enum: ["assigned", "in_progress", "submitted", "approved", "declined"],
      default: "assigned",
    },

    startedAt: { type: Date },
    completedAt: { type: Date },

    proof: {
      photoUrl: { type: String },
      videoUrl: { type: String },
    },

    sampleWeight: { type: String, default: "" },
    userRemark: { type: String, default: "" },

    // Optional — set when completing a task that consumed stock (e.g. feed).
    // Filled in by completeTask/resubmitTask if stockItemId+quantityUsed are sent.
    stockUsage: {
      item: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryItem" },
      quantity: { type: Number },
    },

    review: {
      status: { type: String, enum: ["pending", "approved", "declined"], default: "pending" },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reviewedAt: { type: Date },
      note: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

// One task per staff member, per category, per day, per time slot —
// timeLabel is blank ("") for non-schedule tasks, so the old one-task-per-
// category-per-day rule still holds for manual/auto tasks exactly as before.
workTaskSchema.index({ assignedTo: 1, category: 1, date: 1, timeLabel: 1 }, { unique: true });

const WorkTask = mongoose.model("WorkTask", workTaskSchema);
WorkTask.syncIndexes().catch((err) => console.log("WorkTask index sync warning:", err.message));

module.exports = WorkTask;