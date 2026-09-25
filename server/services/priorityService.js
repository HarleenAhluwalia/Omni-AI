// the closer a task is to its due_date, the more priority points it gets
const getDeadlineScore = (dueDate) => {
    if (!dueDate) {
        return 0;
    }

    const now = new Date();
    const deadline = new Date(dueDate);

    const differenceMs = deadline.getTime() - now.getTime();

    const daysRemaining = Math.ceil(
        differenceMs / (1000 * 60 * 60 * 24)
    );

    if (daysRemaining <= 0) {
        return 35;
    }

    if (daysRemaining <= 2) {
        return 30;
    }

    if (daysRemaining <= 7) {
        return 20;
    }

    if (daysRemaining <= 14) {
        return 10;
    }

    return 5;
};

const getUserPriorityScore = (priority) => {
    switch (priority) {
        case "high":
            return 25;

        case "medium":
            return 15;

        case "low":
            return 5;

        default:
            return 0;
    }
};

// gives more weight to tasks worth more points
const getPointValueScore = (pointValue) => {
    const points = Number(pointValue);

    if (!Number.isFinite(points) || points <= 0) {
        return 0;
    }

    if (points >= 50) {
        return 20;
    }

    if (points >= 25) {
        return 15;
    }

    if (points >= 10) {
        return 10;
    }

    return 5;
};

// covers estimated effort and available time
const getAvailableTimeScore = (
    estimatedEffortMinutes,
    availableMinutes
) => {
    const effort = Number(estimatedEffortMinutes);
    const available = Number(availableMinutes);

    if (
        !Number.isFinite(effort) ||
        !Number.isFinite(available) ||
        effort <= 0 ||
        available < 0
    ) {
        return 0;
    }

    if (effort <= available) {
        return 20;
    }

    if (effort <= available * 1.5) {
        return 10;
    }

    return 2;
};

const calculateTaskPriority = (
    task,
    availableMinutes
) => {
    const deadlineScore = getDeadlineScore(task.due_date);

    const userPriorityScore =
        getUserPriorityScore(task.priority);

    const pointValueScore =
        getPointValueScore(task.point_value);

    const availableTimeScore =
        getAvailableTimeScore(
            task.estimated_effort_minutes,
            availableMinutes
        );

    const totalScore =
        deadlineScore +
        userPriorityScore +
        pointValueScore +
        availableTimeScore;

    return {
        score: totalScore,

        breakdown: {
            deadline: deadlineScore,
            userPriority: userPriorityScore,
            pointValue: pointValueScore,
            availableTime: availableTimeScore,
        },
    };
};

module.exports = {
    calculateTaskPriority,
};