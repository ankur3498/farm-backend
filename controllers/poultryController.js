const PoultryBatch = require("../models/PoultryBatch");
const PoultryRecord = require("../models/PoultryRecord");
const User = require("../models/User");
const uploadBufferToCloudinary = require("../utils/uploadToCloudinary");

const startOfDay = (d = new Date()) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};
const daysBetween = (a, b) => Math.floor((b - a) / (1000 * 60 * 60 * 24));

const getDefaultManager = async (reqUser) => {
  if (reqUser && ["admin", "manager_operations"].includes(reqUser.role)) {
    return reqUser._id;
  }
  const mgr = await User.findOne({ role: "manager_operations", isActive: true });
  if (mgr) return mgr._id;
  const admin = await User.findOne({ role: "admin", isActive: true });
  return admin ? admin._id : reqUser._id;
};

// ---------------- Batches ----------------

const getBatches = async (req, res) => {
  try {
    const batches = await PoultryBatch.find({ isActive: true })
      .populate("assignedTo", "name role mobile")
      .sort({ createdAt: -1 });

    const withSummary = await Promise.all(
      batches.map(async (b) => {
        const latest = await PoultryRecord.findOne({ batch: b._id }).sort({ date: -1 });
        const totals = await PoultryRecord.aggregate([
          { $match: { batch: b._id } },
          {
            $group: {
              _id: null,
              totalMortality: { $sum: "$mortality" },
              totalCulls: { $sum: "$culls" },
              totalFeedKg: { $sum: "$feedKg" },
              totalEggs: { $sum: { $ifNull: ["$eggCount", 0] } },
              avgProdPercent: { $avg: "$eggProductionPercent" },
            },
          },
        ]);
        const agg = totals[0] || { totalMortality: 0, totalCulls: 0, totalFeedKg: 0, totalEggs: 0, avgProdPercent: null };

        return {
          ...b.toObject(),
          currentStock: latest ? latest.closingStock : b.chicksReceived,
          ageDay: latest ? latest.ageDay : daysBetween(startOfDay(b.dateOfHatch), startOfDay(new Date())),
          lastRecordDate: latest ? latest.date : null,
          totalMortality: agg.totalMortality,
          totalCulls: agg.totalCulls,
          totalFeedKg: Math.round(agg.totalFeedKg * 10) / 10,
          totalEggs: agg.totalEggs,
          avgProductionPercent: agg.avgProdPercent ? Math.round(agg.avgProdPercent * 10) / 10 : null,
        };
      })
    );

    res.status(200).json({ batches: withSummary });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch batches", error: error.message });
  }
};

const addBatch = async (req, res) => {
  try {
    const { name, breed, dateOfHatch, chicksReceived, assignedTo } = req.body;
    if (!name || !dateOfHatch || chicksReceived === undefined) {
      return res.status(400).json({ message: "name, dateOfHatch and chicksReceived are required" });
    }

    let assignee = assignedTo;
    if (!assignee) {
      assignee = await getDefaultManager(req.user);
    }

    const batch = await PoultryBatch.create({
      name,
      breed: breed || "",
      dateOfHatch: startOfDay(new Date(dateOfHatch)),
      chicksReceived: Number(chicksReceived),
      assignedTo: assignee,
      createdBy: req.user._id,
    });

    const populated = await PoultryBatch.findById(batch._id).populate("assignedTo", "name role mobile");
    res.status(201).json({ message: "Batch created", batch: populated });
  } catch (error) {
    res.status(500).json({ message: "Failed to create batch", error: error.message });
  }
};

const updateBatch = async (req, res) => {
  try {
    const batch = await PoultryBatch.findById(req.params.id);
    if (!batch) return res.status(404).json({ message: "Batch not found" });

    const { name, breed, isActive, assignedTo } = req.body;
    if (name !== undefined) batch.name = name;
    if (breed !== undefined) batch.breed = breed;
    if (isActive !== undefined) batch.isActive = isActive;
    if (assignedTo !== undefined) batch.assignedTo = assignedTo || (await getDefaultManager(req.user));
    await batch.save();

    const populated = await PoultryBatch.findById(batch._id).populate("assignedTo", "name role mobile");
    res.status(200).json({ message: "Batch updated", batch: populated });
  } catch (error) {
    res.status(500).json({ message: "Failed to update batch", error: error.message });
  }
};

const deleteBatch = async (req, res) => {
  try {
    const batch = await PoultryBatch.findByIdAndDelete(req.params.id);
    if (!batch) return res.status(404).json({ message: "Batch not found" });
    await PoultryRecord.deleteMany({ batch: batch._id });
    res.status(200).json({ message: "Batch and its records removed" });
  } catch (error) {
    res.status(500).json({ message: "Failed to remove batch", error: error.message });
  }
};

// ---------------- Records ----------------

const getRecords = async (req, res) => {
  try {
    const records = await PoultryRecord.find({ batch: req.params.id })
      .populate("recordedBy", "name role")
      .sort({ date: -1 });
    res.status(200).json({ records });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch records", error: error.message });
  }
};

const addRecord = async (req, res) => {
  try {
    const batch = await PoultryBatch.findById(req.params.id);
    if (!batch) return res.status(404).json({ message: "Batch not found" });

    const { date, mortality, culls, feedKg, eggCount, bodyWeightGms, remarks } = req.body;
    if (!date) return res.status(400).json({ message: "date is required" });

    const day = startOfDay(new Date(date));
    const existing = await PoultryRecord.findOne({ batch: batch._id, date: day });
    if (existing) {
      return res.status(409).json({ message: "A record for this batch on this date already exists — edit it instead" });
    }

    // Auto-carry-forward: today's open stock = yesterday's closing stock,
    // unless explicitly overridden (e.g. first-ever record for the batch)
    let openStock = req.body.openStock;
    if (openStock === undefined) {
      const previous = await PoultryRecord.findOne({ batch: batch._id, date: { $lt: day } }).sort({ date: -1 });
      openStock = previous ? previous.closingStock : batch.chicksReceived;
    } else {
      openStock = Number(openStock);
    }

    const mort = Number(mortality) || 0;
    const cull = Number(culls) || 0;
    const closingStock = Math.max(0, openStock - mort - cull);
    const feed = Number(feedKg) || 0;
    const feedPerBirdGms = closingStock > 0 ? Math.round(((feed * 1000) / closingStock) * 10) / 10 : 0;

    let eggProductionPercent = null;
    const eggs = eggCount !== undefined && eggCount !== null && eggCount !== "" ? Number(eggCount) : null;
    if (eggs !== null && closingStock > 0) {
      eggProductionPercent = Math.round((eggs / closingStock) * 1000) / 10;
    }

    const ageDay = daysBetween(startOfDay(batch.dateOfHatch), day) + 1;

    // Handle optional Photo AND Video proof files
    let proof = { photoUrl: "", videoUrl: "" };
    const photoFile = req.files?.photo?.[0];
    const videoFile = req.files?.video?.[0];

    if (photoFile || videoFile) {
      const uploads = [];
      if (photoFile) uploads.push(uploadBufferToCloudinary(photoFile.buffer, "farmhouse/poultry/photos", "image"));
      else uploads.push(Promise.resolve(""));

      if (videoFile) uploads.push(uploadBufferToCloudinary(videoFile.buffer, "farmhouse/poultry/videos", "video"));
      else uploads.push(Promise.resolve(""));

      const [pUrl, vUrl] = await Promise.all(uploads);
      proof = { photoUrl: pUrl, videoUrl: vUrl };
    }

    const record = await PoultryRecord.create({
      batch: batch._id,
      date: day,
      ageDay,
      openStock,
      mortality: mort,
      culls: cull,
      closingStock,
      feedKg: feed,
      feedPerBirdGms,
      eggCount: eggs,
      eggProductionPercent,
      bodyWeightGms: bodyWeightGms !== undefined && bodyWeightGms !== "" ? Number(bodyWeightGms) : null,
      remarks: remarks || "",
      proof,
      recordedBy: req.user._id,
    });

    res.status(201).json({ message: "Record added", record });
  } catch (error) {
    res.status(500).json({ message: "Failed to add record", error: error.message });
  }
};

const updateRecord = async (req, res) => {
  try {
    const record = await PoultryRecord.findById(req.params.id);
    if (!record) return res.status(404).json({ message: "Record not found" });

    const { openStock, mortality, culls, feedKg, eggCount, bodyWeightGms, remarks } = req.body;

    if (openStock !== undefined) record.openStock = Number(openStock);
    if (mortality !== undefined) record.mortality = Number(mortality);
    if (culls !== undefined) record.culls = Number(culls);
    if (feedKg !== undefined) record.feedKg = Number(feedKg);
    if (bodyWeightGms !== undefined) record.bodyWeightGms = bodyWeightGms === "" ? null : Number(bodyWeightGms);
    if (remarks !== undefined) record.remarks = remarks;

    record.closingStock = Math.max(0, record.openStock - record.mortality - record.culls);
    record.feedPerBirdGms = record.closingStock > 0 ? Math.round(((record.feedKg * 1000) / record.closingStock) * 10) / 10 : 0;

    if (eggCount !== undefined) {
      record.eggCount = eggCount === "" ? null : Number(eggCount);
      record.eggProductionPercent =
        record.eggCount !== null && record.closingStock > 0
          ? Math.round((record.eggCount / record.closingStock) * 1000) / 10
          : null;
    }

    const photoFile = req.files?.photo?.[0];
    const videoFile = req.files?.video?.[0];

    if (photoFile || videoFile) {
      if (!record.proof) record.proof = { photoUrl: "", videoUrl: "" };
      if (photoFile) {
        record.proof.photoUrl = await uploadBufferToCloudinary(photoFile.buffer, "farmhouse/poultry/photos", "image");
      }
      if (videoFile) {
        record.proof.videoUrl = await uploadBufferToCloudinary(videoFile.buffer, "farmhouse/poultry/videos", "video");
      }
    }

    await record.save();
    res.status(200).json({ message: "Record updated", record });
  } catch (error) {
    res.status(500).json({ message: "Failed to update record", error: error.message });
  }
};

const deleteRecord = async (req, res) => {
  try {
    const record = await PoultryRecord.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ message: "Record not found" });
    res.status(200).json({ message: "Record removed" });
  } catch (error) {
    res.status(500).json({ message: "Failed to remove record", error: error.message });
  }
};

module.exports = {
  getBatches,
  addBatch,
  updateBatch,
  deleteBatch,
  getRecords,
  addRecord,
  updateRecord,
  deleteRecord,
};