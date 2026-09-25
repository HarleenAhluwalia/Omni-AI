import { useState } from "react";
import { useAuth } from "../context/AuthContext";

const TEST_USER_ID = import.meta.env.VITE_TEST_USER_ID;

// Only allow digits (and, for point value, a single decimal point) to be
// typed into the numeric fields so a negative number can never enter state.
const NON_NEGATIVE_INTEGER_PATTERN = /^\d*$/;
const NON_NEGATIVE_DECIMAL_PATTERN = /^\d*\.?\d*$/;

function AddTask({ onTaskCreated }) {
  const { user } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("medium");
  const [pointValue, setPointValue] = useState("");
  const [estimatedEffort, setEstimatedEffort] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Use real authenticated user first.
  // VITE_TEST_USER_ID remains only as a temporary Sprint 1 fallback.
  const userId = user?.id || TEST_USER_ID;

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
    setPriority("medium");
    setPointValue("");
    setEstimatedEffort("");
  };

  const handleAddTask = async (e) => {
    e.preventDefault();

    if (isSubmitting) {
      return;
    }

    if (!title.trim()) {
      setFeedback({ type: "error", text: "Task title is required." });
      return;
    }

    if (!userId) {
      setFeedback({
        type: "error",
        text: "No authenticated or development user ID is available.",
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

    const taskData = {
      user_id: userId,
      title: title.trim(),
      description: description.trim() || null,
      due_date: dueDate
        ? new Date(`${dueDate}T23:59:59`).toISOString()
        : null,
      priority,
      completion_status: "not_started",
      point_value: pointValue === "" ? null : Number(pointValue),
      estimated_effort_minutes:
        estimatedEffort === ""
          ? null
          : Number.parseInt(estimatedEffort, 10),
    };

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(taskData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not create task.");
      }

      if (onTaskCreated) {
        onTaskCreated(result.data);
      }

      setFeedback({ type: "success", text: "Task created successfully." });
      resetForm();
    } catch (error) {
      console.error("Create Task failed:", error);
      setFeedback({
        type: "error",
        text: error.message || "Could not create task.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="add-task-form-wrapper">
      <h2 className="add-task-heading">Add Task</h2>

      <form
        className="add-task-form"
        onSubmit={handleAddTask}
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

        <div className="add-task-field add-task-field--due-date">
          <label htmlFor="add-task-due-date" className="add-task-label">
            Due Date
          </label>
          <input
            id="add-task-due-date"
            type="date"
            className="add-task-input"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={isSubmitting}
          />
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
            {isSubmitting ? "Adding Task..." : "Add Task"}
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
