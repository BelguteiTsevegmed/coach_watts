# Versioned endurance workout families

Issue #12 adds an opt-in `workout_families_v1` generator. The default remains
`draft_json_v1`. The catalogue and recorded fixtures are engineering-reviewed;
**coach review is pending**. Do not describe the numerical defaults as validated
training effectiveness or enable them broadly before that review.

Enable the generator for a test athlete through the existing user feature flags:

```json
{ "structuredWorkout": { "generator": "workout_families_v1" } }
```

The same structure task handles sessions created by blocks, weeks, ad-hoc tools
and chat. The selector proposes purpose and dose, then the compiler builds the
canonical intervals. Adjustment tasks use the same compiler. No migration or new
calendar write path is introduced. The existing canonical writer validates the
final schedule, reconciles metrics, checks generation revisions and writes before
realtime/provider publication.

## Catalogue v1

`shared/workout-families.ts` is the executable policy. Each family declares its
objective, supported sports, effort target, reference-factor bounds, preparation,
recovery, duration ceilings and progression ladder. Factor bounds are product
choices awaiting coach review, not physiological boundaries.

| Family        | Initial run dose         | Initial ride dose        | Objective / constraints                              |
| ------------- | ------------------------ | ------------------------ | ---------------------------------------------------- |
| Easy          | Continuous RPE 3         | Continuous RPE 3         | Conversational movement; default alternative         |
| Endurance     | Continuous RPE 4         | Continuous RPE 4         | Steady aerobic exposure                              |
| Threshold     | 3 × 300s / 120s recovery | 3 × 480s / 180s recovery | Controlled sustained repetitions, RPE 7              |
| VO2           | 4 × 120s / 120s recovery | 4 × 180s / 180s recovery | Repeatable hard aerobic efforts, RPE 8               |
| Strides       | 4 × 20s / 80s recovery   | Unsupported              | Relaxed fast running, RPE 8; never an all-out sprint |
| Sprints       | Unsupported              | 4 × 10s / 170s recovery  | Brief controlled fast cycling, RPE 9                 |
| Long          | Continuous RPE 4         | Continuous RPE 4         | Familiar long exposure and practiced pacing/fueling  |
| Race-specific | 2 × 600s / 180s recovery | 2 × 600s / 180s recovery | Rehearse an explicitly supplied event effort         |

Recovery is included after the final repetition. The compiler uses ten minutes
of warm-up and five minutes of cooldown by default, or longer saved sport
settings. Quality sessions require at least ten/five minutes; easy alternatives
can use five/five minutes when availability requires it. Spare time becomes easy
preparation. Fitting removes whole repetitions without increasing intensity or
shortening work/recovery; if the minimum dose cannot fit, the explicit alternative
is easy work. It never pads a quality session with extra repetitions to consume
all availability.

Volume, dose step and relative target intensity are independent inputs. This
separation follows the public [Runna training-preference design reference](https://support.runna.com/en/articles/10393191-how-to-use-training-preferences); its private formulas are not replicated. Numerical
power/pace targets require an applicable positive athlete reference. Unknown
references stay null and use executable RPE steps. Fast efforts use effort cues,
not an assumed percentage of FTP or threshold pace. RPE is not converted to a
measured threshold or numerical TSS. Distance/TSS remain unknown when the shared
metric resolver lacks evidence.

Race-specific selection requires saved `rawJson.eventEffortTarget` metadata:
`{ "label": "Established event effort", "factor": 0.9 }`. The factor is relative
to the applicable athlete reference and must fit the family bounds. An inferred
race title cannot create this reference.

## Eligibility and progression

The service snapshots actual non-duplicate completions from the preceding 28
days, counting distinct UTC training dates with at least ten minutes in the
selected sport. Six such dates permit proposing a quality entry dose. Sparse
history selects easy work capped at 30 minutes. Long sessions also respect a
110% ceiling over the longest completed session in that window; below the
one-hour minimum they become a shorter easy alternative. These are conservative
product defaults, not clearance or evidence of fitness/injury risk. The shared
schedule assessment remains authoritative and can reject a compiled proposal.

Any logged ACTIVE/RECOVERING injury affecting the sport blocks the family path;
it cannot infer clearance from a low pain score. Unknown/missing context does not
create clinical advice.

The first rung is the default. Two recent comparable completions on separate
UTC dates, each with at least 90% of planned duration and a usable RPE no more
than one above the family effort target, permit proposing the next rung. The two
most recent comparable sessions govern this decision; older successes cannot
mask recent difficulty or missing feedback. Missing/poor feedback holds the last
rung. A regression choice lowers the dose without raising intensity. These facts
are a bounded proposal gate, not a threshold-capacity diagnosis; recovery,
execution-quality and wider adaptation work remain separate roadmap concerns.

## Library, fallback and provenance

Existing custom/library structures continue through the existing preservation
path rather than being reinterpreted as a catalogue family. Swimming, strength,
and other sports keep their validated draft/native generator paths. Fallback
reasons are saved in `lastGenerationContext.family`. Supported but incompatible
pairs (cycling strides, running cycling sprints) select easy work and record the
requested and accepted choices.

Family structures carry `workoutFamily` provenance in the canonical envelope, so
library saving/copying and export adaptation retain the selection, version, dose,
reference and fitting decisions. The planned workout context also records model,
prompt version, eligibility snapshot and contributing completed-session IDs.
The compiler generates titles/descriptions from its final dose and writes them
together with duration, distance, TSS and structure. No residual description can
promise repetitions removed during fitting.

Persona, name, language and recovery scores are excluded from the numerical
selector prompt. Identical family inputs compile identically; the compiler does
not call an LLM. Its v1 instructions are plain English. Persona/localized wording
can be added separately without changing the numerical structure.

## Verification and rollout review

Run the four family suites plus the existing canonical write/export and
prescription suites. Routine tests use recorded selector outputs and synthetic
histories, with no paid model calls:

```bash
pnpm exec vitest run tests/unit/shared-workout-families.test.ts \
  tests/unit/server/utils/workout-family-generation.test.ts \
  tests/unit/server/utils/structured-workout-generator.test.ts \
  tests/unit/trigger/workout-family-pipeline.test.ts
pnpm eval:prescription
```

`tests/fixtures/workout-families/v1.json` fixes expected work/recovery totals
independently of the compiler. A 29-minute threshold window produces two
300-second efforts with unchanged targets and recovery. A 25-minute window
produces an explicitly named easy alternative. These cases catch the previous
failure where proportional fitting left an obsolete repetition promise.

Before broad enablement, a human endurance coach must review the fixture
catalogue and representative novice, experienced, returning, missing-reference,
short-window and event-specific scenarios. Record reviewer/date, accepted or
revised dose/targets, and rationale against these criteria:

1. Purpose and dose suit the completed exposure and event demands.
2. Preparation and recovery remain suitable after time fitting.
3. Progression/regression does not covertly increase target intensity.
4. Unknown references and uncertainty remain explicit.
5. Title, description, actual intervals, totals and export agree.
6. The resulting calendar passes shared prescription constraints.

The fixture `reviewStatus` deliberately records pending coach review. Keep issue
#12 open until that acceptance criterion is met. Compare recorded legacy failures
and the new fixtures before a test-athlete rollout; then use the existing
prescription evaluation/rollout protocol to assess outcomes. Passing deterministic
tests alone does not establish coaching quality or improved athlete outcomes.
