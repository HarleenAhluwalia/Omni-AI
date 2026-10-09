const express = require("express");
const cors = require("cors");
const aiRoutes = require("./routes/aiRoutes");

const authRoutes = require("./routes/auth");
const taskRoutes = require("../routes/taskRoutes");
const scheduleRoutes = require("../routes/scheduleRoutes");
const dummyCanvasRoutes = require("../routes/dummyCanvasRoutes");

function createApp() {
  const app = express();

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

  app.use("/api/auth", authRoutes);
  app.use("/api/ai", aiRoutes);
  // Harleen - Task CRUD routes
  app.use("/api/tasks", taskRoutes);

  // Alan - Scheduling routes
  app.use("/api/schedules", scheduleRoutes);

  // Alan - Dummy Canvas routes
  app.use("/api/dummy-canvas", dummyCanvasRoutes);

  app.use((err, req, res, next) => {
    console.error(err);

    res.status(500).json({
      error:
        "Internal server error."
    });
  });

  return app;
}

module.exports = {
  createApp
};