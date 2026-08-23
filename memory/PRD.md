# IPL Auction — Chat Sticker Upload Fix

## Original problem statement
> In the auction interface page, change the command center so that when I upload my sticker folder, it gets uploaded without any issue and we can view and send stickers.

## Root cause of the bug
Stickers were stored as base64 data URLs in `localStorage`. A folder with many/large images blew through the ~5MB quota, throwing `QuotaExceededError` inside an empty `catch {}` block — nothing appeared in the panel and nothing rendered after the click.

## Changes implemented (2026-01)
- **server.js**
  - Added `multer` + per-room/per-user sticker upload endpoints:
    - `POST /api/stickers/:roomCode/:username` — accepts up to 60 files, 5 MB each.
    - `GET  /api/stickers/:roomCode/:username` — lists user's stickers.
    - `DELETE /api/stickers/:roomCode/:username/:file` — removes one sticker.
  - Stickers served as static assets at `/sticker-uploads/...`.
  - `clearRoomStickers()` called on `endAuction()` and on abandoned-lobby deletion (delete-when-auction-ends spec).
- **public/client.js**
  - Replaced localStorage-based sticker store with server-backed fetch / upload.
  - Folder picker now uploads in batches of 15 files with progressive rendering, surfaces errors, and supports any folder size.
  - Chat render treats `data:image/*`, `/sticker-uploads/*`, and `http(s)://*` as image stickers so uploaded URLs display inline for all users.
- **.gitignore** — ignore `sticker_uploads/`.
- **package.json** — added `multer` dependency.

## Behaviour
- User opens sticker panel → panel fetches their existing room stickers.
- User picks a folder → files upload in batches, chips appear as uploads finish. Error popup if upload fails.
- Clicking a sticker emits `__sticker__:<url>` over socket; all users in the room see the image.
- When the auction ends, the room's sticker folder is deleted from disk.

## Verified (curl)
- Upload 8 images → success; URLs returned & served (200).
- Upload 50 images in one batch → success.
- Per-user and per-room isolation confirmed.
- Non-image file rejected (filtered by fileFilter).
- Path-traversal `DELETE` attempts neutralised; `server.js` untouched.

## Not yet done / backlog
- P1: Legacy localStorage stickers still shown as a secondary fallback; could add a one-time migration to server.
- P2: Drag-and-drop folder support in addition to the folder picker.
- P2: Sticker search / categorisation inside the panel.

---

## Iteration 2 — Squad inline-XI polish + sticker panel UX (Jan 2026)

Based on the screenshot showing the in-room "Check XI / Back Squad" view:

### Sticker panel
- Chips are now ~56px tall (~3× larger), pill-shaped, with hover lift + active scale.
- Panel is scrollable (`max-height: 240px`, smooth scroll, themed scrollbar) — handles 40+ stickers gracefully.
- Drops to 4 cols on phones <480px.

### Squad inline-XI page (the "Back Squad" tab)
- Removed extra `8px` outer padding around `#embeddedSquadView` and the inline-xi panels — they now sit flush against the command-center container.
- Top bar redesigned with proper bordered card finish, gradient background, inset highlight, and a polished "Back Squad / Check XI" pill button. Stats row scrolls horizontally on tight viewports so nothing overflows. Mobile-tuned padding under 768px.
- **Left ↗ expand button now opens its own popup** (`openInlineSelectorPopup`) showing the full player selector grid (WK / BAT / ALL / BOWL) with avatars, names and ratings. Picking a player in the popup syncs back to the inline view in real time. Right ↗ continues to open the playing-XI card popup.
- Popup is responsive: 820px wide on desktop, full-width sheet style under 540px.

### Files touched
- `public/client.js` — `openInlineSelectorPopup` added, left ↗ button rebound, `data-testid` added on the new buttons.
- `public/style.css` — appended ~280 lines of polish under "SQUAD INLINE-XI POLISH (Jan 2026)".

---

## Iteration 3 — Sticker UX polish + CC overflow hardening (Jan 2026)

Issues seen in screenshots:
- Sticker grid was rendering as overlapping vertical strips. Cause: the legacy `.sticker-panel { display:grid; grid-template-columns: repeat(6,...) }` was forcing the head row + the inner `.sticker-grid` (itself a grid) into two cells of an outer 6-col grid, squeezing everything into a single column.
- Squad header (the "Back Squad" bar) overflowed the rounded card when many badges were present, leaking outside the container.
- In-chat stickers were too tiny.

### Changes
- **`.sticker-panel`** is now a flex column. Head row (Add Folder OR live progress bar) sits on its own line at full width; chip grid uses `repeat(auto-fill, minmax(54px, 1fr))` so chips properly tile across the panel.
- **Folder upload UX**:
  - After picking a folder, the user gets a confirm popup: *"Upload N stickers from this folder?"*. Cancel aborts; Confirm starts upload.
  - During upload, the **Add Folder** button is replaced in-place by a live progress bar showing batch # and overall %. XHR upload progress events drive the % per batch.
  - On success, the bar animates to 100%, then the button restores and a "STICKERS READY" toast fires.
- **Chat stickers** now use a clamped responsive size (96–132px on desktop, 84–112px on small phones), padded image with rounded corners and a subtle drop shadow — visually ~3× the height of a normal text message.
- **Squad header (`.squad-header-compact`)** is now strict: `box-sizing: border-box; max-width: 100%; overflow: hidden;`. The badges row is forced to `nowrap` with horizontal scroll inside the card and a fade mask on the right edge so it never bleeds outside. Back-Squad button stays anchored. The `#commandCenter`, `#view-squads`, `#embeddedSquadView`, and `#squad-display-container` get `overflow: hidden` so children can never escape, while `#view-squad-list` keeps its own y-scroll.
- Mobile breakpoints tuned: <768px reduces header padding & button size; <480px shrinks chip cells & chat sticker size.

### Files touched
- `public/client.js` — `renderStickerPanel` rebuilt around flex layout + progress slot; `handleStickerFolderPick` now confirms before upload, uses XHR with `upload.onprogress` for live %, hides Add Folder button while uploading, restores after.
- `public/style.css` — replaced the iteration-2 sticker block + squad header block with hardened versions (~+90 lines).

---

## Iteration 4 — Chatbox overhaul (Jan 2026)

User-reported issues:
1. Multiple sticker messages overlapped vertically and covered the next message + the "player sold" tile.
2. When the chat box was smaller, content scroll was blocked / messages got hidden behind each other.
3. Long-press reaction tray was popping above the bubble (cramped) — wanted it on the **right** side instead.
4. The squad header (image 2) had been over-restyled in iter-2/3; user asked to revert it to its original look.

### Changes
- **Chat sticker bubble**: now auto-grows around the image; `100×100` (88×88 mobile), max 60% of bubble width, `flex-direction: column`, `min-height:0`, `overflow:visible`. Adds `has-sticker` / `has-image-sticker` classes from JS so the sticker rules don't leak into normal text rows.
- **No more vertical bleed** between consecutive sticker messages — each `.chat-msg` now has a fixed `margin-bottom` and no `align-items: flex-start` constraint pulling the image out of the bubble.
- **Premium "player sold" tile** is unaffected (z-index:1, own margin) and no longer hidden by sticker overflow.
- **Reactions on hold**: tray is now absolutely positioned at the **right edge** of the message (`top: 50%; right: 6px; transform: translateY(-50%)`) with a pop animation. While `.reactable-hold` is active, the message gets right padding so the tray never overlaps the sticker/text.
- **Suppressed chat**: `#chat` now keeps `overflow-y: auto`, scroll-behavior smooth, no `overflow-x`, so all messages (including stickers) stay accessible when the panel is short.
- **Squad header reverted** to its original visual style — removed the gradient/border/shadow overlay I added in iter-2. Kept only the strict overflow guards (`box-sizing`, `overflow:hidden`, badge row scroll, `.squad-check-xi-btn { white-space: nowrap }`) so it never bleeds outside the rounded card on either PC or mobile.

### Files touched
- `public/client.js` — `chatUpdate` listener tags messages with `has-sticker`/`has-image-sticker` classes for clean targeting.
- `public/style.css` — replaced the iter-3 chat-sticker block with a hardened bubble + right-side reactions block; reverted the squad-header decorative rules.
