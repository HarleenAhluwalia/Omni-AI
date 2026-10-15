
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";

import {
  registerUser,
  loginUser,
  fetchCurrentUser,
  exchangeOAuthToken,
} from "../api/authApi";

import { supabase } from "../lib/supabaseClient";

const AuthContext = createContext(null);

const TOKEN_STORAGE_KEY = "omni_ai_token";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  const [token, setToken] = useState(() =>
    localStorage.getItem(TOKEN_STORAGE_KEY)
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Restore Omni AI authentication on page refresh.
  useEffect(() => {
    let cancelled = false;

    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    fetchCurrentUser(token)
      .then(({ user: currentUser }) => {
        if (!cancelled) {
          setUser(currentUser);
        }
      })
      .catch((err) => {
        if (cancelled) return;

        console.error(
          "Omni AI session verification failed:",
          err
        );

        localStorage.removeItem(TOKEN_STORAGE_KEY);

        setToken(null);
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  // Email/password login.
  const login = useCallback(async (email, password) => {
    setError(null);

    try {
      const {
        token: newToken,
        user: loggedInUser,
      } = await loginUser({ email, password });

      localStorage.setItem(
        TOKEN_STORAGE_KEY,
        newToken
      );

      setUser(loggedInUser);
      setToken(newToken);

      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, []);

  // Registration.
  const register = useCallback(
    async (name, email, password) => {
      setError(null);

      try {
        const {
          token: newToken,
          user: newUser,
        } = await registerUser({
          name,
          email,
          password,
        });

        localStorage.setItem(
          TOKEN_STORAGE_KEY,
          newToken
        );

        setUser(newUser);
        setToken(newToken);

        return true;
      } catch (err) {
        setError(err.message);
        return false;
      }
    },
    []
  );

  // Exchange a Supabase OAuth token for the Omni AI JWT.
  const exchangeOAuthSession = useCallback(
    async (session) => {
      if (!session?.access_token) {
        return;
      }

      const {
        token: newToken,
        user: oauthUser,
      } = await exchangeOAuthToken(
        session.access_token
      );

      localStorage.setItem(
        TOKEN_STORAGE_KEY,
        newToken
      );

      setUser(oauthUser);
      setToken(newToken);
    },
    []
  );

  // Log out from both authentication systems.
  const logout = useCallback(async () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);

    setUser(null);
    setToken(null);
    setError(null);

    try {
      const { error: signOutError } =
        await supabase.auth.signOut();

      if (signOutError) {
        console.warn(
          "Supabase sign-out warning:",
          signOutError.message
        );
      }
    } catch (err) {
      console.warn(
        "Supabase sign-out unavailable:",
        err
      );
    }
  }, []);

  // Restore existing Supabase OAuth session if present.
  useEffect(() => {
    let cancelled = false;

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (
          cancelled ||
          !session?.access_token
        ) {
          return;
        }

        exchangeOAuthSession(session).catch(
          (err) => {
            if (!cancelled) {
              console.error(
                "OAuth session exchange failed:",
                err
              );
            }
          }
        );
      })
      .catch((err) => {
        console.error(
          "Supabase session check failed:",
          err
        );
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (cancelled) {
          return;
        }

        if (
          event === "SIGNED_IN" &&
          session?.access_token
        ) {
          exchangeOAuthSession(session).catch(
            (err) => {
              console.error(
                "OAuth exchange failed:",
                err
              );

              setError(err.message);
            }
          );
        }

        // IMPORTANT:
        // Do not clear the Omni AI JWT simply because
        // there is no Supabase browser session.
        //
        // Email/password users authenticate through
        // Omni AI's backend and may not have a
        // Supabase browser session.
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [exchangeOAuthSession]);

  const value = {
    user,
    token,
    loading,
    error,
    login,
    register,
    logout,
    exchangeOAuthSession,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error(
      "useAuth must be used within an AuthProvider"
    );
  }

  return ctx;
}
