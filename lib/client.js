window.__ModuleLoader__.load({
	id: "dsh-file-ref",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		/**
		* dsh-file-ref browser half: a Codex-style workspace file picker for the
		* composer. Registers an '@' input-trigger source ("file-ref") whose
		* candidates come from the host route /dsh-file-ref/list; picking a file
		* inserts the workspace-relative path as plain text, so the composer shows
		* the full file name and the agent receives a clean relative path it can
		* resolve against the session workspace.
		*/
		const SOURCE_NAME = "file-ref";
		const LIST_ROUTE = "/dsh-file-ref/list";
		/** Required services: the trigger pipeline and the session list (cwd lookup). */
		const inject = ["inputTriggers", "sessions"];
		/** Normalize separators and strip trailing slashes for prefix comparison. */
		const norm = (p) => p.replace(/[\\/]+/g, "/").replace(/\/+$/, "");
		/** Workspace-relative path when the file lives under the cwd, else the basename. */
		const relPath = (cwd, abs) => {
			const c = norm(cwd ?? "");
			const a = norm(abs);
			if (c !== "" && a.toLowerCase().startsWith(c.toLowerCase() + "/")) {
				return a.slice(c.length + 1);
			}
			const parts = a.split("/");
			return parts[parts.length - 1] ?? a;
		};
		/**
		* Client plugin body: register the '@' file source over the session
		* workspace.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			const inputTriggers = ctx.get("inputTriggers");
			const sessions = ctx.sessions;
			if (inputTriggers === void 0) return;
			const cwdOf = (sessionId) => sessions.list.getSnapshot().byId[sessionId]?.cwd;
			const source = {
				trigger: "@",
				name: SOURCE_NAME,
				order: -1,
				async candidates(session, { query, signal }) {
					const cwd = cwdOf(session.sessionId);
					if (cwd === void 0 || cwd === "") return [];
					const controller = new AbortController();
					const onAbort = () => controller.abort();
					signal?.addEventListener("abort", onAbort, { once: true });
					try {
						const response = await fetch(`${LIST_ROUTE}?path=${encodeURIComponent(cwd)}`, {
							signal: controller.signal,
							headers: { accept: "application/json" }
						});
						if (!response.ok) return [];
						const data = await response.json();
						if (!Array.isArray(data.files)) return [];
						const q = query.trim().toLowerCase();
						return data.files
							.filter((f) => typeof f.name === "string" && typeof f.path === "string")
							.filter((f) => q === "" || f.name.toLowerCase().includes(q))
							.map((f) => ({
								name: f.name,
								description: f.path,
								path: f.path,
								icon: "📄"
							}));
					} catch {
						return [];
					} finally {
						signal?.removeEventListener("abort", onAbort);
					}
				},
				onPick({ candidate, session }) {
					const cwd = cwdOf(session.sessionId);
					const abs = candidate.path ?? candidate.description;
					const rel = relPath(cwd, abs);
					// Anchor the reference to the workspace so the model
					// resolves it against the session workspace instead of
					// searching the whole disk by file name.
					return { text: `工作区文件：${rel} ` };
				}
			};
			ctx.effect(() => inputTriggers.registerSource(source), "dsh-file-ref: @ source");
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
