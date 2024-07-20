const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const app = express();
const port = 3000;
const cors = require("cors");

app.use(cors());

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Replace <password> with the actual password
const mongoUri = "mongodb+srv://Wilson:MuitaMuita%402021@cluster0.gxglrta.mongodb.net/?retryWrites=true&w=majority";

mongoose.connect(mongoUri).then(() => {
    console.log("Connected to MongoDB");
}).catch((error) => {
    console.log("Error connecting to MongoDB:", error);
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
