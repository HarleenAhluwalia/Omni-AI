import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import "./Login.css";

function Login({ onLogin, onRegister }) {
  const { login, error } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const handleLogin = async () => {
  
  if (email.trim() === "" && password.trim() === "") {
    setErrorMessage("Please enter your email and password.");
    return;
  }

  if (email.trim() === "") {
    setErrorMessage("Please enter your email.");
    return;
  }

  if (password.trim() === "") {
    setErrorMessage("Please enter your password.");
    return;
  }

  setErrorMessage("");

  const success = await login(email, password);

  if (success) {
    onLogin();
  }

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
          type="email"
          placeholder="Email"
          className="login-input"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
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

        {(errorMessage || error) && (
          <p className="error-message">
          {errorMessage || error}
          </p>
        )}

        <a href="#" className="link">
          Forgot Password?
        </a>

        <p>
          Not registered?{" "}
        <a
          href="#"
          className="link"
          onClick={(e) => {
            e.preventDefault();
            onRegister();
         }}
    >
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