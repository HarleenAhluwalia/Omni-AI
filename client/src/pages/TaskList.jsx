import { useEffect, useState } from "react";
import EditTask from "./EditTask";
import { useAuth } from "../context/AuthContext";

const TEST_USER_ID = import.meta.env.VITE_TEST_USER_ID;

function TaskList({
  tasks,
  setTasks,
  onEditTask,
}) {
  const { user } = useAuth();
  const userId = user?.id || TEST_USER_ID;

  const [editingTask, setEditingTask] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTasks = async () => {
      if (!userId) {
        setMessage(
          "No authenticated or development user ID is available."
        );
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/tasks?user_id=${encodeURIComponent(
            userId
          )}`
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error || "Could not load tasks."
          );
        }

        setTasks(result.data || []);
        setMessage("");
      } catch (error) {
        console.error("Load Tasks failed:", error);

        setMessage(
          error.message || "Could not load tasks."
        );
      } finally {
        setLoading(false);
      }
    };

    loadTasks();
  }, [userId, setTasks]);

  const handleDelete = async (taskId) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/tasks/${taskId}?user_id=${encodeURIComponent(
          userId
        )}`,
        {
          method: "DELETE",
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Could not delete task."
        );
      }

      setTasks((currentTasks) =>
        currentTasks.filter(
          (task) => task.id !== taskId
        )
      );

      setMessage("Task deleted successfully.");
    } catch (error) {
      console.error("Delete Task failed:", error);

      setMessage(
        error.message || "Could not delete task."
      );
    }
  };

  const handleComplete = async (task) => {
    try {
      const newStatus =
        task.completion_status === "completed"
          ? "not_started"
          : "completed";

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/tasks/${task.id}?user_id=${encodeURIComponent(
          userId
        )}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            completion_status: newStatus,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Could not update task."
        );
      }

      setTasks((currentTasks) =>
        currentTasks.map((currentTask) =>
          currentTask.id === result.data.id
            ? result.data
            : currentTask
        )
      );

      setMessage(
        newStatus === "completed"
          ? "Task marked complete."
          : "Task marked incomplete."
      );
    } catch (error) {
      console.error("Complete Task failed:", error);

      setMessage(
        error.message || "Could not update task."
      );
    }
  };

  const handleUpdated = (updatedTask) => {
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === updatedTask.id
          ? updatedTask
          : task
      )
    );

    setEditingTask(null);
    setMessage("Task updated successfully.");
  };

  const handleEditClick = (task) => {
    if (onEditTask) {
      onEditTask(task);
      return;
    }

    setEditingTask(task);
  };

  if (loading) {
    return <p>Loading tasks...</p>;
  }

  return (
    <div className="task-list">

      {message && (
        <p className="task-list-message">
          {message}
        </p>
      )}

      {tasks.length === 0 && (
        <p>No tasks available.</p>
      )}

      {tasks.map((task) => (
        <div
          key={task.id}
          className={
            task.completion_status === "completed"
              ? "task-item completed"
              : `task-item task-priority-${task.priority || "low"}`
          }
        >
          <div className="task-item-main">

            <div>
              <h3>{task.title}</h3>

              {task.description && (
                <p>{task.description}</p>
              )}

              <div className="task-meta">
                <span>
                  Due:{" "}
                  {task.due_date
                    ? new Date(
                        task.due_date
                      ).toLocaleDateString()
                    : "No deadline"}
                </span>

                <span>
                  Points:{" "}
                  {task.point_value ?? "Not set"}
                </span>

                <span>
                  Priority:{" "}
                  {task.priority || "Not set"}
                </span>
              </div>
            </div>

            <div className="task-actions">

              <button
                type="button"
                className="task-edit-ghost-button"
                onClick={() =>
                  handleEditClick(task)
                }
              >
                Edit
              </button>

              <button
                type="button"
                className="task-complete-button"
                onClick={() =>
                  handleComplete(task)
                }
              >
                {task.completion_status ===
                "completed"
                  ? "Undo"
                  : "Complete"}
              </button>

              <button
                type="button"
                className="task-delete-button"
                onClick={() =>
                  handleDelete(task.id)
                }
              >
                Delete
              </button>

            </div>

          </div>
        </div>
      ))}

      {!onEditTask && editingTask && (
        <EditTask
          task={editingTask}
          onUpdated={handleUpdated}
          onCancel={() =>
            setEditingTask(null)
          }
        />
      )}

    </div>
  );
}

export default TaskList;