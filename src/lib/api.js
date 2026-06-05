// Base URL for the backend API.
// - Local dev: empty string -> Vite proxies /api to localhost:4000
// - Production: set VITE_API_URL to the deployed backend origin
//   (e.g. https://deciops-demo-api.onrender.com)
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const apiUrl = (path) => `${API_BASE}${path}`;
