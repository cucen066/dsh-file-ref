# dsh-file-ref

Codex-style **workspace file references** for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web GUI: type `@` in the composer to browse the current workspace's files and insert the file's workspace-relative path as plain text.

```
@ → file.md → send
```

The agent receives a clean relative path it can resolve against the session workspace — no absolute paths, no truncated chips.

## Why plain text instead of a chip?

DSH's composer reference chips occupy a **single character cell**, so any label longer than 1–2 characters is visually truncated (the full label only appears on hover). For file names that defeats the purpose. Inserting the path as plain text means:

- the composer shows the **complete file name** before you send;
- the sent message is **exactly what you picked** (WYSIWYG);
- the agent gets a short, unambiguous relative path (`sub/file.md` for nested files).

## Features

- `@` opens a file group at the top of the existing trigger menu (before subagents/plugins).
- Candidates come from a small host endpoint, so the browser never touches the filesystem directly.
- Files only (directories are skipped), recursive walk up to depth 4, capped at 300 files; `node_modules`, `.git`, and dotfiles are excluded.
- Workspace-relative path insertion; falls back to the bare file name when the file is outside the workspace root.

## Requirements

- A running DSH **web** profile (`dsh web`).
- Loopback bind (`127.0.0.1` — the default). See [Security](#security).

## Installation

Add the package to the profile and enable it, then restart `dsh web`.

```sh
# from your workspace (the path is anchored to the invoking directory)
dsh plugin --profile web add github:<your-account>/dsh-file-ref
# or from a local checkout
dsh plugin --profile web add /path/to/dsh-file-ref
```

Append a row to `$DSH_HOME/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - id: file-ref
      name: 'dsh-file-ref'
      inject: [webServer]
```

Restart the server:

```sh
dsh web
```

> While developing the bundle itself, the client half hot-reloads: the
> `client-hmr` chain polls served bundles every 500 ms and reloads the plugin
> in the browser without a server restart. New rows (the cordis patch above)
> still need a restart because the boot graph is composed at startup.

## How it works

Two halves, one package (a `dsh.client` dual-face plugin):

- **Host half** (`lib/index.js`) registers one exact HTTP route on the web
  server: `GET /dsh-file-ref/list?path=<absolute-directory>` → `{ cwd, files:
  [{ name, path }] }`. The walk uses `node:fs/promises` with a bounded
  recursive scan.
- **Browser half** (`lib/client.js`) registers an `@` input-trigger source
  (`file-ref`, order `-1` so it lists first). Candidates call the route with
  the session's `cwd` (from the sessions store). Picking a file inserts the
  workspace-relative path plus a trailing space.

The browser never needs a filesystem API; the host never exposes one beyond
the single listing route.

## Development

The client bundle is a plain classic script that registers itself via
`window.__ModuleLoader__.load({ id, factory })` (the format the DSH module
loader serves under `/plugins/<id>/client.js`). No build step is required.

Run the host smoke test (no cordis needed):

```sh
node smoke-test.mjs                # lists this package's own directory
node smoke-test.mjs /path/to/dir   # or any absolute directory
```

## Security

- The listing route is **unauthenticated** and accepts any absolute path —
  acceptable for the default loopback bind, not for `--host 0.0.0.0`.
- Relative paths are rejected (`400`); unreadable directories are skipped
  silently.
- No file contents ever leave the host — only names and paths.

## Limitations

- Web surface only (the composer lives in the web GUI).
- Files only; no directory entries, no nested-picker navigation.
- The `@` menu group title renders the raw source name (`file-ref`) because
  the trigger menu's locale namespace is owned by `ui-input-trigger`.

## License

MIT
