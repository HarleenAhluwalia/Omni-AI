import { useState } from "react";

import AddTask from "./AddTask";
import TaskList from "./TaskList";
import PrioritizedTodo from "./PrioritizedTodo";
import CalendarView from "./CalendarView";

import { useAuth } from "../context/AuthContext";

import "./Dashboard.css";

function Dashboard() {
  const { user, logout } = useAuth();

  const [activeView, setActiveView] = useState("dashboard");
  const [showAddTask, setShowAddTask] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [taskRefreshKey, setTaskRefreshKey] = useState(0);

  const today = new Date();

  const monthName = today.toLocaleString("default", {
    month: "long",
  });

  const year = today.getFullYear();

  // TEMPORARY calendar shell.
  // Real Calendar backend integration will be added later.
  const days = Array.from({ length: 35 }, (_, index) => index + 1);

  const handleTaskCreated = (newTask) => {
    if (newTask) {
      setTasks((currentTasks) => [
        ...currentTasks,
        newTask,
      ]);
    }

    setShowAddTask(false);

    // Refresh prioritized To-Do List after creating a task.
    setTaskRefreshKey((current) => current + 1);
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
                      onClick={() =>
                        setShowAddTask((current) => !current)
                      }
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

                {/* ADD TASK FORM */}
                {showAddTask && (
                  <div className="add-task-panel">

                    <AddTask
                      onTaskCreated={handleTaskCreated}
                    />

                    <button
                      className="close-task-button"
                      onClick={() => setShowAddTask(false)}
                    >
                      Close
                    </button>

                  </div>
                )}

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

                <div className="chat-message">

                  <div className="ai-avatar">
                    AI
                  </div>

                  <div>
                    <strong>Hello!</strong>

                    <p>
                      I can help organize your tasks and
                      upcoming deadlines.
                    </p>
                  </div>

                </div>

                <div className="chat-message user-message">

                  <div>
                    <p>
                      What should I work on today?
                    </p>
                  </div>

                  <div className="user-chat-avatar">
                    H
                  </div>

                </div>

                <div className="chat-message">

                  <div className="ai-avatar">
                    AI
                  </div>

                  <div>
                    <p>
                      Start with your highest-priority task.
                    </p>
                  </div>

                </div>

                <div className="chat-placeholder-note">
                  AI Chat functionality will be connected
                  by the assigned team member.
                </div>

                <div className="chat-input-placeholder">
                  Generate a new schedule with these tasks...
                </div>

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
                onClick={() =>
                  setShowAddTask((current) => !current)
                }
              >
                + Add Task
              </button>

            </div>

            {showAddTask && (
              <div className="add-task-panel">

                <AddTask
                  onTaskCreated={handleTaskCreated}
                />

                <button
                  className="close-task-button"
                  onClick={() => setShowAddTask(false)}
                >
                  Close
                </button>

              </div>
            )}

            <PrioritizedTodo
              refreshKey={taskRefreshKey}
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

    </div>
  );
}

export default Dashboard;