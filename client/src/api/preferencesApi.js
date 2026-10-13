
export const DEFAULT_PREFERENCES = Object.freeze({
  studySessionMinutes: 45,
  breakMinutes: 10,
  dailyWorkloadMinutes: 240,
  schedulingStyle: "balanced",
  communicationStyle: "balanced",
  deadlineWeight: 40,
  priorityWeight: 35,
  effortWeight: 25,
});

export function validatePreferences(v) {
  for (const [key, min, max] of [
    ["studySessionMinutes", 1, 240],
    ["breakMinutes", 0, 120],
    ["dailyWorkloadMinutes", 1, 1440],
  ]) {
    if (
      !Number.isInteger(Number(v[key])) ||
      v[key] === "" ||
      Number(v[key]) < min ||
      Number(v[key]) > max
    ) {
      return `${key} must be between ${min} and ${max}`;
    }
  }

  for (const key of [
    "deadlineWeight",
    "priorityWeight",
    "effortWeight",
  ]) {
    if (
      !Number.isInteger(Number(v[key])) ||
      v[key] === "" ||
      Number(v[key]) < 0 ||
      Number(v[key]) > 100
    ) {
      return "Weights must be whole numbers between 0 and 100";
    }
  }

  const total = [
    "deadlineWeight",
    "priorityWeight",
    "effortWeight",
  ].reduce((sum, key) => sum + Number(v[key]), 0);

  if (total !== 100) {
    return "Weights must total 100";
  }

  if (
    !["balanced", "deadline", "flexible"].includes(
      v.schedulingStyle
    )
  ) {
    return "Invalid scheduling style";
  }

  if (
    !["balanced", "concise", "detailed", "encouraging"].includes(
      v.communicationStyle
    )
  ) {
    return "Invalid communication style";
  }

  return "";
}

export const normalizePreferences = (v) => ({
  ...v,
  ...Object.fromEntries(
    [
      "studySessionMinutes",
      "breakMinutes",
      "dailyWorkloadMinutes",
      "deadlineWeight",
      "priorityWeight",
      "effortWeight",
    ].map((key) => [key, Number(v[key])])
  ),
});

export async function preferenceRequest(
  baseUrl,
  token,
  method = "GET",
  payload,
  fetchImpl = fetch
) {
  if (!token) throw new Error("Please log in");

  const response = await fetchImpl(
    `${baseUrl.replace(/\/$/, "")}/preferences`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(payload
          ? { "Content-Type": "application/json" }
          : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok || !data || data.success === false) {
    throw new Error(
      data?.error ||
        `Preferences request failed (${response.status})`
    );
  }

  return data.data;
}
