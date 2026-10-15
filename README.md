# Who Could Have Known?

A trivia game about location-data scandals, built as a companion to *Data Power: Radical Geographies of Control and Resistance* (Thatcher & Dalton, Pluto Press 2022; [open access](https://doi.org/10.2307/j.ctv249sg9w)). Players see a real headline with the company names blacked out, guess the year and the kind of data, then guess what changed afterward.

## Run it locally

The page loads its data with `fetch`, so serve the folder rather than opening the file directly:

```
python3 -m http.server 8765
```

Then open <http://localhost:8765/>.

| URL | What it does |
|---|---|
| `./` | A random round of 10 cards |
| `./?set=fitness-apps` | A curated classroom set (ids in `data/sets.json`) |
| `./?cases=id1,id2,…` | A custom set, in order (built on `teach.html`) |
| `./?review` | Review mode: shows empty author slots, plus review notes if `data/review.json` is present |
| `./teach.html` | Classroom sets and a custom-set builder |

## Files

- `index.html`, `js/game.js`: the game
- `teach.html`, `js/teach.js`: the teacher page
- `css/style.css`: styles and light/dark themes (after the *Data Power* cover and Debord & Jorn's *The Naked City*)
- `fonts/`: self-hosted Cormorant Garamond, Work Sans and Courier Prime, with their OFL licenses
- `data/cases.json`: the cases (schema in `docs/SCHEMA.md`)
- `data/sets.json`: classroom sets
- `tools/provenance_report.py`: lints the data and lists draft fields, empty author slots and review notes
- `docs/SCHEMA.md`: data format and authorship rules

## Authorship

All commentary and explanatory text will be written by Jim Thatcher and Craig Dalton; none is published yet. Factual summaries and judgment fields (outcome categories, links between cases, harm tags, set selection) may be drafted by Claude. Those carry `"by": "claude", "status": "draft"` and display a "drafted by Claude" badge until an author sets `"status": "approved"`. Author-only fields (`commentary`, set descriptions and discussion prompts) stay `null` until written.

## Links

Every headline, source and response has both an original `url` and a Wayback Machine `archive_url`, and the page links to the archived copy first. Headline wording was checked against the archived page (`checked_via` records which element).

## Privacy

No analytics, cookies, third-party scripts or third-party fonts (the fonts are hosted in this repo). The only stored value is the light/dark theme choice, kept in `localStorage`.

## Adding a case

Add an object to `data/cases.json` following the schema, including `archive_url` for every link. Then run `python3 tools/provenance_report.py`.
