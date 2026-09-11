const express = require("express");
const cors = require("cors");

const healthRoutes = require("./routes/healthRoutes");
const taskRoutes = require("./routes/taskRoutes");

const app = express();

// Middleware must come BEFORE routes
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/health", healthRoutes);
app.use("/api/tasks", taskRoutes);

app.get("/api/test", (req, res) => {
  res.json({
    message: "Backend connection successful",
  });
});

module.exports = app;