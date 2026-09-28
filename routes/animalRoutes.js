const express = require("express");
const router = express.Router();
const multer = require("multer");
const {
  getAnimals,
  getAnimalById,
  createAnimal,
  updateAnimal,
  logHeatCycle,
  logPregnancy,
  addMedicalLog,
  getAnimalAlerts,
} = require("../controllers/animalController");
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

router.get("/", getAnimals);
router.get("/alerts", getAnimalAlerts);
router.get("/:id", getAnimalById);
router.post("/", authorize("admin", "manager_operations", "field_manager"), createAnimal);
router.put("/:id", authorize("admin", "manager_operations", "field_manager"), updateAnimal);
router.post("/:id/heat", logHeatCycle);
router.post("/:id/pregnancy", logPregnancy);
router.post("/:id/medical", uploadFields, addMedicalLog);

module.exports = router;
