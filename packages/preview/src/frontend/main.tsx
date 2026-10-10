/// <reference lib="dom" />
import { createRoot, type Root } from "react-dom/client";
import { App } from "./app.tsx";

// Keep a single root across Bun's frontend module updates.
const root: Root = import.meta.hot
	? (import.meta.hot.data.root ??= createRoot(document.getElementById("root")!))
	: createRoot(document.getElementById("root")!);
root.render(<App />);
