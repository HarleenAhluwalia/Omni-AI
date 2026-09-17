import { useState } from "react";
import { useAuth } from "../context/AuthContext";

const TEST_USER_ID = import.meta.env.VITE_TEST_USER_ID;

function EditTask({ task, onUpdated, onCancel }) {
  const { user } = useAuth();

  const [title, setTitle] = useState(task.title || "");
  const [description, setDescription] = useState(
    task.description || ""
  );
  const [dueDate, setDueDate] = useState(
    task.due_date ? task.due_date.slice(0, 10) : ""
  );
  const [priority, setPriority] = useState(
    task.priority || "medium"
  );
  const [pointValue, setPointValue] = useState(
    task.point_value ?? ""
  );
  const [estimatedEffort, setEstimatedEffort] = useState(
    task.estimated_effort_minutes ?? ""
  );
  const [message, setMessage] = useState("");

  const userId = user?.id || TEST_USER_ID;

  const handleUpdate = async () => {
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

    const updatePayload = {
      title: title.trim(),
      description: description.trim() || null,
      due_date: dueDate
        ? new Date(`${dueDate}T23:59:59`).toISOString()
        : null,
      priority,
      point_value:
        pointValue === "" ? null : Number(pointValue),
      estimated_effort_minutes:
        estimatedEffort === ""
          ? null
          : Number.parseInt(estimatedEffort, 10),
    };

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/tasks/${task.id}?user_id=${encodeURIComponent(
          userId
        )}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updatePayload),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Could not update task."
        );
      }

      onUpdated(result.data);
      setMessage("Task updated successfully.");
    } catch (error) {
      console.error("Update Task failed:", error);

      setMessage(
        error.message || "Could not update task."
      );
    }
  };

  return (
    <div>
      <h3>Edit Task</h3>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <textarea
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

      <button onClick={handleUpdate}>
        Save Changes
      </button>

      <button onClick={onCancel}>
        Cancel
      </button>

      {message && <p>{message}</p>}
    </div>
  );
}

export default EditTask;