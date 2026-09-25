import { useState } from "react";
import { useAuth } from "../context/AuthContext";

const TEST_USER_ID = import.meta.env.VITE_TEST_USER_ID;

// Only allow digits (and, for point value, a single decimal point) to be
// typed into the numeric fields so a negative number can never enter state.
const NON_NEGATIVE_INTEGER_PATTERN = /^\d*$/;
const NON_NEGATIVE_DECIMAL_PATTERN = /^\d*\.?\d*$/;

// Passing `task` switches this form into edit mode: fields are pre-filled
// from it and submitting PUTs to that task instead of POSTing a new one.
function AddTask({ task = null, onTaskSaved }) {
  const { user } = useAuth();

  const isEditMode = Boolean(task);

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [dueDate, setDueDate] = useState(
    task?.due_date ? task.due_date.slice(0, 10) : ""
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

  const handleSubmit = async (e) => {
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

    const sharedFields = {
      title: title.trim(),
      description: description.trim() || null,
      due_date: dueDate
        ? new Date(`${dueDate}T23:59:59`).toISOString()
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
      : { ...sharedFields, user_id: userId, completion_status: "not_started" };

    const url = isEditMode
      ? `${import.meta.env.VITE_API_URL}/tasks/${task.id}?user_id=${encodeURIComponent(
          userId
        )}`
      : `${import.meta.env.VITE_API_URL}/tasks`;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch(url, {
        method: isEditMode ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
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
