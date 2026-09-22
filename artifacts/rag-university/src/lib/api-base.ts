const configuredApiBase =
  (import.meta.env.VITE_API_BASE as string | undefined) ||
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  "http://localhost:3001";

export const apiBaseUrl = configuredApiBase
  .replace(/\/+$/, "")
  .replace(/\/api$/, "");
