require("dotenv").config();
const axios = require("axios");
const generateAccessToken = require("./generateAccessToken"); // Adjust the path if necessary

const stkPushRequest = async () => {
    const token = await generateAccessToken();

    const url = process.env.MPESA_ENVIRONMENT === "production"
        ? "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
        : "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest";

    const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
    const password = Buffer.from(`${process.env.MPESA_PAYBILL}${process.env.MPESA_PASSKEY}${timestamp}`).toString("base64");

    const requestBody = {
        BusinessShortCode: process.env.MPESA_PAYBILL,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: 1, // Set the desired amount
        PartyA: "254703538670", // Replace with the user's phone number
        PartyB: process.env.MPESA_PAYBILL,
        PhoneNumber: "254703538670", // Replace with the user's phone number
        CallBackURL: `${process.env.SERVER_URL}/callback`,
        AccountReference: "TestRef",
        TransactionDesc: "Testing STK Push",
    };

    try {
        const response = await axios.post(url, requestBody, {
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
        });

        console.log("STK Push Response:", response.data);
    } catch (error) {
        console.error("Error initiating STK Push:", error.response?.data || error.message);
    }
};

stkPushRequest();
