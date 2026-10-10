import { useEffect, useRef, useState } from "react";
import type { PreviewSnapshot } from "../../index.ts";

export type PreviewConnection = "connecting" | "connected" | "disconnected";

function initialSnapshot(): PreviewSnapshot {
	const payload = document.getElementById("preview-data")?.textContent;
	if (payload) {
		const parsed = JSON.parse(payload) as PreviewSnapshot | null;
		if (parsed) return parsed;
	}
	return {
		entry: "",
		result: null,
		projection: null,
		error: null,
		version: -1,
		building: false,
		live: location.protocol !== "file:",
	};
}

/** One request at a time, canceled when the viewer unmounts or hot reloads. */
export function usePreview() {
	const [snapshot, setSnapshot] = useState(initialSnapshot);
	const version = useRef(snapshot.version);
	const [connection, setConnection] = useState<PreviewConnection>(
		snapshot.live ? "connecting" : "connected",
	);
	useEffect(() => {
		if (!snapshot.live) return;
		const controller = new AbortController();
		let timer: ReturnType<typeof setTimeout>;
		const get = async (path: string) => {
			const response = await fetch(path, {
				cache: "no-store",
				signal: controller.signal,
			});
			if (!response.ok)
				throw new Error(`Preview request failed (${response.status})`);
			return response.json();
		};
		const poll = async () => {
			try {
				const status = (await get("/__preview/status")) as {
					version: number;
					building: boolean;
				};
				if (status.version !== version.current) {
					const next = (await get("/__preview/data")) as PreviewSnapshot;
					if (controller.signal.aborted) return;
					version.current = next.version;
					setSnapshot(next);
				} else
					setSnapshot((previous) =>
						previous.building === status.building
							? previous
							: { ...previous, building: status.building },
					);
				setConnection("connected");
			} catch {
				if (!controller.signal.aborted) setConnection("disconnected");
			} finally {
				if (!controller.signal.aborted) timer = setTimeout(poll, 500);
			}
		};
		void poll();
		return () => {
			controller.abort();
			clearTimeout(timer);
		};
		// Snapshot updates must not restart the polling loop.
	}, [snapshot.live]);
	return { snapshot, connection };
}
