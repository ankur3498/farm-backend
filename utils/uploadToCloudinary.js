const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");

// Streams an in-memory file buffer to Cloudinary and resolves with the
// secure URL. resourceType should be "image" or "video".
const uploadBufferToCloudinary = (buffer, folder, resourceType) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

module.exports = uploadBufferToCloudinary;