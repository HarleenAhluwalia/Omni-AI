const express = require("express");

const { requireAuth } = require("../src/middleware/auth");

const {
  getTasks,
  getTaskById,
  getPrioritizedTasks,
  createTask,
  updateTask,
  deleteTask,
} = require("../controllers/taskController");

const router = express.Router();

// Sprint 2: Task routes require a verified session. Downstream handlers
// read the authenticated user from req.user.id rather than trusting a
// client-supplied user_id.
router.use(requireAuth);

// HARLEEN SPRINT 2
// Must be before /:id.
router.get(
  "/prioritized",
  getPrioritizedTasks
);

// Existing Task CRUD
router.get("/", getTasks);
router.get("/:id", getTaskById);
router.post("/", createTask);
router.put("/:id", updateTask);
router.delete("/:id", deleteTask);

module.exports = router;