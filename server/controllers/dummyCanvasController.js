
const {
    getCourses,
    getAssignments,
    getAssignmentById,
} = require("../services/dummyCanvasService");

const {
    convertCanvasAssignmentToTask,
} = require("../services/dummyCanvasImportService");

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


// POST - Process imported Dummy Canvas assignment
const processImportedAssignment = (req, res) => {
    try {
        const { assignment } = req.body || {};

        if (!assignment) {
            return res.status(400).json({
                success: false,
                error: "Assignment data is required",
            });
        }

        const convertedTask =
            convertCanvasAssignmentToTask(assignment);

        // Check the actual simulated Canvas assignment.
        // Do not trust a locked value supplied by the frontend.
        const canvasAssignment = getAssignmentById(
            convertedTask.source.assignmentId
        );

        if (
            !canvasAssignment ||
            canvasAssignment.courseId !== convertedTask.source.courseId
        ) {
            return res.status(404).json({
                success: false,
                error: "Canvas assignment not found",
            });
        }

        // Prevent processing locked assignments.
        if (canvasAssignment.locked) {
            return res.status(403).json({
                success: false,
                error: "This Canvas assignment is locked",
            });
        }

        return res.status(200).json({
            success: true,
            data: convertedTask,
        });

    } catch (error) {
        return res.status(400).json({
            success: false,
            error: error.message,
        });
    }
};


module.exports = {
    fetchCourses,
    fetchAssignments,
    fetchAssignmentById,
    processImportedAssignment,
};
