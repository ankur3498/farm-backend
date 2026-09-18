const Asset = require("../models/Asset");
const WorkTask = require("../models/WorkTask");
const uploadBufferToCloudinary = require("../utils/uploadToCloudinary");

const startOfDay = (d = new Date()) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};
const daysBetween = (a, b) => Math.floor((b - a) / (1000 * 60 * 60 * 24));
const INSPECTION_INTERVAL_DAYS = 7;

const getAssets = async (req, res) => {
  try {
    const assets = await Asset.find({ isActive: true })
      .populate("responsiblePerson", "name role")
      .sort({ category: 1, name: 1 });

    const today = new Date();
    const withDueInfo = assets.map((a) => {
      const dueDate = a.lastInspectedAt
        ? new Date(a.lastInspectedAt.getTime() + INSPECTION_INTERVAL_DAYS * 24 * 60 * 60 * 1000)
        : a.createdAt;
      const daysUntilDue = daysBetween(today, dueDate);
      return {
        ...a.toObject(),
        inspectionDueDate: dueDate,
        inspectionStatus: daysUntilDue < 0 ? "overdue" : daysUntilDue <= 1 ? "due-soon" : "ok",
      };
    });

    res.status(200).json({ assets: withDueInfo });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch assets", error: error.message });
  }
};

const addAsset = async (req, res) => {
  try {
    const { name, category, responsiblePerson } = req.body;
    if (!name) return res.status(400).json({ message: "Item name is required" });

    let photoUrl = "";
    if (req.file) {
      photoUrl = await uploadBufferToCloudinary(req.file.buffer, "farmhouse/assets", "image");
    }

    const asset = await Asset.create({
      name,
      category: category || "Equipment",
      photoUrl,
      responsiblePerson: responsiblePerson || null,
      createdBy: req.user._id,
    });

    res.status(201).json({ message: "Asset added", asset });
  } catch (error) {
    res.status(500).json({ message: "Failed to add asset", error: error.message });
  }
};

const updateAsset = async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);
    if (!asset) return res.status(404).json({ message: "Asset not found" });

    const { name, category, responsiblePerson, isActive } = req.body;
    if (name !== undefined) asset.name = name;
    if (category !== undefined) asset.category = category;
    if (responsiblePerson !== undefined) asset.responsiblePerson = responsiblePerson || null;
    if (isActive !== undefined) asset.isActive = isActive;

    if (req.file) {
      asset.photoUrl = await uploadBufferToCloudinary(req.file.buffer, "farmhouse/assets", "image");
    }

    await asset.save();
    res.status(200).json({ message: "Asset updated", asset });
  } catch (error) {
    res.status(500).json({ message: "Failed to update asset", error: error.message });
  }
};

const deleteAsset = async (req, res) => {
  try {
    const asset = await Asset.findByIdAndDelete(req.params.id);
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    res.status(200).json({ message: "Asset removed" });
  } catch (error) {
    res.status(500).json({ message: "Failed to remove asset", error: error.message });
  }
};

const getAssetHistory = async (req, res) => {
  try {
    const history = await WorkTask.find({ relatedAsset: req.params.id })
      .populate("assignedTo", "name role")
      .populate("review.reviewedBy", "name role")
      .sort({ date: -1 });
    res.status(200).json({ history });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch inspection history", error: error.message });
  }
};

// Core generator — used by the nightly cron (all assets) and lazily from
// workController.getMyTasks (just this user's assets, today only) so a
// newly-assigned asset shows up the moment its responsible person opens
// "My Tasks", without anyone clicking a button.
const generateAssetInspections = async (day, { onlyUserId } = {}) => {
  const filter = { isActive: true, responsiblePerson: { $ne: null } };
  if (onlyUserId) filter.responsiblePerson = onlyUserId;

  const assets = await Asset.find(filter);
  let created = 0;
  let skippedNotDue = 0;
  let skippedExisting = 0;

  for (const asset of assets) {
    const dueDate = asset.lastInspectedAt
      ? new Date(asset.lastInspectedAt.getTime() + INSPECTION_INTERVAL_DAYS * 24 * 60 * 60 * 1000)
      : asset.createdAt;

    if (day < startOfDay(dueDate)) {
      skippedNotDue++;
      continue;
    }

    const category = `Inspect: ${asset.name}`;
    const existing = await WorkTask.findOne({
      assignedTo: asset.responsiblePerson,
      category,
      date: day,
    });
    if (existing) {
      skippedExisting++;
      continue;
    }

    await WorkTask.create({
      category,
      assignedTo: asset.responsiblePerson,
      assignedBy: null,
      source: "asset",
      date: day,
      relatedAsset: asset._id,
      notes: "Weekly asset check — inspect condition and submit photo + video proof.",
    });
    created++;
  }

  return { created, skippedNotDue, skippedExisting };
};

module.exports = {
  getAssets,
  addAsset,
  updateAsset,
  deleteAsset,
  getAssetHistory,
  generateAssetInspections,
};