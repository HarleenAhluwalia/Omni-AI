
const {
  getActiveScheduleBlocks,
} = require("../services/workloadScheduleUtils");

describe("Workload Scheduling Integration", () => {
  const start = "2026-11-12T12:00:00Z";
  const end = "2026-11-12T18:00:00Z";

  test("identifies active scheduled study blocks", () => {
    const schedules = [{
      task_id: "task-1",
      start_time: "2026-11-12T14:00:00Z",
      end_time: "2026-11-12T15:00:00Z",
      schedule_type: "study_block",
      status: "scheduled",
    }];

    const result = getActiveScheduleBlocks(
      schedules, start, end
    );

    expect(result).toHaveLength(1);
    expect(result[0].taskId).toBe("task-1");
    expect(result[0].endMs - result[0].startMs)
      .toBe(60 * 60 * 1000);
  });

  test("ignores cancelled and expired blocks", () => {
    const schedules = [
      {
        start_time: "2026-11-12T14:00:00Z",
        end_time: "2026-11-12T15:00:00Z",
        status: "cancelled",
      },
      {
        start_time: "2026-11-12T08:00:00Z",
        end_time: "2026-11-12T09:00:00Z",
        status: "scheduled",
      },
    ];

    expect(
      getActiveScheduleBlocks(schedules, start, end)
    ).toHaveLength(0);
  });

  test("clips blocks to the prediction window", () => {
    const schedules = [{
      start_time: "2026-11-12T11:00:00Z",
      end_time: "2026-11-12T13:00:00Z",
      status: "scheduled",
    }];

    const result = getActiveScheduleBlocks(
      schedules, start, end
    );

    expect(result[0].startMs)
      .toBe(new Date(start).getTime());

    expect(result[0].endMs - result[0].startMs)
      .toBe(60 * 60 * 1000);
  });

  test("ignores invalid scheduling intervals", () => {
    const schedules = [{
      start_time: "invalid-date",
      end_time: "2026-11-12T15:00:00Z",
      status: "scheduled",
    }];

    expect(
      getActiveScheduleBlocks(schedules, start, end)
    ).toHaveLength(0);
  });
});
