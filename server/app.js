const express = require("express");
const cors = require("cors");

const supabase = require("./config/supabase");
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

// Temporary route to verify the Supabase connection (Task 4)
app.get("/api/db-test", async (req, res) => {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .limit(1);

  if (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }

  res.json({
    success: true,
    message: "Supabase database connection works",
    data,
  });
});

module.exports = app;