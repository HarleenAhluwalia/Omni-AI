export async function resolveSchedule(payload) {
  const response = await fetch(
    "http://localhost:3000/api/tasks/resolve-schedule",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error || "Failed to resolve schedule"
    );
  }

  return result;
}