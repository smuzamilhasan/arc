---
name: Hover-revealed controls eat taps on touch
description: opacity-0 hover-only controls still capture pointer events; on touch they hijack the tap target.
---

# Hover-revealed controls steal taps on touch

A control hidden with only `opacity-0` (revealed via `group-hover:opacity-100`) is still
fully pointer-interactive. On touch devices there is no hover, so the invisible control
sits on top of the real tap target and captures taps — e.g. a hidden Share button inside a
small calendar post cell opened the share menu instead of opening the post.

**Why:** `opacity:0` does not disable hit-testing; only `pointer-events`, `display`, or
`visibility` do.

**How to apply:** for any hover-revealed secondary action, pair the opacity toggle with a
pointer-events toggle: `opacity-0 pointer-events-none group-hover:opacity-100
group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto`.
For the primary action on small/compact cards, make the whole card a single
`absolute inset-0` button (z-0), wrap text in a `pointer-events-none` layer, and float the
secondary control above at z-10. Keep the secondary action reachable elsewhere on touch
(e.g. the post editor dialog has its own ShareMenu).
