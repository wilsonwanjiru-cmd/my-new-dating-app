const express = require("express");
const router = express.Router();
const MatchController = require("../controllers/matchController");
const ValidateRequest = require("../middlewares/validateRequest");

// ==================== Route Definitions ====================

/**
 * @swagger
 * /api/match/user-matches/{userId}:
 *   get:
 *     summary: Get all matches for a specific user
 *     tags: [Matches]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID
 *     responses:
 *       200:
 *         description: List of matches
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 matches:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid user ID format
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.get(
  "/user-matches/:userId",
  ValidateRequest.validateObjectId,
  MatchController.getMatches
);

/**
 * @swagger
 * /api/match/crushes/{userId}:
 *   get:
 *     summary: Get all users who liked the current user (crushes)
 *     tags: [Matches]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID
 *     responses:
 *       200:
 *         description: List of crushes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 crushes:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid user ID format
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.get(
  "/crushes/:userId",
  ValidateRequest.validateObjectId,
  MatchController.getCrushes
);

/**
 * @swagger
 * /api/match/likes:
 *   get:
 *     summary: Get all likes sent by the current user
 *     tags: [Matches]
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the current user
 *     responses:
 *       200:
 *         description: List of likes sent by the user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 likes:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid user ID format
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.get(
  "/likes",
  ValidateRequest.validateQueryObjectId('userId'),
  MatchController.getUserLikes
);

/**
 * @swagger
 * /api/match/send-like:
 *   post:
 *     summary: Send a like to another user
 *     tags: [Matches]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentUserId
 *               - selectedUserId
 *             properties:
 *               currentUserId:
 *                 type: string
 *               selectedUserId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Like sent successfully or match found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 isMatch:
 *                   type: boolean
 *       400:
 *         description: Invalid input
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.post(
  "/send-like",
  ValidateRequest.validateBodyObjectId(['currentUserId', 'selectedUserId']),
  MatchController.sendLike
);

/**
 * @swagger
 * /api/match/create-match:
 *   post:
 *     summary: Create a match between two users
 *     tags: [Matches]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentUserId
 *               - selectedUserId
 *             properties:
 *               currentUserId:
 *                 type: string
 *               selectedUserId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Match created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid input
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.post(
  "/create-match",
  ValidateRequest.validateBodyObjectId(['currentUserId', 'selectedUserId']),
  MatchController.createMatch
);

/**
 * @swagger
 * /api/match/unmatch:
 *   post:
 *     summary: Unmatch two users
 *     tags: [Matches]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentUserId
 *               - selectedUserId
 *             properties:
 *               currentUserId:
 *                 type: string
 *               selectedUserId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Match removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid input
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.post(
  "/unmatch",
  ValidateRequest.validateBodyObjectId(['currentUserId', 'selectedUserId']),
  MatchController.unmatch
);

module.exports = router;