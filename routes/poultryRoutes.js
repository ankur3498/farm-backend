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
  getInTransitChicks,
  addInTransitChick,
  updateInTransitChick,
  receiveInTransitChick,
  deleteInTransitChick,
  getHatcheryLogs,
  addHatcheryLog,
  addHatcheryBooking,
  updateHatcheryLog,
  deleteHatcheryLog,
  getBrooderBatches,
  addBrooderBatch,
  updateBrooderBatch,
  deleteBrooderBatch,
  getBrooderRecords,
  addBrooderRecord,
  updateBrooderRecord,
  deleteBrooderRecord,
  getVaccinations,
  addVaccination,
  autoGenerateVaccinationSchedule,
  updateVaccination,
  deleteVaccination,
  getPoultryAlerts,
} = require("../controllers/poultryController");
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

// Poultry Alerts (Vaccinations, Brooder Transitions, Mortality)
router.get("/alerts", getPoultryAlerts);

// In-Transit Chicks & Received Chicks
router.get("/in-transit", getInTransitChicks);
router.post("/in-transit", authorize("admin", "manager_operations"), addInTransitChick);
router.put("/in-transit/:id", authorize("admin", "manager_operations"), updateInTransitChick);
router.put("/in-transit/:id/receive", authorize("admin", "manager_operations"), receiveInTransitChick);
router.delete("/in-transit/:id", authorize("admin", "manager_operations"), deleteInTransitChick);

// Hatchery & Breeder Incubator Logs
router.get("/hatchery", getHatcheryLogs);
router.post("/hatchery", authorize("admin", "manager_operations"), addHatcheryLog);
router.post("/hatchery/:id/bookings", authorize("admin", "manager_operations"), addHatcheryBooking);
router.put("/hatchery/:id", authorize("admin", "manager_operations"), updateHatcheryLog);
router.delete("/hatchery/:id", authorize("admin", "manager_operations"), deleteHatcheryLog);

// Brooder Management
router.get("/brooder", getBrooderBatches);
router.post("/brooder", authorize("admin", "manager_operations"), addBrooderBatch);
router.put("/brooder/:id", authorize("admin", "manager_operations"), updateBrooderBatch);
router.delete("/brooder/:id", authorize("admin", "manager_operations"), deleteBrooderBatch);
router.get("/brooder/:id/records", getBrooderRecords);
router.post("/brooder/:id/records", addBrooderRecord);
router.put("/brooder-records/:id", authorize("admin", "manager_operations"), updateBrooderRecord);
router.delete("/brooder-records/:id", authorize("admin", "manager_operations"), deleteBrooderRecord);

// Vaccination Schedule & Logs
router.get("/vaccinations", getVaccinations);
router.post("/vaccinations", authorize("admin", "manager_operations"), addVaccination);
router.post("/vaccinations/auto-generate", authorize("admin", "manager_operations"), autoGenerateVaccinationSchedule);
router.put("/vaccinations/:id", uploadFields, updateVaccination);
router.delete("/vaccinations/:id", authorize("admin", "manager_operations"), deleteVaccination);

// Batches — view by anyone, manage by admin/manager
router.get("/batches", getBatches);
router.post("/batches", authorize("admin", "manager_operations"), addBatch);
router.put("/batches/:id", authorize("admin", "manager_operations"), updateBatch);
router.delete("/batches/:id", authorize("admin", "manager_operations"), deleteBatch);

// Daily records — any staff can log an entry with optional photo & video proof
router.get("/batches/:id/records", getRecords);
router.post("/batches/:id/records", uploadFields, addRecord);
router.put("/records/:id", authorize("admin", "manager_operations"), uploadFields, updateRecord);
router.delete("/records/:id", authorize("admin", "manager_operations"), deleteRecord);

module.exports = router;