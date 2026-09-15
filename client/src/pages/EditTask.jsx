import { useState } from "react";

function EditTask({ task, onUpdated, onCancel }) {
  const [title, setTitle] = useState(task.title || "");
  const [description, setDescription] = useState(task.description || "");
  const [dueDate, setDueDate] = useState(
    task.due_date ? task.due_date.slice(0, 10) : ""
  );
  const [priority, setPriority] = useState(task.priority || "medium");
  const [message, setMessage] = useState("");

  const handleUpdate = async () => {
    if (!title.trim()) {
      setMessage("Task title is required.");
      return;
    }

    const updatedTask = {
      ...task,
      title,
      description,
      due_date: dueDate || null,
      priority,
    };

    // Demo tasks do not exist in Supabase, so update them locally.
    if (String(task.id).startsWith("demo-")) {
      // TEMPORARY FRONTEND FALLBACK:
      // Remove when all tasks are loaded from the real backend.
      onUpdated(updatedTask);
      return;
    }

    try {
      // REAL BACKEND CONNECTION:
      // Updates an existing database task through PUT /api/tasks/:id.
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/tasks/${task.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title,
            description,
            due_date: dueDate || null,
            priority,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not update task.");
      }

      onUpdated(result.data);

    } catch (error) {
      console.error("Backend Update Task unavailable:", error);

      // TEMPORARY FRONTEND FALLBACK:
      // Keeps Edit Task testable while backend dependencies are unavailable.
      onUpdated(updatedTask);
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