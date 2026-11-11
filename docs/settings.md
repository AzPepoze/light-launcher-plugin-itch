[Back to the README](../README.md)

# Settings

Settings change how the plugin talks to itch.io and what it shows. Open them in the launcher's plugin settings form. The defaults keep the plugin's normal behaviour.

The form is built from [settings.schema.json](../settings.schema.json).

## Downloads

The launcher has two places for downloads: its downloads folder and its games folder. These settings pick one of them, plus a folder inside it. The plugin cannot name an absolute folder; the launcher owns those paths. The plugin reads the settings on each download, so a change applies without a restart.

| Setting | Default | What it does |
|---|---|---|
| `downloadRoot` | `downloads` | Saves into the launcher's downloads folder, or its games folder |
| `gameSubfolder` | on | Gives each game its own folder, named from the game title |
| `installAfterDownload` | off | Unpacks the archive into the games folder after the download |
| `deleteArchiveAfterInstall` | off | Removes the archive after a good unpack. Only applies when unpacking is on |

> [!NOTE]
> The game folder name works on both Windows and Linux. The plugin removes characters Windows does not allow, drops leading and trailing dots and spaces, and caps the name at 200 bytes. Names Windows reserves, such as `CON`, get an underscore. A title with nothing usable left becomes `game`. The rules come from the SDK.

> [!IMPORTANT]
> The games folder and unpacking need the `$GAMES` permission. The plugin asks for it in `plugin.json`.

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
| Only import favourites | itch.io has no favourites in its API. Collections exist, but they are not the same thing |
| Include bundle and key games | itch.io's owned-keys list does not say which keys come from a bundle |
| Upload type filter | itch.io documents only the `default` upload type |

## Limits

| Topic | Effect |
|---|---|
| Library sync | The launcher does not call the sync method today. Its settings apply when it does |
| Update checks | The launcher runs them when you ask. They are not scheduled |
