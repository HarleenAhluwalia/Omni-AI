
function getActiveScheduleBlocks(
  schedules,
  windowStart,
  windowEnd
) {
  if (!Array.isArray(schedules)) {
    throw new TypeError("schedules must be an array");
  }

  const start = new Date(windowStart).getTime();
  const end = new Date(windowEnd).getTime();

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end < start
  ) {
    throw new RangeError("Invalid prediction window");
  }

  return schedules
    .flatMap((schedule) => {
      // Ignore schedules that are not active.
      if (!schedule || schedule.status !== "scheduled") {
        return [];
      }

      const blockStart = new Date(schedule.start_time).getTime();
      const blockEnd = new Date(schedule.end_time).getTime();

      if (
        !Number.isFinite(blockStart) ||
        !Number.isFinite(blockEnd) ||
        blockEnd <= blockStart
      ) {
        return [];
      }

      // Include only the part inside the prediction window.
      const clippedStart = Math.max(start, blockStart);
      const clippedEnd = Math.min(end, blockEnd);

      if (clippedEnd <= clippedStart) {
        return [];
      }

      return [{
        taskId: schedule.task_id ?? null,
        scheduleType: schedule.schedule_type ?? null,
        startMs: clippedStart,
        endMs: clippedEnd,
      }];
    })
    .sort((a, b) => a.startMs - b.startMs);
}

module.exports = {
  getActiveScheduleBlocks,
};
