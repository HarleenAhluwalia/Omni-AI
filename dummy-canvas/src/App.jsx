
import React, { useState } from "react";

const mockCourses = [
  {
    id: 1,
    name: "CPSC 491 - Computer Science",
    assignments: [
      { id: 101, title: "Sprint 3 Report", dueDate: "2026-10-12", points: 100 },
      { id: 102, title: "Frontend Implementation", dueDate: "2026-10-15", points: 50 },
    ],
  },
  {
    id: 2,
    name: "Marketing 351",
    assignments: [
      { id: 201, title: "Marketing Homework", dueDate: "2026-10-18", points: 25 },
      { id: 202, title: "Marketing Presentation", dueDate: "2026-10-22", points: 100 },
    ],
  },
  {
    id: 3,
    name: "ART 101",
    assignments: [
      { id: 301, title: "Art Homework", dueDate: "2026-10-20", points: 20 },
    ],
  },
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function App() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importedIds, setImportedIds] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState("all");
  const [syncResult, setSyncResult] = useState(null);
  const [simulateFailure, setSimulateFailure] = useState(false);

  const allAssignments = mockCourses.flatMap(
    (course) => course.assignments
  );

  const visibleCourses =
    selectedCourse === "all"
      ? mockCourses
      : mockCourses.filter(
          (course) => course.id === Number(selectedCourse)
        );

  const handleConnect = async () => {
    if (loading) return;

    if (connected) {
      setConnected(false);
      setImportedIds([]);
      setSyncResult(null);
      return;
    }

    setLoading(true);
    await wait(500);
    setConnected(true);
    setLoading(false);

    setSyncResult({
      type: "success",
      message: "Dummy Canvas connected successfully (simulation).",
      imported: 0,
      skipped: 0,
    });
  };

  const handleImport = async (assignment) => {
    if (!connected || loading) return;

    setLoading(true);
    await wait(500);

    if (simulateFailure) {
      setSyncResult({
        type: "error",
        message: "Simulated import failure. Please try again.",
        imported: 0,
        skipped: 0,
      });

      setSimulateFailure(false);
      setLoading(false);
      return;
    }

    if (importedIds.includes(assignment.id)) {
      setSyncResult({
        type: "info",
        message: "Assignment already imported.",
        imported: 0,
        skipped: 1,
      });
    } else {
      setImportedIds((current) => [...current, assignment.id]);

      setSyncResult({
        type: "success",
        message: `${assignment.title} imported successfully (simulation).`,
        imported: 1,
        skipped: 0,
      });
    }

    setLoading(false);
  };

  const handleImportAll = async () => {
    if (!connected || loading) return;

    setLoading(true);
    await wait(500);

    if (simulateFailure) {
      setSyncResult({
        type: "error",
        message: "Simulated synchronization failure.",
        imported: 0,
        skipped: 0,
      });

      setSimulateFailure(false);
      setLoading(false);
      return;
    }

    const newAssignments = allAssignments.filter(
      (assignment) => !importedIds.includes(assignment.id)
    );

    const skipped = allAssignments.length - newAssignments.length;

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

    setLoading(false);
  };

  return (
    <div className="canvas-app">
      <header className="canvas-topbar">
        <div className="canvas-brand">
          <div className="canvas-logo">C</div>
          <div>
            <h1>Dummy Canvas</h1>
            <p>Simulated Learning Management System</p>
          </div>
        </div>

        <span className="canvas-demo-badge">DEMO ENVIRONMENT</span>
      </header>

      <main className="canvas-main">
        <section className="canvas-connection-card">
          <div>
            <h2>Canvas Connection</h2>
            <p>
              Connect to the simulated Canvas environment to view
              and import assignments.
            </p>

            <div className="canvas-connection-status">
              <span
                className={`status-dot ${
                  connected ? "connected" : "disconnected"
                }`}
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
            disabled={loading}
          >
            {loading
              ? "Please wait..."
              : connected
              ? "Disconnect Canvas"
              : "Connect Canvas"}
          </button>
        </section>

        <section className="canvas-assignments-section">
          <div className="canvas-section-header">
            <div>
              <h2>Courses & Assignments</h2>
              <p>View simulated assignments and select items to import.</p>
            </div>

            <button
              type="button"
              className="canvas-primary-button"
              onClick={handleImportAll}
              disabled={!connected || loading}
            >
              {loading ? "Processing..." : "Import All"}
            </button>
          </div>

          <div className="canvas-filter-row">
            <label htmlFor="course-filter">Filter by Class</label>
            <select
              id="course-filter"
              value={selectedCourse}
              onChange={(event) =>
                setSelectedCourse(event.target.value)
              }
            >
              <option value="all">All Classes</option>
              {mockCourses.map((course) => (
                <option key={course.id} value={course.id}>
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
                <div key={course.id} className="canvas-course-card">
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

                    {course.assignments.map((assignment) => {
                      const isImported = importedIds.includes(
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
                          <span>{assignment.dueDate}</span>
                          <span>{assignment.points}</span>
                          <span
                            className={`assignment-status ${
                              isImported ? "imported" : "pending"
                            }`}
                          >
                            {isImported ? "Imported" : "Not Imported"}
                          </span>

                          <button
                            type="button"
                            className="canvas-import-button"
                            onClick={() => handleImport(assignment)}
                            disabled={isImported || loading}
                          >
                            {isImported ? "Imported" : "Import"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="canvas-results-card">
          <h2>Synchronization Results</h2>
          <p>Results from simulated Canvas import actions.</p>

          <label className="canvas-test-toggle">
            <input
              type="checkbox"
              checked={simulateFailure}
              onChange={(event) =>
                setSimulateFailure(event.target.checked)
              }
              disabled={loading}
            />
            Simulate next import failure
          </label>

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
                  <strong>{allAssignments.length}</strong>
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
