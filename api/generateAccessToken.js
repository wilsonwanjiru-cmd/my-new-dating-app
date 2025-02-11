const axios = require("axios");

// Consumer Key and Secret from the environment variables
const consumerKey = process.env.MPESA_CONSUMER_KEY || "GxJG88IxmgIteKKAYcRtsG8jRDsNN1oHYeq3whLAJwe8AtMb";
const consumerSecret = process.env.MPESA_CONSUMER_SECRET || "FxHoJM1P7ACJqWxurC0AbAM7YKMAWehGlFRot4YXmJM8kskXGTnD6j9J7pvcEM9E";

// Function to generate the access token
const generateAccessToken = async () => {
  try {
    // Encode consumer key and secret
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

    // Fetch access token from Safaricom API
    const response = await axios.get(
      "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      }
    );

    const { access_token, expires_in } = response.data;

    // Log the token and its expiry
    console.log("Access Token:", access_token);
    console.log("Expires In:", expires_in);

    return access_token; // Return the access token for use in other parts of the app
  } catch (error) {
    // Improved error logging
    if (error.response) {
      console.error("Error generating access token:", error.response.data);
    } else {
      console.error("Error generating access token:", error.message);
    }
    throw new Error("Failed to generate access token");
  }
};

// Export the function for use elsewhere
module.exports = generateAccessToken;

// If the script is executed directly, test the function
if (require.main === module) {
  (async () => {
    try {
      const token = await generateAccessToken();
      console.log("Generated Access Token:", token);
    } catch (error) {
      console.error("Access token generation failed:", error.message);
    }
  })();
}
