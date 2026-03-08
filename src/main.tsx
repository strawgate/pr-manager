import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/app/app";
import { AppProvider } from "@/app/provider";
import "@/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>,
);
