[Back to the README](../README.md)

# Settings

Settings change how the plugin talks to itch.io and what it shows. Open them in the launcher's plugin settings form. The defaults keep the plugin's normal behaviour.

The form is built from [settings.schema.json](../settings.schema.json).

## Platform

| Setting | Default | What it does |
|---|---|---|
| `preferredPlatform` | `any` | `windows`, `linux` or `osx`. Files for this platform are listed first |
| `skipSoundtracksAndExtras` | off | Hides files whose name says soundtrack or OST |

## Library

| Setting | Default | What it does |
|---|---|---|
| `syncOwnedGames` | on | Off imports no games from your itch.io library |
| `syncIntervalHours` | `0` | Reuses the last library import for this many hours. `0` imports every time |

## Updates

| Setting | Default | What it does |
|---|---|---|
| `updateCheckIntervalHours` | `0` | Skips a game's update check if it was checked this recently. `0` checks every time |

> [!NOTE]
> A skipped update check reports "no update". Wait for the interval to pass to check again.

## Network

| Setting | Default | What it does |
|---|---|---|
| `requestDelayMs` | `0` | Waits this many milliseconds between requests to itch.io. `0` sends them without a wait |
| `userAgent` | empty | Browser identity sent with each request. Empty uses the default |

## Debug

| Setting | Default | What it does |
|---|---|---|
| `verboseLogging` | off | Writes debug messages to the log |
| `dumpDir` | empty | Saves raw pages here when a page cannot be read. Empty saves nothing |

> [!TIP]
> Turn on `verboseLogging` and set `dumpDir` when you report a problem. The log and the saved pages show what itch.io returned.

## Not available

These settings are not in the plugin, because the launcher decides them:

| Idea | Why |
|---|---|
| Download folder, subfolders | The launcher picks the download folder. The plugin cannot pass a folder when it starts a download |
| Install after download, delete archive | The launcher runs these steps. The plugin cannot set them |
| Only import favourites | itch.io has no favourites in its API. Collections exist, but they are not the same thing |
| Include bundle and key games | itch.io's owned-keys list does not say which keys come from a bundle |
| Upload type filter | itch.io documents only the `default` upload type |

## Limits

| Topic | Effect |
|---|---|
| Library sync | The launcher does not call the sync method today. Its settings apply when it does |
| Update checks | The launcher runs them when you ask. They are not scheduled |
