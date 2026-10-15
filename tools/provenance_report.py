"""Check cases.json and list what still needs an author.

Lints: required fields, outcome values, data types, http(s)-only links with archive copies,
at least one "break" headline per playable case, and links between cases that only point one way.
Lists: draft fields, empty author slots, and open verification items (from data/review.json if present).

Usage: python3 tools/provenance_report.py [path/to/cases.json]
Exit status is 1 if any lint error is found, so this can run in CI.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTCOMES = {"nothing", "pr-tweak", "product-pulled", "fine-settlement-order", "ruling-law", None}
DATA_TYPES = set(re.findall(r'^\s+"([a-z-]+)": "', (ROOT / "js" / "game.js").read_text(), re.M))
REQUIRED = ["id", "title", "date", "data_type", "companies", "redact", "redaction_label", "headlines", "what_happened", "outcome", "outcome_detail"]


def main(path):
    cases = json.loads(Path(path).read_text())["cases"]
    review_path = Path(path).with_name("review.json")
    review = json.loads(review_path.read_text()) if review_path.exists() else {}
    by_id = {c["id"]: c for c in cases}
    errors, totals = [], {"draft": 0, "author_slots": 0, "verify": 0}

    def err(cid, msg):
        errors.append(f"{cid}: {msg}")

    for c in cases:
        cid = c.get("id", "?")
        for f in REQUIRED:
            if f not in c:
                err(cid, f"missing field '{f}'")
        if c.get("data_type") not in DATA_TYPES:
            err(cid, f"unknown data_type {c.get('data_type')!r}")
        if (c.get("outcome") or {}).get("value") not in OUTCOMES:
            err(cid, "invalid outcome value")
        if c.get("playable") and not any(h.get("phase", "break") == "break" for h in c.get("headlines", [])):
            err(cid, "no 'break' headline to show during the guess")
        links = [("headline", h) for h in c.get("headlines", [])] + [("source", s) for s in c.get("sources", [])] + [("response", r) for r in c.get("responses", [])]
        for kind, item in links:
            for key in ("url", "archive_url"):
                u = item.get(key)
                if u is None:
                    err(cid, f"{kind} has no {key}: {item.get('text') or item.get('label') or item.get('party')}")
                elif not re.match(r"^https?://", u):
                    err(cid, f"{kind} {key} is not http(s): {u}")
        for field, back in (("precedents", "recurrences"), ("recurrences", "precedents")):
            for other in (c.get(field) or {}).get("value", []):
                if other not in by_id:
                    err(cid, f"{field} points to unknown case {other}")
                elif cid not in (by_id[other].get(back) or {}).get("value", []):
                    print(f"note  {cid} -> {other} is one-way ({other} lacks {cid} in {back}; the game makes it symmetric)")

        drafts = [k for k, v in c.items() if isinstance(v, dict) and v.get("status") == "draft"]
        drafts += [f"responses[{i}]" for i, r in enumerate(c.get("responses", [])) if r.get("status") == "draft"]
        empty = [k for k, v in c.items() if isinstance(v, dict) and "text" in v and v.get("text") is None and v.get("by") is None]
        notes = review.get(cid, {}).get("verify", [])
        totals["draft"] += len(drafts)
        totals["author_slots"] += len(empty)
        totals["verify"] += len(notes)
        print(f"\n{cid}")
        if drafts:
            print("  drafts:       " + ", ".join(drafts))
        if empty:
            print("  author slots: " + ", ".join(empty))
        if (c.get("outcome") or {}).get("scored") is False:
            print("  outcome:      not scored until confirmed")
        for n in notes:
            print("  verify:       " + n)

    print(f"\n{len(cases)} cases · {totals['draft']} draft fields · {totals['author_slots']} empty author slots · {totals['verify']} verification items")
    if errors:
        print(f"\n{len(errors)} lint error(s):")
        for e in errors:
            print("  " + e)
        sys.exit(1)
    print("lint: ok")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ROOT / "data" / "cases.json")
