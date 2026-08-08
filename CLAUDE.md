# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Cross-agent handoff — read this first

This repo is also worked on by other AI agents (Codex) in separate
sessions. **Before finishing any task that changes files here, add a dated
entry to the Change Log in [`AGENTS.md`](./AGENTS.md)** summarizing what
changed, why, and which files — that file is the shared handoff point so
the next agent (Claude or Codex) doesn't have to re-derive context from a
diff. Read `AGENTS.md`'s Change Log at the start of a session too, to see
what's already been done.

## Project shape

See `README.md` for the overview, `CONNECTORS.md` for connector setup, and
`PLAN.md` for the roadmap. `index.html` is the live chat UI; `server/` is
the backend.
