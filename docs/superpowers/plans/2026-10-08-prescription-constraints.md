# Shared prescription constraints implementation plan

**Goal:** Implement GitHub issue #10 across generation, chat, manual edits, templates and publication.
**Architecture:** A pure versioned assessment consumes one database snapshot and the full proposed schedule. Transactional write guards serialize athlete schedule changes and persist the assessment with accepted writes; rejected proposals preserve existing sessions. Canonical structure dose is assessed again after compilation. Remote imports are assessed without rewriting provider data.
**Spec:** https://github.com/BelguteiTsevegmed/coach_watts/issues/10
**Tech stack:** TypeScript, Prisma/PostgreSQL, Vitest, existing canonical workout contract.

## Constraints and decisions

- Preserve unrelated work in the main checkout; use repository worktree scripts.
- No clinical diagnosis, injury probability, ACWR threshold or prompt-based override.
- Scheduling, volume and duration caps are versioned product heuristics. Distance vs the longest completed run in the previous 30 days produces a separately identified observational caution.
- No silent proportional modification of canonical intervals. An adjust outcome supplies a bounded proposal for revision; it cannot be persisted until recompiled/reassessed and accepted. Rejection is valid when no suitable adjusted structure is supplied.
- Unknown exposure remains explicit; starter allowance is a product default, not an inferred capacity.
- Injury loading restrictions and red flags are structured, athlete-recorded fields. Free text never grants permission to bypass them.

## Review focus

1. Completed activities replace linked planned doses and extra sessions count once.
2. Preserved/locked sessions and neighbouring weeks still consume budgets and affect spacing.
3. Batch rejection must roll back deletion and prevent external publication.
4. Concurrent writes must not both consume the same remaining allowance.
5. Final canonical dose and date/type edits must be assessed as one candidate.

## Tasks

- [x] Add failing fixtures for combined schedules, missing history, cross-week hard spacing, injury restrictions, distance caution, sparse/returning history and rejected adjustments.
- [x] Implement pure assessment, documented policy, snapshot loader, persistent assessment table and structured injury restrictions.
- [x] Guard repository create/update, canonical writes, weekly/block/ad-hoc generation and recalculation in transactions; validate the combined proposed schedule before replacing old sessions.
- [x] Apply templates as validated atomic batches and guard publication; preserve remote-import data with recorded assessments.
- [x] Run fixtures, entrypoint/database checks, unit suite, lint/typecheck; review the diff.

Publication follows the repository standing authorization: commit, push a focused PR to `master`, respect required checks, merge, and tear down the isolated worktree.

## Verification results

- 425 unit files / 3,243 tests passed.
- 12 isolated PostgreSQL integration tests passed.
- Typecheck passed. Lint passed with zero errors and 93 existing warnings.
- Independent review findings addressed, including final canonical dose, protected templates, import receipts, stale exports, provider identity recovery and concurrent deletion.
