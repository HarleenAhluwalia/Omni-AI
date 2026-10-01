import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "../context/AuthContext";

import "./PrioritizedTodo.css";

const TEST_USER_ID =
  import.meta.env.VITE_TEST_USER_ID;

const TASKS_PER_PAGE = 10;

// Must match modal animation duration.
const DELETE_MODAL_ANIMATION_MS = 180;

function PrioritizedTodo({
  refreshKey = 0,
  onEditTask,
}) {
  const { user } = useAuth();

  const userId =
    user?.id || TEST_USER_ID;

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] =
    useState(true);

  const [message, setMessage] =
    useState("");

  const [currentPage, setCurrentPage] =
    useState(1);

  const [deletingTask, setDeletingTask] =
    useState(null);

  const [
    isDeleteClosing,
    setIsDeleteClosing,
  ] = useState(false);

  const [isDeleting, setIsDeleting] =
    useState(false);

  const [deleteError, setDeleteError] =
    useState(null);


  const loadPrioritizedTasks =
    async () => {
      if (!userId) {
        setMessage(
          "No authenticated user is available."
        );

        setLoading(false);

        return;
      }

      try {
        setLoading(true);

        const response = await fetch(
          `${
            import.meta.env.VITE_API_URL
          }/tasks/prioritized?user_id=${encodeURIComponent(
            userId
          )}`
        );

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ||
              "Could not load prioritized tasks."
          );
        }

        // Important:
        // preserve the backend's prioritized order.
        setTasks(result.data || []);

        setMessage("");
      } catch (error) {
        console.error(
          "Prioritized task load failed:",
          error
        );

        setMessage(
          error.message ||
            "Could not connect to the backend."
        );
      } finally {
        setLoading(false);
      }
    };


  useEffect(() => {
    loadPrioritizedTasks();
  }, [userId, refreshKey]);


  useEffect(() => {
    setCurrentPage(1);
  }, [refreshKey]);


  const totalPages = Math.max(
    1,
    Math.ceil(
      tasks.length / TASKS_PER_PAGE
    )
  );


  const visibleTasks = useMemo(() => {
    const start =
      (currentPage - 1) *
      TASKS_PER_PAGE;

    return tasks.slice(
      start,
      start + TASKS_PER_PAGE
    );
  }, [tasks, currentPage]);


  const formatPriority = (
    priority
  ) => {
    if (!priority) {
      return "Not set";
    }

    return (
      priority.charAt(0).toUpperCase() +
      priority.slice(1)
    );
  };


  const formatDueDate = (
    dueDate
  ) => {
    if (!dueDate) {
      return "No due date";
    }

    return new Date(
      dueDate
    ).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };


  const getStatusClass = (
    task
  ) => {
    if (
      task.completion_status ===
      "completed"
    ) {
      return "todo-row-completed";
    }

    if (task.priority === "high") {
      return "todo-row-high";
    }

    if (
      task.priority === "medium"
    ) {
      return "todo-row-medium";
    }

    return "todo-row-low";
  };


  const handleComplete =
    async (task) => {
      try {
        const newStatus =
          task.completion_status ===
          "completed"
            ? "not_started"
            : "completed";

        const response =
          await fetch(
            `${
              import.meta.env
                .VITE_API_URL
            }/tasks/${
              task.id
            }?user_id=${encodeURIComponent(
              userId
            )}`,
            {
              method: "PUT",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body: JSON.stringify({
                completion_status:
                  newStatus,
              }),
            }
          );

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ||
              "Could not update task."
          );
        }

        // Reload because completion can
        // change prioritization order.
        await loadPrioritizedTasks();
      } catch (error) {
        console.error(
          "Complete Task failed:",
          error
        );

        setMessage(
          error.message ||
            "Could not update task."
        );
      }
    };


  const openDeleteConfirm = (
    task
  ) => {
    setDeleteError(null);

    setIsDeleteClosing(false);

    setDeletingTask(task);
  };


  const closeDeleteConfirm =
    () => {
      setIsDeleteClosing(true);

      window.setTimeout(() => {
        setDeletingTask(null);

        setIsDeleteClosing(false);

        setDeleteError(null);
      }, DELETE_MODAL_ANIMATION_MS);
    };


  useEffect(() => {
    if (!deletingTask) {
      return;
    }

    const handleKeyDown = (
      event
    ) => {
      if (
        event.key === "Escape"
      ) {
        closeDeleteConfirm();
      }
    };

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    document.body.style.overflow =
      "hidden";

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyDown
      );

      document.body.style.overflow =
        "";
    };
  }, [deletingTask]);


  const handleConfirmDelete =
    async () => {
      if (
        !deletingTask ||
        isDeleting
      ) {
        return;
      }

      setIsDeleting(true);

      setDeleteError(null);

      try {
        const response =
          await fetch(
            `${
              import.meta.env
                .VITE_API_URL
            }/tasks/${
              deletingTask.id
            }?user_id=${encodeURIComponent(
              userId
            )}`,
            {
              method: "DELETE",
            }
          );

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ||
              "Could not delete task."
          );
        }

        setTasks(
          (currentTasks) =>
            currentTasks.filter(
              (task) =>
                task.id !==
                deletingTask.id
            )
        );

        closeDeleteConfirm();
      } catch (error) {
        console.error(
          "Delete Task failed:",
          error
        );

        setDeleteError(
          error.message ||
            "Could not delete task."
        );
      } finally {
        setIsDeleting(false);
      }
    };


  if (loading) {
    return (
      <div className="prioritized-page">

        <div className="prioritized-card">

          <p className="todo-loading">
            Loading prioritized
            tasks...
          </p>

        </div>

      </div>
    );
  }


  return (
    <div className="prioritized-page">

      <div className="prioritized-card">

        <div className="prioritized-header">

          <div>
            <h1>
              To-Do List
            </h1>

            <p className="prioritized-subtitle">
              Highest-priority tasks
              are shown first.
            </p>
          </div>

          <span className="prioritized-count">
            {tasks.length} Tasks
          </span>

        </div>


        {message && (
          <div className="todo-error-message">
            {message}
          </div>
        )}


        <div className="todo-table-wrapper">

          <div className="todo-table-header">

            <div></div>

            <div>Name</div>

            <div>Due</div>

            <div>Score</div>

            <div>Priority</div>

            <div>Status</div>

            <div></div>

          </div>


          {tasks.length === 0 ? (
            <div className="todo-empty-state">
              No tasks available.
            </div>
          ) : (
            visibleTasks.map(
              (task) => (
                <div
                  className={`todo-table-row ${
    task.completion_status === "completed"
      ? "todo-row-completed"
      : `todo-row-${task.priority || "low"}`
  }`}
  key={task.id}
                >

                  <div className="todo-status-cell">
                    <input
                      type="checkbox"
                      checked={
                        task.completion_status ===
                        "completed"
                      }
                      onChange={() =>
                        handleComplete(
                          task
                        )
                      }
                      aria-label={`Completion status for ${task.title}`}
                    />
                  </div>


                  <div className="todo-task-name">
                    {task.title}
                  </div>


                  <div>
                    {formatDueDate(
                      task.due_date
                    )}
                  </div>


                  <div>
                    {task.calculated_priority_score ??
                      "—"}
                  </div>


                  <div>
                    {formatPriority(
                      task.priority
                    )}
                  </div>


                  <div>
                    {task.completion_status ===
                    "completed"
                      ? "Completed"
                      : "Active"}
                  </div>


                  <div className="todo-actions-cell">

                    <button
                      type="button"
                      className="todo-edit-button"
                      onClick={() =>
                        onEditTask?.(
                          task
                        )
                      }
                    >
                      Edit
                    </button>


                    <button
                      type="button"
                      className="todo-delete-trigger-button"
                      onClick={() =>
                        openDeleteConfirm(
                          task
                        )
                      }
                    >
                      Delete
                    </button>

                  </div>

                </div>
              )
            )
          )}

        </div>


        {tasks.length >
          TASKS_PER_PAGE && (
          <div className="todo-pagination">

            <button
              type="button"
              onClick={() =>
                setCurrentPage(
                  (page) =>
                    Math.max(
                      1,
                      page - 1
                    )
                )
              }
              disabled={
                currentPage === 1
              }
            >
              Previous
            </button>


            <span>
              Page {currentPage} of{" "}
              {totalPages}
            </span>


            <button
              type="button"
              onClick={() =>
                setCurrentPage(
                  (page) =>
                    Math.min(
                      totalPages,
                      page + 1
                    )
                )
              }
              disabled={
                currentPage ===
                totalPages
              }
            >
              Next
            </button>

          </div>
        )}

      </div>


      {deletingTask && (
        <div
          className={
            isDeleteClosing
              ? "modal-overlay modal-overlay--closing"
              : "modal-overlay"
          }
          onClick={
            closeDeleteConfirm
          }
        >

          <div
            className={
              isDeleteClosing
                ? "confirm-delete-modal confirm-delete-modal--closing"
                : "confirm-delete-modal"
            }
            onClick={(event) =>
              event.stopPropagation()
            }
            role="dialog"
            aria-modal="true"
          >

            <button
              type="button"
              className="modal-close-button"
              onClick={
                closeDeleteConfirm
              }
            >
              ×
            </button>


            <h2 className="confirm-delete-heading">
              Delete Task
            </h2>


            <p className="confirm-delete-text">
              Are you sure you want
              to delete{" "}
              <strong>
                “{deletingTask.title}”
              </strong>
              ?
            </p>


            {deleteError && (
              <p className="add-task-message add-task-message--error">
                {deleteError}
              </p>
            )}


            <div className="confirm-delete-actions">

              <button
                type="button"
                className="confirm-cancel-button"
                onClick={
                  closeDeleteConfirm
                }
                disabled={
                  isDeleting
                }
              >
                Cancel
              </button>


              <button
                type="button"
                className="confirm-delete-button"
                onClick={
                  handleConfirmDelete
                }
                disabled={
                  isDeleting
                }
              >
                {isDeleting
                  ? "Deleting..."
                  : "Delete Task"}
              </button>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}

export default PrioritizedTodo;