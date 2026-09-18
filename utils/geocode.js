const axios = require("axios");

// Free reverse geocoding — no API key needed, but Nominatim requires a
// descriptive User-Agent and is rate-limited (~1 req/sec). Fine for our
// check-in/check-out volume.
const reverseGeocode = async (latitude, longitude) => {
  try {
    const res = await axios.get("https://nominatim.openstreetmap.org/reverse", {
      params: {
        lat: latitude,
        lon: longitude,
        format: "json",
      },
      headers: {
        "User-Agent": "FarmhouseManagementApp/1.0",
      },
      timeout: 5000,
    });
    return res.data?.display_name || "";
  } catch (error) {
    console.error("Reverse geocoding failed:", error.message);
    return ""; // Don't block check-in/out if geocoding fails
  }
};

module.exports = reverseGeocode;