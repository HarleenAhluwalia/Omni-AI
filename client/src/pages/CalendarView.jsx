import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";

function CalendarView({
  refreshKey = 0,
  onEditTask,
}) {
  const { token } = useAuth();

  const today = new Date();

  const [currentDate, setCurrentDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

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
    const loadCalendarTasks = async () => {
      if (!token) {
        setMessage("You must be logged in to view tasks.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/tasks`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error || "Could not load Calendar tasks."
          );
        }

        setTasks(result.data || []);
        setMessage("");
      } catch (error) {
        console.error(
          "Calendar task retrieval failed:",
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

    loadCalendarTasks();
  }, [token, refreshKey]);

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