import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { QueryProvider } from "./providers/QueryProvider.jsx";
import { DialogProvider } from "./providers/DialogProvider.jsx";
import { AuthProvider } from "./providers/AuthProvider.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryProvider>
      <DialogProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </DialogProvider>
    </QueryProvider>
  </React.StrictMode>
);
