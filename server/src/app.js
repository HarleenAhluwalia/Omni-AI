const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");

function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CLIENT_ORIGIN || "*" }));
  app.use(express.json());

  app.get("/health", (req, res) => res.json({ status: "ok" }));
  app.use("/api/auth", authRoutes);

  // Fallback error handler
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error." });
  });

  return app;
}

module.exports = { createApp };
