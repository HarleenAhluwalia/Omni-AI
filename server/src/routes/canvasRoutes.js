const express = require("express");

const { requireAuth } = require("../middleware/auth");

const {
  getCourses,
  importAssignments,
} = require("../controllers/canvasController");

const router = express.Router();

// Canvas sync routes require a verified session, same as /api/tasks -
// ownership always comes from req.user.id, never a client-supplied value.
router.use(requireAuth);

router.get("/courses", getCourses);
router.post("/import", importAssignments);

module.exports = router;
