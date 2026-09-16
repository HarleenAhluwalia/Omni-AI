import { useEffect, useState } from "react";
import EditTask from "./EditTask";

const TEST_USER_ID = import.meta.env.VITE_TEST_USER_ID;

function TaskList({ tasks, setTasks }) {
  const [editingTask, setEditingTask] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTasks = async () => {
      if (!TEST_USER_ID) {
        setMessage("Development user ID is not configured.");
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/tasks?user_id=${encodeURIComponent(TEST_USER_ID)}`
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Could not load tasks.");
        }

        setTasks(result.data || []);
        setMessage("");
      } catch (error) {
        console.error("Load Tasks failed:", error);
        // Leave the last known state rather than injecting fake state.
        setMessage(error.message || "Could not load tasks.");
      } finally {
        setLoading(false);
      }
    };

    loadTasks();
  }, [setTasks]);

  const handleDelete = async (taskId) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/tasks/${taskId}?user_id=${encodeURIComponent(TEST_USER_ID)}`,
        { method: "DELETE" }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not delete task.");
      }

      setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));
      setMessage("Task deleted successfully.");
    } catch (error) {
      console.error("Delete Task failed:", error);
      setMessage(error.message || "Could not delete the task.");
    }
  };

  const handleComplete = async (task) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/tasks/${task.id}?user_id=${encodeURIComponent(TEST_USER_ID)}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ completion_status: "completed" }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not complete task.");
      }

      setTasks((currentTasks) =>
        currentTasks.map((currentTask) =>
          currentTask.id === result.data.id ? result.data : currentTask
        )
      );

      setMessage("Task marked complete.");
    } catch (error) {
      console.error("Complete Task failed:", error);
      setMessage(error.message || "Could not complete task.");
    }
  };

  const handleUpdated = (updatedTask) => {
    setTasks((currentTasks) =>
      currentTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task))
    );

    setEditingTask(null);
  };

  if (loading) {
    return <p>Loading tasks...</p>;
  }

  return (
    <div>
      <h2>Tasks</h2>

      {message && <p>{message}</p>}

      {tasks.length === 0 && (
        <p>No tasks available.</p>
      )}

      {tasks.map((task) => (
        <div
          key={task.id}
          className={
            task.completion_status === "completed" ? "task-item completed" : "task-item"
          }
        >
          <h3>{task.title}</h3>

          {task.description && <p>{task.description}</p>}

          <p>
            Due: {task.due_date ? new Date(task.due_date).toLocaleString() : "No deadline"}
          </p>

          <p>Points: {task.point_value ?? "Not set"}</p>

          <p>
            Estimated effort:
            {task.estimated_effort_minutes != null
              ? ` ${task.estimated_effort_minutes} minutes`
              : " Not set"}
          </p>

          <p>Priority: {task.priority || "Not set"}</p>

          <p>Status: {task.completion_status || "not_started"}</p>

          <button onClick={() => setEditingTask(task)}>
            Edit
          </button>

          <button onClick={() => handleDelete(task.id)}>
            Delete
          </button>

          {task.completion_status !== "completed" && (
            <button onClick={() => handleComplete(task)}>
              Mark Complete
            </button>
          )}
        </div>
      ))}

      {editingTask && (
        <EditTask
          task={editingTask}
          onUpdated={handleUpdated}
          onCancel={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}

export default TaskList;
