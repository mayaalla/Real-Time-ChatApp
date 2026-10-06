
import './App.css'
import { BrowserRouter }      from "react-router-dom";
import { useSessionRestore }  from "./hooks/useSessionRestore";
import { useAuthStore }       from "./store/authStore";
import { LoadingScreen }      from "./components/LoadingScreen";

export default function App() {
  useSessionRestore();
  const isCheckingAuth = useAuthStore((s) => s.isCheckingAuth);

  
  // While we are checking the session, show a blank/loading screen.
  // This prevents the protected routes from briefly flashing the login page.
  if (isCheckingAuth) {
    return <LoadingScreen />;
  }

  // Once we know the session status, render the router.
  return (
    <BrowserRouter>
      {/* Your routes go here — we build them in Steps 20.3 and 20.4 */}
    </BrowserRouter>
  );
}

