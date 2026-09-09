import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";

// Configure API base URL for client requests. Use Vite env when provided,
// otherwise default to the local api-server used in development.
const apiBase =
	(import.meta.env.VITE_API_BASE as string) ||
	(import.meta.env.VITE_API_BASE_URL as string) ||
	"http://localhost:3001";
setBaseUrl(apiBase.replace(/\/+$/, ""));

createRoot(document.getElementById("root")!).render(<App />);
