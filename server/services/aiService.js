
const OLLAMA_URL =
  process.env.OLLAMA_URL || "http://127.0.0.1:11434";

const OLLAMA_MODEL =
  process.env.OLLAMA_MODEL || "qwen3.5:4b";

const SYSTEM_PROMPT = `
You are Omni AI, a student planning assistant.

General rules:
- Use only the information supplied by Omni AI or the user.
- Do not invent task information or student activity.
- Consider deadlines, estimated effort, user priority,
  point value, and available study time.
- Never recommend completed tasks.
- Explain recommendations concisely.
- If a due date is missing, say it is unknown.
- If estimated effort is missing, say it is unknown.
- Do not assume the user has more available study time
  than the application supplies.
- Treat Omni AI's overall priority score as a combined
  ranking signal, not simply an urgency score.
- Do not provide chain-of-thought.

Schedule-generation rules:
- Only schedule the supplied incomplete tasks.
- Use Omni AI's calculated priority score as a
  primary ranking signal.
- Consider deadline urgency, task priority,
  estimated effort, and point value.
- Earlier due dates generally deserve more urgency,
  while other priority factors may affect the order.
- Never schedule a completed task.
- Never allocate more total minutes than are available.
- Never allocate more minutes to a task than its
  estimated effort when that effort is known.
- Allocate positive whole numbers of minutes.
- Use each task no more than once in a schedule.
- You may schedule one task or multiple tasks.
- Do not divide time equally by default.
- Never create a task ID.
- Return concise explanations.
`;

function buildTaskContext(tasks) {
  if (!tasks.length) {
    return "The user currently has no incomplete tasks.";
  }

  return tasks
    .map((task, index) => {
      return `
Task ${index + 1}
Task ID: ${task.id}
Title: ${task.title}
Due Date: ${task.due_date ?? "Unknown"}
User Priority: ${task.priority ?? "Unknown"}
Point Value: ${task.point_value ?? "Unknown"}
Estimated Effort: ${
        task.estimated_effort_minutes ?? "Unknown"
      } minutes
Completion Status: ${
        task.completion_status ?? "Unknown"
      }
Omni AI Overall Priority Score: ${
        task.calculated_priority_score ?? "Unknown"
      }

Priority Score Breakdown:
Deadline: ${
        task.priority_breakdown?.deadline ?? "Unknown"
      }
User Priority: ${
        task.priority_breakdown?.userPriority ?? "Unknown"
      }
Point Value: ${
        task.priority_breakdown?.pointValue ?? "Unknown"
      }
Available Time: ${
        task.priority_breakdown?.availableTime ?? "Unknown"
      }
`;
    })
    .join("\n");
}

async function askAI(
  userMessage,
  tasks,
  availableMinutes,
  responseMode = "text"
) {
  if (!["text", "schedule"].includes(responseMode)) {
    throw new Error("Invalid response mode.");
  }

  const taskContext = buildTaskContext(tasks);

  const formatInstruction =
    responseMode === "schedule"
      ? `
Return valid JSON only, without markdown.

Use exactly this structure:

{
  "message": "A brief explanation of the schedule",
  "schedule": [
    {
      "task_id": "an exact supplied Task ID",
      "allocated_minutes": 30
    }
  ]
}

Rules:
- Use only task IDs provided in the task context.
- allocated_minutes must be a positive whole number.
- Total allocated_minutes must not exceed available time.
- Respect known estimated effort limits.
- Do not include completed tasks.
- Do not repeat a task ID.
- If no task should be scheduled, return an empty array.
`
      : `
Return a concise, helpful natural-language response.
Do not include chain-of-thought.
`;

  const requestBody = {
    model: OLLAMA_MODEL,
    stream: false,
    messages: [
      {
        role: "system",
        content: `${SYSTEM_PROMPT}\n${formatInstruction}`,
      },
      {
        role: "system",
        content: `
Current Omni AI Task Information

Available Study Time: ${availableMinutes} minutes

${taskContext}
`,
      },
      {
        role: "user",
        content: userMessage,
      },
    ],
  };

  if (responseMode === "schedule") {
    requestBody.format = "json";
  }

  const response = await fetch(
    `${OLLAMA_URL}/api/chat`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Ollama request failed: ${response.status}`
    );
  }

  const data = await response.json();
  const content = data.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Ollama returned an empty response.");
  }

  if (responseMode === "schedule") {
    let parsed;

    try {
      parsed = JSON.parse(content.trim());
    } catch {
      throw new Error(
        "AI returned an invalid JSON schedule."
      );
    }

    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray(parsed.schedule)
    ) {
      throw new Error(
        "AI returned an invalid schedule structure."
      );
    }

    return parsed;
  }

  return content.trim();
}

module.exports = {
  askAI,
};
