const express = require("express");
const router = express.Router();
const multer = require("multer");
const {
  getBatches,
  addBatch,
  updateBatch,
  deleteBatch,
  getRecords,
  addRecord,
  updateRecord,
  deleteRecord,
} = require("../controllers/goatController");
const { protect, authorize } = require("../middleware/auth");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

const uploadFields = upload.fields([
  { name: "photo", maxCount: 1 },
  { name: "video", maxCount: 1 },
]);

router.use(protect);

// Batches — view by anyone, manage by admin/manager
router.get("/batches", getBatches);
router.post("/batches", authorize("admin", "manager_operations"), addBatch);
router.put("/batches/:id", authorize("admin", "manager_operations"), updateBatch);
router.delete("/batches/:id", authorize("admin", "manager_operations"), deleteBatch);

// Daily records — staff can log entry with optional photo & video proof
router.get("/batches/:id/records", getRecords);
router.post("/batches/:id/records", uploadFields, addRecord);
router.put("/records/:id", authorize("admin", "manager_operations"), uploadFields, updateRecord);
router.delete("/records/:id", authorize("admin", "manager_operations"), deleteRecord);

module.exports = router;
