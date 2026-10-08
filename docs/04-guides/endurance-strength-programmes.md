# Endurance strength programmes

Weekly planning and native gym structure generation share the versioned policy in
`server/utils/strength-programme.ts`. Its phase, reason and completed-session IDs
are saved in the weekly plan JSON and newly generated native structures. This is
an initial conservative product policy, not a rehabilitation protocol or a claim
that a particular load is safe for every athlete.

## Phase and dose

| Phase       | Selection                                                                       | Work sets per exercise / session                    | Effort                                |
| ----------- | ------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------- |
| Foundation  | No established recent routine                                                   | 2 / 8                                               | At least 4 RIR, session RPE at most 6 |
| Progressive | At least 6 completed strength sessions spanning 21 days within the last 42 days | 3 / 12                                              | At least 3 RIR, session RPE at most 8 |
| Return      | Latest completed strength session more than 14 days ago                         | 2 / 8                                               | At least 4 RIR, session RPE at most 6 |
| Maintenance | Recovery/deload/transition phase or latest session RPE at least 9               | 2 / 8                                               | At least 4 RIR, session RPE at most 6 |
| Taper       | Event within 14 days or explicit taper phase                                    | 1 / 5                                               | At least 4 RIR, session RPE at most 6 |
| Modified    | Any open injury                                                                 | 2 / 8 ceilings, subject to restrictions or omission | At least 4 RIR, session RPE at most 6 |

Exposure does not prove lifting skill or good technique. Experience, equipment,
existing routine and clinician restrictions come from the athlete's context and
workout description. Structure generation includes that context even when the
endurance prompt profile would omit it. Unknown equipment defaults to familiar
bodyweight preparation. Exercise selection still uses the existing generator and
exercise-library matcher; equipment and movement-specific injury compatibility
remain coaching-context decisions, rather than a new equipment/clinical registry.

## Progression and sequencing

Keep familiar core movements across weeks. Recommend a small rep **or** load
increase only after two comparable sessions completed at the prescribed effort
with good form and tolerable next-day response. These confirmations are not
available as structured data today, so automatic numeric increases are disabled.
Missing data means hold. High effort, incomplete work, deteriorating form or
symptoms mean hold, regress or omit the affected exercise.

Same-exercise load estimates use recent normal work sets, exclude duplicate
activities and future/stale observations, and use the conservative current-session
range rather than a lifetime maximum. A conditional increase proposal requires
repeated comparable low-effort sessions. The hardest set in the latest session
controls effort; an easy final set cannot conceal a failed set. Blank numeric
loads stay blank when the exercise has no reference or uses bodyweight/generic
load mode. Targets filled from references reserve the phase's RIR allowance.

New native prescriptions are checked after library defaults for set ceilings,
explicit rest, numeric RIR/RPE effort, submaximal repetitions, known-load limits,
and session RPE. Invalid prescriptions use the existing corrective retry path;
persistent violations fail before persistence. Automatic power/plyometric work is
excluded from this initial programme. Existing authored structures are preserved.

Weekly planning asks for approximately two short sessions only when availability
and the existing routine permit. It protects key runs/rides and long sessions by
preferring separation from demanding/unfamiliar lower-body work; same-day
consolidation requires the priority endurance session first and an explicit
fatigue rationale. Taper weeks retain familiar movements with fewer sets. The
placement explanation is generated in the athlete's language and respects locked
sessions. Timing guidance is a coaching default, not a universal recovery window.

Gym duration, sets/reps and session effort are tracked separately from endurance
stimulus. Native strength generation no longer invents endurance TSS from gym
time; weekly generation excludes gym from its endurance-TSS total.

## Evidence and validation

The [2024 running-economy meta-analysis](https://pubmed.ncbi.nlm.nih.gov/38165636/)
examines benefits of strength methods in studied running populations. It does not
validate this product's exact preparation dose, experience gates, or scheduling
windows. Preparation aims to establish familiarity and tolerance; it does not
promise the same economy benefit as a studied high-load intervention. Coaching
text must not promise injury prevention.

Fixtures cover unknown/novice exposure, established routines, high effort, injury,
taper/recovery, breaks, noisy history, bodyweight equipment constraints, native
rendering/metrics, effort and load violations, and separate strength/endurance
stimulus. Runtime schema and programme checks apply to newly generated structures.
