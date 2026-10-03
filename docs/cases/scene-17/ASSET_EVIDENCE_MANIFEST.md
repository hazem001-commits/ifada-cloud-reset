# Scene 17 — Asset ↔ Evidence Manifest (for approval)

**Status: AWAITING APPROVAL. Nothing seeded, nothing uploaded, no canon changed.**
Machine-readable source: [`asset-evidence-manifest.json`](./asset-evidence-manifest.json) (per-item reasons, global conflicts, engine gaps).

Source of truth: `03-Scene-17-Evidence-Map` + `04-Scene-17-Multiplayer-Distribution` (E01–E40, channels A–H).
Audit method: every image viewed; PDFs text-extracted locally; `.log`/`.html` read as text; audio/video **not played** (so at best PROBABLE).

## Summary

| Confidence | Count | Items |
|---|---|---|
| CONFIRMED | 10 | E05, E06, E07, E08, E09, E10, E11, E12, E14, E31 |
| PROBABLE | 6 | E02, E13, E15, E16, E17, E29 |
| CONFLICT | 14 | E01, E03, E04, E18, E19, E20, E22, E30, E32, E34, E35, E36, E37, E38 |
| MISSING | 10 | E21, E23, E24, E25, E26, E27, E28, E33, E39, E40 |

39 files on disk: 35 map to items above (E02, E12 and E17 use 2–3 files each); 4 map to no item — the envelope photo (`e25`), the phone backup (`e26`), the stage plan (`e19`), and `channel-b/ChatGPT Image Sep 16…png`, which is an **unrelated cosmetics advert**.

## Decisions required (Hazem)

1. **Incident date (G1)** — the assets disagree: 2026-04-14 (E01), 2025-11-17 (E03/E08/E13/E16/Joud), 2025-11-18 (printer log show day), 2024-11-17 (E30), catalogue 2026-03-11. Pick one; the others need asset fixes.
2. **Victim identity (G2/G3)** — "يزن سامر الكيلاني" (E01/E03) vs "يزن الخطيب" (E04) vs catalogue "يزن الكيلاني"; age 38 vs DOB 1995. "الخطيب" is Room 714's victim surname.
3. **Room 714 contamination (G3)** — "Service Stairs (M1)" on the Scene 17 stage plan; forensic doctor "د. سامر الخطيب".
4. **Old numbering printed inside assets (G4)** — E24/E26/E28/E-18 badges on the wrong items. Re-render or accept a remap.
5. **Meta branding in fiction (G5)** — "IFADA / MAIL ARCHIVE", "IFADA / AUDIO FORENSICS … CASE 000".
6. **E19** — the printer log shows R.S printing `SC17_ENDING_REV2`, not the "do not close the curtain" page the map requires.
7. **E20** — the chat is Yazan↔Rana; the map says Rana↔Nader.
8. **E22** — the Joud statement is a denial, not the second statement admitting Kamal gave her the box.
9. **E18 / E34 media type** — E18 should be recovered audio (asset is a PDF with E17's conclusion); E34 should be phone video (asset is WAV).
10. **Phone unlock scheme (G7)** — three different schemes across the map, E32 and e26.
11. **Channel placement (G9)** — five files sit in a different channel folder than the distribution doc says.
12. **Chapter-2 condition (G8)** — node sets for 3 of the 4 contradictions are not specified.
13. **10 missing assets** — E21, E23, E24, E25, E26, E27, E28, E33 (puzzle), E39, E40.
14. **Unassigned files** — envelope photo (e25), phone backup (e26), stage plan (e19), the unrelated advert.

## Engine work this reveals (shared, not Scene 17-specific)

- Native comparison challenges to replace the standalone HTML puzzles (E15, E17) — arbitrary HTML is never served as evidence.
- Multi-media evidence (one item, several files: E12, E17).
- Channel-based visibility (`sql/029_case_channels_PROPOSAL.sql`).
- Derived evidence / chapters via validated connections (`sql/027_validated_connections.sql`, not applied).
