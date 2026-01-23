import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Update favicon based on color scheme
function updateFavicon() {
  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const favicon = document.querySelector('link[rel="icon"]');
  if (favicon) {
    favicon.href = isDark ? "/favicon_light.png" : "/favicon.png";
  }
}

// Update on load
updateFavicon();

// Listen for changes
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", updateFavicon);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
