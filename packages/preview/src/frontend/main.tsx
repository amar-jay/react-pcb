/// <reference lib="dom" />
import { createRoot, type Root } from "react-dom/client";
import { App } from "./app.tsx";

// Keep a single root across Bun's frontend module updates.
const container = document.getElementById("root");
if (!container) throw new Error("Preview root element is missing");
let root: Root;
if (import.meta.hot) {
	root = import.meta.hot.data.root ?? createRoot(container);
	import.meta.hot.data.root = root;
} else {
	root = createRoot(container);
}
root.render(<App />);
