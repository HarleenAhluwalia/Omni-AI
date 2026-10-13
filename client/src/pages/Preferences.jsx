
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import "./Preferences.css";
import {
  DEFAULT_PREFERENCES,
  validatePreferences,
  normalizePreferences,
  preferenceRequest,
} from "../api/preferencesApi";

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

function Preferences() {
  const { user, token } = useAuth();

  const [values, setValues] = useState(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const storageKey = `omni-preferences-demo-${user?.id}`;
  const apiUrl = import.meta.env.VITE_API_URL;
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
          saved = raw
            ? JSON.parse(raw)
            : DEFAULT_PREFERENCES;
        } else {
          saved = await preferenceRequest(apiUrl, token);
        }

        if (active) {
          setValues({
            ...DEFAULT_PREFERENCES,
            ...saved,
          });
        }
      } catch (err) {
        if (active) {
          setError(
            err.message || "Could not load preferences."
          );
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

    const payload = normalizePreferences(values);

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
        const saved = await preferenceRequest(
          apiUrl,
          token,
          "PUT",
          payload
        );

        setValues({
          ...DEFAULT_PREFERENCES,
          ...saved,
        });

        setMessage("Preferences saved successfully.");
      }
    } catch (err) {
      setError(
        err.message || "Save failed. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const resetPreferences = () => {
    setValues({ ...DEFAULT_PREFERENCES });
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
                update(
                  "schedulingStyle",
                  event.target.value
                )
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
                update(
                  "communicationStyle",
                  event.target.value
                )
              }
            >
              <option value="balanced">Balanced</option>
              <option value="concise">Concise</option>
              <option value="detailed">Detailed</option>
              <option value="encouraging">Encouraging</option>
            </select>
          </label>
        </div>

        <h2>Task Priority Weights</h2>

        <p className="preferences-help">
          Adjust how important each factor is.
          Total must equal 100%.
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

        <p
          className={
            totalWeight === 100
              ? ""
              : "preferences-invalid"
          }
        >
          Total: {totalWeight}%
        </p>

        {error && (
          <p className="preferences-error" role="alert">
            {error}
          </p>
        )}

        {message && (
          <p
            className="preferences-success"
            role="status"
          >
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
            {saving
              ? "Saving..."
              : "Save Preferences"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default Preferences;
