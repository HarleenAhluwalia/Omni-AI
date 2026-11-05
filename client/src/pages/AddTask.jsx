import { useState } from "react";
import { useAuth } from "../context/AuthContext";

// Only allow digits (and, for point value, a single decimal point) to be
// typed into the numeric fields so a negative number can never enter state.
const NON_NEGATIVE_INTEGER_PATTERN = /^\d*$/;
const NON_NEGATIVE_DECIMAL_PATTERN = /^\d*\.?\d*$/;

// Derives the local calendar date (YYYY-MM-DD) a stored due_date timestamp
// falls on, for pre-filling a <input type="date">. Using the local-time
// Date accessors (not a raw slice of the UTC ISO string) keeps this in sync
// with how the rest of the app displays due dates, and avoids showing a
// day that's off by one for timezones behind UTC.
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

// Passing `task` switches this form into edit mode: fields are pre-filled
// from it and submitting PUTs to that task instead of POSTing a new one.
function AddTask({ task = null, onTaskSaved }) {
  const { token } = useAuth();

  const isEditMode = Boolean(task);

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [dueDate, setDueDate] = useState(toDateInputValue(task?.due_date));
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
  const [priority, setPriority] = useState(task?.priority ?? "medium");
  const [pointValue, setPointValue] = useState(
    task?.point_value != null ? String(task.point_value) : ""
  );
  const [estimatedEffort, setEstimatedEffort] = useState(
    task?.estimated_effort_minutes != null
      ? String(task.estimated_effort_minutes)
      : ""
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const handlePointValueChange = (e) => {
    const { value } = e.target;
    if (NON_NEGATIVE_DECIMAL_PATTERN.test(value)) {
      setPointValue(value);
    }
  };

  const handleEstimatedEffortChange = (e) => {
    const { value } = e.target;
    if (NON_NEGATIVE_INTEGER_PATTERN.test(value)) {
      setEstimatedEffort(value);
    }
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setDueDate("");
    setStartDate("");
    setStartTime("");
    setDueTime("");
    setAllDay(true);
    setPriority("medium");
    setPointValue("");
    setEstimatedEffort("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isSubmitting) {
      return;
    }

    if (!title.trim()) {
      setFeedback({ type: "error", text: "Task title is required." });
      return;
    }

    if (!token) {
      setFeedback({
        type: "error",
        text: "You must be logged in to save a task.",
      });
      return;
    }

    if (pointValue !== "" && Number(pointValue) < 0) {
      setFeedback({
        type: "error",
        text: "Point value cannot be negative.",
      });
      return;
    }

    if (estimatedEffort !== "" && Number(estimatedEffort) < 0) {
      setFeedback({
        type: "error",
        text: "Estimated effort cannot be negative.",
      });
      return;
    }
    // Validate the optional start date and time.
    if (startDate && !dueDate) {
      setFeedback({
        type: "error",
        text: "A due date is required when a start date is entered.",
      });
      return;
    }

    if (!allDay) {
      if (dueDate && !dueTime) {
        setFeedback({
          type: "error",
          text: "Please select a due time.",
        });
        return;
      }

      if (dueTime && !dueDate) {
        setFeedback({
          type: "error",
          text: "Please select a due date.",
        });
        return;
      }

      if (startDate && !startTime) {
        setFeedback({
          type: "error",
          text: "Please select a start time.",
        });
        return;
      }

      if (startTime && !startDate) {
        setFeedback({
          type: "error",
          text: "Please select a start date.",
        });
        return;
      }
    }

    // Convert the selected local dates and times into timestamps.
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

    // Validate that dates and times are valid.
    if (
      (dueTimestamp && Number.isNaN(dueTimestamp.getTime())) ||
      (startTimestamp && Number.isNaN(startTimestamp.getTime()))
    ) {
      setFeedback({
        type: "error",
        text: "Please enter valid dates and times.",
      });
      return;
    }

    // Start must occur before the deadline.
    if (
      startTimestamp &&
      dueTimestamp &&
      startTimestamp >= dueTimestamp
    ) {
      setFeedback({
        type: "error",
        text: "Start date and time must be before the due date and time.",
      });
      return;
    }

    const sharedFields = {
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
      point_value: pointValue === "" ? null : Number(pointValue),
      estimated_effort_minutes:
        estimatedEffort === ""
          ? null
          : Number.parseInt(estimatedEffort, 10),
    };

    const requestBody = isEditMode
      ? sharedFields
      : { ...sharedFields, completion_status: "not_started" };

    const url = isEditMode
      ? `${import.meta.env.VITE_API_URL}/tasks/${task.id}`
      : `${import.meta.env.VITE_API_URL}/tasks`;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch(url, {
        method: isEditMode ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
          (isEditMode ? "Could not update task." : "Could not create task.")
        );
      }

      if (onTaskSaved) {
        onTaskSaved(result.data);
      }

      setFeedback({
        type: "success",
        text: isEditMode
          ? "Task updated successfully."
          : "Task created successfully.",
      });

      if (!isEditMode) {
        resetForm();
      }
    } catch (error) {
      console.error(
        isEditMode ? "Update Task failed:" : "Create Task failed:",
        error
      );
      setFeedback({
        type: "error",
        text:
          error.message ||
          (isEditMode ? "Could not update task." : "Could not create task."),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="add-task-form-wrapper">
      <h2 className="add-task-heading">
        {isEditMode ? "Edit Task" : "Add Task"}
      </h2>

      <form
        className="add-task-form"
        onSubmit={handleSubmit}
        aria-busy={isSubmitting}
        noValidate
      >
        <div className="add-task-field add-task-field--title">
          <label htmlFor="add-task-title" className="add-task-label">
            Title <span className="add-task-required">*</span>
          </label>
          <input
            id="add-task-title"
            type="text"
            className="add-task-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            aria-required="true"
            disabled={isSubmitting}
          />
        </div>

        <div className="add-task-field add-task-field--description">
          <label htmlFor="add-task-description" className="add-task-label">
            Description
          </label>
          <textarea
            id="add-task-description"
            className="add-task-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            disabled={isSubmitting}
          />
        </div>

        {/* APPLE CALENDAR STYLE DATE AND TIME */}
        <div className="add-task-datetime-section">

          {/* ALL-DAY TOGGLE */}
          <div className="add-task-toggle-row">
            <label
              htmlFor="add-task-all-day"
              className="add-task-label"
            >
              All-day
            </label>

            <input
              id="add-task-all-day"
              type="checkbox"
              role="switch"
              className="add-task-all-day-switch"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              disabled={isSubmitting}
            />
          </div>

          {/* START DATE AND TIME - OPTIONAL */}
          <div className="add-task-datetime-row">
            <label
              htmlFor="add-task-start-date"
              className="add-task-label"
            >
              Starts (Optional)
            </label>

            <div className="add-task-datetime-inputs">
              <input
                id="add-task-start-date"
                type="date"
                className="add-task-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={isSubmitting}
              />

              {!allDay && (
                <input
                  type="time"
                  aria-label="Start time (optional)"
                  className="add-task-input"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={isSubmitting}
                />
              )}
            </div>
          </div>

          {/* END / DUE DATE AND TIME */}
          <div className="add-task-datetime-row">
            <label
              htmlFor="add-task-due-date"
              className="add-task-label"
            >
              Ends (Due)
            </label>

            <div className="add-task-datetime-inputs">
              <input
                id="add-task-due-date"
                type="date"
                className="add-task-input"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={isSubmitting}
              />

              {!allDay && (
                <input
                  type="time"
                  aria-label="Due time"
                  className="add-task-input"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  disabled={isSubmitting}
                />
              )}
            </div>
          </div>

        </div>

        <fieldset className="add-task-group-row">
          <legend className="add-task-group-legend">
            Priority, points, and effort
          </legend>

          <div className="add-task-field">
            <label htmlFor="add-task-priority" className="add-task-label">
              Priority
            </label>
            <select
              id="add-task-priority"
              className="add-task-select"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              disabled={isSubmitting}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div className="add-task-field">
            <label htmlFor="add-task-point-value" className="add-task-label">
              Point Value
            </label>
            <input
              id="add-task-point-value"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              className="add-task-input add-task-input--number"
              value={pointValue}
              onChange={handlePointValueChange}
              disabled={isSubmitting}
            />
          </div>

          <div className="add-task-field">
            <label htmlFor="add-task-effort" className="add-task-label">
              Estimated Time
            </label>
            <div className="add-task-input-suffix-wrap">
              <input
                id="add-task-effort"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                className="add-task-input add-task-input--number add-task-input--suffix"
                value={estimatedEffort}
                onChange={handleEstimatedEffortChange}
                disabled={isSubmitting}
                aria-label="Estimated time in minutes"
              />
              <span className="add-task-input-suffix" aria-hidden="true">
                minutes
              </span>
            </div>
          </div>
        </fieldset>

        <div className="add-task-actions">
          <button
            type="submit"
            className="add-task-submit-button"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? isEditMode
                ? "Saving Changes..."
                : "Adding Task..."
              : isEditMode
                ? "Save Changes"
                : "Add Task"}
          </button>
        </div>

        {feedback && (
          <p
            role="alert"
            aria-live="polite"
            className={
              feedback.type === "error"
                ? "add-task-message add-task-message--error"
                : "add-task-message add-task-message--success"
            }
          >
            {feedback.text}
          </p>
        )}
      </form>
    </div>
  );
}

export default AddTask;
