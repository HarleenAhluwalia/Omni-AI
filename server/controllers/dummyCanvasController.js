
const {
    getCourses,
    getAssignments,
    getAssignmentById,
} = require("../services/dummyCanvasService");

// GET all simulated Canvas courses
const fetchCourses = (req, res) => {
    return res.status(200).json({
        success: true,
        data: getCourses(),
    });
};

// GET simulated Canvas assignments
const fetchAssignments = (req, res) => {
    const { courseId } = req.query;

    return res.status(200).json({
        success: true,
        data: getAssignments(courseId),
    });
};

// GET one assignment by ID
const fetchAssignmentById = (req, res) => {
    const assignment = getAssignmentById(req.params.id);

    if (!assignment) {
        return res.status(404).json({
            success: false,
            error: "Assignment not found",
        });
    }

    return res.status(200).json({
        success: true,
        data: assignment,
    });
};

module.exports = {
    fetchCourses,
    fetchAssignments,
    fetchAssignmentById,
};
