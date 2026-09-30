const FieldPatch = require("../models/FieldPatch");
const User = require("../models/User");
const WorkTask = require("../models/WorkTask");

const startOfDay = (d = new Date()) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};

// Auto-generate daily WorkTask for field patches assigned to user
const generateFieldPatchTasksForUserToday = async (userId, day = startOfDay(new Date())) => {
  try {
    const today = startOfDay(day);

    const patches = await FieldPatch.find({
      assignedTo: userId,
      status: { $in: ["active", "in_progress", "submitted"] },
    });

    for (const patch of patches) {
      try {
        await WorkTask.findOneAndUpdate(
          { assignedTo: userId, category: "Field Patch Work", date: today, timeLabel: `patch_${patch._id}` },
          {
            $setOnInsert: {
              category: "Field Patch Work",
              assignedTo: userId,
              assignedBy: patch.createdBy || null,
              source: "auto",
              date: today,
              session: patch.name,
              timeLabel: `patch_${patch._id}`,
              track: patch.landmark || "Field Landmark",
              relatedFieldPatch: patch._id,
              notes: `FIELD PATCH WORK: ${patch.work} | Crop: ${patch.crop || "General Crop"} | Size: ${patch.size || "1.0 Acre"} | Landmark: ${patch.landmark || "N/A"}`,
            },
          },
          { upsert: true, setDefaultsOnInsert: true }
        );
      } catch (err) {
        if (err.code !== 11000) console.error("Field patch task creation error:", err.message);
      }
    }
  } catch (error) {
    console.error("generateFieldPatchTasksForUserToday error:", error.message);
  }
};

// @desc    Create new field patch (Admin / Manager)
// @route   POST /api/field-patches
// @access  Private (Admin / Manager)
exports.createPatch = async (req, res) => {
  try {
    const { name, image, work, workType, landmark, assignedTo, crop, size, status } = req.body;

    let assignedToName = "Unassigned Worker";
    if (assignedTo) {
      const userDoc = await User.findById(assignedTo);
      if (userDoc) assignedToName = userDoc.name;
    }

    const patch = await FieldPatch.create({
      name,
      image,
      work,
      workType: workType || "one_time",
      landmark,
      assignedTo,
      assignedToName,
      crop,
      size,
      status: status || "active",
      createdBy: req.user._id,
    });

    if (assignedTo) {
      try {
        await generateFieldPatchTasksForUserToday(assignedTo);
      } catch (e) {
        console.error("Task generation on createPatch failed:", e.message);
      }
    }

    res.status(201).json({
      success: true,
      message: "Field patch created successfully",
      patch,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all field patches (with filter by worker or assigned user)
// @route   GET /api/field-patches
// @access  Private
exports.getPatches = async (req, res) => {
  try {
    const { status, workType, assignedTo, search } = req.query;

    const query = {};

    if (status && status !== "all") query.status = status;
    if (workType && workType !== "all") query.workType = workType;
    if (assignedTo === "me" && req.user) {
      query.assignedTo = req.user._id;
    } else if (assignedTo) {
      query.assignedTo = assignedTo;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { landmark: { $regex: search, $options: "i" } },
        { work: { $regex: search, $options: "i" } },
        { assignedToName: { $regex: search, $options: "i" } },
      ];
    }

    const patches = await FieldPatch.find(query)
      .populate("assignedTo", "name role email mobile")
      .populate("createdBy", "name role")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: patches.length,
      patches,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update field patch info or status
// @route   PUT /api/field-patches/:id
// @access  Private
exports.updatePatch = async (req, res) => {
  try {
    const patch = await FieldPatch.findById(req.params.id);

    if (!patch) {
      return res.status(404).json({ message: "Field patch not found" });
    }

    const { name, image, work, workType, landmark, assignedTo, crop, size, status } = req.body;

    if (name) patch.name = name;
    if (image) patch.image = image;
    if (work) patch.work = work;
    if (workType) patch.workType = workType;
    if (landmark) patch.landmark = landmark;
    if (crop) patch.crop = crop;
    if (size) patch.size = size;
    if (status) patch.status = status;

    if (assignedTo) {
      patch.assignedTo = assignedTo;
      const userDoc = await User.findById(assignedTo);
      if (userDoc) patch.assignedToName = userDoc.name;
    }

    await patch.save();

    if (patch.assignedTo) {
      try {
        await generateFieldPatchTasksForUserToday(patch.assignedTo);
      } catch (e) {
        console.error("Task generation on updatePatch failed:", e.message);
      }
    }

    res.json({
      success: true,
      message: "Field patch updated successfully",
      patch,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Worker submits completion proof for field patch
// @route   PUT /api/field-patches/:id/submit-proof
// @access  Private (Worker)
exports.submitPatchWork = async (req, res) => {
  try {
    const { submissionProof, submissionNotes } = req.body;
    const patch = await FieldPatch.findById(req.params.id);

    if (!patch) {
      return res.status(404).json({ message: "Field patch not found" });
    }

    patch.submissionProof = submissionProof || patch.image;
    patch.submissionNotes = submissionNotes || "Work completed as instructed.";
    patch.submittedAt = Date.now();
    patch.status = "submitted";

    await patch.save();

    // Sync corresponding WorkTask if present
    const today = startOfDay(new Date());
    await WorkTask.findOneAndUpdate(
      { relatedFieldPatch: patch._id, date: today },
      {
        status: "submitted",
        completedAt: new Date(),
        "proof.photoUrl": patch.submissionProof,
      }
    );

    res.json({
      success: true,
      message: "Proof of work submitted successfully for review",
      patch,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Admin / Manager approves or declines submitted work proof
// @route   PUT /api/field-patches/:id/review
// @access  Private (Admin / Manager)
exports.reviewPatchWork = async (req, res) => {
  try {
    const { action, reviewNote } = req.body; // action: 'approve' or 'decline'
    const patch = await FieldPatch.findById(req.params.id);

    if (!patch) {
      return res.status(404).json({ message: "Field patch not found" });
    }

    if (action === "approve") {
      patch.status = "approved";
      await WorkTask.updateMany(
        { relatedFieldPatch: patch._id },
        {
          status: "approved",
          "review.status": "approved",
          "review.reviewedBy": req.user._id,
          "review.reviewedAt": new Date(),
          "review.note": reviewNote || "Work verified and approved.",
        }
      );
    } else if (action === "decline") {
      patch.status = "declined";
      await WorkTask.updateMany(
        { relatedFieldPatch: patch._id },
        {
          status: "declined",
          "review.status": "declined",
          "review.reviewedBy": req.user._id,
          "review.reviewedAt": new Date(),
          "review.note": reviewNote || "Work declined, please redo.",
        }
      );
    } else {
      return res.status(400).json({ message: "Invalid action. Use 'approve' or 'decline'" });
    }

    patch.reviewedBy = req.user._id;
    patch.reviewedByName = req.user.name || "Manager";
    patch.reviewNote = reviewNote || (action === "approve" ? "Work verified and approved." : "Work declined, please redo.");
    patch.reviewedAt = Date.now();

    await patch.save();

    res.json({
      success: true,
      message: `Patch work review completed (${action})`,
      patch,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete field patch
// @route   DELETE /api/field-patches/:id
// @access  Private (Admin / Manager)
exports.deletePatch = async (req, res) => {
  try {
    const patch = await FieldPatch.findById(req.params.id);

    if (!patch) {
      return res.status(404).json({ message: "Field patch not found" });
    }

    await WorkTask.deleteMany({ relatedFieldPatch: patch._id });
    await patch.deleteOne();

    res.json({
      success: true,
      message: "Field patch deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.generateFieldPatchTasksForUserToday = generateFieldPatchTasksForUserToday;
