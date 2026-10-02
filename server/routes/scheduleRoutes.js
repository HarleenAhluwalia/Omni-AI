const express = require("express");

const {
  getSchedules,
  createSchedule,
  updateSchedule,
  resolveScheduleConflict,
} = require("../controllers/scheduleController");

const router = express.Router();

router.get("/", getSchedules);

router.post(
  "/resolve-conflict",
  resolveScheduleConflict
);

router.post("/", createSchedule);

router.put("/:id", updateSchedule);

module.exports = router;