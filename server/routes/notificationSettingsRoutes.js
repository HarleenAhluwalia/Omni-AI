const express = require("express");
const { requireAuth } = require("../src/middleware/auth");
const {
  getNotificationSettings,
  updateNotificationSettings,
} = require("../controllers/notificationSettingsController");

const router = express.Router();

// Same protection as the task routes: identity comes from the verified token.
router.use(requireAuth);

router.get("/", getNotificationSettings);
router.put("/", updateNotificationSettings);

module.exports = router;
