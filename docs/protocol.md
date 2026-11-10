[Back to README](../README.md)

# Protocol

Light Launcher starts the plugin and sends JSON-RPC 2.0 requests, one per line, on stdin. The plugin writes one reply per line on stdout.

> [!IMPORTANT]
> stdout carries only protocol lines. Logs go to stderr.

## Methods

| Method | Params | Result |
|---|---|---|
| `initialize` | `{ "credential": "<api key or null>" }` | `{ pluginVersion, capabilities }` |
| `source.authStatus` | none | Auth state: `status`, `user`, `message`, `checkedAt` |
| `source.setCredential` | `{ "value": "<api key>" }` | Auth state. The plugin does not save the key |
| `source.search` | `{ url?, query?, page? }` | List of games. Empty unless `url` is an itch.io address |
| `source.fetchGame` | `{ kind, id, url }` (a ref) | One game |
| `source.resolveFiles` | A game ref | List of file candidates |
| `source.prepareDownload` | `{ file, game }` | `{ url, headers }` |
| `source.checkUpdate` | A game ref | Update info, or `null` when nothing changed |
| `source.sync` | none | List of games you own |
| `shutdown` | none | `{}`. The plugin then exits |

Call `initialize` first. Other source methods fail until it runs.

## Errors

| Code | Meaning |
|---|---|
| -32700 | The line is not valid JSON |
| -32600 | The message is not a request |
| -32601 | Unknown method |
| -32000 | The method failed. The message says why |

## Notes

| Topic | Rule |
|---|---|
| Notifications | A request without `id` gets no reply |
| Order | Replies can arrive out of order. Match them by `id` |
| Exit | The plugin also exits when stdin closes |
