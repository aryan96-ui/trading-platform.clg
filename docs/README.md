# ProTrader — Documentation Set

Professional analysis of the ProTrader codebase, written for project review, hackathon judging,
internship evaluation, technical interviews and software-engineering audit.

| Document | Lines | Contents |
| --- | --- | --- |
| [`01-ARCHITECTURE-AND-ENGINEERING-REPORT.md`](01-ARCHITECTURE-AND-ENGINEERING-REPORT.md) | 803 | Executive summary · project overview · technology stack (with rationale) · layered architecture + ASCII diagram · two worked data-flow traces · feature-by-feature analysis (20 features) · algorithm analysis with formulas and complexity · database analysis · API architecture · UI/UX analysis · security analysis (10 findings) · performance analysis (measured) · project metrics · audit findings · engineering practices |
| [`02-API-REFERENCE.md`](02-API-REFERENCE.md) | 419 | Every endpoint across all six route groups: method, route, purpose, request, response, validation, business logic, data operations, plus the response envelope, the provenance contract and the endpoint census |
| [`03-INTERVIEW-AND-PRESENTATION-GUIDE.md`](03-INTERVIEW-AND-PRESENTATION-GUIDE.md) | 289 | Executive summary · resume bullet · LinkedIn post · 60-second hackathon pitch · 50 technical interview Q&A with answers · viva/defence Q&A · metrics cheat-sheet |

## Conventions used in these documents

**Status labels.** Every capability is marked by what has actually been exercised, not by intent:

| Label | Meaning |
| --- | --- |
| ✅ verified | Implemented and exercised end-to-end against the running system |
| ⚠️ implemented, unverified | Code exists and is wired, but not run against real input here |
| 🧪 demo-backed | Works, but inputs come from the built-in deterministic demo provider (labelled `DEMO`) |
| ❌ absent | Not implemented; stated so the audit is honest |

**File references** are given as `path:line` so every claim can be checked in the source.

**Honest gaps are documented, not hidden** — the security section leads with the absence of
authentication on the v2 API, and the findings section lists defects discovered in adversarial
review that have not been fixed.

## Quick facts

- 94 hand-written source files · ≈21,000 lines (excluding `node_modules`)
- 25 engine modules · 106 HTTP endpoints (87 v2 + 19 v1) · 76 instruments · 5 data providers
- 371 automated test assertions across 6 suites
- 15 views in a single-page workspace, verified with zero console errors
- Cold stock request: 3–28 ms (was 650–800 ms before asset-class-aware provider routing)
- Production readiness: **4 / 10** — functionally substantial, blocked by the security gaps

## Running the project

See `.freebuff/run.md` for the environment procedure and the exact commands.

```bash
node server-v2.js              # primary server, default port 3001
# → http://localhost:3001/terminal.html
```

DEMO mode requires no API keys. Keyed providers activate automatically when their keys are
present in `.env`.
