import { useState } from "react";
import { useAuth } from "../context/AuthContext";

// Derives the local calendar date (YYYY-MM-DD) a stored due_date timestamp
// falls on, for pre-filling a <input type="date">. Using local-time Date
// accessors (not a raw slice of the UTC ISO string) avoids showing a day
// that's off by one for timezones behind UTC.
const toDateInputValue = (isoString) => {
  if (!isoString) {
    return "";
  }

  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

function EditTask({ task, onUpdated, onCancel }) {
  const { token } = useAuth();

  const [title, setTitle] = useState(task.title || "");
  const [description, setDescription] = useState(
    task.description || ""
  );
  const [dueDate, setDueDate] = useState(
    toDateInputValue(task.due_date)
  );
  const [allDay, setAllDay] = useState(
    !task?.has_due_time
  );

  const [startDate, setStartDate] = useState(
    toDateInputValue(task?.start_time)
  );

  const [startTime, setStartTime] = useState(
    task?.has_due_time && task?.start_time
      ? new Date(task.start_time).toTimeString().slice(0, 5)
      : ""
  );

  const [dueTime, setDueTime] = useState(
    task?.has_due_time && task?.due_date
      ? new Date(task.due_date).toTimeString().slice(0, 5)
      : ""
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

  const handleUpdate = async () => {
    if (!title.trim()) {
      setMessage("Task title is required.");
      return;
    }

    if (!token) {
      setMessage("You must be logged in to save a task.");
      return;
    }
    // Validate the optional start date and time.
    if (startDate && !dueDate) {
      setMessage("A due date is required when a start date is entered.");
      return;
    }

    if (!allDay) {
      if (dueDate && !dueTime) {
        setMessage("Please select a due time.");
        return;
      }

      if (dueTime && !dueDate) {
        setMessage("Please select a due date.");
        return;
      }

      if (startDate && !startTime) {
        setMessage("Please select a start time.");
        return;
      }

      if (startTime && !startDate) {
        setMessage("Please select a start date.");
        return;
      }
    }

    const dueTimestamp = dueDate
      ? new Date(
        `${dueDate}T${allDay ? "23:59:59" : `${dueTime}:00`}`
      )
      : null;

    const startTimestamp = startDate
      ? new Date(
        `${startDate}T${allDay ? "00:00:00" : `${startTime}:00`}`
      )
      : null;

    if (
      (dueTimestamp && Number.isNaN(dueTimestamp.getTime())) ||
      (startTimestamp && Number.isNaN(startTimestamp.getTime()))
    ) {
      setMessage("Please enter valid dates and times.");
      return;
    }

    if (
      startTimestamp &&
      dueTimestamp &&
      startTimestamp >= dueTimestamp
    ) {
      setMessage("Start date and time must be before the due date and time.");
      return;
    }
    const updatePayload = {
      title: title.trim(),
      description: description.trim() || null,
      due_date: dueTimestamp
        ? dueTimestamp.toISOString()
        : null,

      has_due_time: !allDay && Boolean(dueDate),

      start_time: startTimestamp
        ? startTimestamp.toISOString()
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
        `${import.meta.env.VITE_API_URL}/tasks/${task.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
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

      {/* CALENDAR STYLE DATE AND TIME */}
      <div className="add-task-datetime-section">

        {/* ALL-DAY TOGGLE */}
        <div className="add-task-toggle-row">
          <label
            htmlFor="edit-task-all-day"
            className="add-task-label"
          >
            All-day
          </label>

          <input
            id="edit-task-all-day"
            type="checkbox"
            role="switch"
            className="add-task-all-day-switch"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
          />
        </div>

        {/* OPTIONAL START DATE AND TIME */}
        <div className="add-task-datetime-row">
          <label
            htmlFor="edit-task-start-date"
            className="add-task-label"
          >
            Starts (Optional)
          </label>

          <div className="add-task-datetime-inputs">
            <input
              id="edit-task-start-date"
              type="date"
              className="add-task-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />

            {!allDay && (
              <input
                type="time"
                aria-label="Start time (optional)"
                className="add-task-input"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            )}
          </div>
        </div>

        {/* DUE DATE AND TIME */}
        <div className="add-task-datetime-row">
          <label
            htmlFor="edit-task-due-date"
            className="add-task-label"
          >
            Ends (Due)
          </label>

          <div className="add-task-datetime-inputs">
            <input
              id="edit-task-due-date"
              type="date"
              className="add-task-input"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />

            {!allDay && (
              <input
                type="time"
                aria-label="Due time"
                className="add-task-input"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
              />
            )}
          </div>
        </div>

      </div>

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