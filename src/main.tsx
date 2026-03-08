import React from "react";
import ReactDOM from "react-dom/client";
import { AppProvider } from "@/app/provider";
import { App } from "@/app/app";
import "@/styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>,
);
