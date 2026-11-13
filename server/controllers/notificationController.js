
const {
  listNotificationsForUser,
  evaluateAndStoreNotificationsForUser,
} = require("../services/notificationPersistenceService");

// GET /api/notifications
// Retrieve the authenticated student's notifications.
async function getNotifications(req, res) {
  try {
    const userId = req.user.id;

    const notifications = await listNotificationsForUser(userId);

    return res.status(200).json({
      success: true,
      data: notifications,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Could not retrieve notifications",
    });
  }
}

// POST /api/notifications/evaluate
// Evaluate tasks and save eligible notifications.
async function evaluateNotifications(req, res) {
  try {
    const userId = req.user.id;

    const result = await evaluateAndStoreNotificationsForUser(userId);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Could not evaluate notifications",
    });
  }
}

module.exports = {
  getNotifications,
  evaluateNotifications,
};
