const express = require("express");

const {
  getTasks,
  getTaskById,
  getPrioritizedTasks,
  createTask,
  updateTask,
  deleteTask,
} = require("../controllers/taskController");

const router = express.Router();

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