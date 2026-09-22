import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";
import { apiBaseUrl } from "./lib/api-base";

setBaseUrl(apiBaseUrl);

createRoot(document.getElementById("root")!).render(<App />);
