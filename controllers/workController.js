const WorkCategory = require("../models/WorkCategory");
const WorkRecurring = require("../models/WorkRecurring");
const WorkTask = require("../models/WorkTask");
const uploadBufferToCloudinary = require("../utils/uploadToCloudinary");
const { generateScheduleTasksForUserToday } = require("./scheduleController");
const { deductStockForTask } = require("./inventoryController");
const { generateAssetInspections } = require("./assetController");
const { generatePoultryTasksForUserToday } = require("./poultryController");
const { generateFieldPatchTasksForUserToday } = require("./fieldPatchController");
const Asset = require("../models/Asset");

const startOfDay = (d = new Date()) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getCategories = async (req, res) => {
  try {
    const categories = await WorkCategory.find().sort({ isDefault: -1, name: 1 });
    res.status(200).json({ categories });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch categories", error: error.message });
  }
};

const addCategory = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: "Category name is required" });

    const existing = await WorkCategory.findOne({ name: new RegExp(`^${name}$`, "i") });
    if (existing) return res.status(409).json({ message: "This category already exists" });

    const category = await WorkCategory.create({ name, isDefault: false, createdBy: req.user._id });
    res.status(201).json({ message: "Category added", category });
  } catch (error) {
    res.status(500).json({ message: "Failed to add category", error: error.message });
  }
};

const createRecurring = async (req, res) => {
  try {
    const categories = req.body.categories || (req.body.category ? [req.body.category] : []);
    const staffIds = req.body.assignedTo
      ? Array.isArray(req.body.assignedTo) ? req.body.assignedTo : [req.body.assignedTo]
      : [];
    const notes = req.body.notes || "";

    if (categories.length === 0 || staffIds.length === 0) {
      return res.status(400).json({ message: "At least one category and one staff member are required" });
    }

    const created = [];
    const skipped = [];

    for (const category of categories) {
      for (const assignedTo of staffIds) {
        const existing = await WorkRecurring.findOne({ category, assignedTo, isActive: true });
        if (existing) {
          skipped.push({ category, assignedTo });
          continue;
        }
        const rule = await WorkRecurring.create({ category, assignedTo, notes, createdBy: req.user._id });
        created.push(rule);
      }
    }

    res.status(201).json({
      message: `${created.length} daily assignment${created.length !== 1 ? "s" : ""} created${skipped.length ? `, ${skipped.length} skipped (already active)` : ""}`,
      created,
      skippedCount: skipped.length,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to create recurring assignment", error: error.message });
  }
};

const listRecurring = async (req, res) => {
  try {
    const rules = await WorkRecurring.find().populate("assignedTo", "name role").sort({ createdAt: -1 });
    res.status(200).json({ rules });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch recurring assignments", error: error.message });
  }
};

const updateRecurring = async (req, res) => {
  try {
    const rule = await WorkRecurring.findById(req.params.id);
    if (!rule) return res.status(404).json({ message: "Recurring assignment not found" });

    const { assignedTo, isActive, notes } = req.body;
    if (assignedTo) rule.assignedTo = assignedTo;
    if (isActive !== undefined) rule.isActive = isActive;
    if (notes !== undefined) rule.notes = notes;

    await rule.save();
    res.status(200).json({ message: "Recurring assignment updated", rule });
  } catch (error) {
    res.status(500).json({ message: "Failed to update recurring assignment", error: error.message });
  }
};

const deleteRecurring = async (req, res) => {
  try {
    const rule = await WorkRecurring.findByIdAndDelete(req.params.id);
    if (!rule) return res.status(404).json({ message: "Recurring assignment not found" });
    res.status(200).json({ message: "Recurring assignment removed" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete recurring assignment", error: error.message });
  }
};

const assignTask = async (req, res) => {
  try {
    const categories = req.body.categories || (req.body.category ? [req.body.category] : []);
    const staffIds = req.body.assignedTo
      ? Array.isArray(req.body.assignedTo) ? req.body.assignedTo : [req.body.assignedTo]
      : [];
    const { date, notes, session, timeLabel, track } = req.body;

    if (categories.length === 0 || staffIds.length === 0 || !date) {
      return res.status(400).json({ message: "At least one category, one staff member, and a date are required" });
    }

    const day = startOfDay(new Date(date));
    const created = [];
    const skipped = [];

    for (const category of categories) {
      for (const assignedTo of staffIds) {
        const existing = await WorkTask.findOne({
          assignedTo,
          category,
          date: day,
          timeLabel: timeLabel || "",
        });
        if (existing) {
          skipped.push({ category, assignedTo });
          continue;
        }
        const task = await WorkTask.create({
          category,
          assignedTo,
          assignedBy: req.user._id,
          source: timeLabel || session ? "schedule" : "manual",
          date: day,
          notes: notes || "",
          session: session || "",
          timeLabel: timeLabel || "",
          track: track || "",
        });
        created.push(task);
      }
    }

    res.status(201).json({
      message: `${created.length} task${created.length !== 1 ? "s" : ""} assigned${skipped.length ? `, ${skipped.length} skipped (already assigned)` : ""}`,
      created,
      skippedCount: skipped.length,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to assign task", error: error.message });
  }
};

const autoCreateTodaysTasks = async (userId, day) => {
  try {
    const rules = await WorkRecurring.find({ assignedTo: userId, isActive: true });
    for (const rule of rules) {
      try {
        await WorkTask.findOneAndUpdate(
          { assignedTo: userId, category: rule.category, date: day },
          {
            $setOnInsert: {
              assignedTo: userId,
              category: rule.category,
              date: day,
              source: "auto",
              assignedBy: null,
              notes: rule.notes || "",
            },
          },
          { upsert: true, setDefaultsOnInsert: true }
        );
      } catch (ruleErr) {
        if (ruleErr.code !== 11000) console.error("Auto task creation warning:", ruleErr.message);
      }
    }
  } catch (err) {
    console.error("autoCreateTodaysTasks error:", err.message);
  }
};

const getMyTasks = async (req, res) => {
  try {
    const dateParam = req.query.date ? new Date(req.query.date) : new Date();
    const day = startOfDay(dateParam);
    const isToday = day.getTime() === startOfDay(new Date()).getTime();

    // Only auto-create for today — no point backfilling past/future days
    if (isToday) {
      try { await autoCreateTodaysTasks(req.user._id, day); } catch (e) {}
      try { await generateScheduleTasksForUserToday(req.user._id, day); } catch (e) {}
      try { await generateAssetInspections(day, { onlyUserId: req.user._id }); } catch (e) {}
      try { await generatePoultryTasksForUserToday(req.user._id, day); } catch (e) {}
      try { await generateFieldPatchTasksForUserToday(req.user._id, day); } catch (e) {}
    }

    const tasks = await WorkTask.find({ assignedTo: req.user._id, date: day }).sort({ createdAt: 1 });
    res.status(200).json({ count: tasks.length, tasks });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch tasks", error: error.message });
  }
};

const startTask = async (req, res) => {
  try {
    const task = await WorkTask.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    if (String(task.assignedTo) !== String(req.user._id)) {
      return res.status(403).json({ message: "This task isn't assigned to you" });
    }
    if (task.status !== "assigned") {
      return res.status(400).json({ message: `Task is already '${task.status}'` });
    }

    task.status = "in_progress";
    task.startedAt = new Date();
    await task.save();

    res.status(200).json({ message: "Task started", task });
  } catch (error) {
    res.status(500).json({ message: "Failed to start task", error: error.message });
  }
};

const completeTask = async (req, res) => {
  try {
    const task = await WorkTask.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    if (String(task.assignedTo) !== String(req.user._id)) {
      return res.status(403).json({ message: "This task isn't assigned to you" });
    }
    if (!["in_progress", "assigned"].includes(task.status)) {
      return res.status(400).json({ message: `Task is already '${task.status}'` });
    }

    const photoFile = req.files?.photo?.[0];
    const videoFile = req.files?.video?.[0];
    if (!photoFile || !videoFile) {
      return res.status(400).json({ message: "Both a photo and a video are required to complete the task" });
    }

    const [photoUrl, videoUrl] = await Promise.all([
      uploadBufferToCloudinary(photoFile.buffer, "farmhouse/work-proof/photos", "image"),
      uploadBufferToCloudinary(videoFile.buffer, "farmhouse/work-proof/videos", "video"),
    ]);

    task.proof = { photoUrl, videoUrl };
    task.status = "submitted";
    task.completedAt = new Date();
    task.review = { status: "pending", reviewedBy: undefined, reviewedAt: undefined, note: "" };
    if (req.body.sampleWeight) {
      task.sampleWeight = req.body.sampleWeight;
    }
    if (req.body.userRemark || req.body.remarks) {
      task.userRemark = req.body.userRemark || req.body.remarks;
    }

    // Optional — if this task consumed feed/medicine, deduct it from stock now
    const { stockItemId, quantityUsed } = req.body;
    if (stockItemId && quantityUsed) {
      try {
        await deductStockForTask(stockItemId, quantityUsed, task._id, req.user._id);
        task.stockUsage = { item: stockItemId, quantity: Number(quantityUsed) };
      } catch (stockError) {
        console.error("Stock deduction failed:", stockError.message);
      }
    }

    // If this is a weekly asset inspection, mark the asset as freshly inspected
    if (task.relatedAsset) {
      await Asset.findByIdAndUpdate(task.relatedAsset, { lastInspectedAt: new Date() });
    }

    await task.save();

    res.status(200).json({ message: "Task submitted for approval", task });
  } catch (error) {
    res.status(500).json({ message: "Failed to complete task", error: error.message });
  }
};

const resubmitTask = async (req, res) => {
  try {
    const task = await WorkTask.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    if (String(task.assignedTo) !== String(req.user._id)) {
      return res.status(403).json({ message: "This task isn't assigned to you" });
    }
    if (task.status !== "declined") {
      return res.status(400).json({ message: "Only declined tasks can be resubmitted" });
    }

    const photoFile = req.files?.photo?.[0];
    const videoFile = req.files?.video?.[0];
    if (!photoFile || !videoFile) {
      return res.status(400).json({ message: "Both a photo and a video are required to resubmit" });
    }

    const [photoUrl, videoUrl] = await Promise.all([
      uploadBufferToCloudinary(photoFile.buffer, "farmhouse/work-proof/photos", "image"),
      uploadBufferToCloudinary(videoFile.buffer, "farmhouse/work-proof/videos", "video"),
    ]);

    task.proof = { photoUrl, videoUrl };
    task.status = "submitted";
    task.completedAt = new Date();
    task.review = { status: "pending", reviewedBy: undefined, reviewedAt: undefined, note: "" };
    if (req.body.sampleWeight) {
      task.sampleWeight = req.body.sampleWeight;
    }
    if (req.body.userRemark || req.body.remarks) {
      task.userRemark = req.body.userRemark || req.body.remarks;
    }

    const { stockItemId, quantityUsed } = req.body;
    if (stockItemId && quantityUsed) {
      try {
        await deductStockForTask(stockItemId, quantityUsed, task._id, req.user._id);
        task.stockUsage = { item: stockItemId, quantity: Number(quantityUsed) };
      } catch (stockError) {
        console.error("Stock deduction failed:", stockError.message);
      }
    }

    if (task.relatedAsset) {
      await Asset.findByIdAndUpdate(task.relatedAsset, { lastInspectedAt: new Date() });
    }

    await task.save();

    res.status(200).json({ message: "Task resubmitted for approval", task });
  } catch (error) {
    res.status(500).json({ message: "Failed to resubmit task", error: error.message });
  }
};

const getAllTasks = async (req, res) => {
  try {
    const { date, userId, status, category } = req.query;
    const filter = {};

    if (date) filter.date = startOfDay(new Date(date));
    if (userId) filter.assignedTo = userId;
    if (status) filter.status = status;
    if (category) filter.$or = [{ category }, { session: category }];

    const tasks = await WorkTask.find(filter)
      .populate("assignedTo", "name role")
      .populate("assignedBy", "name role")
      .sort({ date: -1, createdAt: -1 });

    res.status(200).json({ count: tasks.length, tasks });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch tasks", error: error.message });
  }
};

const reviewTask = async (req, res) => {
  try {
    const { action, note } = req.body;
    if (!["approve", "decline"].includes(action)) {
      return res.status(400).json({ message: "action must be 'approve' or 'decline'" });
    }

    const task = await WorkTask.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    if (task.status !== "submitted") {
      return res.status(400).json({ message: "Only submitted tasks can be reviewed" });
    }
    if (action === "decline" && !note) {
      return res.status(400).json({ message: "A note is required when declining a task" });
    }

    task.status = action === "approve" ? "approved" : "declined";
    task.review = {
      status: action === "approve" ? "approved" : "declined",
      reviewedBy: req.user._id,
      reviewedAt: new Date(),
      note: note || "",
    };
    await task.save();

    res.status(200).json({ message: `Task ${action}d`, task });
  } catch (error) {
    res.status(500).json({ message: "Failed to review task", error: error.message });
  }
};

const deleteTask = async (req, res) => {
  try {
    const task = await WorkTask.findByIdAndDelete(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    res.status(200).json({ message: "Task removed successfully", task });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete task", error: error.message });
  }
};

module.exports = {
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
  deleteTask,
};