
const supabase = require("../config/supabase");

const {
    convertCanvasAssignmentToTask,
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

    // Reject assignments that do not exist in Dummy Canvas.
    if (!canvasAssignment) {
        throw new Error("Canvas assignment not found");
    }

    // Verify the assignment belongs to the correct course.
    if (canvasAssignment.courseId !== source.courseId) {
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

const importCanvasAssignment = async (userId, assignmentId) => {
    if (!userId || !Number.isInteger(assignmentId)) {
        throw new Error("Valid user and assignment IDs are required");
    }

    // Retrieve the actual simulated Canvas assignment.
    const assignment = getAssignmentById(assignmentId);

    if (!assignment) {
        throw new Error("Canvas assignment not found");
    }

    if (assignment.locked) {
        throw new Error("This Canvas assignment is locked");
    }

    // Convert Canvas data into Omni-AI task format.
    const { source, task } =
        convertCanvasAssignmentToTask(assignment);

    // Check whether this assignment was already imported.
    const existingTask = await findImportedTask(
        userId,
        source.courseId,
        source.assignmentId
    );

    if (existingTask) {
        return {
            created: false,
            task: existingTask,
        };
    }

    // Insert the new task into Supabase.
    const { data, error } = await supabase
        .from("tasks")
        .insert([{
            ...task,
            user_id: userId,
            canvas_course_id: source.courseId,
            canvas_assignment_id: source.assignmentId,
        }])
        .select()
        .single();

    if (error) {
        // Handle a concurrent import of the same assignment.
        if (error.code === "23505") {
            const imported = await findImportedTask(
                userId,
                source.courseId,
                source.assignmentId
            );

            if (imported) {
                return {
                    created: false,
                    task: imported,
                };
            }
        }

        throw new Error(error.message);
    }

    return {
        created: true,
        task: data,
    };
};

module.exports = {
  findImportedTask,
  updateImportedTask,
  importCanvasAssignment,
};