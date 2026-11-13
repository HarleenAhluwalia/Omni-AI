const express = require("express");
const cors = require("cors");
const aiRoutes = require("./routes/aiRoutes");

const authRoutes = require("./routes/auth");
const taskRoutes = require("../routes/taskRoutes");
const scheduleRoutes = require("../routes/scheduleRoutes");
const dummyCanvasRoutes = require("../routes/dummyCanvasRoutes");
const canvasRoutes = require("./routes/canvasRoutes");
const notificationSettingsRoutes = require("../routes/notificationSettingsRoutes");
const preferencesRoutes = require("./routes/preferencesRoutes");
const notificationRoutes = require("../routes/notificationRoutes");
const { requestId } = require("./middleware/requestId");
const { logBackendError } = require("./utils/securityLogger");

function createApp() {
  const app = express();

  // CC7.2: give every request a correlation id before anything can log.
  app.use(requestId);

  app.use(
    cors({
      origin:
        process.env.CLIENT_ORIGIN || "*",
    })
  );

  app.use(express.json());

  app.get("/health", (req, res) => {
    res.json({
      status: "ok"
    });
  });

  // Medrian - UC-4 Smart Notification storage and retrieval
  app.use("/api/notifications", notificationRoutes);

  app.use("/api/auth", authRoutes);
  app.use("/api/ai", aiRoutes);
  // Harleen - Task CRUD routes
  app.use("/api/tasks", taskRoutes);

  // Jerry - Notification preferences (Sprint 3)
  app.use("/api/notification-settings", notificationSettingsRoutes);

  // Alan - Scheduling routes
  app.use("/api/schedules", scheduleRoutes);

  
  // Alan - Dummy Canvas routes
  app.use("/api/dummy-canvas", dummyCanvasRoutes);

  // Canvas assignment synchronization
  app.use("/api/canvas", canvasRoutes);

  // Harleen - UC-9/UC-16 Study and AI Preferences
  app.use("/api/preferences", preferencesRoutes);

  app.use((err, req, res, next) => {
    // CC7.2: structured, sanitized record (error name/code only — the raw
    // error object and message are not written to the log).
    logBackendError(req, "unhandled_exception", err, 500);

    res.status(500).json({
      error: "Internal server error."
    });
  });


  return app;
}

module.exports = {
  createApp
};
