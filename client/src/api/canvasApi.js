
export function canvasImportPayload(assignments) {
  const unique = new Map();

  for (const item of assignments) {
    if (
      !Number.isInteger(item.course_id) ||
      item.course_id <= 0 ||
      !Number.isInteger(item.assignment_id) ||
      item.assignment_id <= 0
    ) {
      throw new Error("Invalid assignment reference");
    }

    unique.set(
      `${item.course_id}:${item.assignment_id}`,
      item
    );
  }

  if (!unique.size) {
    throw new Error("No assignments selected");
  }

  return {
    assignments: [...unique.values()],
  };
}

export function canvasResultCounts(data) {
  return Object.fromEntries(
    ["imported", "updated", "skipped", "failed"].map(
      (key) => [
        key,
        Array.isArray(data?.[key]) ? data[key].length : 0,
      ]
    )
  );
}

export async function canvasRequest(
  base,
  token,
  path,
  options = {},
  fetchImpl = fetch
) {
  if (!token) {
    throw new Error("Please log in");
  }

  const response = await fetchImpl(
    `${base.replace(/\/$/, "")}${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    }
  );

  const body = await response.json().catch(() => null);

  if (!response.ok || body?.success === false || !body) {
    throw new Error(
      body?.error ||
        `Canvas request failed (${response.status})`
    );
  }

  return body.data;
}
