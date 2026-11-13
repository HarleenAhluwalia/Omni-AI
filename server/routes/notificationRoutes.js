const express = require("express");
const { requireAuth } = require("../src/middleware/auth");

const {
  getNotifications,
  evaluateNotifications,
} = require("../controllers/notificationController");

const router = express.Router();

// Require authentication for all notification endpoints.
router.use(requireAuth);

// Retrieve the authenticated student's saved notifications.
router.get("/", getNotifications);

// Evaluate tasks and store eligible notifications.
router.post("/evaluate", evaluateNotifications);

module.exports = router;
