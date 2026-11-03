
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const login = readFileSync(
  new URL('../src/pages/Login.jsx', import.meta.url),
  'utf8'
);

const register = readFileSync(
  new URL('../src/pages/RegisterPage.jsx', import.meta.url),
  'utf8'
);

test('login includes email and password input controls', () => {
  assert.match(login, /type="email"/);
  assert.match(login, /type="password"/);
});

test('login checks missing email and password', () => {
  assert.match(login, /Please enter your email and password/);
  assert.match(login, /Please enter your email\./);
  assert.match(login, /Please enter your password\./);
});

test('login displays loading and accessible error states', () => {
  assert.match(login, /Logging in\.\.\./);
  assert.match(login, /disabled=\{loading\}/);
  assert.match(login, /role="alert"/);
});

test('registration has required fields and minimum password length', () => {
  assert.match(register, /type="email"/);
  assert.match(register, /type="password"/);
  assert.match(register, /minLength=\{8\}/);
  assert.match(register, /required/);
});

test('registration shows loading and error states', () => {
  assert.match(register, /Creating account\.\.\./);
  assert.match(register, /role="alert"/);
  assert.match(register, /disabled=\{submitting\}/);
});
