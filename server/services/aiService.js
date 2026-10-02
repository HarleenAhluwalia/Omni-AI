const OLLAMA_URL =
  process.env.OLLAMA_URL || "http://127.0.0.1:11434";

const OLLAMA_MODEL =
  process.env.OLLAMA_MODEL || "qwen3.5:4b";

const SYSTEM_PROMPT = `
You are Omni AI, a student planning assistant.

Follow these rules:
- Only use information supplied by Omni AI or the user.
- Do not invent grades, progress percentages, personal experiences,
  user behavior, or unavailable information.
- Consider deadline, user-selected priority, point value,
  estimated effort, completion status, and available study time.
- Never recommend or schedule completed tasks.
- Explain recommendations using the supplied task information.
- Keep final responses concise.
- If a due date is missing, say that the due date is unknown.
- If estimated effort is missing, say that the required time is unknown.
- Do not say there is "no risk" when information is missing.
- Do not assume available study time unless Omni AI provides it.
- Refer to the calculated score as Omni AI's overall priority score.
- Do not describe the score as urgency alone because it also includes
  user priority, point value, and available-time fit.

When the user asks for a study schedule:
- Create the schedule using only the supplied incomplete tasks.
- Use Omni AI's overall priority score as the primary ranking signal.
- Also consider deadline, estimated effort, user priority, point value,
  and available study time when allocating time.
- Treat an earlier calendar due date as more urgent than a later due date.
- Never allocate more total study time than the supplied available time.
- Do not allocate more time to a task than its known estimated effort.
- Before saying a task cannot fit, compare its estimated effort directly
  with the available study time.
- A schedule may contain one or multiple tasks.
- Do not divide time evenly between tasks by default.
- Consider whether shorter tasks with nearer deadlines can reasonably fit
  alongside higher-scoring tasks.
- A lower-scoring task may still receive time when its shorter effort or
  nearer deadline makes it appropriate.
- It is acceptable to allocate all available time to one task when that is
  genuinely the best allocation.
- Keep explanations consistent with the supplied task data.
- Return the schedule as a concise, readable list containing task names
  and allocated minutes.
`;

async function askAI(userMessage, tasks, availableMinutes) {

    console.log(
      "Available minutes in AI service:",
      availableMinutes
    );

    const taskContext = tasks.length
        ? tasks
            .map((task, index) => {
                return `
    Task ${index + 1}
    Title: ${task.title}
    Due Date: ${task.due_date || "Not provided"}
    Priority: ${task.priority || "Not provided"}
    Point Value: ${task.point_value ?? "Not provided"}
    Estimated Effort: ${
            task.estimated_effort_minutes ?? "Not provided"
            } minutes
    Completion Status: ${
          task.completion_status || "Not provided"
        }
    Omni AI Overall Priority Score: ${
      task.calculated_priority_score ?? "Not provided"
    }

    Priority Score Breakdown:
      - Deadline Contribution: ${
      task.priority_breakdown?.deadline ?? "Not provided"
    }
      - User Priority Contribution: ${
      task.priority_breakdown?.userPriority ?? "Not provided"
    }
      - Point Value Contribution: ${
      task.priority_breakdown?.pointValue ?? "Not provided"
    }
      - Available Time Contribution: ${
      task.priority_breakdown?.availableTime ?? "Not provided"
    }
    
    `;
        })
        .join("\n")
    : "The user currently has no tasks.";

  const response = await fetch(
    `${OLLAMA_URL}/api/chat`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        messages: [
        {
        role: "system",
        content: SYSTEM_PROMPT,
        },
        {
          role: "system",
          content: `
        The following is the user's current Omni AI task data:

        Available Study Time: ${availableMinutes} minutes

        ${taskContext}
        `,
            },
            {
              role: "user",
              content: userMessage,
            },
          ],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Ollama request failed: ${response.status}`
    );
  }

  const data = await response.json();

  return data.message?.content || "";
}

module.exports = {
  askAI,
};