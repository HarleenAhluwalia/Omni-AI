const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
//const taskRoutes = require("../routes/taskRoutes");

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

  // Harleen - Task CRUD routes
  // app.use("/api/tasks", taskRoutes);

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