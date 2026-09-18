// Placeholder for mobile OTP — plug in Twilio / MSG91 / Fast2SMS here later.
// Keeping the interface ready so authController doesn't need to change
// when you add a real SMS provider.

const sendSmsOtp = async ({ mobile, otp }) => {
  console.log(`[SMS OTP - NOT YET WIRED] Would send OTP ${otp} to ${mobile}`);
  // TODO: integrate real SMS provider here
  return true;
};

module.exports = sendSmsOtp;