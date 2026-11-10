[Back to README](../README.md)

# Development

## Layout

| Path | Contents |
|---|---|
| `src/main.ts` | Entry point. Maps RPC methods to the provider |
| `src/rpc.ts` | JSON-RPC over stdio |
| `src/logger.ts` | Colored logs on stderr |
| `src/host.ts` | Services the host gives the plugin |
| `src/providers/itch/` | itch.io API, parsing, library and upload rules |
| `src/library/itch-key.ts` | Reads the API key from the itch desktop app |
| `src/vendor/` | Copies of shared types and helpers (see below) |
| `tests/` | Unit tests. They use in-memory fakes and make no network calls |

## Vendored code

Files in `src/vendor/` are copies from the launcher's shared core. Each one starts with a header:

```ts
// vendored until the SDK is published; replace with @light-launcher/plugin-sdk
```

When the SDK is published, replace these imports with the package and delete `src/vendor/`.

## Commands

| Command | Use |
|---|---|
| `bun test` | Run tests |
| `bun run typecheck` | Check types with `tsc` |
| `bun run build:linux` | Build the Linux program |
| `bun run build:windows` | Build the Windows program |

## Known gaps

| Gap | Effect |
|---|---|
| Storage is in memory | Data is lost when the plugin exits |
| `dump` only logs | Raw pages for failed parses are not saved |
| The desktop key reader is not wired | `src/library/itch-key.ts` has no RPC method yet |
| Permissions are not enforced here | The launcher must check them |
| Credential is passed in `initialize` | The launcher must send the key, since the plugin does not read secrets |
