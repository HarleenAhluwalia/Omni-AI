
const supabase = require("../config/supabase");

const {
    convertCanvasAssignmentToUpdates,
} = require("./dummyCanvasImportService");

const {
    getAssignmentById,
} = require("./dummyCanvasService");

// Find an existing Omni-AI task associated
// with a previously imported Canvas assignment.
const findImportedTask = async (
    userId,
    courseId,
    assignmentId
) => {
    if (
        !userId ||
        !Number.isInteger(courseId) ||
        !Number.isInteger(assignmentId)
    ) {
        throw new Error("Valid user and Canvas IDs are required");
    }

    const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", userId)
        .eq("canvas_course_id", courseId)
        .eq("canvas_assignment_id", assignmentId)
        .maybeSingle();

    if (error) {
        throw new Error(error.message);
    }

    return data || null;
};


// Update an existing Omni-AI task using Canvas assignment data.
const updateImportedTask = async (userId, assignment) => {
    // Validate and convert the updated Canvas assignment.
    const { source, updates } =
        convertCanvasAssignmentToUpdates(assignment);

    // Check the original simulated Canvas assignment.
    const canvasAssignment = getAssignmentById(
        source.assignmentId
    );

    // Reject assignments associated with the wrong course.
    if (
        canvasAssignment &&
        canvasAssignment.courseId !== source.courseId
    ) {
        throw new Error(
            "Canvas assignment does not belong to the specified course"
        );
    }

    // Prevent locked assignments from being synchronized.
    if (canvasAssignment?.locked) {
        throw new Error(
            "This Canvas assignment is locked"
        );
    }


    // Locate the previously imported Omni-AI task.
    const existingTask = await findImportedTask(
        userId,
        source.courseId,
        source.assignmentId
    );

    // Do not create a duplicate if no imported task exists.
    if (!existingTask) {
        return null;
    }

    // Update the existing task while preserving user-managed fields.
    const { data, error } = await supabase
        .from("tasks")
        .update(updates)
        .eq("id", existingTask.id)
        .eq("user_id", userId)
        .eq("canvas_course_id", source.courseId)
        .eq("canvas_assignment_id", source.assignmentId)
        .select()
        .maybeSingle();

    if (error) {
        throw new Error(error.message);
    }

    return data || null;
};


module.exports = {
    findImportedTask,
    updateImportedTask,
};