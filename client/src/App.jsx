import { useEffect, useState } from "react";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import RegisterPage from "./pages/RegisterPage";

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
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

  return (
    <>

      {loggedIn ? (
        <Dashboard />
      ) : showRegister ? (
      <RegisterPage />
      ) : (
      <Login
        onLogin={() => setLoggedIn(true)}
        onRegister={() => setShowRegister(true)}
      />
      )}

    </>
  );
}

export default App;