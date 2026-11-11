# light-launcher-plugin-itch

An itch.io plugin for Light Launcher. It searches itch.io, reads your owned games, finds downloads, and checks for new uploads.

> [!NOTE]
> The plugin is a separate program. Light Launcher starts it and talks to it over stdin and stdout, using JSON-RPC.

## Quick start

The plugin needs the SDK repo in the folder next to this one. See [Development](docs/development.md#setup).

```sh
bun install
bun test
bun run build:linux
```

| Step | Command | Result |
|---|---|---|
| Install packages | `bun install` | Downloads dependencies |
| Run tests | `bun test` | Runs the unit tests, no network |
| Typecheck | `bun run typecheck` | Checks types |
| Build for Linux | `bun run build:linux` | `bin/linux-x64/itch` |
| Build for Windows | `bun run build:windows` | `bin/windows-x64/itch.exe` |
| Build for Windows | `bun run build:windows` | `bin/windows-x64/itch.exe` |

## What it can do

| Capability | What it does |
|---|---|
| browse | Reads itch.io listing and search pages |
| auth | Checks your itch.io API key |
| updateCheck | Tells you when a game has a newer upload |
| resolveFiles | Lists the downloads for a game you own |
| sync:games | Imports the games you own |
| Import key | Copies the API key from the itch desktop app |

## More

| Topic | Page |
|---|---|
| Build and output files | [docs/build.md](docs/build.md) |
| RPC methods and errors | [docs/protocol.md](docs/protocol.md) |
| Manifest fields | [docs/manifest.md](docs/manifest.md) |
| Code layout, tests, known gaps | [docs/development.md](docs/development.md) |
