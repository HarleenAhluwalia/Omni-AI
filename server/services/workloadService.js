
const DAY_MS = 24 * 60 * 60 * 1000;

function getDayInTimeZone(date, timeZone = "UTC") {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });

    const parts = formatter.formatToParts(date);

    const values = Object.fromEntries(
        parts.map((part) => [part.type, part.value])
    );

    return Date.UTC(
        Number(values.year),
        Number(values.month) - 1,
        Number(values.day)
    );
}

const {
    calculateTaskPriority,
} = require("./priorityService");

// Analyze the user's workload for the next 7 days.
function analyzeWorkload(
    tasks,
    dailyLimitMinutes = 240,
    now = new Date(),
    timeZone = "UTC"
) {
    if (!Array.isArray(tasks)) {
        throw new TypeError("tasks must be an array");
    }

    if (
        !Number.isFinite(dailyLimitMinutes) ||
        dailyLimitMinutes <= 0
    ) {
        throw new RangeError("dailyLimitMinutes must be positive");
    }

    const today = getDayInTimeZone(now, timeZone);

    const activeTasks = tasks.filter(
        (task) =>
            task &&
            task.completion_status !== "completed" &&
            task.canvas_locked !== true
    );

    let requiredMinutes = 0;
    let overdueCount = 0;
    let dueSoonCount = 0;
    let missingEstimateCount = 0;
    let undatedCount = 0;

    for (const task of activeTasks) {
        const effort = Number(task.estimated_effort_minutes);

        const hasEstimate =
            task.estimated_effort_minutes !== null &&
            task.estimated_effort_minutes !== undefined &&
            Number.isFinite(effort) &&
            effort >= 0;

        if (!hasEstimate) {
            missingEstimateCount++;
        }

        const deadline = task.due_date
            ? new Date(task.due_date)
            : null;

        if (!deadline || Number.isNaN(deadline.getTime())) {
            undatedCount++;
            continue;
        }

        const dueDay = getDayInTimeZone(deadline, timeZone);

        const daysUntilDue = (dueDay - today) / DAY_MS;

        if (daysUntilDue < 0) {
            overdueCount++;
        } else if (daysUntilDue < 7) {
            dueSoonCount++;
        }

        // Include overdue and next-7-day tasks.
        if (daysUntilDue < 7 && hasEstimate) {
            requiredMinutes += effort;
        }
    }

    const availableMinutes = dailyLimitMinutes * 7;

    const overloadMinutes = Math.max(
        0,
        requiredMinutes - availableMinutes
    );

    return {
        activeTaskCount: activeTasks.length,
        overdueCount,
        dueSoonCount,
        missingEstimateCount,
        undatedCount,
        requiredMinutes,
        availableMinutes,
        overloadMinutes,
        isOverloaded: overloadMinutes > 0,
    };
}

function findDeadlineCapacityRisk(
    tasks,
    dailyLimitMinutes,
    now,
    timeZone = "UTC"
) {

    const today = getDayInTimeZone(now, timeZone);

    const effortByDay = Array(7).fill(0);

    for (const task of tasks) {
        if (
            !task ||
            task.completion_status === "completed" ||
            task.canvas_locked === true ||
            !task.due_date
        ) {
            continue;
        }

        const rawEffort = task.estimated_effort_minutes;
        const effort = Number(rawEffort);

        if (
            rawEffort === null ||
            rawEffort === undefined ||
            rawEffort === "" ||
            !Number.isFinite(effort) ||
            effort < 0
        ) {
            continue;
        }

        const deadline = new Date(task.due_date);

        if (Number.isNaN(deadline.getTime())) {
            continue;
        }

        const dueDay = getDayInTimeZone(deadline, timeZone);

        const daysUntilDue = (dueDay - today) / DAY_MS;

        if (daysUntilDue >= 7) {
            continue;
        }

        // Overdue work is treated as immediately outstanding.
        const dayIndex = Math.max(0, daysUntilDue);
        effortByDay[dayIndex] += effort;
    }

    let cumulativeEffort = 0;

    for (let day = 0; day < 7; day++) {
        cumulativeEffort += effortByDay[day];

        const capacity = dailyLimitMinutes * (day + 1);

        if (cumulativeEffort > capacity) {
            return {
                deadlineDate: new Date(today + day * DAY_MS)
                    .toISOString()
                    .slice(0, 10),
                requiredMinutes: cumulativeEffort,
                availableMinutes: capacity,
                shortfallMinutes: cumulativeEffort - capacity,
            };
        }
    }

    return null;
}

function generateWorkloadRecommendations(
    tasks,
    dailyLimitMinutes = 240,
    now = new Date(),
    timeZone = "UTC"
) {
    const analysis = analyzeWorkload(
        tasks,
        dailyLimitMinutes,
        now,
        timeZone
    );

    const warnings = [];

    if (analysis.isOverloaded) {
        warnings.push({
            type: "overload",
            message:
                `Your estimated workload exceeds your ` +
                `7-day study capacity by ` +
                `${analysis.overloadMinutes} minutes.`,
        });
    }

    if (analysis.overdueCount > 0) {
        warnings.push({
            type: "overdue",
            message:
                `You have ${analysis.overdueCount} ` +
                `overdue assignment(s).`,
        });
    }

    if (analysis.missingEstimateCount > 0) {
        warnings.push({
            type: "missing_estimates",
            message:
                `${analysis.missingEstimateCount} active task(s) ` +
                `have no effort estimate. Your workload ` +
                `prediction may be too low.`,
        });
    }

    const deadlineCapacityRisk = findDeadlineCapacityRisk(
        tasks,
        dailyLimitMinutes,
        now,
        timeZone
    );

    if (deadlineCapacityRisk) {
        warnings.push({
            type: "deadline_capacity",
            message:
                `By ${deadlineCapacityRisk.deadlineDate}, ` +
                `you have ${deadlineCapacityRisk.requiredMinutes} ` +
                `minutes of work due, but only ` +
                `${deadlineCapacityRisk.availableMinutes} minutes ` +
                `of configured study capacity. ` +
                `Short by ${deadlineCapacityRisk.shortfallMinutes} minutes.`,
        });
    }

    const today = getDayInTimeZone(now, timeZone);

    const endOfWindow = today + 7 * DAY_MS;

    const recommendedTasks = tasks
        .filter((task) => {
            if (
                !task ||
                task.completion_status === "completed" ||
                task.canvas_locked === true ||
                !task.due_date
            ) {
                return false;
            }

            const deadline = new Date(task.due_date);

            return (
                !Number.isNaN(deadline.getTime()) &&
                getDayInTimeZone(deadline, timeZone) < endOfWindow
            );
        })
        .map((task) => ({
            id: task.id,
            title: task.title,
            due_date: task.due_date,
            priority: task.priority,
            calculated_priority_score:
                calculateTaskPriority(
                    task,
                    dailyLimitMinutes
                ).score,
        }))
        .sort(
            (a, b) =>
                b.calculated_priority_score -
                a.calculated_priority_score ||
                new Date(a.due_date) - new Date(b.due_date)
        )
        .slice(0, 3);

    return {
        ...analysis,
        warnings,
        deadlineCapacityRisk,
        recommendedTasks,
    };
}


module.exports = {
    analyzeWorkload,
    generateWorkloadRecommendations,
};