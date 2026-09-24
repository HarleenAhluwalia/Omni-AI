import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";
import "./Login.css";

function Login({ onRegister }) {
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

  await login(email, password);

};

const handleGoogleLogin = async () => {
  setErrorMessage("");

  const { error: googleError } =
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        queryParams: {
        prompt: "select_account",
      },
    },
  });


  if (googleError) {
    setErrorMessage(googleError.message);
  }
};

const handleMicrosoftLogin = async () => {
  setErrorMessage("");

  console.log("Microsoft login clicked");

  const { error: microsoftError } =
    await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        redirectTo: window.location.origin,
        scopes: "email",
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    console.log("Microsoft OAuth data:", data);
    console.log("Microsoft OAuth error:", microsoftError);

  if (microsoftError) {
    setErrorMessage(microsoftError.message);
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
            onClick={(event) => {
              event.preventDefault();
              onRegister();
            }}
          >
            Create Account
          </a>
        </p>

        <p className="social-title">
          Or log in with:
        </p>

        <button
          className="social-button"
          onClick={handleGoogleLogin}
        >
          Google
        </button>

        <button className="social-button">
          Apple
        </button>

        <button
          className="social-button"
          onClick={handleMicrosoftLogin}
        >
          Microsoft
        </button>
      </div>
    </div>
  );
}

export default Login;