
const express = require("express");

const { requireAuth } = require("../src/middleware/auth");

const {
    fetchCourses,
    fetchAssignments,
    fetchAssignmentById,
} = require("../controllers/dummyCanvasController");

const router = express.Router();

// Require authentication for Dummy Canvas endpoints
router.use(requireAuth);

// GET all simulated Canvas courses
router.get("/courses", fetchCourses);

// GET all assignments or filter by course
router.get("/assignments", fetchAssignments);

// GET a specific assignment by ID
router.get("/assignments/:id", fetchAssignmentById);

module.exports = router;
