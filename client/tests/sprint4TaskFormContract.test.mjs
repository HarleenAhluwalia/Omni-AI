
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../src/pages/AddTask.jsx', import.meta.url),
  'utf8'
);

test('task form exposes a required accessible title input', () => {
  assert.match(source, /htmlFor="add-task-title"/);
  assert.match(source, /id="add-task-title"[\s\S]*?required/);
});

test('task form validates blank titles before network requests', () => {
  assert.match(source, /if \(!title\.trim\(\)\)/);
  assert.match(source, /Task title is required/);
});

test('task form requires an authenticated token', () => {
  assert.match(source, /if \(!token\)/);
  assert.match(source, /You must be logged in to save a task/);
});

test('task form supports both POST creation and PUT editing', () => {
  assert.match(source, /method: isEditMode \? "PUT" : "POST"/);
  assert.match(source, /completion_status: "not_started"/);
});

test('task form sends bearer token and JSON payload', () => {
  assert.match(source, /Authorization: `Bearer \$\{token\}`/);
  assert.match(source, /JSON\.stringify\(requestBody\)/);
});

test('task form blocks duplicate submission while saving', () => {
  assert.match(source, /if \(isSubmitting\)/);
  assert.match(source, /disabled=\{isSubmitting\}/);
});

test('task form provides success and error feedback', () => {
  assert.match(source, /Task created successfully/);
  assert.match(source, /Task updated successfully/);
  assert.match(source, /role="alert"/);
});

test('task form validates non-negative effort and points', () => {
  assert.match(source, /NON_NEGATIVE_INTEGER_PATTERN/);
  assert.match(source, /NON_NEGATIVE_DECIMAL_PATTERN/);
  assert.match(source, /Point value cannot be negative/);
  assert.match(source, /Estimated effort cannot be negative/);
});
