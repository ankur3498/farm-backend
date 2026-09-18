const express = require("express");
const router = express.Router();
const {
  getSessions,
  updateSession,
  getTracks,
  createTrack,
  updateTrack,
  deleteTrack,
  getSlots,
  createSlot,
  updateSlot,
  deleteSlot,
  generateTasksForDate,
  getMySessionLog,
  startSession,
  endSession,
  getAllSessionLogs,
} = require("../controllers/scheduleController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect); // every schedule route requires login

// Session log — any logged-in staff, attendance-style start/end
router.get("/session-log", getMySessionLog);
router.post("/session-log/:sessionId/start", startSession);
router.post("/session-log/:sessionId/end", endSession);

// Everything below is the schedule builder — admin/manager only
router.get("/sessions", authorize("admin", "manager_operations"), getSessions);
router.put("/sessions/:id", authorize("admin", "manager_operations"), updateSession);

router.get("/tracks", authorize("admin", "manager_operations"), getTracks);
router.post("/tracks", authorize("admin", "manager_operations"), createTrack);
router.put("/tracks/:id", authorize("admin", "manager_operations"), updateTrack);
router.delete("/tracks/:id", authorize("admin", "manager_operations"), deleteTrack);

router.get("/slots", authorize("admin", "manager_operations"), getSlots);
router.post("/slots", authorize("admin", "manager_operations"), createSlot);
router.put("/slots/:id", authorize("admin", "manager_operations"), updateSlot);
router.delete("/slots/:id", authorize("admin", "manager_operations"), deleteSlot);

router.post("/generate", authorize("admin", "manager_operations"), generateTasksForDate);
router.get("/session-log/all", authorize("admin", "manager_operations"), getAllSessionLogs);

module.exports = router;