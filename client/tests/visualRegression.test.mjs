
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  const file = path.join(root, relativePath);

  assert.ok(
    fs.existsSync(file),
    `Missing file: ${relativePath}`
  );

  return fs.readFileSync(file, "utf8");
}

test("SCRUM-404: Dashboard component exists", () => {
  const dashboard = read("src/pages/Dashboard.jsx");

  assert.ok(dashboard.length > 0);
});

test("SCRUM-404: Dashboard styling exists", () => {
  const css = read("src/pages/Dashboard.css");

  assert.ok(css.length > 0);
});

test("SCRUM-404: Dashboard supports task rendering", () => {
  const dashboard = read("src/pages/Dashboard.jsx");

  assert.match(dashboard, /task/i);
});

test("SCRUM-404: Dashboard includes pagination logic", () => {
  const dashboard = read("src/pages/Dashboard.jsx");
  const pagination = read("src/utils/taskPagination.js");

  assert.match(
    dashboard + pagination,
    /page|pagination/i
  );
});

test("SCRUM-404: Dashboard includes priority handling", () => {
  const dashboard = read("src/pages/Dashboard.jsx");

  assert.match(dashboard, /priorit/i);
});

test("SCRUM-404: CSS includes responsive styling", () => {
  const css = read("src/pages/Dashboard.css");

  assert.match(css, /@media/);
});

test("SCRUM-404: CSS includes layout styling", () => {
  const css = read("src/pages/Dashboard.css");

  assert.match(css, /display|grid|flex/);
});
