# Bike Setup Tracker for Windows

Windows desktop version of Bike Setup Tracker. It is the same app as the Android
build (same screens, bikes, tracks, Dry/Wet setups, three profiles, notes, themes),
packaged with Electron so it installs and runs as a normal Windows program.

## Moving data between Android and Windows

Backups are plain JSON files named `suspension_tracker_backup_YYYYMMDD.json`.

- **Android → Windows:** on the phone use *Export Data* (it saves to Documents), copy
  the file to the PC, then in the Windows app use *Import Data* or drag the file onto
  the window.
- **Windows → Android:** use *Export Data* on Windows (it suggests your Documents
  folder), copy the file to the phone, then *Import Data* there.

Importing replaces all data in the app, exactly as on Android.

The file format is defined in one place, [`src/shared/schema.ts`](src/shared/schema.ts):
types, limits, defaults, validation (`parseBackup`) and writing (`serializeBackup`).
The UI never reads or writes backup JSON any other way. `test/fixtures/android_backup_example.json`
is an Android-format export used by the tests.

## Developing

Requires Node.js 22.

```sh
npm install
npm test           # backup-format tests
npm start          # build and run the desktop app
npm run dist:win   # build release/*.exe (installer + portable)
```

`npm run dist:win` works on Windows directly. On Linux or macOS it needs Wine.
Pushing to GitHub runs `.github/workflows/build-windows.yml`, which builds both
`.exe` files on a Windows runner and attaches them to the workflow run.

## Layout

| Path | What it is |
| --- | --- |
| `src/shared/schema.ts` | Backup file format shared by every part of the app |
| `src/renderer/` | The app UI (ported from the Android/web `index.tsx` and `index.css`) |
| `electron/` | Desktop shell: window, Open/Save dialogs, opening map links in the browser |
| `test/` | Format tests and an Android sample backup |

Settings are kept on the PC between sessions (Electron local storage, under the
same key the Android app uses). The app is unsigned, so Windows SmartScreen will
warn the first time it runs until a code-signing certificate is added.
