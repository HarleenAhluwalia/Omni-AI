import { useEffect, useState } from "react";

import AddTask from "./AddTask";
import TaskList from "./TaskList";
import PrioritizedTodo from "./PrioritizedTodo";
import CalendarView from "./CalendarView";
import DailySummary from "./DailySummary";
import WeeklySummary from "./WeeklySummary";

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
  const [theme, setTheme] = useState(() => {
  return localStorage.getItem("omni-theme") || "light";
});
useEffect(() => {
  localStorage.setItem("omni-theme", theme);
}, [theme]);

const toggleTheme = () => {
  setTheme((currentTheme) =>
    currentTheme === "light" ? "dark" : "light"
  );
};

  const today = new Date();

  const monthName = today.toLocaleString("default", {
    month: "long",
  });

  const year = today.getFullYear();

  const calendarYear = today.getFullYear();
const calendarMonth = today.getMonth();

const daysInMonth = new Date(
  calendarYear,
  calendarMonth + 1,
  0
).getDate();

const firstDayOfMonth = new Date(
  calendarYear,
  calendarMonth,
  1
).getDay();

const dashboardCalendarCells = [];

for (let i = 0; i < firstDayOfMonth; i += 1) {
  dashboardCalendarCells.push(null);
}

for (let day = 1; day <= daysInMonth; day += 1) {
  dashboardCalendarCells.push(day);
}

while (dashboardCalendarCells.length % 7 !== 0) {
  dashboardCalendarCells.push(null);
}
const getTasksForDashboardDay = (day) => {
  if (!day) {
    return [];
  }

  return tasks.filter((task) => {
    if (!task.due_date) {
      return false;
    }

    const dueDate = new Date(task.due_date);

    return (
      dueDate.getFullYear() === calendarYear &&
      dueDate.getMonth() === calendarMonth &&
      dueDate.getDate() === day
    );
  });
};

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
    <div className={`dashboard-page ${theme === "dark" ? "dark-mode" : ""}`}>

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
        <div>
  <div className="theme-toggle-section">
    <span className="theme-toggle-label">
      {theme === "dark" ? "Dark Mode" : "Light Mode"}
    </span>

    <button
      type="button"
      className={`theme-toggle ${
        theme === "dark" ? "theme-toggle--dark" : ""
      }`}
      onClick={toggleTheme}
      aria-label="Toggle dark and light mode"
    >
      <span className="theme-toggle-knob">
        {theme === "dark" ? "☾" : "☀"}
      </span>
    </button>
  </div>

  <div className="user-section">
    {/* existing user info */}
  </div>
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

                  {dashboardCalendarCells.map((day, index) => {
  const dayTasks = day
    ? getTasksForDashboardDay(day)
    : [];

  return (
    <div
      key={`${calendarYear}-${calendarMonth}-${index}`}
      className={
        day === today.getDate()
          ? "calendar-day dashboard-current-day"
          : "calendar-day"
      }
    >
      {day && (
        <>
          <span className="calendar-number">
            {day}
          </span>

          <div className="dashboard-calendar-tasks">
            {dayTasks.slice(0, 3).map((task) => (
              <button
                type="button"
                key={task.id}
                className={`dashboard-calendar-task dashboard-calendar-task-${
                  task.priority || "low"
                }`}
                title={task.title}
                onClick={() => openEditTaskModal(task)}
              >
                {task.title}
              </button>
            ))}

            {dayTasks.length > 3 && (
              <button
                type="button"
                className="dashboard-calendar-more"
                onClick={() =>
                  setActiveView("calendar")
                }
              >
                +{dayTasks.length - 3} more
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
})}

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
  refreshKey={taskRefreshKey}
/>

              </section>

              {/* SUMMARY COLUMN */}
              <section className="summary-column">

                <DailySummary
                  onEditTask={openEditTaskModal}
                  refreshKey={taskRefreshKey}
                />

                <WeeklySummary
                  onEditTask={openEditTaskModal}
                  refreshKey={taskRefreshKey}
                />

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
  <CalendarView
    refreshKey={taskRefreshKey}
    onEditTask={openEditTaskModal}
  />
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