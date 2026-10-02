import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

// Parses the backend's "YYYY-MM-DD" (its own UTC calendar date) as a UTC
// date and formats it for display in UTC, so the displayed day can never
// drift from the day the backend actually classified tasks against.
const formatSummaryDate = (dateString) => {
  if (!dateString) {
    return "";
  }

  const [year, month, day] = dateString.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(
    "en-US",
    {
      weekday: "long",
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

const getPriorityRowClass = (task) => {
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

function DailySummary({ onEditTask, refreshKey = 0 }) {
  const { token } = useAuth();

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const loadSummary = async () => {
      if (!token) {
        setMessage("You must be logged in to view your daily summary.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/tasks/summary/daily`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error || "Could not load daily summary."
          );
        }

        setSummary(result.data);
        setMessage("");
      } catch (error) {
        console.error("Daily summary load failed:", error);

        setMessage(
          error.message || "Could not load daily summary."
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
        <h3>Daily Summary</h3>
        <p className="daily-summary-status">Loading...</p>
      </div>
    );
  }

  if (message) {
    return (
      <div className="summary-card daily-summary-card">
        <h3>Daily Summary</h3>
        <p className="daily-summary-status daily-summary-status--error">
          {message}
        </p>
      </div>
    );
  }

  return (
    <div className="summary-card daily-summary-card">
      <div className="daily-summary-header">
        <h3>Daily Summary</h3>
        <span className="daily-summary-date">
          {formatSummaryDate(summary.date)}
        </span>
      </div>

      <div className="daily-summary-stats">
        <div className="daily-summary-stat">
          <span className="daily-summary-stat-value">
            {summary.counts.dueToday}
          </span>
          <span className="daily-summary-stat-label">
            Due Today
          </span>
        </div>

        <div className="daily-summary-stat daily-summary-stat--overdue">
          <span className="daily-summary-stat-value">
            {summary.counts.overdue}
          </span>
          <span className="daily-summary-stat-label">
            Overdue
          </span>
        </div>

        <div className="daily-summary-stat">
          <span className="daily-summary-stat-value">
            {summary.counts.completed}
          </span>
          <span className="daily-summary-stat-label">
            Completed
          </span>
        </div>

        <div className="daily-summary-stat">
          <span className="daily-summary-stat-value">
            {summary.counts.highPriority}
          </span>
          <span className="daily-summary-stat-label">
            High Priority
          </span>
        </div>
      </div>

      <div className="daily-summary-section">
        <h4>Due Today</h4>

        {summary.dueToday.length === 0 ? (
          <p className="daily-summary-empty">
            Nothing due today.
          </p>
        ) : (
          summary.dueToday.map(renderTaskRow)
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

export default DailySummary;
