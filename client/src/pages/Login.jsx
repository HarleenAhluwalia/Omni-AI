import { useState } from "react";
import "./Login.css";

function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const handleLogin = () => {
  // Temporary login information for frontend testing
  const correctUsername = "test";
  const correctPassword = "omni123";

  if (username.trim() === "" && password.trim() === "") {
    setErrorMessage("Please enter your username and password.");
    return;
  }

  if (username.trim() === "") {
    setErrorMessage("Please enter your username.");
    return;
  }

  if (password.trim() === "") {
    setErrorMessage("Please enter your password.");
    return;
  }

  // Check temporary username and password
  if (
    username !== correctUsername ||
    password !== correctPassword
  ) {
    setErrorMessage("Incorrect username or password.");
    return;
  }

  // Correct login
  setErrorMessage("");
  onLogin();
};

  return (
    <div className="login-page">
      <div className="login-container">
        <h1 className="logo">Omni AI</h1>

        <p className="tagline">
          Join 10000+ users in planning with confidence today.
        </p>

        <h2>Omni AI Login</h2>

        <input
          type="text"
          placeholder="Username"
          className="login-input"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          className="login-input"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <button
          className="login-button"
          onClick={handleLogin}
        >
          Login
        </button>

        {errorMessage && (
          <p className="error-message">
            {errorMessage}
          </p>
        )}

        <a href="#" className="link">
          Forgot Password?
        </a>

        <p>
          Not registered?{" "}
          <a href="#" className="link">
            Create Account
          </a>
        </p>

        <p className="social-title">
          Or log in with:
        </p>

        <button className="social-button">Google</button>
        <button className="social-button">Apple</button>
        <button className="social-button">Microsoft</button>
      </div>
    </div>
  );
}

export default Login;