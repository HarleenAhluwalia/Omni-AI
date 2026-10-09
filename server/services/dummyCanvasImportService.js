
const convertCanvasAssignmentToTask = (assignment) => {
    if (!assignment || typeof assignment !== "object") {
        throw new Error("Assignment data is required");
    }

    const { id, courseId, title, dueDate, points } = assignment;

    // Validate required assignment fields.
    if (!Number.isInteger(id) || !Number.isInteger(courseId)) {
        throw new Error("Valid assignment and course IDs are required");
    }

    if (typeof title !== "string" || !title.trim()) {
        throw new Error("Assignment title is required");
    }

    const dueDateObject = new Date(`${dueDate}T23:59:59.999Z`);

    if (
        typeof dueDate !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
        Number.isNaN(dueDateObject.getTime()) ||
        dueDateObject.toISOString().slice(0, 10) !== dueDate
    ) {
        throw new Error("Valid assignment due date is required");
    }

    if (
        typeof points !== "number" ||
        !Number.isFinite(points) ||
        points < 0
    ) {
        throw new Error("Valid assignment points are required");
    }

    // Convert Dummy Canvas fields to Omni-AI fields.
    return {
        source: {
            assignmentId: id,
            courseId: courseId,
        },
        task: {
            title: title.trim(),
            description: assignment.description ?? null,
            due_date: dueDateObject.toISOString(),
            point_value: points,
            estimated_effort_minutes: null,
            priority: "medium",
            completion_status: "not_started",
        },
    };
};

const convertCanvasAssignmentToUpdates = (assignment) => {
    // Reuse the existing validation and conversion logic.
    const converted = convertCanvasAssignmentToTask(assignment);

    const updates = {
        title: converted.task.title,
        due_date: converted.task.due_date,
        point_value: converted.task.point_value,
    };

    // Only update the description if Canvas supplies one.
    if (Object.prototype.hasOwnProperty.call(
        assignment, "description"
    )) {
        if (
            assignment.description !== null &&
            typeof assignment.description !== "string"
        ) {
            throw new Error("Description must be a string or null");
        }

        updates.description = assignment.description;
    }

    return {
        source: converted.source,
        updates,
    };
};

module.exports = {
    convertCanvasAssignmentToTask,
    convertCanvasAssignmentToUpdates,
};