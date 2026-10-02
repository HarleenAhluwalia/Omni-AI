const {
    calculateTaskPriority,
} = require("./priorityService");

/**
 * Determines whether two scheduled tasks overlap.
 *
 * A conflict occurs when:
 * taskA starts before taskB ends
 * AND
 * taskB starts before taskA ends.
 */
function hasConflict(taskA, taskB) {
    if (
        !taskA.start_time ||
        !taskA.end_time ||
        !taskB.start_time ||
        !taskB.end_time
    ) {
        return false;
    }

    const startA = new Date(taskA.start_time);
    const endA = new Date(taskA.end_time);

    const startB = new Date(taskB.start_time);
    const endB = new Date(taskB.end_time);

    return startA < endB && startB < endA;
}

/**
 * Finds every scheduling conflict among a list of tasks.
 */
function detectConflicts(tasks) {
    const conflicts = [];

    for (let i = 0; i < tasks.length; i++) {
        for (let j = i + 1; j < tasks.length; j++) {
            const taskA = tasks[i];
            const taskB = tasks[j];

            if (hasConflict(taskA, taskB)) {
                conflicts.push({
                    taskA,
                    taskB,
                });
            }
        }
    }

    return conflicts;
}

/**
 * Determines which task should keep its scheduled time
 * and which task should be moved.
 *
 * The task with the higher calculated priority score stays.
 */
function resolveConflict(
    taskA,
    taskB,
    availableMinutes = 60
) {
    if (!hasConflict(taskA, taskB)) {
        return {
            conflict: false,
            keepTask: null,
            moveTask: null,
            reason: "Tasks do not conflict",
        };
    }

    const priorityA = calculateTaskPriority(
        taskA,
        availableMinutes
    );

    const priorityB = calculateTaskPriority(
        taskB,
        availableMinutes
    );

    if (priorityA.score >= priorityB.score) {
        return {
            conflict: true,
            keepTask: taskA,
            moveTask: taskB,
            keepTaskScore: priorityA.score,
            moveTaskScore: priorityB.score,
            reason: `${taskA.title} has equal or higher priority`,
        };
    }

    return {
        conflict: true,
        keepTask: taskB,
        moveTask: taskA,
        keepTaskScore: priorityB.score,
        moveTaskScore: priorityA.score,
        reason: `${taskB.title} has higher priority`,
    };
}

/**
 * Finds the next available time slot for a task after a given time.
 *
 * It keeps the same task duration and moves the task forward
 * until it no longer conflicts with any scheduled task.
 */
function findNextAvailableSlot(
    task,
    scheduledTasks,
    searchStartTime = null,
    incrementMinutes = 30
) {
    const originalStart = new Date(task.start_time);
    const originalEnd = new Date(task.end_time);

    const durationMs =
        originalEnd.getTime() - originalStart.getTime();

    let candidateStart = searchStartTime
        ? new Date(searchStartTime)
        : new Date(originalStart);

    const incrementMs =
        incrementMinutes * 60 * 1000;

    // Prevent an infinite loop.
    const maxAttempts = 100;

    for (let i = 0; i < maxAttempts; i++) {
        const candidateEnd = new Date(
            candidateStart.getTime() + durationMs
        );

        const candidateTask = {
            ...task,
            start_time: candidateStart.toISOString(),
            end_time: candidateEnd.toISOString(),
        };

        const conflictExists = scheduledTasks.some(
            (scheduledTask) =>
                scheduledTask.id !== task.id &&
                hasConflict(candidateTask, scheduledTask)
        );

        if (!conflictExists) {
            return candidateTask;
        }

        candidateStart = new Date(
            candidateStart.getTime() + incrementMs
        );
    }

    return null;
}

/**
 * Detects and resolves a conflict between two tasks.
 *
 * The higher-priority task keeps its time.
 * The lower-priority task is moved to the next available slot.
 */
function resolveAndReschedule(
    taskA,
    taskB,
    scheduledTasks,
    availableMinutes = 60,
    incrementMinutes = 30
) {
    const resolution = resolveConflict(
        taskA,
        taskB,
        availableMinutes
    );

    if (!resolution.conflict) {
        return {
            conflict: false,
            keepTask: null,
            originalMoveTask: null,
            rescheduledTask: null,
            reason: "Tasks do not conflict",
        };
    }

    const searchStartTime = resolution.keepTask.end_time;

    const rescheduledTask = findNextAvailableSlot(
        resolution.moveTask,
        scheduledTasks,
        searchStartTime,
        incrementMinutes
    );

    if (!rescheduledTask) {
        return {
            conflict: true,
            keepTask: resolution.keepTask,
            originalMoveTask: resolution.moveTask,
            rescheduledTask: null,
            reason: "No available time slot found",
        };
    }

    return {
        conflict: true,
        keepTask: resolution.keepTask,
        originalMoveTask: resolution.moveTask,
        rescheduledTask,
        keepTaskScore: resolution.keepTaskScore,
        moveTaskScore: resolution.moveTaskScore,
        reason: resolution.reason,
    };
}

module.exports = {
    hasConflict,
    detectConflicts,
    resolveConflict,
    findNextAvailableSlot,
    resolveAndReschedule,
};