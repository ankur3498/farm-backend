const express = require("express");
const router = express.Router();
const {
  checkIn,
  checkOut,
  getMyAttendance,
  getAllAttendance,
  adminUpdateAttendance,
  adminMarkAttendance,
  requestEdit,
  reviewEditRequest,
  applyLeave,
  reviewLeaveRequest,
  getSalarySummary,
} = require("../controllers/attendanceController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect); // every attendance route requires login

// Self — any logged-in staff
router.post("/checkin", checkIn);
router.post("/checkout", checkOut);
router.get("/me", getMyAttendance);
router.post("/:id/edit-request", requestEdit);
router.post("/leave-request", applyLeave);

// Salary — self, or admin/manager for anyone (access check done inside controller)
router.get("/salary/:userId", getSalarySummary);

// Admin / Manager only
router.get("/", authorize("admin", "manager_operations"), getAllAttendance);
router.post("/mark", authorize("admin", "manager_operations"), adminMarkAttendance);
router.put("/:id", authorize("admin", "manager_operations"), adminUpdateAttendance);
router.put("/:id/edit-request/review", authorize("admin", "manager_operations"), reviewEditRequest);
router.put("/:id/leave-request/review", authorize("admin", "manager_operations"), reviewLeaveRequest);

module.exports = router;