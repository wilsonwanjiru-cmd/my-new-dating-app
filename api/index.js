const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const socketIO = require("socket.io");
const http = require("http");

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const mongoUri = "mongodb+srv://Wilson:MuitaMuita%402021@cluster0.gxglrta.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(mongoUri).then(() => {
    console.log("Connected to MongoDB");
}).catch((error) => {
    console.log("Error connecting to MongoDB:", error);
});

// Create HTTP server and pass it to Socket.IO
const server = http.createServer(app);
const io = socketIO(server);

// Define the user schema and model
const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    verificationToken: String,
    verified: { type: Boolean, default: false }
});

const UserActivation = mongoose.model("UserActivation", userSchema);

// Endpoint to register a user
app.post("/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Check if the email is already registered
        const existingUser = await UserActivation.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

        // Create a new user
        const newUser = new UserActivation({
            name,
            email,
            password,
            verificationToken: crypto.randomBytes(20).toString("hex")
        });

        // Save the user to the backend
        await newUser.save();

        // Send verification email to the registered user
        sendVerificationEmail(newUser.email, newUser.verificationToken);

        res.status(200).json({ message: "User registered successfully. Please check your email to verify your account." });
    } catch (error) {
        console.log("Error registering the user:", error);
        res.status(500).json({ message: "Registration failed" });
    }
});

const sendVerificationEmail = async (email, verificationToken) => {
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: "wilsonmuita41@gmail.com",
            pass: "qfnlbtbsplqwtell",
        }
    });

    const mailOptions = {
        from: "wilsonmuita41@gmail.com",
        to: email,
        subject: "Email Verification",
        text: `Please click on the following link to verify your email: http://192.168.43.73:3000/verify/${verificationToken}`,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log("Verification email sent to:", email);
    } catch (error) {
        console.log("Error sending the verification email:", error);
    }
};

// Verify the user
app.get("/verify/:token", async (req, res) => {
    try {
        const token = req.params.token;
        const user = await UserActivation.findOne({ verificationToken: token });

        if (!user) {
            return res.status(404).json({ message: "Invalid verification token" });
        }

        // Mark the user as verified
        user.verified = true;
        user.verificationToken = undefined;

        await user.save();
        res.status(200).json({ message: "Email verified successfully" });
    } catch (error) {
        console.log("Error verifying the email:", error);
        res.status(500).json({ message: "Email verification failed" });
    }
});

// Handle socket connections
io.on("connection", (socket) => {
    console.log("A user connected");

    socket.on("disconnect", () => {
        console.log("User disconnected");
    });
});

// Start the server
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});




// Generate secret key for JWT
const generateSecretKey = () => {
    const secretKey = crypto.randomBytes(32).toString("hex");
    return secretKey;
};

const secretKey = generateSecretKey();

// Endpoint to login
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if the user exists
        const user = await UserActivation.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        // Check if the password is correct
        if (user.password !== password) {
            return res.status(401).json({ message: "Invalid password" });
        }

        // Generate JWT token
        const token = jwt.sign({ userId: user._id }, secretKey);
        res.status(200).json({ token });

    } catch (error) {
        console.log("Error during login:", error);
        res.status(500).json({ message: "Login failed" });
    }
});
//endpoint to change or select the gender for a particular user profile
app.put("/users/:userId/gender", async (req, res) => {
    try {
      const { userId } = req.params;
      const { gender } = req.body;
  
      const user = await user.findByIdAndUpdate(
        userId,
        { gender: gender },
        { new: true }
      );
  
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
  
      return res.status(200).json({ message: "User gender updated Successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error updating user gender", error });
    }
  });
  //endpoint to update the user description
app.put("/users/:userId/description", async (req, res) => {
    try {
      const { userId } = req.params;
      const { description } = req.body;
  
      const user = await user.findByIdAndUpdate(
        userId,
        {
          description: description,
        },
        { new: true }
      );
  
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
  
      return res
        .status(200)
        .json({ message: "User description updated successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error updating user description" });
    }
  });
  //fetch users data
app.get("/users/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
  
      const user = await user.findById(userId);
  
      if (!user) {
        return res.status(500).json({ message: "User not found" });
      }
  
      return res.status(200).json({ user });
    } catch (error) {
      res.status(500).json({ message: "Error fetching the user details" });
    }
  });
  
  //end point to add a turnon for a user in the backend
  app.put("/users/:userId/turn-ons/add", async (req, res) => {
    try {
      const { userId } = req.params;
      const { turnOn } = req.body;
  
      const user = await user.findByIdAndUpdate(
        userId,
        { $addToSet: { turnOns: turnOn } },
        { new: true }
      );
  
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
  
      return res
        .status(200)
        .json({ message: "Turn on updated successfully", user });
    } catch (error) {
      res.status(500).json({ message: "Error adding the turn on" });
    }
  });
  
  //endpoint to remove a particular turn on for the user
  app.put("/users/:userId/turn-ons/remove", async (req, res) => {
    try {
      const { userId } = req.params;
  
      const { turnOn } = req.body;
  
      const user = await user.findByIdAndUpdate(
        userId,
        { $pull: { turnOns: turnOn } },
        { new: true }
      );
  
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
  
      return res
        .status(200)
        .json({ message: "Turn on removed successfully", user });
    } catch (error) {
      return res.status(500).json({ message: "Error removing turn on" });
    }
  });
  
  //end point to add a lookingFor  for a user in the backend
  app.put("/users/:userId/looking-for", async (req, res) => {
    try {
      const { userId } = req.params;
      const { lookingFor } = req.body;
  
      const user = await user.findByIdAndUpdate(
        userId,
        {
          $addToSet: { lookingFor: lookingFor },
        },
        { new: true }
      );
  
      if (!user) {
        return res.status(404).json({ message: "No user" });
      }
  
      return res
        .status(200)
        .json({ message: "Looking for updated successfully".user });
    } catch (error) {
      res.status(500).json({ message: "Error updating looking for", error });
    }
  });
  
  //endpoint to remove looking for in the backend
  app.put("/users/:userId/looking-for/remove", async (req, res) => {
    try {
      const { userId } = req.params;
      const { lookingFor } = req.body;
  
      const user = await User.findByIdAndUpdate(
        userId,
        {
          $pull: { lookingFor: lookingFor },
        },
        { new: true }
      );
  
      if (!user) {
        return res.status(404).json({ message: "No user" });
      }
  
      return res
        .status(200)
        .json({ message: "Looking for updated successfully".user });
    } catch (error) {
      res.status(500).json({ message: "Error removing looking for", error });
    }
  });
  
  app.post("/users/:userId/profile-images", async (req, res) => {
    try {
      const { userId } = req.params;
      const { imageUrl } = req.body;
  
      const user = await user.findById(userId);
  
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
  
      user.profileImages.push(imageUrl);
  
      await user.save();
  
      return res.status(200).json({ message: "Image has been added", user });
    } catch (error) {
      res.status(500).json({ message: "Error adding the profile images" });
    }
  });
  
  //endpoint to fetch all the profiles for a particular user
  app.get("/profiles", async (req, res) => {
    const { userId, gender, turnOns, lookingFor } = req.query;
  
    try {
      let filter = { gender: gender === "male" ? "female" : "male" }; // For gender filtering
  
      // Add filtering based on turnOns and lookingFor arrays
      if (turnOns) {
        filter.turnOns = { $in: turnOns };
      }
  
      if (lookingFor) {
        filter.lookingFor = { $in: lookingFor };
      }
  
      const currentUser = await User.findById(userId)
        .populate("matches", "_id")
        .populate("crushes", "_id");
  
      // Extract IDs of friends
      const friendIds = currentUser.matches.map((friend) => friend._id);
  
      // Extract IDs of crushes
      const crushIds = currentUser.crushes.map((crush) => crush._id);
  
      const profiles = await User.find(filter)
        .where("_id")
        .nin([userId, ...friendIds, ...crushIds]);
  
      return res.status(200).json({ profiles });
    } catch (error) {
      return res.status(500).json({ message: "Error fetching profiles", error });
    }
  });
  
  app.post("/send-like", async (req, res) => {
    const { currentUserId, selectedUserId } = req.body;
  
    try {
      //update the recepient's friendRequestsArray!
      await User.findByIdAndUpdate(selectedUserId, {
        $push: { receivedLikes: currentUserId },
      });
      //update the sender's sentFriendRequests array
      await User.findByIdAndUpdate(currentUserId, {
        $push: { crushes: selectedUserId },
      });
  
      res.sendStatus(200);
    } catch (error) {
      res.sendStatus(500);
    }
  });
  
  //endpoint to get the details of the received Likes
  app.get("/received-likes/:userId/details", async (req, res) => {
    const { userId } = req.params;
  
    try {
      // Find the user by ID
      const user = await User.findById(userId);
  
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
  
      // Fetch details of users who liked the current user
      const receivedLikesDetails = [];
      for (const likedUserId of user.receivedLikes) {
        const likedUser = await User.findById(likedUserId);
        if (likedUser) {
          receivedLikesDetails.push(likedUser);
        }
      }
  
      res.status(200).json({ receivedLikesDetails });
    } catch (error) {
      res.status(500).json({
        message: "Error fetching received likes details",
        error: error.message,
      });
    }
  });
  
  //endpoint to create a match between two people
  app.post("/create-match", async (req, res) => {
    try {
      const { currentUserId, selectedUserId } = req.body;
  
      //update the selected user's crushes array and the matches array
      await User.findByIdAndUpdate(selectedUserId, {
        $push: { matches: currentUserId },
        $pull: { crushes: currentUserId },
      });
  
      //update the current user's matches array received likes array
      await User.findByIdAndUpdate(currentUserId, {
        $push: { matches: selectedUserId },
        $pull: { recievedLikes: selectedUserId },
      });
  
      res.sendStatus(200);
    } catch (error) {
      res.status(500).json({ message: "Error creating a match", error });
    }
  });
  
  //endpoint to get all the matches of the particular user
  app.get("/users/:userId/matches", async (req, res) => {
    try {
      const { userId } = req.params;
  
      const user = await User.findById(userId);
  
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
  
      const matchIds = user.matches;
  
      const matches = await User.find({ _id: { $in: matchIds } });
  
      res.status(200).json({ matches });
    } catch (error) {
      res.status(500).json({ message: "Error retrieving the matches", error });
    }
  });

 // Handle socket connections
io.on("connection", (socket) => {
  console.log("A user connected");

  socket.on("sendMessage", async (data) => {
      try {
          const { senderId, receiverId, message } = data;

          console.log("data", data);

          const newMessage = new Chat({ senderId, receiverId, message });
          await newMessage.save();

          // Emit the message to the receiver
          io.to(receiverId).emit("receiveMessage", newMessage);
      } catch (error) {
          console.log("Error handling the messages");
      }
  });

  socket.on("disconnect", () => {
      console.log("User disconnected");
  });
});

// // Start the server
// server.listen(port, () => {
//   console.log(`Socket.IO server running on port ${port}`);
// });
  
  app.get("/messages", async (req, res) => {
    try {
      const { senderId, receiverId } = req.query;
  
      console.log(senderId);
      console.log(receiverId);
  
      const messages = await Chat.find({
        $or: [
          { senderId: senderId, receiverId: receiverId },
          { senderId: receiverId, receiverId: senderId },
        ],
      }).populate("senderId", "_id name");
  
      res.status(200).json(messages);
    } catch (error) {
      res.status(500).json({ message: "Error in getting messages", error });
    }
  });
  
  
  //endpoint to delete the messages;
  
  app.post("/delete",async(req,res) => {
      try{
          const {messages} = req.body;
  
          if(!Array.isArray(messages) || messages.length == 0){
              return res.status(400).json({message:"Invalid request body"})
          };
  
          for(const messageId of messages){
              await Chat.findByIdAndDelete(messageId);
          }
  
          res.status(200).json({message:"Messages deleted successfully!"})
      } catch(error){
          res.status(500).json({message:"Internal server error",error})
      }
  })

