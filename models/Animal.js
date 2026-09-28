const mongoose = require("mongoose");

const GESTATION_DAYS = {
  cow: 283,
  buffalo: 310,
  goat: 150,
  dog: 63,
};

const HEAT_INTERVAL_DAYS = {
  cow: 21,
  buffalo: 21,
  goat: 21,
  dog: 180, // ~6 months
};

const animalSchema = new mongoose.Schema(
  {
    tagId: { type: String, required: true, unique: true, uppercase: true, trim: true }, // e.g. "COW-101", "GT-204", "DOG-01"
    name: { type: String, default: "", trim: true }, // e.g. "Gauri", "Sheru"
    species: {
      type: String,
      enum: ["cow", "buffalo", "goat", "dog"],
      required: true,
      lowercase: true,
    },
    breed: { type: String, default: "", trim: true },
    gender: { type: String, enum: ["female", "male"], default: "female" },
    dateOfBirth: { type: Date },

    // Assigned staff member (defaults to manager/creator if unassigned)
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    status: { type: String, enum: ["active", "sold", "deceased"], default: "active" },

    reproductiveStatus: {
      type: String,
      enum: ["normal", "in_heat", "pregnant", "lactating", "dry"],
      default: "normal",
    },

    // ♀️ Heat Cycle Tracking
    heatTracking: {
      lastHeatDate: { type: Date },
      nextExpectedHeatDate: { type: Date },
      notes: { type: String, default: "" },
    },

    // 🤰 Pregnancy & Delivery Tracking
    pregnancyTracking: {
      inseminationDate: { type: Date },
      expectedDeliveryDate: { type: Date },
      pregnancyStatus: { type: String, enum: ["not_pregnant", "suspected", "confirmed", "delivered"], default: "not_pregnant" },
      notes: { type: String, default: "" },
    },

    // 💊 Medical & Vaccination History Logs
    medicalLogs: [
      {
        date: { type: Date, default: Date.now },
        title: { type: String, required: true }, // e.g. "FMD Vaccination", "Deworming", "Mastitis Treatment"
        type: { type: String, enum: ["vaccination", "deworming", "treatment", "checkup"], default: "vaccination" },
        medicine: { type: String, default: "" },
        nextDueDate: { type: Date }, // Next vaccination/treatment due alert date
        notes: { type: String, default: "" },
        proof: {
          photoUrl: { type: String },
          videoUrl: { type: String },
        },
        recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    ],

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

animalSchema.statics.GESTATION_DAYS = GESTATION_DAYS;
animalSchema.statics.HEAT_INTERVAL_DAYS = HEAT_INTERVAL_DAYS;

module.exports = mongoose.model("Animal", animalSchema);
