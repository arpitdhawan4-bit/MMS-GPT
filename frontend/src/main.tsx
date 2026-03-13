import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";
import { ThemeProvider } from "./components/layout/ThemeContext";

// NOTE: StrictMode has been intentionally removed.
// AG Grid v33 + React 19 can crash under StrictMode because StrictMode
// intentionally double-mounts components in development, which interferes
// with AG Grid's DOM initialization lifecycle.
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </BrowserRouter>
);
