# Training prescription evaluation

Issue [#9](https://github.com/BelguteiTsevegmed/coach_watts/issues/9) introduces an offline engineering benchmark before changes to training generation are rolled out. This first version supplies a scenario corpus, production-kernel replay, an independent output audit, capture validation, comparison thresholds, and reports. It does **not** establish coaching quality, training effectiveness, or reduced injury risk.

## Run the benchmark

```bash
pnpm eval:prescription
pnpm eval:prescription:typecheck
```

No `.env`, athlete database, network connection, or paid model call is required. A dedicated Vitest configuration avoids the Nuxt application bootstrap. Database access and `fetch` fail explicitly. Synthetic histories use a fixed snapshot date. JSON and Markdown reports are written to `.tmp/prescription-evaluation/`, which is already ignored. Set `PRESCRIPTION_REPORT_DIR` to export elsewhere. CI runs this command and retains its report even when tests fail.

The versioned corpus includes beginner, returning and experienced runners, cyclists, mixed-sport athletes, sparse and stale history, explicit injury restrictions, limited availability, completed extra sessions, missed training, protected sessions, and short event timelines. The first-week expectations are specified in fixtures independently of the production calculation. These are product-policy regression expectations, not medical thresholds.

## What runs and what remains

Every scenario is evaluated against seven named prescription boundaries using the same input hash.

| Boundary        | Offline execution                                           | Remaining integration coverage                                                 |
| --------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Initialization  | Production sport-history resolution and progression targets | Full initialization handler, macro prompt and persistence                      |
| Block and week  | Production volume validation, clamping and revalidation     | Full task prompts, corrective LLM retry and persistence                        |
| Structure       | Production draft compiler and repeat-recovery check         | Full generation task, canonical persistence and device export                  |
| Adaptation      | Production recalculation proposal validator                 | Full transaction, revision/idempotency and publication                         |
| Ad-hoc and chat | Audit of captured endpoint output                           | Default reference run marks both **not exercised** until captures are supplied |

The independent audit reports total and per-sport dose, quality minutes, unavailable/protected days, explicit restricted sports, description-duration mismatch, structure-duration mismatch, missing interval recovery, and quality-dose mismatch. Distance-only steps retain unknown-duration coverage. No pace is invented to turn them into known minutes. Free-text coaching quality, environmental causes and condition-specific injury advice require human review.

Clamping does not automatically make a replay pass: if the shortened prescription retains its original duration claim or interval structure, it is a regression. Negative controls cover the historical four-hour low-history prescription, missing recovery, injury restrictions and protected-day overwrites.

Remaining work for #9 is full endpoint scenario adapters/captures, independent coach review of representative outputs, and a measured live/shadow baseline. Keep the issue open until those are reviewed. Do not interpret the default benchmark's green test exit as permission to enable an adaptive prescribing feature.

## Replay a candidate or live capture

Configure any live evaluation separately from routine CI. Run the real generation entrypoints against the **synthetic** scenario histories in an isolated environment with explicit model credentials and budget. Capture the actual accepted/adjusted/rejected/failed outcome and final prescription at each boundary. Use existing fixture/mock generation for routine recorded replays. No live-model evaluator or self-grading LLM is invoked by this command.

Normalize captures to `captureSchema` in `tests/evaluation/prescription.ts`, including a record for **every scenario and boundary**. Each record requires:

- `scenarioId`, `entrypoint` and the exact `inputHash(scenario)` of the resolved fixture inputs.
- Model, prompt, family and policy versions plus `capture: recorded` or `live-capture`. Use immutable identifiers or content hashes; never `latest`.
- Measured `generatorLatencyMs`, the actual `decision`, final `sessions`, and an optional failure message. A failed generation remains failed even if it has no sessions.
- Session day/type/duration/intensity/description, explicit duration/quality claims and normalized draft steps. Retain unknown distance durations. Never infer claims from an LLM evaluation score.

The fixture reference itself is not a model capture. Synthetic generator latency is null in the default report; evaluator runtime is reported separately. Captures with duplicate, missing, unknown or changed scenario inputs fail before evaluation. Secrets and live athlete data must not enter captures or CI artifacts.

```bash
PRESCRIPTION_REPLAY_FILE=/absolute/path/candidate.json pnpm eval:prescription

PRESCRIPTION_REPLAY_FILE=/absolute/path/candidate.json \
PRESCRIPTION_BASELINE_FILE=/absolute/path/baseline-report.json \
pnpm eval:prescription
```

The command exits nonzero for accepted/adjusted outputs with audit violations or generator failures. A deliberate rejection is recorded separately. JSON preserves both the captured endpoint decision and local replay decision so downstream checks can inspect their difference. Missing baseline data never implies improved latency.

Comparison requires identical benchmark/audit versions and scenario input hashes. Initial **engineering** thresholds fail on any increased constraint-regression or generator-failure count, a rejection-rate increase above five percentage points, or generator p95 latency above 120% of a comparable baseline. These conservative defaults are configurable only by a reviewed code change; establish a measured baseline before claiming improvement. Timing from different hosts/providers needs separate interpretation.

## Human coaching rubric and rollout

Rubric version: `coaching-rubric-v1`. An independent endurance coach must review representative plans and adversarial cases. Record reviewer, review date, scenario and output hashes, model/prompt/family/policy versions, rationale, and pass/revise/reject findings. An agent must never manufacture that sign-off. Fixture reviews are initially pending and cannot approve a different candidate's output.

| Review dimension             | Pass criteria                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Capacity and progression     | Recent sport exposure and interruptions explain the starting dose; requested time does not invent fitness             |
| Intended stimulus            | Work/recovery, quality dose and narrative agree; shortened sessions still have a coherent purpose                     |
| Schedule and preservation    | Availability fits; actual extra training consumes budget; missed sessions are not crammed in; protected work survives |
| Uncertainty and provenance   | Missing/stale references and data coverage are explicit; precise targets have qualifying references                   |
| Restrictions and feasibility | Explicit restrictions take precedence; an incompatible event timeline is explained honestly                           |
| Athlete-facing rationale     | Changes, contributing evidence, confidence and tradeoffs are understandable without clinical promises                 |

Stages:

1. Keep the feature disabled. Run recorded scenarios and negative controls in CI. Complete full endpoint captures and independent review; retain the exact report with its input/output hashes.
2. Run a versioned shadow comparison with the current generator, without applying proposals. Review every constraint failure and a stratified sample of rejected/adjusted/accepted prescriptions. Establish empirical rejection, failure and latency distributions.
3. Enable suggestions for a small consented cohort only after a documented human release decision. Preserve accept/dismiss and the existing validated application path. Any hard constraint regression or unexpected application/publication failure stops expansion.
4. Expand only after repeat review of the same gates and a sufficient observation period. Roll back to the previous generator/policy when its criteria fail. Do not infer effectiveness from a single favorable replay.

`rollout.eligible` remains false for the current reference run because chat/ad-hoc captures and coach reviews are missing. Candidate captures require their own coaching review, so this harness alone cannot authorize rollout. It does not toggle a production feature flag.

## Outcome observation

Define outcomes and observation windows **before** examining results. With explicit consent and minimum necessary data, observe planned/completed dose, completion and adherence, self-reported fatigue/difficulty, reported injury/illness, retention and event performance. Store source, measurement dates, missingness and withdrawals; allow users to opt out. Keep reported conditions distinct from diagnoses and never infer an absent report means no injury.

Use anonymized aggregate reports with restricted access, retention limits and suppression of small groups. Do not commit athlete exports or upload them as CI artifacts. Analyze within-athlete baselines and comparable cohorts, including missed/extra work and device changes. Document season, environment, event selection, prior training, self-selection, sensor quality and exposure differences as confounders. Observational changes cannot establish causal training benefit or injury prevention. Human review and empirical outcomes supplement deterministic checks; they cannot waive a known hard constraint regression.
