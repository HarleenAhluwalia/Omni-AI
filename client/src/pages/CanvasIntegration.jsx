
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  canvasImportPayload,
  canvasRequest,
  importableAssignmentPairs,
} from "../api/canvasApi";
import "./CanvasIntegration.css";

const API_URL = import.meta.env.VITE_API_URL;

function CanvasIntegration() {
  const { token } = useAuth();

  const [connected, setConnected] = useState(false);
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState("all");

  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const [syncResult, setSyncResult] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const importablePairs = importableAssignmentPairs(courses);

  const visibleCourses =
    selectedCourse === "all"
      ? courses
      : courses.filter(
          (course) => String(course.id) === selectedCourse
        );

  const loadCourses = async () => {
    if (!token) {
      throw new Error("Please log in to use Canvas integration.");
    }

    const data = await canvasRequest(API_URL, token, "/canvas/courses");

    if (!Array.isArray(data?.courses)) {
      throw new Error("Invalid Canvas course response.");
    }

    setCourses(data.courses);
    return data.courses;
  };

  const handleConnect = async () => {
    if (loading || importing) return;

    if (connected) {
      setConnected(false);
      setCourses([]);
      setSelectedCourse("all");
      setSyncResult(null);
      setMessage("");
      setError("");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      await loadCourses();

      setConnected(true);
      setMessage("Connected to the Omni AI Canvas simulation.");
    } catch (err) {
      setConnected(false);
      setError(err.message || "Could not connect to Canvas.");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (assignmentPairs) => {
    if (!connected || importing || loading) return;

    const validPairs = (assignmentPairs || []).filter(
      (pair) =>
        Number.isInteger(pair.course_id) &&
        pair.course_id > 0 &&
        Number.isInteger(pair.assignment_id) &&
        pair.assignment_id > 0
    );

    if (validPairs.length === 0) {
      setMessage("No eligible assignments to import.");
      return;
    }

    if (!token) {
      setError("Please log in to use Canvas integration.");
      return;
    }

    setImporting(true);
    setError("");
    setMessage("");

    try {
      const data = await canvasRequest(
        API_URL,
        token,
        "/canvas/import",
        {
          method: "POST",
          body: JSON.stringify(canvasImportPayload(validPairs)),
        }
      );

      const result = {
        imported: Array.isArray(data?.imported)
          ? data.imported
          : [],
        updated: Array.isArray(data?.updated)
          ? data.updated
          : [],
        skipped: Array.isArray(data?.skipped)
          ? data.skipped
          : [],
        failed: Array.isArray(data?.failed)
          ? data.failed
          : [],
      };

      setSyncResult(result);

      setMessage(
        result.failed.length > 0
          ? "Synchronization completed with some failures."
          : "Canvas synchronization completed."
      );

      // Refresh from the backend so imported statuses
      // reflect persisted Omni AI Tasks.
      try {
        await loadCourses();
      } catch (refreshError) {
        setError(
          `Import finished, but course refresh failed: ${
            refreshError.message
          }`
        );
      }
    } catch (err) {
      setError(err.message || "Import failed.");
    } finally {
      setImporting(false);
    }
  };

  const handleImportAll = () => {
    handleImport(importablePairs);
  };

  const handleSingleImport = (course, assignment) => {
    handleImport([
      { course_id: course.id, assignment_id: assignment.id },
    ]);
  };

  const getResultCount = (key) =>
    syncResult?.[key]?.length || 0;

  useEffect(() => {
    // Clear connected state when the authenticated
    // application session changes.
    setConnected(false);
    setCourses([]);
    setSyncResult(null);
    setError("");
    setMessage("");
  }, [token]);

  return (
    <section className="canvas-integration-page">
      <div className="canvas-integration-header">
        <div>
          <h1>Canvas Integration</h1>
          <p>
            Import simulated Canvas assignments into Omni AI.
          </p>
        </div>

        <span className="canvas-integration-badge">
          SIMULATED CANVAS
        </span>
      </div>

      <div className="canvas-integration-card">
        <div className="canvas-integration-connect-row">
          <div>
            <h2>Canvas Connection</h2>

            <p>
              {connected
                ? "Connected to the backend Canvas simulation."
                : "Connect to load available simulated courses."}
            </p>

            <div className="canvas-integration-status">
              <span
                className={`canvas-integration-dot ${
                  connected ? "connected" : ""
                }`}
              />

              {connected ? "Connected" : "Not Connected"}
            </div>
          </div>

          <button
            type="button"
            className={
              connected
                ? "canvas-integration-disconnect"
                : "canvas-integration-primary"
            }
            onClick={handleConnect}
            disabled={loading || importing}
          >
            {loading
              ? "Connecting..."
              : connected
              ? "Disconnect Canvas"
              : "Connect Canvas"}
          </button>
        </div>
      </div>

      <div className="canvas-integration-card">
        <div className="canvas-integration-section-header">
          <div>
            <h2>Courses & Assignments</h2>
            <p>
              Select assignments to synchronize with Omni AI.
            </p>
          </div>

          <button
            type="button"
            className="canvas-integration-primary"
            onClick={handleImportAll}
            disabled={
              !connected ||
              importing ||
              loading ||
              importablePairs.length === 0
            }
          >
            {importing ? "Importing..." : "Import All"}
          </button>
        </div>

        <label className="canvas-integration-filter">
          Filter by Class

          <select
            value={selectedCourse}
            onChange={(event) =>
              setSelectedCourse(event.target.value)
            }
            disabled={!connected}
          >
            <option value="all">All Classes</option>

            {courses.map((course) => (
              <option
                key={course.id}
                value={String(course.id)}
              >
                {course.name}
              </option>
            ))}
          </select>
        </label>

        {!connected ? (
          <div className="canvas-integration-empty">
            Connect Canvas to view assignments.
          </div>
        ) : courses.length === 0 ? (
          <div className="canvas-integration-empty">
            No courses available.
          </div>
        ) : (
          visibleCourses.map((course) => (
            <div
              className="canvas-integration-course"
              key={course.id}
            >
              <div className="canvas-integration-course-header">
                <h3>{course.name}</h3>
                <span>
                  {course.assignments?.length || 0} Assignments
                </span>
              </div>

              <div className="canvas-integration-table-wrap">
                <div className="canvas-integration-table-head">
                  <span>Assignment</span>
                  <span>Due Date</span>
                  <span>Points</span>
                  <span>Status</span>
                  <span>Action</span>
                </div>

                {(course.assignments || []).map(
                  (assignment) => (
                    <div
                      className="canvas-integration-table-row"
                      key={assignment.id}
                    >
                      <span className="canvas-integration-title">
                        {assignment.title}
                      </span>

                      <span>
                        {assignment.due_date || "No deadline"}
                      </span>

                      <span>{assignment.points ?? "—"}</span>

                      <span
                        className={`canvas-integration-assignment-status ${
                          assignment.locked
                            ? "locked"
                            : assignment.imported
                            ? "imported"
                            : "pending"
                        }`}
                      >
                        {assignment.locked
                          ? "Locked"
                          : assignment.imported
                          ? "Imported"
                          : "Not Imported"}
                      </span>

                      <button
                        type="button"
                        className="canvas-integration-import"
                        onClick={() =>
                          handleSingleImport(course, assignment)
                        }
                        disabled={
                          importing ||
                          loading ||
                          assignment.locked
                        }
                      >
                        {assignment.locked
                          ? "Locked"
                          : assignment.imported
                          ? "Sync Again"
                          : "Import"}
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="canvas-integration-card">
        <h2>Synchronization Results</h2>

        <p>
          Results returned by the Omni AI Canvas backend.
        </p>

        {message && (
          <p className="canvas-integration-success" role="status">
            {message}
          </p>
        )}

        {error && (
          <p className="canvas-integration-error" role="alert">
            {error}
          </p>
        )}

        {syncResult ? (
          <>
            <div className="canvas-integration-stats">
              {[
                ["Imported", "imported"],
                ["Updated", "updated"],
                ["Skipped", "skipped"],
                ["Failed", "failed"],
              ].map(([label, key]) => (
                <div
                  className="canvas-integration-stat"
                  key={key}
                >
                  <strong>{getResultCount(key)}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>

            {syncResult.failed.length > 0 && (
              <div className="canvas-integration-failures">
                <h3>Failed Assignments</h3>

                {syncResult.failed.map((item, index) => (
                  <p key={`${item.assignment_id}-${index}`}>
                    Assignment {item.assignment_id}:{" "}
                    {item.reason || "Unknown failure"}
                  </p>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="canvas-integration-empty">
            No synchronization activity yet.
          </div>
        )}
      </div>
    </section>
  );
}

export default CanvasIntegration;
