import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";

function CalendarView({
  refreshKey = 0,
  onEditTask,
}) {
  const { user, token } = useAuth();

  const today = new Date();

  const [currentDate, setCurrentDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );

  const [tasks, setTasks] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [resolutionMessage, setResolutionMessage] =
    useState("");
  const [resolving, setResolving] =
    useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthLabel = currentDate.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  const daysInMonth = new Date(
    year,
    month + 1,
    0
  ).getDate();

  const firstDayOfMonth = new Date(
    year,
    month,
    1
  ).getDay();

  useEffect(() => {
    const loadCalendarData = async () => {
      if (!token || !user?.id) {
        setMessage("You must be logged in to view tasks.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const [tasksResponse, schedulesResponse] =
          await Promise.all([
            fetch(
              `${import.meta.env.VITE_API_URL}/tasks`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            ),

            fetch(
              `${import.meta.env.VITE_API_URL
              }/schedules?user_id=${encodeURIComponent(
                user.id
              )}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            ),
          ]);

        const tasksResult =
          await tasksResponse.json();

        const schedulesResult =
          await schedulesResponse.json();

        if (!tasksResponse.ok) {
          throw new Error(
            tasksResult.error ||
            "Could not load Calendar tasks."
          );
        }

        if (!schedulesResponse.ok) {
          throw new Error(
            schedulesResult.error ||
            "Could not load Calendar schedules."
          );
        }

        setTasks(tasksResult.data || []);
        setSchedules(schedulesResult.data || []);
        setMessage("");
      } catch (error) {
        console.error(
          "Calendar data retrieval failed:",
          error
        );

        setMessage(
          error.message ||
          "Could not connect to the backend."
        );
      } finally {
        setLoading(false);
      }
    };

    loadCalendarData();
  }, [token, user?.id, refreshKey]);

  const calendarCells = useMemo(() => {
    const cells = [];

    for (let i = 0; i < firstDayOfMonth; i += 1) {
      cells.push(null);
    }

    for (
      let day = 1;
      day <= daysInMonth;
      day += 1
    ) {
      cells.push(day);
    }

    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    return cells;
  }, [firstDayOfMonth, daysInMonth]);

  const previousMonth = () => {
    setCurrentDate(
      new Date(year, month - 1, 1)
    );
  };

  const nextMonth = () => {
    setCurrentDate(
      new Date(year, month + 1, 1)
    );
  };

  const goToToday = () => {
    setCurrentDate(
      new Date(
        today.getFullYear(),
        today.getMonth(),
        1
      )
    );
  };

  const isToday = (day) => {
    if (!day) {
      return false;
    }

    return (
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    );
  };

  const getTasksForDay = (day) => {
    if (!day) {
      return [];
    }

    return tasks.filter((task) => {
      if (!task.due_date) {
        return false;
      }

      const taskDate = new Date(task.due_date);

      return (
        taskDate.getFullYear() === year &&
        taskDate.getMonth() === month &&
        taskDate.getDate() === day
      );
    });
  };

  const getSchedulesForDay = (day) => {
    if (!day) {
      return [];
    }

    return schedules.filter((schedule) => {
      if (!schedule.start_time) {
        return false;
      }

      const scheduleDate =
        new Date(schedule.start_time);

      return (
        scheduleDate.getFullYear() === year &&
        scheduleDate.getMonth() === month &&
        scheduleDate.getDate() === day
      );
    });
  };

  const formatScheduleTime = (schedule) => {
    const start = new Date(
      schedule.start_time
    );

    const end = new Date(
      schedule.end_time
    );

    const options = {
      hour: "numeric",
      minute: "2-digit",
    };

    return `${start.toLocaleTimeString(
      [],
      options
    )} - ${end.toLocaleTimeString(
      [],
      options
    )}`;
  };

  const schedulesConflict = (
    scheduleA,
    scheduleB
  ) => {
    const startA = new Date(
      scheduleA.start_time
    );

    const endA = new Date(
      scheduleA.end_time
    );

    const startB = new Date(
      scheduleB.start_time
    );

    const endB = new Date(
      scheduleB.end_time
    );

    return (
      startA < endB &&
      startB < endA
    );
  };

  const handleResolveConflict = async () => {
    if (!user?.id) {
      setMessage(
        "You must be logged in to resolve schedule conflicts."
      );
      return;
    }

    let conflictingPair = null;

    for (
      let i = 0;
      i < schedules.length;
      i += 1
    ) {
      for (
        let j = i + 1;
        j < schedules.length;
        j += 1
      ) {
        if (
          schedulesConflict(
            schedules[i],
            schedules[j]
          )
        ) {
          conflictingPair = {
            scheduleA: schedules[i],
            scheduleB: schedules[j],
          };

          break;
        }
      }

      if (conflictingPair) {
        break;
      }
    }

    if (!conflictingPair) {
      setResolutionMessage(
        "No scheduling conflicts were found."
      );
      return;
    }

    try {
      setResolving(true);
      setResolutionMessage("");

      const response = await fetch(
        `${import.meta.env.VITE_API_URL
        }/schedules/resolve-conflict`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },

          body: JSON.stringify({
            user_id: user.id,

            schedule_a_id:
              conflictingPair.scheduleA.id,

            schedule_b_id:
              conflictingPair.scheduleB.id,

            available_minutes: 60,
            increment_minutes: 30,
          }),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
          "Could not resolve schedule conflict."
        );
      }

      const resolution =
        result.data;

      if (resolution.updatedSchedule) {
        setSchedules((currentSchedules) =>
          currentSchedules.map(
            (schedule) => {
              if (
                schedule.id ===
                resolution.updatedSchedule.id
              ) {
                return {
                  ...schedule,
                  ...resolution.updatedSchedule,
                };
              }

              return schedule;
            }
          )
        );
      }

      if (
        resolution.originalMoveTask &&
        resolution.updatedSchedule
      ) {
        const oldTime =
          formatScheduleTime(
            resolution.originalMoveTask
          );

        const newTime =
          formatScheduleTime(
            resolution.updatedSchedule
          );

        setResolutionMessage(
          `Schedule adjusted: ${resolution.originalMoveTask.title
          } moved from ${oldTime} to ${newTime}. ${resolution.reason
          }.`
        );
      } else {
        setResolutionMessage(
          "The scheduling conflict was resolved."
        );
      }

      setMessage("");
    } catch (error) {
      console.error(
        "Conflict resolution failed:",
        error
      );

      setMessage(
        error.message ||
        "Could not resolve schedule conflict."
      );
    } finally {
      setResolving(false);
    }
  };

  const getPriorityClass = (task) => {
    if (task.completion_status === "completed") {
      return "calendar-task-completed";
    }

    if (task.priority === "high") {
      return "calendar-task-high";
    }

    if (task.priority === "medium") {
      return "calendar-task-medium";
    }

    return "calendar-task-low";
  };

  return (
    <section className="calendar-page">

      <div className="calendar-view-header">

        <div>
          <h1>{monthLabel}</h1>

          <p>
            View tasks and schedule information returned
            from the backend.
          </p>
        </div>

        <div className="calendar-navigation">
          <button onClick={previousMonth}>
            Previous
          </button>

          <button onClick={goToToday}>
            Today
          </button>

          <button
            type="button"
            onClick={handleResolveConflict}
            disabled={resolving}
          >
            {resolving
              ? "Resolving..."
              : "Resolve Conflict"}
          </button>

          <button onClick={nextMonth}>
            Next
          </button>
        </div>

      </div>

      {loading && (
        <p className="calendar-status-message">
          Loading Calendar tasks...
        </p>
      )}

      {message && (
        <p className="calendar-error-message">
          {message}
        </p>
      )}
      {resolutionMessage && (
        <p className="calendar-status-message">
          {resolutionMessage}
        </p>
      )}

      <div className="full-calendar-grid">

        {[
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ].map((dayName) => (
          <div
            key={dayName}
            className="full-calendar-heading"
          >
            {dayName}
          </div>
        ))}

        {calendarCells.map((day, index) => {
          const dayTasks =
            getTasksForDay(day);

          const daySchedules =
            getSchedulesForDay(day);

          return (
            <div
              key={`${year}-${month}-${index}`}
              className={
                isToday(day)
                  ? "full-calendar-day current-day"
                  : "full-calendar-day"
              }
            >
              {day && (
                <>
                  <div className="full-calendar-date">
                    {day}
                  </div>

                  <div className="calendar-day-tasks">
                    {daySchedules.map((schedule) => {
                      const scheduledTask =
                        schedule.tasks;

                      return (
                        <button
                          type="button"
                          key={`schedule-${schedule.id}`}
                          className={`calendar-task-chip calendar-schedule-chip ${getPriorityClass(
                            scheduledTask || {}
                          )}`}
                          onClick={() => {
                            if (scheduledTask) {
                              onEditTask?.(scheduledTask);
                            }
                          }}
                          title={
                            scheduledTask
                              ? "Scheduled task - click to edit"
                              : "Scheduled time block"
                          }
                        >
                          {formatScheduleTime(schedule)}
                          {" · "}
                          {scheduledTask?.title ||
                            "Scheduled block"}
                        </button>
                      );
                    })}
                    {dayTasks.map((task) => (
                      <button
                        type="button"
                        key={task.id}
                        className={`calendar-task-chip ${getPriorityClass(
                          task
                        )}`}
                        onClick={() =>
                          onEditTask?.(task)
                        }
                        title="Click to edit task"
                      >
                        {task.title}
                      </button>
                    ))}

                  </div>
                </>
              )}
            </div>
          );
        })}

      </div>

    </section>
  );
}

export default CalendarView;