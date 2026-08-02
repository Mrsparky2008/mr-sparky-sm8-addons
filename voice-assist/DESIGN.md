# AI Assist app — DESIGN SPEC (Look A "Switchboard dark", locked 2026-08-02)

Implement exactly. Visual reference: https://claude.ai/code/artifact/0dc1b247-0554-4100-bb63-7ca3b28539b1
This file wins over the artifact if they ever disagree. Steven approves changes; nobody else.

## Tokens
```
bg           #0F1B24 → use #0f1b2d (matches scaffold)   app background
panel        #16233A                                     cards, fields, bubbles
line         #25375A                                     borders (1px), dashed separators
ink          #E9EFF8                                     primary text
muted        #8DA0BC                                     secondary text
brand        #1A73E8                                     buttons, links, user bubbles, tiles
active       #C96A2B (ring/orb #E08A47→#B4571E gradient) mic live / drafting
neutral      #2E7DD1                                     idle / informational chips
earth        #2F9E57                                     success / locked-in / commit actions
warn-chip    bg rgba(201,106,43,.18) text #EFA96A        "Work order" style chips
info-chip    bg rgba(46,125,209,.16) text #7FB4EE        "Quote" style chips
```
**State colours are semantic (AU wiring code) — never reassign:** active(brown)=mic live,
neutral(blue)=idle/ready, earth(green)=written to ServiceM8. Nothing is green unless it is
REAL in ServiceM8.

## Type
- System font (SF on iOS). Body 14–15. Captions/labels 10–12, uppercase, letter-spacing ~0.1em.
- Job numbers, prices, timers: monospaced digits (`fontVariant: ['tabular-nums']` or SF Mono),
  prices always 2dp with $ and "ex GST" marked where shown.
- Headers: 800 weight, uppercase, slight tightening. No thin weights anywhere.

## Shape & spacing
- Radii: cards/fields 12–14, buttons 14–16, chips 999, orb circle.
- Screen padding 18; card padding 12–14; vertical gap between siblings 12.
- Touch targets ≥48px tall ("glove-sized"). Primary CTA is full-width, 16px padding, 800 weight.

## Components
- **Header bar**: 30px brand-blue "AI/Assist" tile + screen title (uppercase 800) + right meta
  (muted; timer is mono).
- **Job chip**: pill, panel bg, "Job **#167430** · Haymarket" — number mono+ink, rest muted.
- **Talk orb**: 120px circle. States: idle = brand blue; listening = active gradient + two
  expanding rings (respect reduce-motion: static ring instead); thinking = #F9AB00; speaking =
  earth green. State label under orb: 12px 800 uppercase, coloured to match.
- **Captions**: "YOU" label (10px uppercase muted) + live transcript in panel card.
- **Charlie bubble**: brand-blue tinted (bg rgba(26,115,232,.14), border rgba(26,115,232,.35)).
- **Quote lines**: description (12.5px, qty × unit under it in muted) + right-aligned mono price;
  dashed line separators; totals block = subtotal/GST/Total(800, 15px).
- **"Lock it in"** = earth green, only ever on the commit action. "Keep talking" = ghost
  (line border, muted text). Guard line under: "Add-only: Charlie can never delete or change
  existing billing lines" (10.5px, "Add-only" in green).
- **Drafting banner**: "● DRAFTING WITH CHARLIE — NOTHING SAVED YET" 10px 800 uppercase in active.

## Screens (v1, all six)
1. **Sign in** — real Mr Sparky logo (SVG in repo: voice-assist/ms-logo.svg — copy from
   scratchpad/site if missing), email+password fields, brand CTA "Sign in", note: "One sign-in
   per phone — Face ID unlocks it after that." Portal credentials; footer "Same login as the
   Mr Sparky portal".
2. **Jobs** — search field ("Job number or address…"), recent-job cards (mono #, status chip,
   address+contact muted), full-width CTA "🎙 Talk to Charlie" + subline "or pick a job first".
3. **Charlie live** — job chip, orb centre-stage, state label, YOU caption card, Charlie bubble,
   call timer in header.
4. **Quote workshop** — drafting banner, line items card (scrollable), totals, Keep talking /
   Lock it in, guard line.
5. **Day diary** — hour rail (11px muted right-aligned) + slot column: booked events (info-blue
   tint cards: mono # + suburb, desc + time muted), Charlie-made bookings in earth-green tint,
   free gaps = dashed border card "2 hrs free — 'Charlie, fill this?'". CTA "🎙 Ask Charlie
   about my day".
6. **Job card** — address+contact card, DESCRIPTION card, LATEST NOTE card (10px uppercase
   muted section labels), "Billing so far" row (mono total ex GST), CTA "🎙 Talk about this job".

## Behaviour notes tied to design
- Entitlement gate: no AI seat → orb/CTAs disabled state (muted) with "Ask Steven about
  AI Assist" — never a dead button.
- Splash/app icon: AI/Assist blue tile (assets already scaffolded); dark UI style locked
  (`userInterfaceStyle: "dark"` — the app is dark-only by design, not an omission).
- Never show a spinner where the orb state can tell the story instead.
