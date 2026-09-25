import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import "./PrioritizedTodo.css";

const TEST_USER_ID = import.meta.env.VITE_TEST_USER_ID;

function PrioritizedTodo({ refreshKey = 0, onEditTask }) {
  const { user } = useAuth();

  const userId = user?.id || TEST_USER_ID;

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const loadPrioritizedTasks = async () => {
      if (!userId) {
        setMessage("No authenticated user is available.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/tasks/prioritized?user_id=${encodeURIComponent(
            userId
          )}`
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error || "Could not load prioritized tasks."
          );
        }

        setTasks(result.data || []);
        setMessage("");
      } catch (error) {
        console.error("Prioritized task load failed:", error);

        setMessage(
          error.message || "Could not connect to the backend."
        );
      } finally {
        setLoading(false);
      }
    };

    loadPrioritizedTasks();
  }, [userId, refreshKey]);

  const getPriorityClass = (priority) => {
    if (priority === "high") {
      return "todo-high";
    }

    if (priority === "medium") {
      return "todo-medium";
    }

    if (priority === "low") {
      return "todo-low";
    }

    return "";
  };

  const formatPriority = (priority) => {
    if (!priority) {
      return "Not set";
    }

    return (
      priority.charAt(0).toUpperCase() +
      priority.slice(1)
    );
  };

  const formatDueDate = (dueDate) => {
    if (!dueDate) {
      return "No due date";
    }

    return new Date(dueDate).toLocaleDateString(
      "en-US",
      {
        month: "short",
        day: "numeric",
      }
    );
  };

  if (loading) {
    return (
      <div className="prioritized-page">
        <div className="prioritized-card">
          <p className="todo-loading">
            Loading prioritized tasks...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="prioritized-page">
      <div className="prioritized-card">

        <div className="prioritized-header">
          <h1>To-Do List</h1>
        </div>

        {message && (
          <div className="todo-error-message">
            {message}
          </div>
        )}

        <div className="todo-table-wrapper">
          <div className="todo-table-header">
            <div>Name</div>
            <div>Due</div>
            <div>Score</div>
            <div>Priority</div>
            <div className="todo-status-header">
              Status
            </div>
            <div aria-hidden="true"></div>
          </div>

          {tasks.length === 0 ? (
            <div className="todo-empty-state">
              No tasks available.
            </div>
          ) : (
            tasks.map((task) => {
              const priorityClass =
                getPriorityClass(task.priority);

              return (
                <div
                  className="todo-table-row"
                  key={task.id}
                >
                  <div
                    className={`todo-task-name ${priorityClass}`}
                  >
                    {task.title}
                  </div>

                  <div className={priorityClass}>
                    {formatDueDate(task.due_date)}
                  </div>

                  <div className={priorityClass}>
                    {task.point_value != null
                      ? `${task.point_value} points`
                      : "—"}
                  </div>

                  <div className={priorityClass}>
                    {formatPriority(task.priority)}
                  </div>

                  <div className="todo-status-cell">
                    <input
                      type="checkbox"
                      checked={
                        task.completion_status ===
                        "completed"
                      }
                      readOnly
                      aria-label={`Completion status for ${task.title}`}
                    />
                  </div>

                  <div className="todo-actions-cell">
                    <button
                      type="button"
                      className="todo-edit-button"
                      onClick={() => onEditTask?.(task)}
                      aria-label={`Edit ${task.title}`}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>
    </div>
  );
}

export default PrioritizedTodo;