/**
 * dsh-file-ref host face.
 *
 * Registers one exact HTTP route on the web server:
 *   GET /dsh-file-ref/list?path=<absolute-directory>
 * which lists the workspace files under that directory (files only, bounded
 * recursive walk) as JSON: { cwd, files: [{ name, path }] }.
 *
 * The browser half (lib/client.js) drives the composer '@' picker off this
 * endpoint.
 */
import { readdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

/** Route served by this plugin. */
export const LIST_ROUTE = "/dsh-file-ref/list";

/** Hard cap on returned files (protects the menu and the wire). */
const MAX_FILES = 300;
/** Recursion depth cap for the walk (0 = cwd only). */
const MAX_DEPTH = 4;
/** Directories never descended into. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  ".idea",
  ".vscode",
  ".next",
  ".nuxt",
  "dist",
  "build",
  ".DS_Store",
]);

/**
 * Collect files under `root`, at most one level of recursion per depth step.
 * @param root - absolute directory to walk.
 * @returns file descriptors with absolute paths.
 */
async function collectFiles(root) {
  const out = [];
  const seen = new Set();
  const walk = async (dir, depth) => {
    if (out.length >= MAX_FILES || seen.has(dir)) return;
    seen.add(dir);
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable directory: skip silently
    }
    const dirs = [];
    for (const entry of entries) {
      if (out.length >= MAX_FILES) break;
      const name = entry.name;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        if (depth < MAX_DEPTH) dirs.push(name);
        continue;
      }
      if (!entry.isFile()) continue; // symlinks/sockets: skip
      if (name.startsWith(".")) continue; // dotfiles: keep the menu tidy
      out.push({
        name,
        path: join(dir, name),
      });
    }
    dirs.sort((a, b) => a.localeCompare(b, "zh-CN"));
    for (const sub of dirs) {
      if (out.length >= MAX_FILES) break;
      await walk(join(dir, sub), depth + 1);
    }
  };
  await walk(root, 0);
  out.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  return out;
}

/**
 * Cordis plugin entry (host face). Registers the listing route; the row's
 * `inject: [webServer]` guarantees `ctx.webServer` exists before apply runs.
 * @param ctx - the host cordis context.
 * @returns the route disposer.
 */
export function apply(ctx) {
  const webServer = ctx.webServer;
  if (webServer === void 0) return;
  const json = (res, status, body) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  };
  ctx.effect(() => webServer.register({
    kind: "exact",
    path: LIST_ROUTE,
    async handler(req, res) {
      try {
        const url = new URL(req.url ?? "/", "http://localhost");
        const path = url.searchParams.get("path") ?? "";
        if (!isAbsolute(path)) {
          json(res, 400, { error: "path must be absolute" });
          return;
        }
        const files = await collectFiles(path);
        json(res, 200, { cwd: path, files });
      } catch (error) {
        json(res, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  }), "dsh-file-ref: list route");
}
