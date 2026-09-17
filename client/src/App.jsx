import { useEffect, useState } from "react";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import RegisterPage from "./pages/RegisterPage";
import { useAuth } from "./context/AuthContext";

function App() {
  const { user, loading } = useAuth();
  const [showRegister, setShowRegister] = useState(false);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/health`)
      .then((response) => response.json())
      .then((data) => {
        console.log("Backend response:", data);
      })
      .catch((error) => {
        console.error("Backend connection failed:", error);
      });
  }, []);

  if (loading) {
    return <p>Loading...</p>;
  }

  return (
    <>
      {user ? (
        <Dashboard />
      ) : showRegister ? (
        <RegisterPage
          onBackToLogin={() => setShowRegister(false)}
        />
      ) : (
        <Login
          onRegister={() => setShowRegister(true)}
        />
      )}
    </>
  );
}

export default App;