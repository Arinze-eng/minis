# Atlas Design System (Phase 0)

"**Atlas: the quiet map of your next move**" — orientation, evidence, and calm
momentum. Not fashion gloss, not financial anxiety, not dashboard chrome.

## 1. Foundations

### Color tokens (adapted from the team application, refined for Atlas)

| Token | Value | Use |
|---|---|---|
| `--atlas-paper` | warm paper (light) / deep graphite (dark) | workspace background |
| `--atlas-graphite` | near-black graphite | navigation rail, high-contrast text |
| `--atlas-ink` | near-black | primary text on paper |
| `--atlas-lime` | saturated lime | ready / next-action / primary buttons |
| `--atlas-lilac` | soft lilac | reflective / personal states (saved looks, style profile) |
| `--atlas-amber` | amber | review-needed / time-sensitive (renewals) |
| `--atlas-red` | restrained red | blocked / revoked / destructive only |
| `--atlas-line` | low-contrast border | structural separation |

Red is never decorative. Lime is earned by readiness, not sprinkled.

### Typography

- **Space Grotesk** — editorial display for major statements (Inbox headline,
  Signal Card titles).
- **DM Sans** — body, controls, data labels.
- **Tabular numerals** (`font-variant-numeric: tabular-nums`) for amounts,
  counts, dates, confidence — all Culture Engine numbers align vertically.

### Space, radius, motion

- 8-point spacing rhythm (4/8/12/16/24/32/48/64).
- Radius hierarchy: sharper controls (4–6px), medium cards (10–12px), larger
  feature surfaces (16–20px).
- Motion ≤ 300ms, strong ease-out; `prefers-reduced-motion` alternative for
  every non-essential transition; never `transition: all`.

## 2. Signature motif: the route

Evidence sources render as small **waypoints** (dots with connecting line);
the recommendation is the **destination** node; the user's action is the next
route segment; uncertainty renders as a **soft gap** in the path — never a
fake certainty percentage. The motif is structural: it appears in Signal
Cards, the Why panel, and the Inbox column rule. No map backgrounds, pins,
neon gradients, glassmorphism, or AI sparkles.

## 3. Component states

Every data surface implements: **loading**, **empty** (with the next move),
**stale** (freshness label), **blocked** (policy/consent reason in plain
language), **unavailable** (provider down), **error** (recoverable). Destructive
actions confirm or offer undo. Async status uses `aria-live="polite"`.

## 4. Accessibility rules

- Semantic buttons for actions, links for navigation; visible focus states;
  skip link at the top of the shell.
- Every icon-only control has an accessible label.
- Labels + inline errors on all inputs; no disabled zoom; comfortable touch
  targets (≥44px) on mobile.
- `Intl.NumberFormat` / `Intl.DateTimeFormat` for all formatted values.
- Explicit image dimensions, lazy loading below the fold, no layout shift
  during image load.
- Keyboard path through the entire core flow (acceptance flow §8 of the
  product contract).

## 5. Brand assets

- Wordmark: **Atlas** set in Space Grotesk; compact **route/compass mark** as
  the app icon (waypoint path forming an "A" gap).
- Variants: light and dark; monochrome fallback.
- Icons: single stroke weight, rounded joins, 20px grid.
- Image usage: garment imagery only in wardrobe/looks contexts; generated
  previews always carry the approximation notice.
- Placeholder status: the mark is an **internal placeholder** pending a final
  brand asset — recorded as an asset dependency in `brand-spec.md`.
