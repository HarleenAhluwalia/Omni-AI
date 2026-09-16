// same file in client-integration/src/api/authApi.js
const API_BASE_URL = import.meta.env.REACT_APP_API_URL || "http://localhost:4000/api";

async function handleResponse(res) {
  const data = await res.json();
  if (!res.ok) {
    const message = (data.errors && data.errors.join(" ")) || data.error || "Request failed.";
    throw new Error(message);
  }
  return data;
}

export async function registerUser({ name, email, password }) {
  const res = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  return handleResponse(res);
}

export async function loginUser({ email, password }) {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return handleResponse(res);
}

export async function fetchCurrentUser(token) {
  const res = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return handleResponse(res);
}
