import { useState } from "react";
import AddTask from "./AddTask";
import TaskList from "./TaskList";
import "./Dashboard.css";

function Dashboard() {
  const [showAddTask, setShowAddTask] = useState(false);

  // TEMPORARY FRONTEND TEST DATA:
  // Used only while Supabase/authentication dependencies are unavailable.
  // TaskList will replace this with real GET /api/tasks data when the
  // backend connection becomes available.
  const [tasks, setTasks] = useState([
    {
      id: "demo-1",
      title: "CPSC 491 Sprint Report",
      description: "Complete Sprint 1 documentation",
      due_date: "2026-09-17",
      priority: "high",
    },
    {
      id: "demo-2",
      title: "Study for Exam",
      description: "Review chapters and notes",
      due_date: "2026-09-20",
      priority: "medium",
    },
  ]);

  const handleTaskCreated = (newTask) => {
    setTasks((currentTasks) => [...currentTasks, newTask]);
  };

  return (
    <div className="dashboard-page">

      <div className="dashboard-sidebar">
        <h2>
          Omni <span>AI</span>
        </h2>

        <p className="active-menu">Dashboard</p>
        <p>To-Do List</p>
        <p>Calendar</p>

        <div className="user-section">
          <strong>Harleen Ahluwalia</strong>
        </div>
      </div>

      <main className="dashboard-main">

        <div className="calendar-header">
          <h1>September 2026</h1>

          <button
            className="add-task-header-button"
            onClick={() => setShowAddTask(!showAddTask)}
          >
            + Add Task
          </button>
        </div>

        {showAddTask && (
          <div className="add-task-panel">

            <AddTask onTaskCreated={handleTaskCreated} />

            <button
              className="close-task-button"
              onClick={() => setShowAddTask(false)}
            >
              Close
            </button>

          </div>
        )}

        <div className="calendar">
          <div className="calendar-day calendar-heading">Sunday</div>
          <div className="calendar-day calendar-heading">Monday</div>
          <div className="calendar-day calendar-heading">Tuesday</div>
          <div className="calendar-day calendar-heading">Wednesday</div>
          <div className="calendar-day calendar-heading">Thursday</div>
          <div className="calendar-day calendar-heading">Friday</div>
          <div className="calendar-day calendar-heading">Saturday</div>

          {Array.from({ length: 35 }, (_, index) => (
            <div className="calendar-day" key={index}>
              {index < 30 ? index + 1 : ""}
            </div>
          ))}
        </div>

        <div className="task-list-section">
          <TaskList
            tasks={tasks}
            setTasks={setTasks}
          />
        </div>

      </main>
    </div>
  );
}

export default Dashboard;