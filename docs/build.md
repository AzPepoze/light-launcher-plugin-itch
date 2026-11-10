[Back to README](../README.md)

# Build

Builds make one program per operating system. Each program includes the Bun runtime, so no Bun install is needed to run it.

## Commands

| Command | Output |
|---|---|
| `bun run build:linux` | `bin/linux-x64/itch` |
| `bun run build:windows` | `bin/windows-x64/itch.exe` |

> [!NOTE]
> The first Windows build downloads the Windows Bun runtime. Later builds use the cache.

## Size

| Output | Size |
|---|---|
| Linux | about 90 MB |
| Windows | about 116 MB |

Most of the size is the runtime. The plugin code is small.

## Steps

1. Install packages with `bun install`.
2. Run `bun test` and `bun run typecheck`.
3. Run the build command for your target.

The `bin/` folder is not committed.
