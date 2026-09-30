const mongoose = require("mongoose");

const fieldPatchSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Field patch name is required"],
      trim: true,
    },
    image: {
      type: String,
      default: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=80",
    },
    work: {
      type: String,
      required: [true, "Work activity description is required"],
      trim: true,
    },
    workType: {
      type: String,
      enum: ["daily", "one_time"],
      default: "one_time",
    },
    landmark: {
      type: String,
      required: [true, "Landmark description is required"],
      trim: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    assignedToName: {
      type: String,
      default: "Unassigned Worker",
    },
    crop: {
      type: String,
      default: "General Crop",
    },
    size: {
      type: String,
      default: "1.0 Acre",
    },
    status: {
      type: String,
      enum: ["active", "in_progress", "submitted", "approved", "declined", "completed"],
      default: "active",
    },
    // Proof Submission by Worker
    submissionProof: {
      type: String,
    },
    submissionNotes: {
      type: String,
    },
    submittedAt: {
      type: Date,
    },
    // Admin / Manager Review
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedByName: {
      type: String,
    },
    reviewNote: {
      type: String,
    },
    reviewedAt: {
      type: Date,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FieldPatch", fieldPatchSchema);
