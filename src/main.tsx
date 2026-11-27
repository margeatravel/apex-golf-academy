import "./lib/demoFetchGuard";
import "./lib/demoClientGuard";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
