const axios = require('axios');

const fetchAccessToken = async () => {
  try {
    const { MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET } = process.env;

    if (!MPESA_CONSUMER_KEY || !MPESA_CONSUMER_SECRET) {
      throw new Error("M-Pesa consumer credentials are missing in environment variables.");
    }

    const credentials = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString('base64');

    const response = await axios.get(
      'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      }
    );

    const accessToken = response.data?.access_token;

    if (!accessToken) {
      throw new Error("Access token not found in response.");
    }

    return accessToken;
  } catch (error) {
    console.error("❌ Error fetching access token:", error.response?.data || error.message);
    throw new Error("Failed to fetch M-Pesa access token");
  }
};

module.exports = { fetchAccessToken };
