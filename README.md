# Songs and Emotion

**Students:** https://eecastro.github.io/songs-and-emotion/  
**Teacher view:** https://eecastro.github.io/songs-and-emotion/?teacher

An in-class activity on music and emotion regulation (maintain, enhance, reduce). Each tree group (Birch, Cedar, Maple, Oak, Pine, Redwood, Willow) sees only its own scenario, saves a three-song playlist, and marks the one song it will play for the class. The teacher plays each playlist anonymously as Playlist A, B, C…, then students vote for the playlist that best nails its scenario. Group names appear only when the teacher reveals the results.

Converted from the 3rd- and 7th-period "Playlists" Google Docs (Behavioral Neuroscience, Ch 10 Emotion). The college scenarios are the default.

## Files

- `index.html`: the whole site (student view, and the teacher view at `?teacher`)
- `Code.gs`: the Google Apps Script backend, which stores playlists and votes in a Google Sheet

## How it's set up

The backend is the Google Sheet "Song & Emotions playlist data," with `Code.gs` attached through **Extensions > Apps Script** and deployed as a web app (**Execute as: Me**, **Who has access: Anyone**). Its `/exec` URL is in `CONFIG.API_URL` in `index.html`. The site is served by GitHub Pages from the main branch.

The teacher view has no PIN (`TEACHER_PIN = ''`), so anyone who adds `?teacher` to the address can open it. To require a PIN again, set `TEACHER_PIN` in the Apps Script editor and publish a new version; the page will then ask for it. Don't commit a real PIN to this public repo.

**Changing the backend:** edit the code in the Apps Script editor, then publish it with **Deploy > Manage deployments > Edit > Version: New version**. That keeps the same URL. **New deployment** creates a different URL, which you would then have to paste into `index.html`. Copy any changes back into `Code.gs` here so the repo stays current.

**Checking the backend:** opening the `/exec` URL in a private window should show `{"ok":false,"error":"Missing or invalid class period."}`. A Google sign-in page means access isn't set to "Anyone."

**Trying it without the Sheet:** set `API_URL` to `''` in a local copy of `index.html` and open it in a browser. Demo mode stores everything in that one browser, so a student tab and a `?teacher` tab side by side behave like a class.

## Starting over in a new Sheet

1. Create a blank Google Sheet, open **Extensions > Apps Script**, and paste in `Code.gs`.
2. Choose `setup` in the function menu, click **Run**, and approve the permissions. The Control, Submissions and Votes tabs appear.
3. **Deploy > New deployment > Web app**, with **Execute as: Me** and **Who has access: Anyone**. ("Anyone within your school" makes students sign in, which blocks the site from reaching the script.)
4. Paste the new `/exec` URL into `CONFIG.API_URL` in `index.html` and commit.

## Running it in class

1. Open the teacher view on the projector and choose the period. Students open the plain address, pick their period and tree, and see their scenario.
2. **Collect playlists.** The dashboard shows which groups have saved. Anyone in a group can edit until you move on; the newest save counts. Scenarios are hidden on this screen so it is safe to project.
3. **Listen.** Students' screens say "eyes up front." Step through Playlist A, B, C… with the buttons or arrow keys. Each card shows the scenario, the three songs, and the song to play with its start time. Every song title links to a YouTube search, and the song to play also has a Spotify search link.
4. **Vote.** Students can tap any song title to hear it on YouTube before voting. Each device gets one vote and can change it until results. A group's own playlist is hidden, and the server refuses votes for it.
5. **Reveal results.** Tallies and group names appear on every screen. Ties share the win.

Use **Start a new round** for the next class or next year. It resets every screen to step 1 and reshuffles scenarios. Old rows stay in the Sheet.

## Settings

In `index.html` (`CONFIG`):

- `PERIODS`: the class periods students choose from
- `SCENARIO_SET`: `'college'` (default) or `'highschool'` (the 7th-period wording)

In `Code.gs`:

- `TEACHER_PIN`: `''` for no PIN (the default), or a PIN to require for the teacher view
- `SHUFFLE_SCENARIOS`: `true` gives each tree a random scenario every round, so classmates can't work out whose playlist is whose from the scenario. Set `false` to keep the Google Doc pairings (Birch = focus, Cedar = good vibes, and so on).

## Privacy

No names or logins. The Sheet stores the tree group, songs, the optional "why," and a random ID per device so each device's vote counts once.
