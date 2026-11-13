const {
    getActiveScheduleBlocks,
} = require("./workloadScheduleUtils");

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
    let dueWithin6HoursCount = 0;
    let dueWithin24HoursCount = 0;
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

        const hasSpecificDueTime = task.has_due_time === true;
        const millisecondsUntilDue = deadline.getTime() - now.getTime();

        const isOverdue =
            daysUntilDue < 0 ||
            (hasSpecificDueTime && millisecondsUntilDue < 0);

        if (isOverdue) {
            overdueCount++;
        } else if (daysUntilDue < 7) {
            dueSoonCount++;

            if (hasSpecificDueTime && millisecondsUntilDue >= 0) {
                const hoursUntilDue =
                    millisecondsUntilDue / (60 * 60 * 1000);

                if (hoursUntilDue <= 24) {
                    dueWithin24HoursCount++;
                }

                if (hoursUntilDue <= 6) {
                    dueWithin6HoursCount++;
                }
            }
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
        dueWithin6HoursCount,
        dueWithin24HoursCount,
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

function getNextLocalDayStart(date, timeZone) {
    const currentDay = getDayInTimeZone(date, timeZone);

    let low = date.getTime();
    let high = low + 36 * 60 * 60 * 1000;

    // Find the next midnight in the user's timezone.
    // This also accommodates daylight saving changes.
    while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);

        if (
            getDayInTimeZone(new Date(mid), timeZone) === currentDay
        ) {
            low = mid;
        } else {
            high = mid;
        }
    }

    return high;
}

function calculateOccupiedMinutes(blocks) {
    if (!blocks.length) {
        return 0;
    }

    // Sort blocks by starting time.
    const sorted = [...blocks].sort(
        (a, b) => a.startMs - b.startMs
    );

    let totalMs = 0;
    let currentStart = sorted[0].startMs;
    let currentEnd = sorted[0].endMs;

    for (let i = 1; i < sorted.length; i++) {
        const block = sorted[i];

        if (block.startMs <= currentEnd) {
            // Merge overlapping scheduled blocks.
            currentEnd = Math.max(
                currentEnd,
                block.endMs
            );
        } else {
            totalMs += currentEnd - currentStart;

            currentStart = block.startMs;
            currentEnd = block.endMs;
        }
    }

    totalMs += currentEnd - currentStart;

    return totalMs / 60000;
}

function findTimeAwareCapacityRisk(
    tasks,
    dailyLimitMinutes,
    now,
    timeZone = "UTC",
    schedules = []
) {
    const today = getDayInTimeZone(now, timeZone);

    const timedTasks = tasks
        .filter((task) => {
            if (
                !task ||
                task.completion_status === "completed" ||
                task.canvas_locked === true ||
                task.has_due_time !== true ||
                !task.due_date
            ) {
                return false;
            }

            const deadline = new Date(task.due_date);
            const effort = Number(task.estimated_effort_minutes);

            return (
                !Number.isNaN(deadline.getTime()) &&
                deadline.getTime() >= now.getTime() &&
                (getDayInTimeZone(deadline, timeZone) - today) /
                DAY_MS < 7 &&
                task.estimated_effort_minutes !== null &&
                task.estimated_effort_minutes !== undefined &&
                task.estimated_effort_minutes !== "" &&
                Number.isFinite(effort) &&
                effort >= 0
            );
        })
        .sort(
            (a, b) =>
                new Date(a.due_date) - new Date(b.due_date)
        );

    let requiredMinutes = 0;

    for (const task of timedTasks) {
        requiredMinutes += Number(
            task.estimated_effort_minutes
        );

        const deadline = new Date(task.due_date);
        let cursor = now.getTime();
        let availableMinutes = 0;

        // Identify tasks already included in the workload
        // calculation for this deadline.
        const includedTaskIds = new Set(
            timedTasks
                .filter(
                    (candidate) =>
                        new Date(candidate.due_date).getTime() <=
                        deadline.getTime()
                )
                .map((candidate) => candidate.id)
                .filter((id) => id != null)
                .map(String)
        );

        // Count available clock time separately for each
        // local calendar day, capped by the daily study limit.
        while (cursor < deadline.getTime()) {
            const nextDayStart = getNextLocalDayStart(
                new Date(cursor),
                timeZone
            );

            // Determine the end of the current day's window.
            const end = Math.min(
                nextDayStart,
                deadline.getTime()
            );

            const minutesRemaining = (end - cursor) / 60000;

            // Retrieve scheduled blocks within this window.
            const activeBlocks = getActiveScheduleBlocks(
                schedules,
                new Date(cursor),
                new Date(end)
            );

            // Avoid subtracting planned work for tasks
            // already included in requiredMinutes.
            const unrelatedBlocks = activeBlocks.filter(
                (block) =>
                    block.taskId == null ||
                    !includedTaskIds.has(String(block.taskId))
            );

            // Merge overlaps to prevent double-counting.
            const occupiedMinutes = calculateOccupiedMinutes(
                unrelatedBlocks
            );

            // Scheduled study sessions for other tasks
            // reserve part of the daily study capacity.
            const reservedStudyMinutes = calculateOccupiedMinutes(
                unrelatedBlocks.filter(
                    (block) => block.scheduleType === "study_block"
                )
            );

            // Calculate remaining clock time.
            const remainingClockMinutes = Math.max(
                0,
                minutesRemaining - occupiedMinutes
            );

            // Calculate remaining daily study capacity.
            const remainingStudyMinutes = Math.max(
                0,
                dailyLimitMinutes - reservedStudyMinutes
            );

            // Add available capacity only once.
            availableMinutes += Math.min(
                remainingClockMinutes,
                remainingStudyMinutes
            );

            cursor = end;
        }


        availableMinutes = Math.floor(availableMinutes);

        if (requiredMinutes > availableMinutes) {
            return {
                deadlineAt: deadline.toISOString(),
                requiredMinutes,
                availableMinutes,
                shortfallMinutes:
                    requiredMinutes - availableMinutes,
            };
        }
    }

    return null;
}

function generateWorkloadRecommendations(
    tasks,
    dailyLimitMinutes = 240,
    now = new Date(),
    timeZone = "UTC",
    schedules = []
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


    // Sprint 4: Warn about approaching exact deadlines.
    if (analysis.dueWithin6HoursCount > 0) {
        warnings.push({
            type: "deadline_6_hours",
            message:
                `${analysis.dueWithin6HoursCount} task(s) ` +
                `are due within the next 6 hours. ` +
                `Consider prioritizing these tasks.`,
        });
    }

    // Exclude tasks already covered by the 6-hour warning.
    const dueBetween6And24Hours =
        analysis.dueWithin24HoursCount -
        analysis.dueWithin6HoursCount;

    if (dueBetween6And24Hours > 0) {
        warnings.push({
            type: "deadline_24_hours",
            message:
                `${dueBetween6And24Hours} task(s) ` +
                `are due in the next 6 to 24 hours. ` +
                `Review your available study time.`,
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

    const timeAwareCapacityRisk = findTimeAwareCapacityRisk(
        tasks,
        dailyLimitMinutes,
        now,
        timeZone,
        schedules
    );

    if (timeAwareCapacityRisk) {
        warnings.push({
            type: "deadline_time_capacity",
            message:
                `You have ${timeAwareCapacityRisk.requiredMinutes} ` +
                `minutes of work due by ` +
                `${new Intl.DateTimeFormat("en-US", {
                    timeZone,
                    dateStyle: "medium",
                    timeStyle: "short",
                }).format(new Date(timeAwareCapacityRisk.deadlineAt))}, ` +
                `but at most ` +
                `${timeAwareCapacityRisk.availableMinutes} minutes ` +
                `of study capacity remain. ` +
                `Short by ${timeAwareCapacityRisk.shortfallMinutes} minutes.`,
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
        timeAwareCapacityRisk,
        recommendedTasks,
    };
}


module.exports = {
    analyzeWorkload,
    generateWorkloadRecommendations,
};