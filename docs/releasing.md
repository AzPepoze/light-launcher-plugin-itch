[Back to README](../README.md)

# Releasing

This page explains how a new version of the itch.io plugin is tagged and published.

## Cut a release

1. Set the same version in `plugin.json` and `package.json`. For example `0.1.0` becomes `0.1.1`.
2. Run `bun run validate` and `bun test`.
3. Commit the bump with a Conventional Commit message, for example `chore(release): 0.1.1`.
4. Create the tag: `git tag v0.1.1`.
5. Push the commit and the tag: `git push origin HEAD` and `git push origin v0.1.1`.

`plugin.json` is the version the launcher sees. `package.json` keeps the same number for tooling. The tag must be the version with a `v` prefix, or the release workflow stops with an error.

## What the release contains

| File | Contents |
|---|---|
| `itch-<version>.llplugin` | The plugin package: `plugin.json`, both programs, the settings schema, the README, the license, and an inner `SHA256SUMS` |
| `SHA256SUMS` | SHA-256 checksums of the `.llplugin` file |

The release notes group the Conventional Commits since the previous `v*` tag. Types such as `feat` and `fix` get their own section; other subjects go under "Other changes". A `!` before the colon adds a "Breaking changes" section.

## Verify a download

```sh
sha256sum -c SHA256SUMS
```

## Signing

The package is unsigned today. The SDK program `llp` has no sign command, so the workflow prints a notice and publishes the unsigned package. The launcher only installs an unsigned package when you allow unsigned plugins.

The workflow reserves the `PLUGIN_SIGNING_KEY` secret for signed packages later.

| Item | Value |
|---|---|
| Secret name | `PLUGIN_SIGNING_KEY` |
| Key type | ed25519 private key, OpenSSH format |
| How to make it | `ssh-keygen -t ed25519 -N "" -f plugin-signing-key` |
| What to store | The whole `plugin-signing-key` file, including the `BEGIN` and `END` lines |
| Where to store it | Repository settings, Secrets and variables, Actions |

When `PLUGIN_SIGNING_KEY` is not set, the workflow logs that the release is unsigned and continues. When it is set, the workflow logs that signing is skipped until `llp` supports it. Neither case fails the release.

## Update a plugin

Updates are always manual. There is no auto-update from inside the plugin.

1. Open the plugins page in the launcher.
2. Install the new `.llplugin` file. The launcher replaces the old version.
3. Keep your settings. The settings file is stored outside the package.

The command line does the same:

```sh
light-launcher plugin install itch-0.1.1.llplugin
```

## CI and the SDK

The SDK is a local `file:` dependency, so both workflows check out [AzPepoze/light-launcher-plugin-sdk](https://github.com/AzPepoze/light-launcher-plugin-sdk) next to the plugin before `bun install`. This goes away when the SDK is published. See [Development](development.md#setup).
