const express = require("express");
const router = express.Router();
const {
  createPatch,
  getPatches,
  updatePatch,
  submitPatchWork,
  reviewPatchWork,
  deletePatch,
} = require("../controllers/fieldPatchController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect);

router
  .route("/")
  .post(authorize("admin", "manager_operations"), createPatch)
  .get(getPatches);

// Worker submits proof of work
router.put("/:id/submit-proof", submitPatchWork);

// ONLY Admin reviews submitted proof (Approve / Decline)
router.put("/:id/review", authorize("admin"), reviewPatchWork);

router
  .route("/:id")
  .put(updatePatch)
  .delete(authorize("admin", "manager_operations"), deletePatch);

module.exports = router;
