const GoatBatch = require("../models/GoatBatch");
const GoatRecord = require("../models/GoatRecord");
const uploadBufferToCloudinary = require("../utils/uploadToCloudinary");

const startOfDay = (d = new Date()) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};

const daysBetween = (a, b) => Math.floor((b - a) / (1000 * 60 * 60 * 24));

// ---------------- Batches ----------------

const getBatches = async (req, res) => {
  try {
    const batches = await GoatBatch.find({ isActive: true }).sort({ createdAt: -1 });

    const withSummary = await Promise.all(
      batches.map(async (b) => {
        const latest = await GoatRecord.findOne({ batch: b._id }).sort({ date: -1 });
        const totals = await GoatRecord.aggregate([
          { $match: { batch: b._id } },
          {
            $group: {
              _id: null,
              totalMortality: { $sum: "$mortality" },
              totalCulls: { $sum: "$culls" },
              totalFeedKg: { $sum: "$feedKg" },
              avgSampleWeight: { $avg: "$sampleWeightKg" },
            },
          },
        ]);
        const agg = totals[0] || { totalMortality: 0, totalCulls: 0, totalFeedKg: 0, avgSampleWeight: null };

        return {
          ...b.toObject(),
          currentStock: latest ? latest.closingStock : b.goatsReceived,
          ageDay: latest ? latest.ageDay : daysBetween(startOfDay(b.entryDate), startOfDay(new Date())),
          lastRecordDate: latest ? latest.date : null,
          totalMortality: agg.totalMortality,
          totalCulls: agg.totalCulls,
          totalFeedKg: Math.round(agg.totalFeedKg * 10) / 10,
          avgSampleWeight: agg.avgSampleWeight ? Math.round(agg.avgSampleWeight * 10) / 10 : null,
        };
      })
    );

    res.status(200).json({ batches: withSummary });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch goat batches", error: error.message });
  }
};

const addBatch = async (req, res) => {
  try {
    const { name, breed, entryDate, goatsReceived } = req.body;
    if (!name || !entryDate || goatsReceived === undefined) {
      return res.status(400).json({ message: "name, entryDate and goatsReceived are required" });
    }

    const batch = await GoatBatch.create({
      name,
      breed: breed || "",
      entryDate: startOfDay(new Date(entryDate)),
      goatsReceived: Number(goatsReceived),
      createdBy: req.user._id,
    });

    res.status(201).json({ message: "Goat batch created", batch });
  } catch (error) {
    res.status(500).json({ message: "Failed to create goat batch", error: error.message });
  }
};

const updateBatch = async (req, res) => {
  try {
    const batch = await GoatBatch.findById(req.params.id);
    if (!batch) return res.status(404).json({ message: "Goat batch not found" });

    const { name, breed, isActive } = req.body;
    if (name !== undefined) batch.name = name;
    if (breed !== undefined) batch.breed = breed;
    if (isActive !== undefined) batch.isActive = isActive;
    await batch.save();

    res.status(200).json({ message: "Goat batch updated", batch });
  } catch (error) {
    res.status(500).json({ message: "Failed to update goat batch", error: error.message });
  }
};

const deleteBatch = async (req, res) => {
  try {
    const batch = await GoatBatch.findByIdAndDelete(req.params.id);
    if (!batch) return res.status(404).json({ message: "Goat batch not found" });
    await GoatRecord.deleteMany({ batch: batch._id });
    res.status(200).json({ message: "Goat batch and records removed" });
  } catch (error) {
    res.status(500).json({ message: "Failed to remove goat batch", error: error.message });
  }
};

// ---------------- Daily Records ----------------

const getRecords = async (req, res) => {
  try {
    const records = await GoatRecord.find({ batch: req.params.id })
      .populate("recordedBy", "name role")
      .sort({ date: -1 });
    res.status(200).json({ records });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch goat records", error: error.message });
  }
};

const addRecord = async (req, res) => {
  try {
    const batch = await GoatBatch.findById(req.params.id);
    if (!batch) return res.status(404).json({ message: "Goat batch not found" });

    const { date, mortality, culls, feedKg, sampleWeightKg, remarks } = req.body;
    if (!date) return res.status(400).json({ message: "date is required" });

    const day = startOfDay(new Date(date));
    const existing = await GoatRecord.findOne({ batch: batch._id, date: day });
    if (existing) {
      return res.status(409).json({ message: "A record for this batch on this date already exists — edit it instead" });
    }

    let openStock = req.body.openStock;
    if (openStock === undefined) {
      const previous = await GoatRecord.findOne({ batch: batch._id, date: { $lt: day } }).sort({ date: -1 });
      openStock = previous ? previous.closingStock : batch.goatsReceived;
    } else {
      openStock = Number(openStock);
    }

    const mort = Number(mortality) || 0;
    const cull = Number(culls) || 0;
    const closingStock = Math.max(0, openStock - mort - cull);
    const feed = Number(feedKg) || 0;

    const ageDay = daysBetween(startOfDay(batch.entryDate), day) + 1;

    // Handle optional Photo AND Video proof files
    let proof = { photoUrl: "", videoUrl: "" };
    const photoFile = req.files?.photo?.[0];
    const videoFile = req.files?.video?.[0];

    if (photoFile || videoFile) {
      const uploads = [];
      if (photoFile) uploads.push(uploadBufferToCloudinary(photoFile.buffer, "farmhouse/goat/photos", "image"));
      else uploads.push(Promise.resolve(""));

      if (videoFile) uploads.push(uploadBufferToCloudinary(videoFile.buffer, "farmhouse/goat/videos", "video"));
      else uploads.push(Promise.resolve(""));

      const [pUrl, vUrl] = await Promise.all(uploads);
      proof = { photoUrl: pUrl, videoUrl: vUrl };
    }

    const record = await GoatRecord.create({
      batch: batch._id,
      date: day,
      ageDay,
      openStock,
      mortality: mort,
      culls: cull,
      closingStock,
      feedKg: feed,
      sampleWeightKg: sampleWeightKg !== undefined && sampleWeightKg !== "" ? Number(sampleWeightKg) : null,
      remarks: remarks || "",
      proof,
      recordedBy: req.user._id,
    });

    res.status(201).json({ message: "Goat record added", record });
  } catch (error) {
    res.status(500).json({ message: "Failed to add goat record", error: error.message });
  }
};

const updateRecord = async (req, res) => {
  try {
    const record = await GoatRecord.findById(req.params.id);
    if (!record) return res.status(404).json({ message: "Goat record not found" });

    const { openStock, mortality, culls, feedKg, sampleWeightKg, remarks } = req.body;

    if (openStock !== undefined) record.openStock = Number(openStock);
    if (mortality !== undefined) record.mortality = Number(mortality);
    if (culls !== undefined) record.culls = Number(culls);
    if (feedKg !== undefined) record.feedKg = Number(feedKg);
    if (sampleWeightKg !== undefined) record.sampleWeightKg = sampleWeightKg === "" ? null : Number(sampleWeightKg);
    if (remarks !== undefined) record.remarks = remarks;

    record.closingStock = Math.max(0, record.openStock - record.mortality - record.culls);

    // Handle optional proof updates if uploaded
    const photoFile = req.files?.photo?.[0];
    const videoFile = req.files?.video?.[0];

    if (photoFile || videoFile) {
      if (!record.proof) record.proof = { photoUrl: "", videoUrl: "" };
      if (photoFile) {
        record.proof.photoUrl = await uploadBufferToCloudinary(photoFile.buffer, "farmhouse/goat/photos", "image");
      }
      if (videoFile) {
        record.proof.videoUrl = await uploadBufferToCloudinary(videoFile.buffer, "farmhouse/goat/videos", "video");
      }
    }

    await record.save();
    res.status(200).json({ message: "Goat record updated", record });
  } catch (error) {
    res.status(500).json({ message: "Failed to update goat record", error: error.message });
  }
};

const deleteRecord = async (req, res) => {
  try {
    const record = await GoatRecord.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ message: "Goat record not found" });
    res.status(200).json({ message: "Goat record removed" });
  } catch (error) {
    res.status(500).json({ message: "Failed to remove goat record", error: error.message });
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
