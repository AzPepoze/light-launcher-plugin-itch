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

## CI

The workflows check out [AzPepoze/light-launcher-plugin-sdk](https://github.com/AzPepoze/light-launcher-plugin-sdk) next to the plugin before `bun install`, because the SDK is a local `file:` dependency. This step goes away when the SDK is published.

## Layout

| Path | Contents |
|---|---|
| `src/main.ts` | Entry point. Maps protocol methods to the provider |
| `src/providers/itch/` | itch.io API, parsing, library, browse and upload rules |
| `src/library/itch-key.ts` | Reads the API key from the itch desktop app |
| `src/settings.ts` | Reads saved settings, with defaults. See [Settings](settings.md) |
| `src/http.ts` | Applies the request delay and user agent to every request |
| `settings.schema.json` | The settings form. Defaults must match `src/settings.ts` |
| `tests/` | Unit tests, a manifest schema check and a stdio test |

The protocol runtime, logger, HTTP client, dump writer, settings helpers and HTML helpers come from `@light-launcher/plugin-sdk`. See [Protocol](protocol.md).

## Commands

| Command | Use |
|---|---|
| `bun test` | Run all tests |
| `bun run typecheck` | Check types with `tsc` |
| `bun run validate` | Check `plugin.json` with `llp` |
| `bun run pack` | Pack `dist/<id>-<version>.llplugin` |
| `bun run build:linux` | Build the Linux program |
| `bun run build:windows` | Build the Windows program |

## Tests

| File | Checks |
|---|---|
| `itch.test.ts` | Parsing, upload rules, mapping, provider calls, credentials and the owned game list. Uses a fake host, no network |
| `browse.test.ts` | Browse URL building, search-card parsing, cursors, next-page evidence and `listFilters`. Uses a fixture, no network |
| `manifest.test.ts` | `plugin.json` against the SDK schema. Skipped with a message when ajv is missing |
| `stdio.test.ts` | Runs the plugin as a child process and talks to it over stdio |
| `settings.test.ts` | Settings schema, defaults, invalid values and the download settings against the SDK |
| `http.test.ts` | Request delay and user agent |

## Known gaps

| Gap | Effect |
|---|---|
| `dataDir` is not used | The plugin keeps no files yet |
| Dumps need `dumpDir` | Raw pages for failed parses are written there only when the setting is not empty |
| `fs` is not checked by the host | The desktop key import reads files itself |
| Replies after shutdown are dropped | A request still running when `shutdown` arrives gets no reply |
| itch.io search has no stable API | Browse parses search HTML. Markup changes can break it, and the search page currently offers no pager, so browse stops after the cells on the first page |
