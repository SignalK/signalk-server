---
name: plugin-data-storage
description: Where a Signal K plugin writes its files, and how to keep downloaded or rebuildable caches out of backups with a CACHEDIR.TAG. Use when writing or reviewing plugin code that persists files, caches downloads, or prunes old data.
---

# Plugin data storage

## Where files go

A plugin writes the files it keeps to `app.getDataDirPath()`:

- Node plugin: `~/.signalk/plugin-config-data/<plugin id>/` by default.
- WASM plugin: `/`, the root of its virtual filesystem, which the server keeps in `plugin-config-data/<plugin id>/vfs/`.

Call it from `start()` or later; it is not available in the plugin constructor. Never write into the plugin's own folder under `node_modules` (`__dirname` and paths relative to it): an update or reinstall replaces that folder and the data is lost.

## Caches and backups

Backups of the Signal K data directory include every plugin's data directory. Data the plugin downloads or rebuilds by itself (forecasts, tiles, decoded files) gains nothing from a backup, and a cache rewritten every few hours adds a new copy to every scheduled backup, on the boat and in its cloud storage.

Put such data in its own subdirectory with a [cache directory tag](https://bford.info/cachedir/): a file named `CACHEDIR.TAG` whose content starts with exactly `Signature: 8a477f597d28d172789f06886806bc55`. Kopia (used by the signalk-backup plugin) skips tagged directories by default; restic, Borg and GNU tar do with `--exclude-caches`.

Use the `cacheDir()` helper from the "Caches and backups" section of `docs/develop/plugins/README.md`; it is maintained there, so copy it from that file rather than writing a variant.

Rules when applying it:

- Create the tag in `start()`, before the first download, so a backup taken in the meantime already skips the directory.
- Rewrite a tag whose content does not start with the signature; backup tools ignore it. Write it to a temporary file and rename it into place, so a backup never reads a partial tag.
- A failure to read or write the tag is logged, not thrown: an untagged cache only costs backup space, and the plugin must still start.
- Code that prunes old files deletes only the files it wrote, so the tag survives. Never empty the directory wholesale (`fs.rmSync(dir, { recursive: true })`) without recreating the tag.
- A WASM plugin writes the same file inside its virtual filesystem, for example `/cache/CACHEDIR.TAG`.
- Never tag the data directory itself or a directory holding settings, user data (routes, logs, recordings), or anything that cannot be downloaded again without internet access. A restore has to bring those back.

## Reviewing a plugin

Flag, in order:

1. Writes under `__dirname`, `process.cwd()` or a hard-coded `~/.signalk` path instead of `app.getDataDirPath()`.
2. `app.getDataDirPath()` called in the constructor.
3. A download or regenerated cache stored without a `CACHEDIR.TAG`, or mixed into the same directory as data that must be kept.
4. Pruning that can delete the tag.

The rest of plugin development is covered in the same `docs/develop/plugins/README.md`.
