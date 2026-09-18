const multer = require("multer");

// Files are held in memory only long enough to stream to Cloudinary —
// nothing is written to disk on the server.
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.fieldname === "photo" && !file.mimetype.startsWith("image/")) {
    return cb(new Error("photo must be an image file"));
  }
  if (file.fieldname === "video" && !file.mimetype.startsWith("video/")) {
    return cb(new Error("video must be a video file"));
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB per file — video is the bigger one
});

// Expects multipart form-data with a "photo" field and a "video" field
const uploadProof = upload.fields([
  { name: "photo", maxCount: 1 },
  { name: "video", maxCount: 1 },
]);

// Expects multipart form-data with just a single "photo" field — used for
// reference photos (e.g. an asset's own photo, not a task submission).
const uploadSinglePhoto = upload.single("photo");

module.exports = uploadProof;
module.exports.uploadProof = uploadProof;
module.exports.uploadSinglePhoto = uploadSinglePhoto;