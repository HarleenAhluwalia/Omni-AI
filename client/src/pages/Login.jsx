
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";
import "./Login.css";

function Login({ onRegister }) {
  const { login, error } = useAuth();

  const isResetLink = () =>
    new URLSearchParams(window.location.search).has("reset-password");

  const [view, setView] = useState(
    isResetLink() ? "reset" : "login"
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSessionReady, setResetSessionReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((event, session) => {
        if (!mounted) return;

        if (event === "PASSWORD_RECOVERY") {
          setView("reset");
          setResetSessionReady(!!session);
          setErrorMessage("");
        }

        if (
          isResetLink() &&
          event === "SIGNED_IN" &&
          session
        ) {
          setView("reset");
          setResetSessionReady(true);
        }
      });

    if (isResetLink()) {
      supabase.auth.getSession().then(({ data, error }) => {
        if (!mounted) return;

        if (error) {
          setErrorMessage(error.message);
        }

        setResetSessionReady(!!data?.session);
      });
    }

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const clearMessages = () => {
    setErrorMessage("");
    setSuccessMessage("");
  };

  const goToLogin = () => {
    clearMessages();
    setView("login");
    setPassword("");
    setNewPassword("");
    setConfirmPassword("");

    if (isResetLink()) {
      const url = new URL(window.location.href);
      url.searchParams.delete("reset-password");
      url.searchParams.delete("code");
      url.searchParams.delete("error");
      url.searchParams.delete("error_code");
      url.searchParams.delete("error_description");
      url.hash = "";
      window.history.replaceState({}, "", url.toString());
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    clearMessages();

    if (!email.trim() && !password.trim()) {
      setErrorMessage("Please enter your email and password.");
      return;
    }

    if (!email.trim()) {
      setErrorMessage("Please enter your email.");
      return;
    }

    if (!password.trim()) {
      setErrorMessage("Please enter your password.");
      return;
    }

    try {
      setLoading(true);
      await login(email.trim(), password);
    } catch (err) {
      setErrorMessage(err.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (event) => {
    event.preventDefault();
    clearMessages();

    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setErrorMessage("Please enter your email address.");
      return;
    }

    try {
      setLoading(true);

      const redirectUrl = new URL(window.location.href);
      redirectUrl.search = "";
      redirectUrl.hash = "";
      redirectUrl.searchParams.set("reset-password", "1");

      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: redirectUrl.toString(),
        });

      if (resetError) {
        throw resetError;
      }

      setSuccessMessage(
        "If an account exists for this email, " +
        "you will receive a password reset link. " +
        "Please check your inbox and spam folder."
      );
    } catch (err) {
      setErrorMessage(
        err.message || "Unable to send password reset email."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (event) => {
    event.preventDefault();
    clearMessages();

    if (!resetSessionReady) {
      setErrorMessage(
        "The reset link is invalid, expired, or still loading. " +
        "Please request a new password reset link."
      );
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage(
        "Your new password must contain at least 8 characters."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);

      const { error: updateError } =
        await supabase.auth.updateUser({
          password: newPassword,
        });

      if (updateError) {
        throw updateError;
      }

      // End the temporary Supabase recovery session.
      // The user can then log in normally to Omni AI.
      await supabase.auth.signOut();

      setView("login");
      setPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setResetSessionReady(false);

      const url = new URL(window.location.href);
      url.searchParams.delete("reset-password");
      url.searchParams.delete("code");
      url.hash = "";
      window.history.replaceState({}, "", url.toString());

      setSuccessMessage(
        "Your password has been reset successfully! " +
        "Please log in with your new password."
      );
    } catch (err) {
      setErrorMessage(
        err.message || "Unable to update your password."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    clearMessages();

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
    clearMessages();

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

        {view === "login" && (
          <>
            <h2>Omni AI Login</h2>

            <form onSubmit={handleLogin}>
              <input
                type="email"
                placeholder="Email"
                className="login-input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
              />

              <input
                type="password"
                placeholder="Password"
                className="login-input"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />

              <button
                type="submit"
                className="login-button"
                disabled={loading}
              >
                {loading ? "Logging in..." : "Login"}
              </button>
            </form>

            <button
              type="button"
              className="link-button"
              onClick={() => {
                clearMessages();
                setView("forgot");
              }}
            >
              Forgot Password?
            </button>

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

            <p className="social-title">Or log in with:</p>

            <button
              type="button"
              className="social-button"
              onClick={handleGoogleLogin}
            >
              Google
            </button>

            <button type="button" className="social-button">
              Apple
            </button>

            <button
              type="button"
              className="social-button"
              onClick={handleMicrosoftLogin}
            >
              Microsoft
            </button>
          </>
        )}

        {view === "forgot" && (
          <>
            <h2>Forgot Password?</h2>

            <p className="reset-description">
              Enter your email address and we'll send you a
              password reset link.
            </p>

            <form onSubmit={handleForgotPassword}>
              <input
                type="email"
                placeholder="Email address"
                className="login-input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />

              <button
                type="submit"
                className="login-button"
                disabled={loading}
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
            </form>

            <button
              type="button"
              className="link-button"
              onClick={goToLogin}
            >
              Back to Login
            </button>
          </>
        )}

        {view === "reset" && (
          <>
            <h2>Create New Password</h2>

            <p className="reset-description">
              Enter and confirm your new password.
            </p>

            <form onSubmit={handleUpdatePassword}>
              <input
                type="password"
                placeholder="New password"
                className="login-input"
                value={newPassword}
                onChange={(event) =>
                  setNewPassword(event.target.value)
                }
                autoComplete="new-password"
                minLength={8}
                required
              />

              <input
                type="password"
                placeholder="Confirm new password"
                className="login-input"
                value={confirmPassword}
                onChange={(event) =>
                  setConfirmPassword(event.target.value)
                }
                autoComplete="new-password"
                minLength={8}
                required
              />

              <button
                type="submit"
                className="login-button"
                disabled={loading || !resetSessionReady}
              >
                {loading
                  ? "Updating..."
                  : resetSessionReady
                    ? "Update Password"
                    : "Verifying Reset Link..."}
              </button>
            </form>

            <button
              type="button"
              className="link-button"
              onClick={goToLogin}
            >
              Back to Login
            </button>
          </>
        )}

        {(errorMessage || (view === "login" && error)) && (
          <p className="error-message" role="alert">
            {errorMessage || error}
          </p>
        )}

        {successMessage && (
          <p className="success-message" role="status">
            {successMessage}
          </p>
        )}
      </div>
    </div>
  );
}

export default Login;
