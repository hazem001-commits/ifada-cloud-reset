# RESET-2 — Live QA checklist (run right after 038 is applied)

Locally, the protected Room 714 photo is unavailable. The real `PhotoScene` / hotspot / dossier
code was exercised with a **placeholder image of the same source size (1536×1024) carrying the
authored anchor boxes** — geometry, touch targets, sheet layout and the two-player flow passed
at 360 / 390 / 430 / 768 / 1440. This checklist confirms the same on the **real photo** in a
**real multiplayer session**. Mark each line PASS / FAIL with a screenshot.

## 0. Preconditions
- [ ] Hazem applied `sql/038_room714_opening_runtime.sql` (037 not re-run).
- [ ] `sql/verify_038_postapply.sql` in the SQL editor → every non-null `pass` is `true` (85 rows).
- [ ] A **new** Room 714 session (sessions from before 038 keep what they already hold).
- [ ] Two accounts, split: **A = field + forensics**, **B = digital + records** (check in lobby).
- [ ] Devices: A on a phone **360 or 390** wide, B on a phone **430** wide; plus one **desktop** (≥1280) window. Portrait. Real touch, not only devtools emulation, for at least one phone.

## 1. Arrival (both)
- [ ] Briefing: the holder reads V-01; the other sees redaction bars + who holds it.
- [ ] Line "كلكم ترون الغرفة نفسها؛ التخصص يحدد ما تستطيع فعله بما تجده" is visible.
- [ ] "ادخل الغرفة 714" reachable with the thumb; no horizontal scroll.

## 2. The real scene — per size (360, 390, 430, desktop)
- [ ] Photo loads (no "neutral surface" fallback); no letterbox gap that hides an object.
- [ ] Tapping (no hover) each of: glass, window, belongings, laptop opens its dossier.
- [ ] Each hotspot sits **on** its object in the photo (not shifted); rotate the phone once → still aligned.
- [ ] Off-frame "باب الغرفة" entry is tappable and **not under** the "خيوط" pill.
- [ ] Touch hint reads "المس ما يلفت نظرك…" on phones (not "مرّر المؤشر").
- [ ] Focus/zoom: the inspected object stays visible **above** the sheet (phone) / beside the panel (desktop); you can tell where you are in the room.
- [ ] Sheet: the main action ("عاين" / "سلّمه إلى …") is visible without scrolling; the last action clears the iPhone home indicator.
- [ ] Escape (desktop) / back chevron (phone) returns to the room with focus kept.
- [ ] `document.documentElement.scrollWidth === innerWidth` (no horizontal page scroll).
- [ ] Reduced motion (OS setting) → no sliding/zoom animation, still usable.

## 3. Everyone investigates (the RESET-2 correction)
- [ ] **B (digital + records)** can notice the **glass**, the **stain**, the **window** (physical things).
- [ ] **A (field + forensics)** can notice the **laptop** and the **door**.
- [ ] After B shares the stain: **only A** sees "اجمع عينة" / lab request. B sees a stain, no collect action.
- [ ] After A shares the laptop: **only B** sees device inspection / "استخرج آخر نشاط".
- [ ] Records lookup on the passport: offered to B only; the door-log query: B only, and only once the door is shared.

## 4. Pulse / Leads / Case File
- [ ] When one player notices privately, the other sees a Pulse with a **category only** — no title, object, person, place, reason or evidence code (check the presence sheet text).
- [ ] A private insight lead appears **only** for the reader of D-01 / R-01 / F-02 / D-02, phrased as a question; "أخبر الفريق" makes it a team thread on the other phone within seconds.
- [ ] Case File shows only material the team actually produced (D-01, R-01, F-02, D-02, F-01) with its custody line; the non-owner sees the restricted item as a title only.
- [ ] No Case Clock ticker listing future evidence titles (kept suppressed; a spoiler-safe clock is a later design).

## 5. Door log (digital)
- [ ] A window wider than 90 minutes → neutral "too broad" result; no times, no evidence named.
- [ ] A reasonable window within 90 minutes → D-02 arrives; nothing reveals the authored range in the UI before that.

## 6. Boundaries (must NOT happen)
- [ ] No Security Office, CCTV archive, or breadcrumb to them anywhere.
- [ ] No RAMI_FOUND / RAMI_DIED broadcast, no M1, no F-04 / F-07, no Scene 17 content.
- [ ] The browser network tab shows no `unlockable_evidence` titles for Room 714 and no `media_path`.

## 7. Realtime
- [ ] Each share / discovery reaches the other phone without reload (signal → refetch), ≤ ~3 s.
- [ ] Lock one phone 30 s, unlock → state catches up without duplicate pulses.
- [ ] 0 console errors on both phones and desktop (ignore browser-extension noise).
