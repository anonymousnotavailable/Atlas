# Working with other AI agents on this repo

Atlas is developed with the help of multiple AI coding agents — **Claude
Code** and **Codex** — working on behalf of the same maintainer, often in
separate sessions that don't share context with each other. This file is
the handoff point between them.

## The one rule

**Whenever you (any agent, in any session) make a change to this repo,
add a dated entry to the Change Log below before you're done** — a few
lines is enough: what changed, why, and which files. The next agent to
touch this repo (Claude or Codex, today or in six months) should be able
to read this file top-to-bottom and know what's already been done and
why, without re-deriving it from a diff.

This applies to feature work, connector changes, UI passes, refactors,
bug fixes — anything a collaborator would want to know about before
building on top of it. Trivial fixes (typos, formatting) don't need an
entry.

## Project shape

- `index.html` — the live chat UI (voice in/out).
- `landing.html` — marketing/landing page.
- `server/` — backend connecting Atlas to Gmail, Google Calendar, device
  location, and web lookups (see `server/README.md` to run it).
- `CONNECTORS.md` — which credential to get and where, per connector.
- `PLAN.md` — roadmap.

## Change Log

Newest first. No entries yet — this file was set up on 2026-08-08 by
Claude Code at the maintainer's request, as part of establishing the same
cross-agent handoff convention across their projects (see the sibling
entry in `anonymousnotavailable/prism`'s `AGENTS.md`). Add the first real
entry the next time this repo changes.
