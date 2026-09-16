import { useState } from "react";

function AddTask({ onTaskCreated }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("medium");
  const [message, setMessage] = useState("");

  const handleAddTask = async () => {
    if (!title.trim()) {
      setMessage("Task title is required.");
      return;
    }

    const taskData = {
      title,
      description,
      due_date: dueDate || null,
      priority,
    };

    try {
      // REAL BACKEND CONNECTION:
      // This will create the task through POST /api/tasks once
      // Supabase and authenticated user/profile setup are available.
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
        throw new Error(result.error || "Could not create task.");
      }

      onTaskCreated(result.data);
      setMessage("Task created successfully.");

    } catch (error) {
      console.error("Backend Create Task unavailable:", error);

      // TEMPORARY FRONTEND FALLBACK:
      // Allows Create Task UI testing while the backend is blocked
      // by Supabase/authentication dependencies.
      // Remove this fallback once backend integration is fully available.
      const temporaryTask = {
        id: `demo-${Date.now()}`,
        ...taskData,
      };

      onTaskCreated(temporaryTask);

      setMessage(
        "Task added locally for testing. Backend connection unavailable."
      );
    }

    setTitle("");
    setDescription("");
    setDueDate("");
    setPriority("medium");
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

      <button onClick={handleAddTask}>
        Add Task
      </button>

      {message && <p>{message}</p>}
    </div>
  );
}

export default AddTask;