# Volleyball Stats

An offline iPad web app for keeping volleyball stats: light entry courtside,
full detail afterwards against game film, and reports for coaches. Data and
video never leave the iPad except in files you export yourself.

The full spec is in [docs/spec.md](docs/spec.md).

Live at **https://tatrogar.github.io/volleyball-stats/** once `main` deploys.

## Status

Built in phases, each tested on the iPad before the next starts.

- [x] **1. Data and setup**: teams, seasons, rosters, match-format defaults,
      stat layouts, error types, custom stats, preferences, backup and restore
- [ ] 2. Live screen
- [ ] 3. Review screen (video)
- [ ] 4. Reports, PDF and CSV
- [ ] 5. Offline install (home screen, airplane mode)

## Where the data lives

Everything is in the browser's IndexedDB on the iPad. There is no server,
account or analytics, and the app makes no network requests once loaded.

Safari can delete that data: removing the home-screen icon, clearing website
data, and (for a regular Safari tab) a week without visiting. **The backup
file is the only safe copy.** Backup → *Back up now* → *Save to Files*.
The home screen warns when the last backup is older than the reminder
interval (Settings → Preferences).

Safari keeps a home-screen app's data separate from the same site opened in
a Safari tab. To move data from one to the other, back up in one and restore
in the other.

## Development

```sh
npm install
npm run dev     # http://localhost:5173/volleyball-stats/
npm test
npm run build
```

React + TypeScript + Vite + Tailwind, with `idb` over IndexedDB and `zustand`
for state. Every dependency is bundled at build time.

`src/types.ts` is the stored data model. It already holds rallies, every
contact and lineup changes; the screens that fill them in come in later
phases.

Pushes to `main` run the tests and deploy to GitHub Pages
(`.github/workflows/deploy.yml`). Pull requests run the tests only.
