import React, { useState } from "react";

// Dummy Canvas data.
// No backend or real Canvas API is used.
const mockCourses = [
  {
    id: 1,
    name: "CPSC 491 - Computer Science",
    assignments: [
      {
        id: 101,
        title: "Sprint 3 Report",
        dueDate: "2026-10-12",
        points: 100,
      },
      {
        id: 102,
        title: "Frontend Implementation",
        dueDate: "2026-10-15",
        points: 50,
      },
    ],
  },
  {
    id: 2,
    name: "Marketing 351",
    assignments: [
      {
        id: 201,
        title: "Marketing Homework",
        dueDate: "2026-10-18",
        points: 25,
      },
      {
        id: 202,
        title: "Marketing Presentation",
        dueDate: "2026-10-22",
        points: 100,
      },
    ],
  },
  {
    id: 3,
    name: "ART 101",
    assignments: [
      {
        id: 301,
        title: "Art Homework",
        dueDate: "2026-10-20",
        points: 20,
      },
    ],
  },
];

function App() {
  const [connected, setConnected] = useState(false);

  const [importedIds, setImportedIds] = useState([]);

  const [syncResult, setSyncResult] = useState(null);

  const [selectedCourse, setSelectedCourse] =
    useState("all");

  // Simulated Canvas connection.
  const handleConnect = () => {
    if (connected) {
      setConnected(false);
      setSyncResult(null);
      setImportedIds([]);
      return;
    }

    setConnected(true);

    setSyncResult({
      type: "success",
      message: "Dummy Canvas connected successfully.",
      imported: 0,
      skipped: 0,
    });
  };

  // Simulated assignment import.
  const handleImport = (assignment) => {
    if (!connected) {
      return;
    }

    if (importedIds.includes(assignment.id)) {
      setSyncResult({
        type: "info",
        message: "Assignment already imported.",
        imported: 0,
        skipped: 1,
      });

      return;
    }

    setImportedIds((current) => [
      ...current,
      assignment.id,
    ]);

    setSyncResult({
      type: "success",
      message: `${assignment.title} imported successfully (simulation).`,
      imported: 1,
      skipped: 0,
    });
  };

  // Simulated Import All.
  const handleImportAll = () => {
    if (!connected) {
      return;
    }

    const allAssignments = mockCourses.flatMap(
      (course) => course.assignments
    );

    const newAssignments = allAssignments.filter(
      (assignment) =>
        !importedIds.includes(assignment.id)
    );

    const skipped =
      allAssignments.length - newAssignments.length;

    setImportedIds((current) => [
      ...current,
      ...newAssignments.map((assignment) => assignment.id),
    ]);

    setSyncResult({
      type: "success",
      message: "Simulated Canvas import completed.",
      imported: newAssignments.length,
      skipped,
    });
  };

  const visibleCourses =
    selectedCourse === "all"
      ? mockCourses
      : mockCourses.filter(
          (course) =>
            course.id === Number(selectedCourse)
        );

  const totalAssignments = mockCourses.reduce(
    (total, course) =>
      total + course.assignments.length,
    0
  );

  return (
    <div className="canvas-app">
      {/* HEADER */}
      <header className="canvas-topbar">
        <div className="canvas-brand">
          <div className="canvas-logo">C</div>

          <div>
            <h1>Dummy Canvas</h1>
            <p>Simulated Learning Management System</p>
          </div>
        </div>

        <span className="canvas-demo-badge">
          DEMO ENVIRONMENT
        </span>
      </header>

      <main className="canvas-main">
        {/* CONNECTION SECTION */}
        <section className="canvas-connection-card">
          <div>
            <h2>Canvas Connection</h2>

            <p>
              Connect to the simulated Canvas environment
              to view and import assignments.
            </p>

            <div className="canvas-connection-status">
              <span
                className={
                  connected
                    ? "status-dot connected"
                    : "status-dot disconnected"
                }
              />

              {connected
                ? "Connected to Dummy Canvas"
                : "Not Connected"}
            </div>
          </div>

          <button
            type="button"
            className={
              connected
                ? "canvas-disconnect-button"
                : "canvas-primary-button"
            }
            onClick={handleConnect}
          >
            {connected
              ? "Disconnect Canvas"
              : "Connect Canvas"}
          </button>
        </section>

        {/* ASSIGNMENTS SECTION */}
        <section className="canvas-assignments-section">
          <div className="canvas-section-header">
            <div>
              <h2>Courses & Assignments</h2>

              <p>
                View simulated Canvas assignments
                and select items to import.
              </p>
            </div>

            <button
              type="button"
              className="canvas-primary-button"
              onClick={handleImportAll}
              disabled={!connected}
            >
              Import All
            </button>
          </div>

          <div className="canvas-filter-row">
            <label htmlFor="course-filter">
              Filter by Class
            </label>

            <select
              id="course-filter"
              value={selectedCourse}
              onChange={(event) =>
                setSelectedCourse(event.target.value)
              }
            >
              <option value="all">All Classes</option>

              {mockCourses.map((course) => (
                <option
                  key={course.id}
                  value={course.id}
                >
                  {course.name}
                </option>
              ))}
            </select>
          </div>

          {!connected ? (
            <div className="canvas-empty-state">
              Connect Canvas to view assignments.
            </div>
          ) : (
            <div className="canvas-course-list">
              {visibleCourses.map((course) => (
                <div
                  key={course.id}
                  className="canvas-course-card"
                >
                  <div className="canvas-course-header">
                    <h3>{course.name}</h3>

                    <span>
                      {course.assignments.length} Assignments
                    </span>
                  </div>

                  <div className="canvas-table-wrapper">
                    <div className="canvas-table-header">
                      <span>Assignment</span>
                      <span>Due Date</span>
                      <span>Points</span>
                      <span>Status</span>
                      <span>Action</span>
                    </div>

                    {course.assignments.map(
                      (assignment) => {
                        const isImported =
                          importedIds.includes(
                            assignment.id
                          );

                        return (
                          <div
                            key={assignment.id}
                            className="canvas-table-row"
                          >
                            <span className="assignment-title">
                              {assignment.title}
                            </span>

                            <span>
                              {assignment.dueDate}
                            </span>

                            <span>
                              {assignment.points}
                            </span>

                            <span
                              className={
                                isImported
                                  ? "assignment-status imported"
                                  : "assignment-status pending"
                              }
                            >
                              {isImported
                                ? "Imported"
                                : "Not Imported"}
                            </span>

                            <button
                              type="button"
                              className="canvas-import-button"
                              onClick={() =>
                                handleImport(assignment)
                              }
                              disabled={isImported}
                            >
                              {isImported
                                ? "Imported"
                                : "Import"}
                            </button>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* SYNC RESULTS SECTION */}
        <section className="canvas-results-card">
          <h2>Synchronization Results</h2>

          <p>
            Results from simulated Canvas import actions.
          </p>

          {syncResult ? (
            <>
              <div
                className={`canvas-result-message ${syncResult.type}`}
                role="status"
                aria-live="polite"
              >
                {syncResult.message}
              </div>

              <div className="canvas-result-stats">
                <div>
                  <strong>{syncResult.imported}</strong>
                  <span>Imported This Action</span>
                </div>

                <div>
                  <strong>{syncResult.skipped}</strong>
                  <span>Skipped This Action</span>
                </div>

                <div>
                  <strong>{importedIds.length}</strong>
                  <span>Total Imported</span>
                </div>

                <div>
                  <strong>{totalAssignments}</strong>
                  <span>Available Assignments</span>
                </div>
              </div>
            </>
          ) : (
            <div className="canvas-empty-results">
              No synchronization activity yet.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;