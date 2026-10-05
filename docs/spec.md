# Volleyball Stats App — Build Spec

## What this is

An offline web app for iPad that a parent uses to track volleyball stats for a team. Light stat entry happens live during the match; full detail gets added afterward while watching game film. Data and video never leave the iPad. The app produces reports coaches can use.

**Who uses it:** one person (a parent stat-keeper) holding the iPad courtside, relatively new to volleyball. An Android phone on a tall stand films the match; it does not run the app. Video is moved from the phone to the iPad by USB-C cable or LocalSend, outside the app.

## Non-negotiables

- **Offline-first.** After the first load, everything works with no internet.
- **No cloud.** No backend, no accounts, no analytics or telemetry, no third-party requests at runtime. Bundle all dependencies (no runtime CDN).
- **Video is never uploaded anywhere.** Stats leave the device only through files the user exports.
- **Backup is required** (see Backup).
- **Configurable.** Put choices in settings wherever reasonable.
- **Warn, don't block.** Volleyball rules vary by level, so rule edge cases trigger a warning the user can override, never a hard stop.

## Platform and tech

- Static web app (PWA) installed to the iPad home screen, running in iPadOS Safari.
- Hosted free as static files (e.g. GitHub Pages). Only the app code is hosted.
- A service worker caches the whole app for offline use; include a web app manifest so it installs to the home screen.
- Store data in IndexedDB and request persistent storage (`navigator.storage.persist()`).
- Landscape-first layout with large tap targets; must be usable while holding the iPad.
- Framework is your choice; keep it a static build with no server.
- On iPad, a home-screen web app's data can be lost if its icon is removed or site data is cleared. That is why backup is mandatory.

## Data model

**Store rich, display scalable.** The data model holds every ball contact, even when the live screen only records who won each rally. Never shape storage around the live screen.

- **Team:** name, notes, default match format, default screen layouts. Multiple teams supported.
- **Season:** belongs to a team; name/year. Cumulative stats roll up per season.
- **Player:** name, jersey number, position(s) (OH, MB, OPP/RS, S, L, DS), active flag. Belongs to a team roster, entered in setup.
- **Match:** team, season, opponent, date, location, event/tournament (optional), format (copied from team defaults, editable), designated libero(s) for this match.
- **Set:** match, set number, starting lineup (player in each position 1–6), designated setter, who serves first, final score, video file reference(s) and anchor(s).
- **Rally:** set, rally number, serving team, score before the rally, lineup snapshot (who is in positions 1–6, including the libero), winner (us/them), point reason (the terminal stat, or an error subtype marked ours/theirs).
- **Event** (one contact or stat): rally, player (or "opponent"), action, outcome, optional pass rating 0–3, optional error subtype, video timestamp, wall-clock timestamp, source (live/review), created/edited times.
- **Lineup change:** substitutions and libero replacements stored as events in the rally stream (who in, who out, court position, rally number).

## Match format (setup)

Set per team as a default, overridable per match:

- Number of sets: best of 3, best of 5, or a fixed number of sets played regardless of result (used in some club formats).
- Points per set (default 25) and points for the deciding set (default 15).
- Win by 2 (default on); optional point cap.
- Optional maximum substitutions per set (warn when exceeded).
- Rally scoring: every rally ends in a point.

## Rotation (automatic)

- At the start of each set, the user enters the starting six with court positions 1–6, marks the setter, and says who serves first.
- The app tracks rotation on its own: when our team wins a rally the opponent served (a side-out), our players rotate one position clockwise and the player moving into position 1 serves. No manual rotation input.
- Label rotations by the setter's court position (S1–S6). If no setter is marked, number rotations 1–6 from the set's first rotation.
- Allow manual correction of the lineup/rotation at any rally in case tracking gets out of sync.

## Substitutions

- Tap **Sub**, tap the player coming in, tap the player going out. The incoming player takes the outgoing player's court position.
- The app always knows who is on court.
- Counts toward the sub limit, if one is set.

## Libero

- Mark the libero(s) per match in setup (up to two, one on court at a time).
- Separate **Libero** button: tap Libero, then tap the back-row player she replaces. This is not a substitution and is unlimited.
- When the libero would rotate into the front row, the app automatically puts back the player she replaced and shows a brief notice. The user can override.
- Some rule sets let the libero serve in one rotation; allow it.
- Libero rallies count toward playing time like any other player's.

## Live screen

The goal is the fewest possible taps during play. Configurable in settings, independently of the review screen.

**Always present:**
- Score, set number, serving team, and the current rotation shown as a court diagram with player numbers.
- **We won / They won** buttons. Every rally's winner must be logged live, because rotation depends on it.
- **Undo**, repeatable for multiple steps, covering points, stats, subs and libero swaps.
- **Sub** and **Libero** buttons.

**Configurable:**
- Which stat buttons appear, and in what order. Offer presets (e.g. Points only / Standard / Detailed) plus custom layouts.
- Entry order: player then stat (default), or stat then player.

**Behavior:**
- Logging a terminal stat (kill, ace, block for a point, our error, opponent error) awards the point automatically, with no second tap.
- When a point is logged without a terminal stat, optionally prompt for the reason (ours/theirs plus error subtype). The prompt can be skipped.
- The set ends automatically when the format's conditions are met (with a confirm prompt), then moves to setup for the next set.
- When the match ends, prompt for a backup.
- Every event records wall-clock time for video sync.

## Review screen

This is where full detail gets added against the film. Configurable separately from the live screen.

- Pick the set's video from the Files app. The video stays on the device. Prefer referencing the picked file over copying it into browser storage; if copying, warn about storage size.
- **Anchor:** the user marks the first serve of the set in the video, and the app links it to the first rally's live timestamp. One anchor per set. If a set spans more than one video file, allow an anchor per file at any logged rally.
- Timeline/list of the set's rallies and stats. Tapping any stat jumps the video to that moment, with a few seconds of lead-in (adjustable).
- Add stats at the current video time; they attach to the rally happening at that time. Edit or delete any stat.
- Playback controls: play/pause, skip back/forward, slow-motion speeds.
- Events added here are marked `source = review`.

## Stats

**All stats are optional.** Each one can be turned on or off separately for the live screen and the review screen.

**Actions and outcomes** (standard college categories):
- **Serve:** attempt, ace, error (with subtype).
- **Pass / serve receive:** logged on its own, or with an optional 0–3 rating. Setting: off / optional / required.
  - 3 = perfect, setter has all options
  - 2 = good, setter has some options
  - 1 = poor, limited options
  - 0 = reception error (aced, or overpass that loses the point)
- **Set:** attempt, assist (a set that leads to a kill), ball-handling error.
- **Attack:** attempt, kill, error (with subtype).
- **Block:** solo, assist, error.
- **Dig:** dig, dig error.
- **Error subtypes:** one list, editable in setup and shared by "ours" and "theirs". Default list: serve net, serve out, foot fault, attack out, attack net, attack blocked, net touch, over the net/reaching, center line, rotation/overlap, double contact, lift/carry, four hits, back-row attack, illegal block, reception error, other.
- **Opponent:** no full opponent stats. Only points we win on opponent errors, tagged with an error subtype marked "theirs".
- **Custom stat buttons:** the user can add their own, giving each a name and saying whether it counts as neutral, point won, or point lost.
- **In-app help:** a short plain-language definition for each stat.

**Calculations** (unit-test every formula):
- Hitting % = (kills − attack errors) / attack attempts
- Kill % = kills / attack attempts
- Serve % = (serve attempts − serve errors) / serve attempts
- Ace % = aces / serve attempts
- Pass average = sum of ratings / rated passes
- Team total blocks = solo blocks + 0.5 × block assists. Show individual solos and assists separately.
- Points = kills + aces + solo blocks + 0.5 × block assists
- Side-out % = rallies won when the opponent served / rallies the opponent served
- Point-scoring % = rallies won on our serve / rallies we served

**Playing time:**
- Rallies on court per player, as a count and as a percentage of team rallies.
- Sets played (credited when a player enters a set) and matches played.
- Libero included.

## Reports

- **Report builder:** pick a team, a scope (one match, selected matches, date range, or full season) and players (all or selected), then check which sections to include. Save report setups as presets.
- **Sections** (each one a checkbox):
  - Team box score
  - Player box scores
  - Hitting: kills, errors, attempts, hitting %
  - Serving: attempts, aces, errors, serve %, ace %, error breakdown
  - Serve receive: pass counts, rating distribution, pass average
  - Setting: assists, ball-handling errors
  - Blocking: solos, assists, errors
  - Defense: digs, dig errors
  - Points scored by player
  - Our errors by type, and opponent errors by type
  - Side-out % and point-scoring %
  - By rotation (S1–S6): points won/lost, side-out %, point-scoring %
  - By set
  - Season trends: charts over matches for any stat
  - Playing time: rallies, % of rallies, sets played
  - Per-player report card (one page per player)
- **Export:** PDF through the iPad share sheet (covers WhatsApp, email, AirDrop and Files). CSV export of the raw stats.
- Reports include only stats that were actually tracked. A stat that was turned off shows "not tracked", not zero.

## Backup

- Export a full backup file (all teams, rosters, matches, stats and settings; video excluded) to the Files app through the share sheet.
- Restore from a backup file, with a confirmation step.
- Prompt for a backup after every match. Show the last backup date on the home screen, and warn when it is older than a set number of days (configurable).

## Settings summary

- Teams, seasons, rosters
- Match format defaults per team
- Live screen layout and stat toggles; review screen layout and stat toggles; presets
- Pass rating mode
- Error subtype list
- Custom stats
- Entry order
- Video lead-in seconds
- Backup reminder interval

## Screens

1. **Home:** teams, recent matches, start a match, last backup date
2. **Setup / Settings**
3. **Match setup**
4. **Set start:** lineup, setter, first server
5. **Live**
6. **Review**
7. **Reports**
8. **Backup & restore**

## Build order

Build in phases, and stop after each one so the user can test on the iPad before you continue.

1. Data model, storage, teams/seasons/rosters, settings, backup and restore.
2. Live screen: scoring, set and match flow, automatic rotation, subs, libero, undo, configurable layout.
3. Review screen: video, anchors, jump-to-stat, adding and editing stats.
4. Report builder, PDF and CSV export.
5. Offline install (service worker, manifest), hosting setup, iPad testing in airplane mode.

## Testing

- **Unit tests:** rotation, libero auto-return, set and match end under every format option, undo, every stat formula, playing time.
- **Manual tests:** a full simulated match on the iPad in airplane mode; backup, then wipe, then restore.

## Working notes

- If something isn't covered here, ask before deciding.
- The user is relatively new to volleyball. Apply standard rules, but treat edge cases as warnings with an override.
