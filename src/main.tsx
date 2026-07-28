import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Bundled locally so startup never waits on Google Fonts (unreachable in
// some regions); Chinese text keeps falling back to system fonts.
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/newsreader/opsz.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
