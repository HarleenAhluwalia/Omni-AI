const OLLAMA_URL =
  process.env.OLLAMA_URL || "http://127.0.0.1:11434";

const OLLAMA_MODEL =
  process.env.OLLAMA_MODEL || "qwen3:4b";

const SYSTEM_PROMPT = `
You are Omni AI, a student planning assistant.

Follow these rules:
- Only use information supplied by Omni AI or the user.
- Do not invent grades, progress percentages, personal experiences,
  user behavior, or unavailable information.
- Consider deadline, user-selected priority, point value,
  estimated effort, completion status, and available study time.
- Never recommend completed tasks.
- Never schedule more time than the user has available.
- Explain recommendations using the supplied task information.
- Keep the final recommendation concise.
- If a due date is missing, say that the due date is unknown.
- Do not say there is "no risk" when information is missing.
- Do not assume available study time unless Omni AI provides it.
- If estimated effort is missing, say that the required time is unknown.
- Refer to the calculated score as Omni AI's overall priority score.
- Do not describe the score as urgency alone because it also includes
  user priority, point value, and available-time fit.
`;

async function askAI(userMessage, tasks) {

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
    Raw Task Point Value: ${
      task.point_value ?? "Not provided"
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