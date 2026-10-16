
const {
    getCourses,
    getAssignments,
    getAssignmentById,
} = require("../services/dummyCanvasService");

const {
    convertCanvasAssignmentToTask,
} = require("../services/dummyCanvasImportService");

const {
    getSimulatedCanvasError,
} = require("../services/dummyCanvasErrorService");

const {
    importCanvasAssignment,
    updateImportedTask,
} = require("../services/dummyCanvasSyncService");

// GET all simulated Canvas courses
const fetchCourses = (req, res) => {
    // Check whether an error simulation was requested.
    const simulatedError = getSimulatedCanvasError(
        req.query.simulateError
    );

    if (simulatedError) {
        return res.status(simulatedError.status).json({
            success: false,
            code: simulatedError.code,
            error: simulatedError.error,
        });
    }

    // Normal course retrieval.
    return res.status(200).json({
        success: true,
        data: getCourses(),
    });
};

// GET simulated Canvas assignments
const fetchAssignments = (req, res) => {
    // Check whether an error simulation was requested.
    const simulatedError = getSimulatedCanvasError(
        req.query.simulateError
    );

    if (simulatedError) {
        return res.status(simulatedError.status).json({
            success: false,
            code: simulatedError.code,
            error: simulatedError.error,
        });
    }

    // Normal assignment retrieval.
    const { courseId } = req.query;

    if (courseId !== undefined) {
        const validCourseId =
            typeof courseId === "string" &&
            /^[1-9]\d*$/.test(courseId) &&
            Number.isSafeInteger(Number(courseId));

        if (!validCourseId) {
            return res.status(400).json({
                success: false,
                error: "Valid courseId is required",
            });
        }
    }

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

const importAssignment = async (req, res) => {
    const { assignmentId } = req.body || {};

    if (!Number.isInteger(assignmentId)) {
        return res.status(400).json({
            success: false,
            error: "Valid assignment ID is required",
        });
    }

    try {
        const result = await importCanvasAssignment(
            req.user.id,
            assignmentId
        );

        return res.status(result.created ? 201 : 200).json({
            success: true,
            created: result.created,
            data: result.task,
        });
    } catch (error) {
        if (error.message === "Canvas assignment not found") {
            return res.status(404).json({
                success: false,
                error: error.message,
            });
        }

        if (error.message === "This Canvas assignment is locked") {
            return res.status(403).json({
                success: false,
                error: error.message,
            });
        }

        console.error("Canvas import failed:", error);

        return res.status(500).json({
            success: false,
            error: "Could not import Canvas assignment",
        });
    }
};

const syncImportedAssignment = async (req, res) => {
    const { assignment } = req.body || {};

    if (!assignment || typeof assignment !== "object" ||
        Array.isArray(assignment)) {
        return res.status(400).json({
            success: false,
            error: "Assignment data is required",
        });
    }

    try {
        const updatedTask = await updateImportedTask(
            req.user.id,
            assignment
        );

        if (!updatedTask) {
            return res.status(404).json({
                success: false,
                error: "Imported assignment not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: updatedTask,
        });

    } catch (error) {
        if (error.message === "This Canvas assignment is locked") {
            return res.status(403).json({
                success: false,
                error: error.message,
            });
        }

        if (error.message === "Canvas assignment not found") {
            return res.status(404).json({
                success: false,
                error: error.message,
            });
        }

        const validationErrors = [
            "Valid assignment and course IDs are required",
            "Assignment title is required",
            "Valid assignment due date is required",
            "Valid assignment points are required",
            "Description must be a string or null",
            "Canvas assignment does not belong to the specified course",
        ];

        if (validationErrors.includes(error.message)) {
            return res.status(400).json({
                success: false,
                error: error.message,
            });
        }

        console.error("Canvas synchronization failed:", error);

        return res.status(500).json({
            success: false,
            error: "Could not synchronize Canvas assignment",
        });
    }
};

module.exports = {
    fetchCourses,
    fetchAssignments,
    fetchAssignmentById,
    processImportedAssignment,
    importAssignment,
    syncImportedAssignment,
};
