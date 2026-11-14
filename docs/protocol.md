[Back to README](../README.md)

# Protocol

Light Launcher starts the plugin and talks to it with JSON-RPC 2.0. Each message is one JSON object on one line.

- The launcher writes requests to the plugin's stdin.
- The plugin writes replies to its stdout.
- The plugin writes logs to stderr.

> [!IMPORTANT]
> stdout carries protocol lines only. A stray line on stdout breaks the connection.

The message rules and typed params come from the `@light-launcher/plugin-sdk` package.

## Methods the plugin answers

| Method | Params | Result |
|---|---|---|
| `initialize` | `hostVersion`, `apiVersion`, `platform`, `grantedPermissions`, `dataDir` | `pluginVersion`, `capabilities` keyed by source id |
| `source.authStatus` | `source` | Auth state |
| `source.setCredential` | `source`, `value` | Auth state. Saves the key when itch.io accepts it |
| `source.clearCredential` | `source` | Auth state. Deletes the saved key |
| `source.parseRef` | `url` | `Ref`, or `null` when the URL is not an itch.io game |
| `source.search` | `source`, `url?`, `query?`, `page?` | `{ games }`. Empty unless `url` is an itch.io address |
| `source.fetchGame` | `source`, `ref` | `{ game }` |
| `source.resolveFiles` | `source`, `game` | `{ files }` |
| `source.prepareDownload` | `source`, `file`, `game` | `{ url, headers, root?, subfolder?, install?, installSubfolder?, deleteArchive? }` |
| `source.checkUpdate` | `source`, `game` | `{ update }`. `update` is `null` when nothing changed |
| `source.sync` | `source` | `GameDTO[]`, the games you own (`sync:games`) |
| `source.listGames` | `source`, `scope`, `cursor?`, `limit` | `{ games, nextCursor?, total? }`, one page of the games you own. Needs `listGames` |
| `source.browse` | `source`, `query?`, `filters?`, `sort?`, `order?`, `cursor?`, `limit` | `{ games, nextCursor? }`, one page of the public itch.io search |
| `source.listFilters` | `source`, `group`, `query?`, `limit` | `{ options }`, the static values of one browse group |
| `itch.importDesktopKey` | none | `{ found }`. Copies the key from the itch desktop app |
| `shutdown` | none | `null`. The plugin then exits |

Call `initialize` first. Other methods fail until it runs.

## Browse

`source.browse` reads the public `https://itch.io/search` page. No API key is needed. The page has no JSON API, so the game cells are parsed from HTML with cheerio:
`div.game_cell`, `div.game_title a.title`, `div.game_thumb img` (`data-lazy_src`, then `data-src`, then `src`), `div.game_author a`, `div.game_text` and `.price_value`/`.sale_tag`.

| Filter group | Values | URL parameter |
|---|---|---|
| Search | free text | `q` |
| Sort | `popular`, `new`, `updated` | `sort` (best-effort; the search page currently ignores it). `order` (`asc`/`desc`, default `desc`) is accepted and tied to the cursor, but is not sent because the page has no order parameter |
| Price | `all`, `free`, `paid` | `price` plus the search page's `facets=m.free` or `facets=m.paid` |
| Classification | `games`, `assets`, `mods` | `classification=game`, `assets`, `game_mod` |

`source.listFilters` answers the static options for `sort`, `price` and `classification`; it also applies the group's search text and limit. It does not use the network.

`nextCursor` first spends the cells left on the same page, then follows a real next-page link. The search page currently loads without a pager and ignores `sort`, so the cursor is omitted after the cells on the first page and `sort` is best-effort; that is deliberate, because guessing would loop over the same games. `order` is part of the cursor's filter fingerprint but is not sent. A cursor is tied to its query and filters, and a cursor from another query fails with `-32007` / `invalid_cursor`.

> [!IMPORTANT]
> This is scraping. itch.io does not publish a stable search API, and its markup can change without notice. A page with no parsed cells is written to the debug `dumpDir` when that setting is on. Browse results are read-only and are not added to the library.

The launcher's Library sidebar only calls these methods for a source that declares `browse:filters` and a `sidebar` in `plugin.json`. This plugin declares `browse:filters` and a `sidebar` in `plugin.json`, so the Library browse UI can call them.

`source.prepareDownload` also returns the download settings as hints: `root` (`downloads` or `games`), `subfolder`, `install`, `installSubfolder` and `deleteArchive`. The host checks them the same way as `downloads.enqueue`, including the `$GAMES` permission, and queues the file. See [Settings](settings.md#downloads).

## Credentials

The API key is never sent in `initialize`. The plugin keeps it in the host keyring:

| Host call | When the plugin makes it |
|---|---|
| `secrets.get` with key `apikey` | First time the key is needed |
| `secrets.set` with key `apikey` | After `source.setCredential` gets an accepted key, or after `itch.importDesktopKey` finds one |
| `secrets.delete` with key `apikey` | On `source.clearCredential`, or `source.setCredential` with an empty value |

After the first read, the key stays in memory until it changes.

## Services the plugin calls

| Host method | Needs permission | Used for |
|---|---|---|
| `http.request` | `network` (itch.io hosts) | Every web and API call |
| `secrets.get`, `secrets.set`, `secrets.delete` | `secrets` | The API key |

> [!NOTE]
> `http.request` is rate limited and retried by the host. The plugin does not do its own rate limiting.

## Errors

| Code | Name | Meaning |
|---|---|---|
| -32700 | Parse error | The line is not JSON |
| -32600 | Invalid request | The message is not a JSON-RPC request |
| -32601 | Method not found | The plugin has no such method |
| -32603 | Internal error | The method failed. The message says why |
| -32007 | Invalid cursor | The cursor is malformed or belongs to another query or filter set (`invalid_cursor`) |

## Notes

| Topic | Rule |
|---|---|
| Notifications | A request without `id` gets no reply |
| Order | Replies can arrive out of order. Match them by `id` |
| Shutdown | Send `shutdown` after the last reply you need. Replies still running at that point are dropped |
| Exit | The plugin also exits when stdin closes |

## Example

Launcher checks the saved key:

```json
{"jsonrpc":"2.0","id":"c","method":"source.authStatus","params":{"source":"itch"}}
```

Plugin asks the host for the key:

```json
{"jsonrpc":"2.0","id":1,"method":"secrets.get","params":{"key":"apikey"}}
```

Launcher answers with no key saved:

```json
{"jsonrpc":"2.0","id":1,"result":{"value":null}}
```

Plugin answers the auth check:

```json
{"jsonrpc":"2.0","id":"c","result":{"status":"unconfigured","checkedAt":"2026-01-01T00:00:00.000Z"}}
```
