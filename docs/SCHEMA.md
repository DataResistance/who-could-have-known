# Data and authorship

## Authorship

The goal is for all critical and explanatory text to be written by Jim or Craig, in their voice. Claude's role is scaffolding.

| Tier | Examples | Who writes | Marked? |
|---|---|---|---|
| **Interface** | how to play, buttons, scoring rules, privacy note, credits | Claude | no |
| **Factual** | "what happened", dates, companies, fine amounts, company responses (summarized), source lists | Claude drafts, sourced, no interpretation | **yes**, until an author signs off |
| **Judgment** | outcome category, precedent/recurrence links, harm tags, classroom set selection | Claude *proposes* with sources | **yes**, until an author approves |
| **Critical / explanatory** | commentary on what a case means, ethics, the end-of-round argument, the hope pivot, discussion prompts, "about this app", links to the book's argument | **Jim or Craig only.** Claude never drafts these, and leaves an explicit placeholder | n/a (empty until written) |

**Display:** a small per-block badge ("drafted by Claude") on any unreviewed factual or judgment text, plus one short page-level note explaining the authorship policy. The badge disappears once an author signs off. Author-only slots render a neutral placeholder (or are hidden) until filled.

**In the data:** every prose or judgment field carries provenance, e.g.
`{"text": "…", "by": "claude", "status": "draft" | "approved", "approved_by": "jim"}`. Author-only fields are `{"text": null, "by": null}`. A small script lists every draft and empty author slot, so filling them in is a to-do list.



## Data schema (draft)

```json
{
  "id": "strava-heatmap-2018",
  "title": "Strava Global Heatmap reveals military bases",
  "date": "2018-01-27",
  "spatial": true,
  "data_type": "fitness-gps",
  "companies": ["Strava"],
  "redaction_label": "a fitness app",
  "headlines": [
    {"text": "…verbatim…", "outlet": "The Guardian", "date": "2018-01-28", "url": "…"}
  ],
  "what_happened": {"text": "2–3 plain factual sentences.", "by": "claude", "status": "draft"},
  "outcome": {"value": "pr-tweak", "by": "claude", "status": "draft"},
  "outcome_detail": {"text": "Street-level view limited to logged-in users; monthly refresh; Pentagon device policy Aug 2018.", "by": "claude", "status": "draft"},
  "precedents": {"value": ["runkeeper-yau-2014"], "by": "claude", "status": "draft"},
  "recurrences": {"value": ["polar-flow-2018", "stravaleaks-2024"], "by": "claude", "status": "draft"},
  "harmed": {"value": ["military-personnel"], "by": "claude", "status": "draft"},
  "commentary": {"text": null, "by": null},
  "contested": false,
  "responses": [{"party": "Strava", "summary": "…", "url": "…"}],
  "sources": [{"label": "…", "url": "…", "kind": "primary|press"}],
  "book_refs": [{"pages": "35–38", "note": "Data Power ch. 1"}]
}
```

`sets.json` maps a classroom set id to an ordered list of case ids, plus discussion prompts. A set is played via `?set=<id>`.


### Additional fields

- `headlines[].phase`: `"break"` (shown while guessing) or `"aftermath"` (shown only in the reveal, because it would give away the year or the outcome).
- `headlines[].checked_via`: which element of the archived page the wording was checked against.
- `outcome.scored`: `false` keeps a card's outcome out of scoring until an author confirms it.
- `outcome.also_accept`: other outcome values that also count as correct.
- `data_type_scored`: `false` hides and does not score the data-type question for a card.
- `contested`: `true` shows a "Disputed" notice and the named parties' responses next to the summary.
- Review notes (`verify`, `headline_leads`) live in `data/review.json`, which is kept out of the public repo; `?review` shows them when the file is present.

Run `python3 tools/provenance_report.py` to lint the data and list drafts, empty author slots and open notes.
