const express = require("express");
const router = express.Router();
const {
  getCategories,
  addCategory,
  createRecurring,
  listRecurring,
  updateRecurring,
  deleteRecurring,
  assignTask,
  getMyTasks,
  startTask,
  completeTask,
  resubmitTask,
  getAllTasks,
  reviewTask,
} = require("../controllers/workController");
const { protect, authorize } = require("../middleware/auth");
const uploadProof = require("../middleware/upload");

router.use(protect); // every work route requires login

// Categories
router.get("/categories", getCategories);
router.post("/categories", authorize("admin", "manager_operations"), addCategory);

// Recurring (daily auto-assign) rules — admin/manager only
router.post("/recurring", authorize("admin", "manager_operations"), createRecurring);
router.get("/recurring", authorize("admin", "manager_operations"), listRecurring);
router.put("/recurring/:id", authorize("admin", "manager_operations"), updateRecurring);
router.delete("/recurring/:id", authorize("admin", "manager_operations"), deleteRecurring);

// Self — any logged-in staff
router.get("/my-tasks", getMyTasks);
router.post("/:id/start", startTask);
router.post("/:id/complete", uploadProof, completeTask);
router.post("/:id/resubmit", uploadProof, resubmitTask);

// Admin / Manager only
router.post("/assign", authorize("admin", "manager_operations"), assignTask);
router.get("/", authorize("admin", "manager_operations"), getAllTasks);
router.put("/:id/review", authorize("admin", "manager_operations"), reviewTask);

module.exports = router;