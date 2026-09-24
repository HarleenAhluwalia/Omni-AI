// same file in client-integration/src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { registerUser, loginUser, fetchCurrentUser } from "../api/authApi";
import { supabase } from "../lib/supabaseClient";

const AuthContext = createContext(null);
const TOKEN_STORAGE_KEY = "omni_ai_token";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // On app load, verify any stored token is still valid and load the user.
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetchCurrentUser(token)
      .then(({ user }) => setUser(user))
      .catch(() => {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const login = useCallback(async (email, password) => {
    setError(null);
    try {
      const { token: newToken, user: loggedInUser } = await loginUser({ email, password });
      localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
      setToken(newToken);
      setUser(loggedInUser);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, []);

  const register = useCallback(async (name, email, password) => {
    setError(null);
    try {
      const { token: newToken, user: newUser } = await registerUser({ name, email, password });
      localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
      setToken(newToken);
      setUser(newUser);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, []);


/*
  const logout = useCallback(async() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);

    await supabase.auth.signOut();
    
    setToken(null);
    setUser(null);
  }, []);
*/
  // above replaced with:
  const logout = useCallback(async () => {
  console.log("Logout started");

  localStorage.removeItem(TOKEN_STORAGE_KEY);

  const { error } = await supabase.auth.signOut();

  console.log("Supabase logout error:", error);

  setToken(null);
  setUser(null);

  console.log("Logout finished");
}, []);

/*
  useEffect(() => {
    // Check whether a Supabase/Google session already exists
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
      }
    });

    // Listen for future Supabase login/logout changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
          setUser(session.user);
        } else {
          setUser(null);
        }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);
*/
  // above replaced with:
  useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    console.log("Supabase session on load:", session);

    if (session?.user) {
      setUser(session.user);
    }
  });

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    console.log("Supabase auth event:", event);
    console.log("Supabase auth session:", session);

    if (session?.user) {
      setUser(session.user);
    } else {
      setUser(null);
    }
  });

  return () => {
    subscription.unsubscribe();
  };
}, []);


  const value = { user, token, loading, error, login, register, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
