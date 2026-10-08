# Training stimulus

Issue #11 uses `training-stimulus-v1` to distinguish time and distance per sport from aggregate TSS. Equal TSS is not equal running exposure. The same summarizers serve completed training context, canonical planned writes, and training-plan week responses.

## Measurement definitions

- `domainSeconds` means easy (below first physiological threshold), moderate (between thresholds), hard (above second threshold), or unknown. The zone editor supports an optional `domain` on each power, HR, or pace zone. No vendor name or number implies a physiological domain. Zones that span a threshold should remain unclassified or be split by the athlete.
- `intensitySeconds` is a separate, threshold-relative IF exposure measure using the legacy IF bands. It does not establish physiological domains or diagnose fitness. No FTP/LTHR/pace reference is manufactured, and max HR does not substitute for LTHR.
- `prescribedQualitySeconds` records explicit tempo/threshold/VO2/anaerobic/sprint/strides intent. It describes intended work, not achieved intensity. Repetition counts apply to work and recovery independently.
- Duration-based steps use their declared seconds. Distance-based steps use explicit pace (including resolved canonical pace zones); unresolved steps retain any remaining planned time budget as unknown and report `unresolvedSteps`. Unknown distance is `null`, not zero.
- Strength sets, repetitions, and estimated duration are separate from endurance domain time. Duration uses the existing strength-dose helper; it is an estimate, not measured lifting time.
- `hardSession` is true for observed hard-domain time or prescribed quality work, false only when fully classified without either, otherwise null. This is an exposure descriptor, not a medical risk assessment.

## Sources and coverage

Each session reports source, confidence, classified seconds/fraction, unresolved steps, and TSS provenance/coverage. Planned TSS is a structure estimate only when every timed endurance step has a usable threshold-relative target. Missing TSS remains null. Imported provider totals stay intact; their structure estimate is stored separately.

Completed summaries prefer one usable stream over combining sensors, then use existing provider/engine interval arbitration. Samples use elapsed timestamps, or the existing one-second convention when timestamps are absent. Gaps over five seconds, invalid values, unusable HR, explicitly unusable/estimated power, low-confidence intervals, and overlapping interval partitions remain unknown. This five-second gap limit is a versioned measurement policy, not a physiological cutoff. No session-wide IF or TSS is used to assign an entire activity to one intensity band. Percentages retain unknown time in their denominator.

Plan-wide reads use completed interval/summary evidence to avoid loading months of raw streams. Recent training context can use raw streams; the source and coverage expose this difference. Weekly responses provide `stimulus.scheduled`, `stimulus.completed`, and `stimulus.combined`. Actual activities, including unplanned sessions, replace their linked planned dose once. Running distance never includes cycling distance. Aggregate TSS reports unknown-session counts alongside its known sum.

## Persistence and constraints

Canonical local writes save final duration, distance, TSS, and `PlannedWorkout.stimulusSummary` together. Final duration replaces the coarse proposed duration; unresolved distance/TSS clear stale estimates. The structure hash remains based on the canonical prescription. Revision checks reject stale generation results.

For workouts linked to a training week, the same transaction locks the week and checks total and sport-specific duration, explicit availability, and TSS when all inputs are known. Completed and external sessions consume the budget. Existing overload may be reduced but not increased. A dose that exceeds the budget is rejected rather than proportionally shortening intervals and changing their stimulus. Remote imports retain fidelity and bypass this local prescription constraint. Broader spacing, injury, and override policy is the separate work in #10.

Week aggregates are calculated from saved final metrics at read time, so completions, imports, copies, and date moves do not leave a cached week total stale. TSS targets remain planning estimates: new plans use each sport's observed TSS/hour when the last 28 days provide at least three sessions, one hour, and 50% duration coverage. Otherwise the existing 50 TSS/hour fallback is explicitly labeled `coarse_default` in progression context. Historical plans without these estimates keep the fallback.

## Verification

`tests/unit/server/utils/training-stimulus.test.ts` contains hand-calculated nested-repeat, distance, unknown-reference, stream-gap, interval-quality, overlapping-interval, strength, mixed-sport, and planned/final/actual fixtures. Canonical write tests cover atomic final dose, revision rejection, import fidelity, and validation before persistence. Progression tests cover observed-rate coverage and coarse fallback. These are deterministic measurement tests; no medical outcome is inferred.
