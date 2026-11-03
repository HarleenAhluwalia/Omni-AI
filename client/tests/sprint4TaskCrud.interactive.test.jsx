
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";

import AddTask from "../src/pages/AddTask.jsx";
import TaskList from "../src/pages/TaskList.jsx";

vi.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "test-token" }),
}));

const task = {
  id: "task-1",
  title: "Study for midterm",
  description: "Review notes",
  due_date: null,
  priority: "high",
  point_value: 10,
  estimated_effort_minutes: 60,
  completion_status: "not_started",
};

const response = (data, ok = true) => ({
  ok,
  json: async () => data,
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("SCRUM-383: interactive Task Form", () => {
  it("rejects a blank title without calling the API", () => {
    render(<AddTask />);

    fireEvent.click(
      screen.getByRole("button", { name: "Add Task" })
    );

    expect(screen.getByRole("alert").textContent)
      .toMatch(/title is required/i);

    expect(fetch).not.toHaveBeenCalled();
  });

  it("creates a task using POST and an authenticated request", async () => {
    fetch.mockResolvedValue(response({ data: task }));

    const saved = vi.fn();

    render(<AddTask onTaskSaved={saved} />);

    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: "Study for midterm" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Add Task" })
    );

    await waitFor(() =>
      expect(saved).toHaveBeenCalledWith(task)
    );

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/tasks$/),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      })
    );

    expect(screen.getByRole("alert").textContent)
      .toMatch(/created successfully/i);
  });

  it("edits an existing task using PUT", async () => {
    fetch.mockResolvedValue(
      response({
        data: { ...task, title: "Updated title" },
      })
    );

    render(<AddTask task={task} />);

    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: "Updated title" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Save Changes" })
    );

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/tasks\/task-1$/),
        expect.objectContaining({ method: "PUT" })
      )
    );

    expect(screen.getByRole("alert").textContent)
      .toMatch(/updated successfully/i);
  });

  it("shows backend validation errors without claiming success", async () => {
    fetch.mockResolvedValue(
      response({ error: "Invalid task data" }, false)
    );

    render(<AddTask />);

    fireEvent.change(screen.getByLabelText(/Title/), {
      target: { value: "A task" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Add Task" })
    );

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent)
        .toMatch(/Invalid task data/)
    );
  });
});

describe("SCRUM-383: interactive Task List CRUD", () => {
  const mount = () => {
    const Wrapper = () => {
      const [tasks, setTasks] = React.useState([]);

      return (
        <TaskList
          tasks={tasks}
          setTasks={setTasks}
        />
      );
    };

    render(<Wrapper />);
  };

  it("loads and displays tasks returned by the backend", async () => {
    fetch.mockResolvedValue(
      response({ data: [task] })
    );

    mount();

    expect(
      await screen.findByText("Study for midterm")
    ).toBeTruthy();

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/tasks\/prioritized$/),
      expect.any(Object)
    );
  });

  it("deletes a task and removes it from the list", async () => {
    fetch
      .mockResolvedValueOnce(response({ data: [task] }))
      .mockResolvedValueOnce(response({ data: task }));

    mount();

    await screen.findByText("Study for midterm");

    fireEvent.click(
      screen.getByRole("button", { name: "Delete" })
    );

    await waitFor(() =>
      expect(
        screen.queryByText("Study for midterm")
      ).toBeNull()
    );

    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/tasks\/task-1$/),
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("marks a task completed using PUT", async () => {
    fetch
      .mockResolvedValueOnce(response({ data: [task] }))
      .mockResolvedValueOnce(
        response({
          data: {
            ...task,
            completion_status: "completed",
          },
        })
      );

    mount();

    await screen.findByText("Study for midterm");

    fireEvent.click(
      screen.getByRole("button", { name: "Complete" })
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Undo" })
      ).toBeTruthy()
    );

    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringMatching(/\/tasks\/task-1$/),
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("preserves a task when deletion fails", async () => {
    fetch
      .mockResolvedValueOnce(response({ data: [task] }))
      .mockResolvedValueOnce(
        response({ error: "Delete denied" }, false)
      );

    mount();

    await screen.findByText("Study for midterm");

    fireEvent.click(
      screen.getByRole("button", { name: "Delete" })
    );

    await waitFor(() =>
      expect(
        screen.getByText("Delete denied")
      ).toBeTruthy()
    );

    expect(
      screen.getByText("Study for midterm")
    ).toBeTruthy();
  });
});
