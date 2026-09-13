import { useState } from "react";
import AddTask from "./AddTask";
import "./Dashboard.css";

function Dashboard() {
  const [showAddTask, setShowAddTask] = useState(false);

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
            <AddTask />

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

      </main>
    </div>
  );
}

export default Dashboard;