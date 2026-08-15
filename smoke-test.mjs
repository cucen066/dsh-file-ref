// Standalone smoke test for the dsh-file-ref host route, without cordis.
// Usage: node smoke-test.mjs [absolute-path-to-list]
// The path defaults to this package's own directory (portable).
import http from "node:http";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { apply, LIST_ROUTE } from "./lib/index.js";

const target = process.argv[2] ?? dirname(fileURLToPath(import.meta.url));

const routes = new Map();
const webServer = {
  register(route) {
    const key = `${route.kind}:${route.path}`;
    routes.set(key, route);
    return () => routes.delete(key);
  },
};
let effectRuns = 0;
const ctx = {
  webServer,
  effect(fn) {
    effectRuns += 1;
    fn(); // cordis executes the effect body immediately
    return () => {};
  },
};

apply(ctx);
if (effectRuns !== 1) throw new Error(`expected 1 effect run, got ${effectRuns}`);
const route = routes.get(`exact:${LIST_ROUTE}`);
if (!route) throw new Error(`route ${LIST_ROUTE} not registered`);

const server = http.createServer((req, res) => route.handler(req, res));
server.listen(0, "127.0.0.1", async () => {
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}${LIST_ROUTE}`;
  let failures = 0;

  // 1. listing (workspace dir, or the package dir by default)
  let res = await fetch(`${base}?path=${encodeURIComponent(target)}`);
  let data = await res.json();
  const ok1 = res.status === 200 && Array.isArray(data.files) && data.files.length > 0;
  console.log(`listing ${target}:`, res.status, ok1 ? `${data.files.length} files` : JSON.stringify(data));
  if (!ok1) failures += 1;

  // 2. relative path rejected
  res = await fetch(`${base}?path=relative/path`);
  data = await res.json();
  const ok2 = res.status === 400;
  console.log("relative path:", res.status, ok2 ? "rejected (expected)" : JSON.stringify(data));
  if (!ok2) failures += 1;

  // 3. missing path rejected
  res = await fetch(base);
  const ok3 = res.status === 400;
  console.log("missing path:", res.status, ok3 ? "rejected (expected)" : "unexpected");
  if (!ok3) failures += 1;

  // 4. nonexistent dir -> 200 with empty list (unreadable roots are skipped)
  res = await fetch(`${base}?path=${encodeURIComponent(process.platform === "win32" ? "C:\\no-such-dir-xyz" : "/no/such/dir/xyz")}`);
  data = await res.json();
  const ok4 = res.status === 200 && Array.isArray(data.files) && data.files.length === 0;
  console.log("nonexistent dir:", res.status, ok4 ? "empty list (expected)" : JSON.stringify(data).slice(0, 120));
  if (!ok4) failures += 1;

  console.log(failures === 0 ? "PASS" : `${failures} check(s) failed`);
  server.close();
  process.exitCode = failures === 0 ? 0 : 1;
});
