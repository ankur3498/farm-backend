// Run once: node utils/seedSchedule.js
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const ScheduleSession = require("../models/ScheduleSession");
const ScheduleTrack = require("../models/ScheduleTrack");
const ScheduleSlot = require("../models/ScheduleSlot");

// 5 sessions — one per work category. All times fall within an 8 AM – 8 PM
// working window. Sessions/tracks run independently, so overlapping times
// across different sessions is fine — different workers work in parallel.
const SESSIONS = [
  {
    name: "Milking", order: 1, startTime: "8:00 AM", endTime: "8:00 PM",
    tracks: ["Worker 1", "Worker 2", "Worker 3 - Support", "Manager"],
  },
  {
    name: "Feeding", order: 2, startTime: "10:30 AM", endTime: "12:30 PM",
    tracks: ["Worker 3", "Worker 4", "Worker 5"],
  },
  {
    name: "Medication", order: 3, startTime: "12:30 PM", endTime: "1:20 PM",
    tracks: ["Worker 1", "Manager"],
  },
  {
    name: "Cleaning", order: 4, startTime: "8:00 AM", endTime: "9:00 AM",
    tracks: ["Worker 1", "Worker 2", "Manager"],
  },
  {
    name: "Cropping", order: 5, startTime: "8:00 AM", endTime: "11:00 AM",
    tracks: ["Worker 1", "Worker 2", "Manager"],
  },
];

// Each row: [startTime, endTime, title, notes, { trackName: description, ... }]
const SESSION_ROWS = {
  Milking: [
    // -- Morning block (8:00–10:30 AM) --
    ["08:00", "08:10", "Morning — Attendance & Prep", "", { "Worker 1": "Attendance & preparation", "Worker 2": "Attendance & preparation", "Worker 3 - Support": "Attendance & preparation", "Manager": "Attendance + assign duties" }],
    ["08:10", "08:20", "", "", { "Worker 1": "Check milking equipment", "Worker 2": "Prepare milking station", "Worker 3 - Support": "Prepare buffalo holding area", "Manager": "Check medical/treated-animal list" }],
    ["08:20", "08:30", "", "", { "Worker 1": "Prepare first buffaloes", "Worker 2": "Prepare first buffaloes", "Worker 3 - Support": "Bring first group + manage movement", "Manager": "Inspect hygiene & readiness" }],
    ["08:30", "08:40", "", "", { "Worker 1": "Start milking – Station A", "Worker 2": "Start milking – Station B", "Worker 3 - Support": "Keep next buffaloes ready", "Manager": "Supervise & observe animals" }],
    ["08:40", "09:00", "", "", { "Worker 1": "Continue milking", "Worker 2": "Continue milking", "Worker 3 - Support": "Continuous animal movement", "Manager": "Health/hygiene monitoring" }],
    ["09:00", "09:20", "", "", { "Worker 1": "Continue milking", "Worker 2": "Continue milking", "Worker 3 - Support": "Bring next animals + return completed animals", "Manager": "Spot-check milk/animals" }],
    ["09:20", "09:40", "", "", { "Worker 1": "Finish remaining buffaloes", "Worker 2": "Finish remaining buffaloes", "Worker 3 - Support": "Maintain animal flow", "Manager": "Confirm progress toward 20" }],
    ["09:40", "09:50", "", "", { "Worker 1": "Final milking checks", "Worker 2": "Final milking checks", "Worker 3 - Support": "Return buffaloes + feed/water", "Manager": "Confirm all 20 accounted for" }],
    ["09:50", "10:00", "", "", { "Worker 1": "Clean milking equipment", "Worker 2": "Clean milking station", "Worker 3 - Support": "Clean milking area + dung", "Manager": "Inspect cleanliness" }],
    ["10:00", "10:10", "", "", { "Worker 1": "Consolidate milk", "Worker 2": "Assist milk handling", "Worker 3 - Support": "Prepare delivery area", "Manager": "Prepare milk records" }],
    ["10:10", "10:15", "", "", { "Worker 1": "Weigh milk", "Worker 2": "Assist weighing", "Worker 3 - Support": "Prepare loading", "Manager": "Verify scale" }],
    ["10:15", "10:20", "", "", { "Worker 1": "Take/confirm scale photo", "Worker 2": "Record milk quantity", "Worker 3 - Support": "Assist container loading", "Manager": "Verify photo + register" }],
    ["10:20", "10:25", "", "", { "Worker 1": "Prepare delivery", "Worker 2": "Final container check", "Worker 3 - Support": "Loading/delivery support", "Manager": "Confirm delivery quantity" }],
    ["10:25", "10:30", "", "", { "Worker 1": "Handover / leave for delivery", "Worker 2": "Final dairy check", "Worker 3 - Support": "Final shed/water check", "Manager": "Sign off morning report" }],
    // -- Evening block (5:30–8:00 PM) --
    ["17:30", "17:40", "Evening — Attendance & Prep", "", { "Worker 1": "Attendance & preparation", "Worker 2": "Attendance & preparation", "Worker 3 - Support": "Attendance & preparation", "Manager": "Attendance + assign duties" }],
    ["17:40", "17:50", "", "", { "Worker 1": "Check milking equipment", "Worker 2": "Prepare milking station", "Worker 3 - Support": "Prepare buffalo holding area", "Manager": "Check medical/treated-animal list" }],
    ["17:50", "18:05", "", "", { "Worker 1": "Prepare first buffaloes", "Worker 2": "Prepare first buffaloes", "Worker 3 - Support": "Bring first group + manage movement", "Manager": "Inspect hygiene & readiness" }],
    ["18:05", "18:20", "", "", { "Worker 1": "Start milking – Station A", "Worker 2": "Start milking – Station B", "Worker 3 - Support": "Keep next buffaloes ready", "Manager": "Supervise & observe animals" }],
    ["18:20", "18:50", "", "", { "Worker 1": "Continue milking", "Worker 2": "Continue milking", "Worker 3 - Support": "Continuous animal movement", "Manager": "Health/hygiene monitoring" }],
    ["18:50", "19:20", "", "", { "Worker 1": "Finish remaining buffaloes", "Worker 2": "Finish remaining buffaloes", "Worker 3 - Support": "Maintain animal flow", "Manager": "Confirm progress toward 20" }],
    ["19:20", "19:30", "", "", { "Worker 1": "Clean milking equipment", "Worker 2": "Clean milking station", "Worker 3 - Support": "Clean milking area + dung", "Manager": "Inspect cleanliness" }],
    ["19:30", "19:40", "", "", { "Worker 1": "Consolidate milk", "Worker 2": "Assist milk handling", "Worker 3 - Support": "Prepare delivery area", "Manager": "Prepare milk records" }],
    ["19:40", "19:50", "", "", { "Worker 1": "Weigh & record milk", "Worker 2": "Assist weighing", "Worker 3 - Support": "Prepare loading", "Manager": "Verify scale + register" }],
    ["19:50", "20:00", "", "", { "Worker 1": "Handover / feed & water", "Worker 2": "Final dairy check", "Worker 3 - Support": "Final shed/water check", "Manager": "Sign off evening report" }],
  ],

  Feeding: [
    ["10:30", "10:45", "Preparation & Stock Verification", "Record existing feed stock before feeding.",
      { "Worker 3": "Check and prepare cattle feed.", "Worker 4": "Prepare goat and hen feed.", "Worker 5": "Prepare dog feed and verify weighing scale." }],
    ["10:45", "11:15", "Cows & Goats Feeding", "Weigh feed prepared and feed given to animals.",
      { "Worker 3": "Feed 20 cows.", "Worker 4": "Feed 50 goats.", "Worker 5": "Assist with feed distribution and monitor completion." }],
    ["11:15", "11:45", "Hen Feeding", "Record total feed used for hens.",
      { "Worker 3": "Assist in preparing and distributing hen feed.", "Worker 4": "Feed 1,000 hens across the designated feeding areas.", "Worker 5": "Measure feed quantities and support distribution." }],
    ["11:45", "12:00", "Dog Feeding & Final Distribution", "Verify that all animals have received feed.",
      { "Worker 3": "Complete any pending animal feeding.", "Worker 4": "Complete any pending animal feeding.", "Worker 5": "Feed 2 dogs." }],
    ["12:00", "12:15", "Weighing & Photo Documentation", "Weigh remaining feed, photograph the scale for each feed type, confirm quantities prepared vs given.",
      { "Worker 3": "Weigh & photograph remaining feed", "Worker 4": "Weigh & photograph remaining feed", "Worker 5": "Weigh & photograph remaining feed" }],
    ["12:15", "12:30", "Record Submission & Stock Deduction", "Submit feed usage records + weighing photos. Stock auto-deducts on confirmation. Supervisor verifies and closes the session.",
      { "Worker 3": "Submit feed usage record", "Worker 4": "Submit feed usage record", "Worker 5": "Submit feed usage record" }],
  ],

  Medication: [
    ["12:30", "12:40", "Preparation", "", { "Worker 1": "Check medicine stock & prepare dosage list", "Manager": "Review sick/treated-animal list" }],
    ["12:40", "13:00", "Administer Medication", "", { "Worker 1": "Administer medicine/injections to scheduled animals", "Manager": "Supervise & record dosage given" }],
    ["13:00", "13:10", "Record & Documentation", "", { "Worker 1": "Log each animal's medication given", "Manager": "Verify records and flag follow-ups" }],
    ["13:10", "13:20", "Stock Update", "Medicine stock auto-deducts on confirmation.", { "Worker 1": "Update medicine stock after use", "Manager": "Confirm stock deduction, reorder if low" }],
  ],

  Cleaning: [
    ["08:00", "08:15", "Shed Cleaning", "", { "Worker 1": "Sweep and remove waste – Zone A", "Worker 2": "Sweep and remove waste – Zone B", "Manager": "Inspect cleanliness" }],
    ["08:15", "08:30", "Equipment Cleaning", "", { "Worker 1": "Wash and sanitize milking equipment", "Worker 2": "Clean feeding troughs and containers", "Manager": "Check equipment condition" }],
    ["08:30", "08:45", "Waste Disposal", "", { "Worker 1": "Collect and dispose of dung/waste", "Worker 2": "Assist waste collection", "Manager": "Confirm disposal area is clear" }],
    ["08:45", "09:00", "Final Inspection", "", { "Worker 1": "General walkthrough", "Worker 2": "General walkthrough", "Manager": "Sign off cleanliness report" }],
  ],

  Cropping: [
    ["08:00", "08:30", "Field Inspection", "", { "Worker 1": "Inspect crop rows for pests/damage", "Worker 2": "Check irrigation lines", "Manager": "Review field condition" }],
    ["08:30", "09:30", "Irrigation / Watering", "", { "Worker 1": "Operate irrigation – Field A", "Worker 2": "Operate irrigation – Field B", "Manager": "Monitor water usage" }],
    ["09:30", "10:30", "Weeding / Maintenance", "", { "Worker 1": "Weeding and field maintenance", "Worker 2": "Weeding and field maintenance", "Manager": "Supervise progress" }],
    ["10:30", "11:00", "Harvest / Fodder Cutting", "", { "Worker 1": "Cut fodder for feeding", "Worker 2": "Collect and transport fodder", "Manager": "Record quantity harvested" }],
  ],
};

const seed = async () => {
  await connectDB();

  for (const s of SESSIONS) {
    const session = await ScheduleSession.findOneAndUpdate(
      { name: s.name },
      { $setOnInsert: { name: s.name, order: s.order, startTime: s.startTime, endTime: s.endTime } },
      { upsert: true, new: true }
    );

    const trackDocs = {};
    for (let i = 0; i < s.tracks.length; i++) {
      const trackName = s.tracks[i];
      const track = await ScheduleTrack.findOneAndUpdate(
        { session: session._id, name: trackName },
        { $setOnInsert: { session: session._id, name: trackName, order: i, defaultAssignedTo: null } },
        { upsert: true, new: true }
      );
      trackDocs[trackName] = track;
    }

    const existingCount = await ScheduleSlot.countDocuments({ session: session._id });
    if (existingCount > 0) {
      console.log(`${s.name} already has slots — skipped.`);
      continue;
    }

    const rows = SESSION_ROWS[s.name] || [];
    for (let i = 0; i < rows.length; i++) {
      const [startTime, endTime, title, notes, descByTrack] = rows[i];
      await ScheduleSlot.create({
        session: session._id,
        startTime,
        endTime,
        title,
        notes,
        order: i,
        entries: s.tracks.map((trackName) => ({
          track: trackDocs[trackName]._id,
          description: descByTrack[trackName] || "",
        })),
      });
    }
    console.log(`Seeded ${rows.length} slots for ${s.name}.`);
  }

  console.log("\nSchedule seed complete: 5 sessions, all within 8 AM–8 PM, each with its own tracks.");
  console.log("Different sessions/tracks run independently — parallel work across staff is fully supported.");
  console.log("Next: open Daily Schedule in the app and assign real staff to each track.");
  mongoose.connection.close();
  process.exit(0);
};

seed();