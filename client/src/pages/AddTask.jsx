import { useState } from "react";

function AddTask() {
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

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/tasks`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            title: title,
            description: description,
            due_date: dueDate || null,
            priority: priority,

            // TEMPORARY until authentication supplies the user automatically.
            user_id: "REPLACE_WITH_VALID_TEST_USER_ID",
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || "Could not create task.");
        return;
      }

      setMessage(`Task "${result.data.title}" created successfully!`);

      setTitle("");
      setDescription("");
      setDueDate("");
      setPriority("medium");

      console.log("Created task:", result.data);
    } catch (error) {
      console.error("Task creation failed:", error);

      setMessage("Could not connect to the backend.");
    }
  };

  return (
    <div>
      <h2>Add Task</h2>

      <input
        type="text"
        placeholder="Task Title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />

      <textarea
        placeholder="Task Description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />

      <input
        type="date"
        value={dueDate}
        onChange={(event) => setDueDate(event.target.value)}
      />

      <select
        value={priority}
        onChange={(event) => setPriority(event.target.value)}
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