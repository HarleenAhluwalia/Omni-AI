
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import "./Preferences.css";

const DEFAULTS = {
  studySessionMinutes: 45,
  breakMinutes: 10,
  dailyWorkloadMinutes: 240,
  schedulingStyle: "balanced",
  communicationStyle: "concise",
  deadlineWeight: 40,
  priorityWeight: 35,
  effortWeight: 25,
};

const FIELDS = [
  ["studySessionMinutes", "Study session length", 1, 240],
  ["breakMinutes", "Break interval", 0, 120],
  ["dailyWorkloadMinutes", "Daily workload limit", 1, 1440],
];

const WEIGHTS = [
  ["deadlineWeight", "Deadline"],
  ["priorityWeight", "User priority"],
  ["effortWeight", "Estimated effort"],
];

function validatePreferences(values) {
  for (const [key, label, min, max] of FIELDS) {
    const value = Number(values[key]);

    if (
      !Number.isInteger(value) ||
      value < min ||
      value > max
    ) {
      return `${label} must be between ${min} and ${max} minutes.`;
    }
  }

  for (const [key] of WEIGHTS) {
    const value = Number(values[key]);

    if (
      !Number.isInteger(value) ||
      value < 0 ||
      value > 100
    ) {
      return "Priority weights must be between 0 and 100.";
    }
  }

  const total = WEIGHTS.reduce(
    (sum, [key]) => sum + Number(values[key]),
    0
  );

  if (total !== 100) {
    return "Priority weights must total 100%.";
  }

  return "";
}

function Preferences() {
  const { user, token } = useAuth();

  const [values, setValues] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Demo storage is isolated per authenticated user.
  const storageKey = `omni-preferences-demo-${user?.id}`;

  // Optional backend endpoint configured by the team.
  const apiUrl = import.meta.env.VITE_PREFERENCES_API_URL;
  const demoMode = !apiUrl;

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    let active = true;

    async function loadPreferences() {
      setLoading(true);
      setError("");

      try {
        let saved;

        if (demoMode) {
          const raw = localStorage.getItem(storageKey);
          saved = raw ? JSON.parse(raw) : DEFAULTS;
        } else {
          const response = await fetch(apiUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!response.ok) {
            throw new Error("Could not retrieve preferences.");
          }

          const result = await response.json();
          saved = result.data ?? result;
        }

        if (active) {
          setValues({ ...DEFAULTS, ...saved });
        }
      } catch (err) {
        if (active) {
          setError(err.message || "Could not load preferences.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadPreferences();

    return () => {
      active = false;
    };
  }, [user?.id, token, apiUrl, demoMode, storageKey]);

  const update = (key, value) => {
    setValues((current) => ({
      ...current,
      [key]: value,
    }));

    setMessage("");
    setError("");
  };

  const savePreferences = async (event) => {
    event.preventDefault();

    const validationError = validatePreferences(values);

    if (validationError) {
      setError(validationError);
      return;
    }

    if (!user?.id) {
      setError("Please log in to update preferences.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    const payload = {
      ...values,
      studySessionMinutes: Number(values.studySessionMinutes),
      breakMinutes: Number(values.breakMinutes),
      dailyWorkloadMinutes: Number(values.dailyWorkloadMinutes),
      deadlineWeight: Number(values.deadlineWeight),
      priorityWeight: Number(values.priorityWeight),
      effortWeight: Number(values.effortWeight),
    };

    try {
      if (demoMode) {
        localStorage.setItem(
          storageKey,
          JSON.stringify(payload)
        );

        setMessage(
          "Preferences saved in demo storage. Backend synchronization is not connected."
        );
      } else {
        const response = await fetch(apiUrl, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error("Could not save preferences.");
        }

        setMessage("Preferences saved successfully.");
      }
    } catch (err) {
      setError(err.message || "Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const resetPreferences = () => {
    setValues({ ...DEFAULTS });
    setError("");
    setMessage(
      "Default values restored in the form. Select Save Preferences to keep them."
    );
  };

  const totalWeight = WEIGHTS.reduce(
    (sum, [key]) => sum + Number(values[key] || 0),
    0
  );

  if (loading) {
    return (
      <div className="preferences-page">
        <p>Loading preferences...</p>
      </div>
    );
  }

  return (
    <section className="preferences-page">
      <div className="preferences-header">
        <h1>Study & AI Preferences</h1>
        <p>
          Customize your study habits, scheduling, and AI behavior.
        </p>
      </div>

      {demoMode && (
        <p className="preferences-notice">
          Demo mode: settings are stored only in this browser.
          They do not yet affect AI-generated schedules.
        </p>
      )}

      <form
        className="preferences-card"
        onSubmit={savePreferences}
      >
        <h2>Study Habits</h2>

        <div className="preferences-grid">
          {FIELDS.map(([key, label, min, max]) => (
            <label className="preferences-field" key={key}>
              <span>{label} (minutes)</span>

              <input
                type="number"
                min={min}
                max={max}
                step="1"
                value={values[key]}
                onChange={(event) =>
                  update(key, event.target.value)
                }
              />
            </label>
          ))}
        </div>

        <h2>Scheduling & AI Behavior</h2>

        <div className="preferences-grid">
          <label className="preferences-field">
            <span>Scheduling style</span>
            <select
              value={values.schedulingStyle}
              onChange={(event) =>
                update("schedulingStyle", event.target.value)
              }
            >
              <option value="balanced">Balanced</option>
              <option value="deadline">Deadline focused</option>
              <option value="flexible">Flexible</option>
            </select>
          </label>

          <label className="preferences-field">
            <span>AI communication style</span>
            <select
              value={values.communicationStyle}
              onChange={(event) =>
                update("communicationStyle", event.target.value)
              }
            >
              <option value="concise">Concise</option>
              <option value="detailed">Detailed</option>
              <option value="encouraging">Encouraging</option>
            </select>
          </label>
        </div>

        <h2>Task Priority Weights</h2>
        <p className="preferences-help">
          Adjust how important each factor is. Total must equal 100%.
        </p>

        {WEIGHTS.map(([key, label]) => (
          <label className="preferences-slider" key={key}>
            <span>
              {label}: {values[key]}%
            </span>

            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={values[key]}
              onChange={(event) =>
                update(key, Number(event.target.value))
              }
            />
          </label>
        ))}

        <p className={totalWeight === 100 ? "" : "preferences-invalid"}>
          Total: {totalWeight}%
        </p>

        {error && (
          <p className="preferences-error" role="alert">
            {error}
          </p>
        )}

        {message && (
          <p className="preferences-success" role="status">
            {message}
          </p>
        )}

        <div className="preferences-actions">
          <button
            type="button"
            className="preferences-reset"
            onClick={resetPreferences}
            disabled={saving}
          >
            Reset to Defaults
          </button>

          <button
            type="submit"
            className="preferences-save"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Preferences"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default Preferences;
