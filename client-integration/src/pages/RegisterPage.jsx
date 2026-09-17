import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function RegisterPage({ onSuccess }) {
  const { register, error } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    const success = await register(name, email, password);
    setSubmitting(false);
    if (success && onSuccess) onSuccess();
  }

  return (
    <form onSubmit={handleSubmit}>
      <h2>Create Account</h2>
      {error && <p role="alert">{error}</p>}
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
      </label>
      <button type="submit" disabled={submitting}>
        {submitting ? "Creating account..." : "Sign Up"}
      </button>
    </form>
  );
}
