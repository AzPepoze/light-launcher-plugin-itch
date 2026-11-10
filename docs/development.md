[Back to README](../README.md)

# Development

## Setup

The plugin uses the SDK from a folder next to this repo:

```text
parent/
├── light-launcher-plugin-itch/
└── light-launcher-plugin-sdk/
```

`bun install` copies the SDK into `node_modules`. After you change the SDK, run `bun install` again.

## Layout

| Path | Contents |
|---|---|
| `src/main.ts` | Entry point. Maps protocol methods to the provider |
| `src/host.ts` | The services the provider needs from the host |
| `src/logger.ts` | Colored logs on stderr |
| `src/providers/itch/` | itch.io API, parsing, library and upload rules |
| `src/library/itch-key.ts` | Reads the API key from the itch desktop app |
| `tests/` | Unit tests, a manifest schema check and a stdio test |

The protocol runtime, HTTP client and HTML helpers come from `@light-launcher/plugin-sdk`. See [Protocol](protocol.md).

## Commands

| Command | Use |
|---|---|
| `bun test` | Run all tests |
| `bun run typecheck` | Check types with `tsc` |
| `bun run build:linux` | Build the Linux program |
| `bun run build:windows` | Build the Windows program |

## Tests

| File | Checks |
|---|---|
| `itch.test.ts` | Parsing, upload rules, mapping, provider calls and credentials. Uses a fake host, no network |
| `manifest.test.ts` | `plugin.json` against the SDK schema. Skipped with a message when ajv is missing |
| `stdio.test.ts` | Runs the plugin as a child process and talks to it over stdio |
| `logger.test.ts` | Log colors and category colors |

## Known gaps

| Gap | Effect |
|---|---|
| `dataDir` is not used | The plugin keeps no files yet |
| `dump` only logs | Raw pages for failed parses are not saved |
| `fs` is not checked by the host | The desktop key import reads files itself |
| Replies after shutdown are dropped | A request still running when `shutdown` arrives gets no reply |
