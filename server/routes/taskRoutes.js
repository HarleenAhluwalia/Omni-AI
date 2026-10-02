const express = require("express");

const {
  getTasks,
  getTaskById,
  getPrioritizedTasks,
  createTask,
  updateTask,
  deleteTask,
  resolveSchedule,
} = require("../controllers/taskController");

const router = express.Router();

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

// Existing Task CRUD
router.get("/", getTasks);
router.get("/:id", getTaskById);
router.post("/", createTask);
router.put("/:id", updateTask);
router.delete("/:id", deleteTask);

module.exports = router;