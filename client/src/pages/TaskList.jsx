import { useEffect, useState } from "react";
import EditTask from "./EditTask";

function TaskList({ tasks, setTasks }) {
  const [editingTask, setEditingTask] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const loadTasks = async () => {
      try {
        // REAL BACKEND CONNECTION:
        // Loads stored tasks through GET /api/tasks.
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/tasks`
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Could not load tasks.");
        }

        setTasks(result.data || []);
        setMessage("");

      } catch (error) {
        console.error("Backend Read Tasks unavailable:", error);

        // TEMPORARY:
        // Keep existing demo tasks when backend/Supabase is unavailable.
        setMessage(
          "Using temporary task data while backend connection is unavailable."
        );
      }
    };

    loadTasks();
  }, [setTasks]);

  const handleDelete = async (taskId) => {
    // Demo tasks only exist in frontend memory.
    if (String(taskId).startsWith("demo-")) {
      // TEMPORARY FRONTEND FALLBACK.
      setTasks((currentTasks) =>
        currentTasks.filter((task) => task.id !== taskId)
      );

      setMessage("Temporary task deleted.");
      return;
    }

    try {
      // REAL BACKEND CONNECTION:
      // Deletes a stored task through DELETE /api/tasks/:id.
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/tasks/${taskId}`,
        {
          method: "DELETE",
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not delete task.");
      }

      setTasks((currentTasks) =>
        currentTasks.filter((task) => task.id !== taskId)
      );

      setMessage("Task deleted successfully.");

    } catch (error) {
      console.error("Backend Delete Task unavailable:", error);

      setMessage(
        "Could not delete the stored task because the backend is unavailable."
      );
    }
  };

  const handleUpdated = (updatedTask) => {
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === updatedTask.id ? updatedTask : task
      )
    );

    setEditingTask(null);
  };

  return (
    <div>
      <h2>Tasks</h2>

      {message && <p>{message}</p>}

      {tasks.length === 0 && (
        <p>No tasks available.</p>
      )}

      {tasks.map((task) => (
        <div key={task.id}>
          <h3>{task.title}</h3>

          {task.description && <p>{task.description}</p>}

          {task.due_date && <p>Due: {task.due_date}</p>}

          <p>Priority: {task.priority || "Not set"}</p>

          <button onClick={() => setEditingTask(task)}>
            Edit
          </button>

          <button onClick={() => handleDelete(task.id)}>
            Delete
          </button>
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