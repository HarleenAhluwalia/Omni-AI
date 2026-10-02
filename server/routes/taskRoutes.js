const express = require("express");

const { requireAuth } = require("../src/middleware/auth");

const {
  getTasks,
  getTaskById,
  getPrioritizedTasks,
  getDailySummary,
  getWeeklySummary,
  createTask,
  updateTask,
  deleteTask,
  resolveSchedule,
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

// ALAN SPRINT 2
// Adaptive scheduling and conflict resolution.
// Must be before /:id.
router.post(
  "/resolve-schedule",
  resolveSchedule
);

// Sprint 2 Task 11: Daily Summary. Must be before /:id, same reason.
router.get(
  "/summary/daily",
  getDailySummary
);

// Sprint 2 Task 12: Weekly Summary. Must be before /:id, same reason.
router.get(
  "/summary/weekly",
  getWeeklySummary
);

// Existing Task CRUD
router.get("/", getTasks);
router.get("/:id", getTaskById);
router.post("/", createTask);
router.put("/:id", updateTask);
router.delete("/:id", deleteTask);

module.exports = router;