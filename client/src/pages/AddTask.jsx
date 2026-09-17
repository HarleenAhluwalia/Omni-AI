import { useState } from "react";
import { useAuth } from "../context/AuthContext";

const TEST_USER_ID = import.meta.env.VITE_TEST_USER_ID;

function AddTask({ onTaskCreated }) {
  const { user } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("medium");
  const [pointValue, setPointValue] = useState("");
  const [estimatedEffort, setEstimatedEffort] = useState("");
  const [message, setMessage] = useState("");

  // Use real authenticated user first.
  // VITE_TEST_USER_ID remains only as a temporary Sprint 1 fallback.
  const userId = user?.id || TEST_USER_ID;

  const handleAddTask = async () => {
    if (!title.trim()) {
      setMessage("Task title is required.");
      return;
    }

    if (!userId) {
      setMessage(
        "No authenticated or development user ID is available."
      );
      return;
    }

    const taskData = {
      user_id: userId,
      title: title.trim(),
      description: description.trim() || null,
      due_date: dueDate
        ? new Date(`${dueDate}T23:59:59`).toISOString()
        : null,
      priority,
      completion_status: "not_started",
      point_value:
        pointValue === "" ? null : Number(pointValue),
      estimated_effort_minutes:
        estimatedEffort === ""
          ? null
          : Number.parseInt(estimatedEffort, 10),
    };

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/tasks`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(taskData),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Could not create task."
        );
      }

      if (onTaskCreated) {
        onTaskCreated(result.data);
      }

      setMessage("Task created successfully.");

      setTitle("");
      setDescription("");
      setDueDate("");
      setPriority("medium");
      setPointValue("");
      setEstimatedEffort("");
    } catch (error) {
      console.error("Create Task failed:", error);
      setMessage(
        error.message || "Could not create task."
      );
    }
  };

  return (
    <div>
      <h2>Add Task</h2>

      <input
        type="text"
        placeholder="Task Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <textarea
        placeholder="Task Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
      />

      <select
        value={priority}
        onChange={(e) => setPriority(e.target.value)}
      >
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>

      <input
        type="number"
        min="0"
        placeholder="Point Value"
        value={pointValue}
        onChange={(e) => setPointValue(e.target.value)}
      />

      <input
        type="number"
        min="0"
        placeholder="Estimated Effort (minutes)"
        value={estimatedEffort}
        onChange={(e) => setEstimatedEffort(e.target.value)}
      />

      <button onClick={handleAddTask}>
        Add Task
      </button>

      {message && <p>{message}</p>}
    </div>
  );
}

export default AddTask;