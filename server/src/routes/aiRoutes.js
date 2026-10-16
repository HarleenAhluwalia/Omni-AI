
const express = require("express");

const { chat } = require("../controllers/aiController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Protect AI Chat and Schedule Generation with Omni AI authentication.
router.post("/chat", requireAuth, chat);

module.exports = router;
