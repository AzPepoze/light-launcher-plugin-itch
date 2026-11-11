[Back to README](../README.md)

# Manifest

The manifest is `plugin.json` in the repo root. Light Launcher reads it before it starts the plugin. It must match the `plugin.schema.json` file in the SDK package. The test suite checks this.

## Fields

| Field | Value in this plugin | Meaning |
|---|---|---|
| `id` | `itch` | Unique plugin id |
| `name` | `itch.io` | Name shown to users |
| `version` | `0.1.0` | Plugin version |
| `apiVersion` | `1` | Protocol major version the plugin targets |
| `minHost` | `2.0.0` | Oldest launcher version that can run it |
| `entry.linux-x64` | `bin/linux-x64/itch` | Program for 64-bit Linux |
| `entry.windows-x64` | `bin/windows-x64/itch.exe` | Program for 64-bit Windows |
| `contributes.sources` | One source, `itch` | The game source the plugin adds |
| `contributes.settings` | `{ "$ref": "settings.schema.json" }` | The settings form. See [Settings](settings.md) |
| `contributes.commands` | `import-desktop-key` | An action in the command palette |
| `permissions` | See below | What the plugin may use |

## Source capabilities

| Capability | Included | The launcher may call |
|---|---|---|
| `browse` | Yes | `source.search`, `source.fetchGame` |
| `auth` | Yes | `source.authStatus`, `source.setCredential`, `source.clearCredential` |
| `updateCheck` | Yes | `source.checkUpdate` |
| `resolveFiles` | Yes | `source.resolveFiles`, `source.prepareDownload` |
| `sync:games` | Yes | `source.sync`, which returns the games you own |

> [!IMPORTANT]
> A source declares `sync:games` or `sync:index`, never both. This plugin uses `sync:games`.

## Commands

| Command id | Label | Method it runs |
|---|---|---|
| `import-desktop-key` | Import itch.io key from the itch app | `itch.importDesktopKey` |

## Permissions

| Permission | Value | Why the plugin needs it |
|---|---|---|
| `network` | `itch.io`, `*.itch.io`, `*.itch.zone` | Calls to itch.io and its download hosts |
| `secrets` | `true` | Saves the API key in the host keyring |
| `fs` | `$APPDATA_ITCH` | Reads the API key from the itch desktop app data folder |

### The itch app folder

`$APPDATA_ITCH` is the itch desktop app's data folder. The import command looks for its `butler.db` file in:

| System | Folder |
|---|---|
| Linux | `~/.config/itch` |
| Windows | `%APPDATA%\itch` and `%LOCALAPPDATA%\itch` |
| macOS | `~/Library/Application Support/itch` |

> [!WARNING]
> `permissions` is a request. Network calls go through the host, so the launcher checks the `network` list. The plugin reads the desktop app's files itself, so the launcher does not check `fs` for them.
