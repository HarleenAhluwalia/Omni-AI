const express = require("express");

const { requireAuth } = require("../src/middleware/auth");

const {
  getSchedules,
  createSchedule,
  updateSchedule,
  resolveScheduleConflict,
} = require("../controllers/scheduleController");

const router = express.Router();

// CC6.3 remediation: this router previously had no authentication at
// all, and every handler trusted a client-supplied user_id (query
// param or body field) instead of a verified identity - see
// docs/security/sprint-4/cc63-authorization-review.md. Same protection
// as every other data route: identity comes from the verified token.
router.use(requireAuth);

router.get("/", getSchedules);

router.post(
  "/resolve-conflict",
  resolveScheduleConflict
);

router.post("/", createSchedule);

router.put("/:id", updateSchedule);

module.exports = router;