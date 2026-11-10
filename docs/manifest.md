[Back to README](../README.md)

# Manifest

The manifest is `plugin.json` in the repo root. Light Launcher reads it before it starts the plugin.

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
| `contributes.sources` | One source, `itch` | What the plugin adds to the launcher |
| `permissions.network` | `itch.io`, `*.itch.io`, `*.itch.zone` | Hosts the plugin may reach |
| `permissions.secrets` | `true` | The plugin needs the saved API key |

## Source capabilities

| Capability | Included |
|---|---|
| browse | Yes |
| auth | Yes |
| updateCheck | Yes |
| resolveFiles | Yes |
| sync | Yes |

> [!WARNING]
> `permissions` is a request. In this version the launcher does not run the plugin in a sandbox, so a plugin can still open other connections.
