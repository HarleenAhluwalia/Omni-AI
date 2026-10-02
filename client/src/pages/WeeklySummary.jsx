import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

// Parses the backend's "YYYY-MM-DD" (its own UTC calendar date) as a UTC
// date and formats it for display in UTC - same approach as DailySummary -
// so the displayed day can never drift from the day the backend used.
const formatWeekDate = (dateString) => {
  if (!dateString) {
    return "";
  }

  const [year, month, day] = dateString.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }
  );
};

const formatDueDate = (dueDate) => {
  if (!dueDate) {
    return "No due date";
  }

  return new Date(dueDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

const formatMinutes = (minutes) => {
  if (!minutes) {
    return "0 min";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  return remaining === 0 ? `${hours}h` : `${hours}h ${remaining}m`;
};

const getPriorityRowClass = (task) => {
  if (task.completion_status === "completed") {
    return "daily-summary-row-completed";
  }

  if (task.priority === "high") {
    return "daily-summary-row-high";
  }

  if (task.priority === "medium") {
    return "daily-summary-row-medium";
  }

  if (task.priority === "low") {
    return "daily-summary-row-low";
  }

  return "";
};

function WeeklySummary({ onEditTask, refreshKey = 0 }) {
  const { token } = useAuth();

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const loadSummary = async () => {
      if (!token) {
        setMessage("You must be logged in to view your weekly summary.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/tasks/summary/weekly`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error || "Could not load weekly summary."
          );
        }

        setSummary(result.data);
        setMessage("");
      } catch (error) {
        console.error("Weekly summary load failed:", error);

        setMessage(
          error.message || "Could not load weekly summary."
        );
      } finally {
        setLoading(false);
      }
    };

    loadSummary();
  }, [token, refreshKey]);

  const renderTaskRow = (task) => (
    <div
      key={task.id}
      className={`daily-summary-task-row ${getPriorityRowClass(task)}`}
      onClick={() => onEditTask?.(task)}
      role={onEditTask ? "button" : undefined}
      tabIndex={onEditTask ? 0 : undefined}
    >
      <div className="daily-summary-task-main">
        <span className="daily-summary-task-title">
          {task.title}
        </span>

        <span className="daily-summary-task-meta">
          {formatDueDate(task.due_date)}
          {task.estimated_effort_minutes != null &&
            ` · ${task.estimated_effort_minutes} min`}
          {task.point_value != null &&
            ` · ${task.point_value} pts`}
        </span>
      </div>

      {task.priority && (
        <span className="daily-summary-task-priority">
          {task.priority}
        </span>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="summary-card daily-summary-card">
        <h3>Weekly Summary</h3>
        <p className="daily-summary-status">Loading...</p>
      </div>
    );
  }

  if (message) {
    return (
      <div className="summary-card daily-summary-card">
        <h3>Weekly Summary</h3>
        <p className="daily-summary-status daily-summary-status--error">
          {message}
        </p>
      </div>
    );
  }

  const { counts, workload, completionPercentage } = summary;

  return (
    <div className="summary-card daily-summary-card">
      <div className="daily-summary-header">
        <h3>Weekly Summary</h3>
        <span className="daily-summary-date">
          {formatWeekDate(summary.week.start)} – {formatWeekDate(summary.week.end)}
        </span>
      </div>

      <div className="daily-summary-stats">
        <div className="daily-summary-stat">
          <span className="daily-summary-stat-value">
            {counts.total}
          </span>
          <span className="daily-summary-stat-label">
            Total
          </span>
        </div>

        <div className="daily-summary-stat">
          <span className="daily-summary-stat-value">
            {counts.completed}
          </span>
          <span className="daily-summary-stat-label">
            Completed
          </span>
        </div>

        <div className="daily-summary-stat">
          <span className="daily-summary-stat-value">
            {counts.remaining}
          </span>
          <span className="daily-summary-stat-label">
            Remaining
          </span>
        </div>

        <div className="daily-summary-stat daily-summary-stat--overdue">
          <span className="daily-summary-stat-value">
            {counts.overdue}
          </span>
          <span className="daily-summary-stat-label">
            Overdue
          </span>
        </div>
      </div>

      <div className="daily-summary-progress">
        <div className="daily-summary-progress-track">
          <div
            className="daily-summary-progress-fill"
            style={{ width: `${completionPercentage}%` }}
          />
        </div>
        <span className="daily-summary-progress-label">
          {completionPercentage}% complete
        </span>
      </div>

      <div className="daily-summary-section">
        <h4>Workload</h4>
        <p className="daily-summary-workload-row">
          {formatMinutes(workload.remainingEffortMinutes)} remaining
          {" "}of {formatMinutes(workload.totalEffortMinutes)} total
        </p>
        <p className="daily-summary-workload-row">
          {workload.remainingPoints} points remaining of{" "}
          {workload.totalPoints} total
        </p>
      </div>

      <div className="daily-summary-section">
        <h4>This Week</h4>

        {summary.tasks.length === 0 ? (
          <p className="daily-summary-empty">
            No tasks due this week.
          </p>
        ) : (
          summary.tasks.map(renderTaskRow)
        )}
      </div>

      <div className="daily-summary-section">
        <h4>Overdue</h4>

        {summary.overdue.length === 0 ? (
          <p className="daily-summary-empty">
            No overdue tasks.
          </p>
        ) : (
          summary.overdue.map(renderTaskRow)
        )}
      </div>
    </div>
  );
}

export default WeeklySummary;
