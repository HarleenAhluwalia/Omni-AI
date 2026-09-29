import { useEffect, useState } from "react";

import AddTask from "./AddTask";
import TaskList from "./TaskList";
import PrioritizedTodo from "./PrioritizedTodo";
import CalendarView from "./CalendarView";

import { useAuth } from "../context/AuthContext";

import "./Dashboard.css";

// Must match the CSS fade/pop animation duration for the Add Task modal.
const ADD_TASK_MODAL_ANIMATION_MS = 180;

function Dashboard() {
  const { user, logout } = useAuth();

  const [activeView, setActiveView] = useState("dashboard");
  const [showAddTask, setShowAddTask] = useState(false);
  const [isAddTaskClosing, setIsAddTaskClosing] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [taskRefreshKey, setTaskRefreshKey] = useState(0);
  const [chatInput, setChatInput] = useState("");
  const [availableMinutes, setAvailableMinutes] = useState(120);

  const [chatMessages, setChatMessages] = useState([
    {
      role: "assistant",
      content:
        "Hello! I can help organize your tasks and upcoming deadlines.",
    },
  ]);


  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");

  const today = new Date();

  const monthName = today.toLocaleString("default", {
    month: "long",
  });

  const year = today.getFullYear();

  // TEMPORARY calendar shell.
  // Real Calendar backend integration will be added later.
  const days = Array.from({ length: 35 }, (_, index) => index + 1);

  const openAddTaskModal = () => {
    setEditingTask(null);
    setIsAddTaskClosing(false);
    setShowAddTask(true);
  };

  const openEditTaskModal = (task) => {
    setEditingTask(task);
    setIsAddTaskClosing(false);
    setShowAddTask(true);
  };

  const closeAddTaskModal = () => {
    setIsAddTaskClosing(true);

    window.setTimeout(() => {
      setShowAddTask(false);
      setIsAddTaskClosing(false);
      setEditingTask(null);
    }, ADD_TASK_MODAL_ANIMATION_MS);
  };

  const toggleAddTaskModal = () => {
    if (showAddTask) {
      closeAddTaskModal();
    } else {
      openAddTaskModal();
    }
  };

  // Close on Escape and lock background scroll while the modal is open.
  useEffect(() => {
    if (!showAddTask) {
      return;
    }

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        closeAddTaskModal();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [showAddTask]);

  const handleTaskSaved = (savedTask) => {
    if (savedTask) {
      setTasks((currentTasks) => {
        const alreadyTracked = currentTasks.some(
          (currentTask) => currentTask.id === savedTask.id
        );

        return alreadyTracked
          ? currentTasks.map((currentTask) =>
              currentTask.id === savedTask.id ? savedTask : currentTask
            )
          : [...currentTasks, savedTask];
      });
    }

    closeAddTaskModal();

    // Refresh prioritized To-Do List after creating or editing a task.
    setTaskRefreshKey((current) => current + 1);
  };

  const handleSendChatMessage = async (e) => {
  e.preventDefault();

  const trimmedMessage = chatInput.trim();

  if (!trimmedMessage || !user?.id || chatLoading) {
    return;
  }

  setChatError("");

  setChatMessages((currentMessages) => [
    ...currentMessages,
    {
      role: "user",
      content: trimmedMessage,
    },
  ]);

  setChatInput("");
  setChatLoading(true);

  try {
    const response = await fetch(
      `${import.meta.env.VITE_API_URL}/ai/chat?user_id=${encodeURIComponent(
        user.id
      )}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: trimmedMessage,
          available_minutes: Number(availableMinutes),
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error || "Could not generate AI response."
      );
    }

    setChatMessages((currentMessages) => [
      ...currentMessages,
      {
        role: "assistant",
        content: result.data.response,
      },
    ]);
  } catch (error) {
    console.error("AI Chat failed:", error);

    setChatError(
      error.message || "Could not generate AI response."
    );
  } finally {
    setChatLoading(false);
  }
  };

  return (
    <div className="dashboard-page">

      {/* =========================
          SIDEBAR
      ========================= */}
      <aside className="dashboard-sidebar">

        <div>
          <h2 className="sidebar-logo">
            Omni <span>AI</span>
          </h2>

          <nav className="sidebar-nav">

            <button
              className={
                activeView === "dashboard"
                  ? "sidebar-item active-menu"
                  : "sidebar-item"
              }
              onClick={() => setActiveView("dashboard")}
            >
              <span>⌂</span>
              Dashboard
            </button>

            <button
              className={
                activeView === "todo"
                  ? "sidebar-item active-menu"
                  : "sidebar-item"
              }
              onClick={() => setActiveView("todo")}
            >
              <span>☷</span>
              To-Do List
            </button>

            <button
              className={
                activeView === "calendar"
                  ? "sidebar-item active-menu"
                  : "sidebar-item"
              }
              onClick={() => setActiveView("calendar")}
            >
              <span>▣</span>
              Calendar
            </button>

            <button
              className="sidebar-item"
              disabled
              title="Analytics functionality is assigned separately."
            >
              <span>◷</span>
              Analytics
            </button>

            <button
              className="sidebar-item"
              disabled
              title="AI Chat functionality is assigned separately."
            >
              <span>✎</span>
              AI Chat
            </button>

          </nav>
        </div>

        {/* =========================
            USER SECTION
        ========================= */}
        <div className="user-section">

          <div className="user-profile-row">

            <div className="user-avatar">
              {(user?.name || user?.email || "H")
                .charAt(0)
                .toUpperCase()}
            </div>

            <div>
              <strong>
                {user?.name ||
                  user?.display_name ||
                  user?.email ||
                  "Omni AI User"}
              </strong>

              <small>Omni AI User</small>
            </div>

          </div>

          <button
            className="logout-button"
            onClick={logout}
          >
            Log Out
          </button>

        </div>

      </aside>


      {/* =========================
          MAIN CONTENT
      ========================= */}
      <main className="dashboard-main">

        {/* =========================
            DASHBOARD VIEW
        ========================= */}
        {activeView === "dashboard" && (
          <>
            <div className="dashboard-top-row">

              {/* CALENDAR SHELL */}
              <section className="dashboard-calendar-card">

                <div className="calendar-top-header">

                  <h1>
                    {monthName} {year}
                  </h1>

                  <div className="calendar-actions">

                    <button
                      className="text-action-button"
                      onClick={toggleAddTaskModal}
                    >
                      + Add Task
                    </button>

                    <button
                      className="text-action-button"
                      disabled
                      title="Canvas integration is a later sprint task."
                    >
                      📥 Import from Canvas
                    </button>

                  </div>
                </div>

                {/* CALENDAR MOCKUP */}
                <div className="calendar-grid">

                  {[
                    "Sunday",
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                  ].map((day) => (
                    <div
                      key={day}
                      className="calendar-heading"
                    >
                      {day}
                    </div>
                  ))}

                  {days.map((day) => (
                    <div
                      key={day}
                      className="calendar-day"
                    >
                      <span className="calendar-number">
                        {day}
                      </span>
                    </div>
                  ))}

                </div>

              </section>

              {/* AI CHAT VISUAL PLACEHOLDER */}
              <aside className="ai-chat-card">
                <div className="chat-messages">
                  {chatMessages.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={
                          message.role === "user"
                          ? "chat-message user-message"
                          : "chat-message"
                      }
                    >
                      {message.role === "assistant" && (
                        <div className="ai-avatar">
                          AI
                        </div>
                      )}

                      <div className="chat-bubble">
                        <p>{message.content}</p>
                      </div>

                      {message.role === "user" && (
                        <div className="user-chat-avatar">
                          {(user?.name || user?.email || "U")
                            .charAt(0)
                            .toUpperCase()}
                        </div>
                      )}
                    </div>
                  ))}

                  {chatLoading && (
                    <div className="chat-message">
                      <div className="ai-avatar">
                        AI
                      </div>

                      <div className="chat-bubble">
                        <p>Omni AI is thinking...</p>
                      </div>
                    </div>
                  )}
                </div>

                {chatError && (
                  <div className="chat-error">
                    {chatError}
                  </div>
                )}

                <form
                  className="chat-form"
                  onSubmit={handleSendChatMessage}
                >
                  <div className="chat-time-row">
                    <label htmlFor="available-minutes">
                      Available time
                    </label>

                    <input
                        id="available-minutes"
                      type="number"
                      min="0"
                      value={availableMinutes}
                      onChange={(e) =>
                        setAvailableMinutes(e.target.value)
                      }
                    />

                    <span>minutes</span>
                  </div>

                  <div className="chat-input-row">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) =>
                        setChatInput(e.target.value)
                      }
                      placeholder="Ask Omni AI..."
                      disabled={chatLoading}
                    />

                    <button
                      type="submit"
                      disabled={
                        chatLoading ||
                        !chatInput.trim()
                      }
                    >
                      {chatLoading ? "Sending..." : "Send"}
                    </button>
                  </div>
                </form>
              </aside>

            </div>


            {/* =========================
                BOTTOM ROW
            ========================= */}
            <div className="dashboard-bottom-row">

              {/* EXISTING TASK MANAGEMENT */}
              <section className="todo-dashboard-card">

                <div className="section-title-row">

                  <h2>Tasks</h2>

                  <button
                    className="view-all-button"
                    onClick={() => setActiveView("todo")}
                  >
                    Prioritized To-Do List
                  </button>

                </div>

                <TaskList
  tasks={tasks}
  setTasks={setTasks}
  onEditTask={openEditTaskModal}
/>

              </section>

              {/* VISUAL PLACEHOLDERS */}
              <section className="summary-column">

                <div className="summary-card">
                  <h3>Task Summary</h3>

                  <p>
                    Your existing Task CRUD actions are shown on the left.
                  </p>
                </div>

                <div className="summary-card">
                  <h3>Weekly Summary</h3>

                  <p>
                    Weekly analytics will appear here.
                  </p>
                </div>

              </section>

            </div>
          </>
        )}


        {/* =========================
            FULL TO-DO LIST VIEW
        ========================= */}
        {activeView === "todo" && (
          <section className="full-todo-view">

            <div className="calendar-header">

              <div>
                <h1>
                  Prioritized To-Do List
                </h1>

                <p>
                  Tasks returned by the backend in prioritized order.
                </p>
              </div>

              <button
                className="add-task-header-button"
                onClick={toggleAddTaskModal}
              >
                + Add Task
              </button>

            </div>

            <PrioritizedTodo
              refreshKey={taskRefreshKey}
              onEditTask={openEditTaskModal}
            />

          </section>
        )}


        {/* =========================
            CALENDAR VIEW
        ========================= */}
        {activeView === "calendar" && (
          <CalendarView />
        )}

      </main>

      {/* =========================
          ADD TASK MODAL
      ========================= */}
      {(showAddTask || isAddTaskClosing) && (
        <div
          className={
            isAddTaskClosing
              ? "modal-overlay modal-overlay--closing"
              : "modal-overlay"
          }
          onClick={closeAddTaskModal}
        >
          <div
            className={
              isAddTaskClosing
                ? "add-task-modal add-task-modal--closing"
                : "add-task-modal"
            }
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={editingTask ? "Edit Task" : "Add Task"}
          >
            <button
              type="button"
              className="modal-close-button"
              onClick={closeAddTaskModal}
              aria-label={
                editingTask ? "Close Edit Task dialog" : "Close Add Task dialog"
              }
            >
              ×
            </button>

            <AddTask task={editingTask} onTaskSaved={handleTaskSaved} />
          </div>
        </div>
      )}

    </div>
  );
}

export default Dashboard;