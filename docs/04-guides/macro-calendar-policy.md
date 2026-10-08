# Event-aware macro calendar

New personal plans use `event-macro-v1` in `TrainingPlan.progressionContext.macroPlan`.
The adjacent sport progression snapshot records completed exposure, availability,
import completeness, interruptions, and the captured policy. Macro placement is
deterministic; the model explains and fills sessions within the resulting week
budgets rather than deciding calendar arithmetic or permission to skip preparation.

## Supported event profiles

| Event                                                  | A-event taper weeks, including race week | Post-event transition weeks |
| ------------------------------------------------------ | ---------------------------------------: | --------------------------: |
| Road 5K / 10K                                          |                                        1 |                           1 |
| Road half marathon                                     |                                        2 |                           1 |
| Road marathon                                          |                                        3 |                           2 |
| Road race, gran fondo, MTB marathon, gravel, cyclotour |                                        2 |                           1 |
| Criterium, time trial, MTB XC, cyclocross, social ride |                                        1 |                           1 |

Explicit event sport wins over subtype wording: an MTB marathon is cycling.
Distances are kilometres; durations are hours in Event/Goal storage and minutes in
planning budgets. Terrain and elevation stay in the snapshot. Trail/ultra,
swimming, multisport and unknown profiles use a visible conservative fallback,
with aerobic preparation and one reduced event week. They require a goal review
rather than an invented specialized programme. Event titles are descriptive text,
not numerical evidence of distance, duration, or readiness.

The event's stored A/B/C priority drives placement. A gets its profile taper;
B gets a mini-taper in the two days before the event and replaces a key session;
C replaces ordinary training without another peak. A/B events receive a transition
afterward. Conflicting recovery/event timelines require changing priority, effort,
or dates. Linked events outside the plan are reported explicitly.

## Capacity and calendar rules

A BUILD start requires confirmed history, at least eight completed sessions in the
relevant sport spread across at least three of the last four weeks, an active last
session within seven days, and recorded weekly averages of at least 90 running or
120 cycling minutes. The snapshot must be within 14 days of plan start. PEAK also
requires the requested load to be within 1.2 times current exposure and a supported
A event. These are conservative product gates, not physiological readiness tests.
Unverified, sparse, interrupted or stale exposure cannot bypass easy preparation.
Availability limits volume independently; available time is not proof of capacity.

Road marathon, half-marathon and other supported A events flag preparation windows
shorter than 12, 10 and 8 weeks respectively. These windows are review triggers,
not promises that an athlete with a longer calendar is ready. Explanations propose
a later event, lower ambition or completion-focused goal when appropriate.

Weeks cover the inclusive start-to-target calendar, with a partial final week when
necessary. Every Nth **global** week is recovery, even across short blocks.
Taper/race/transition overrides the ordinary recovery pattern and freezes the
loading ordinal. Plan skeleton edits recalculate budgets across the whole plan
from the same captured progression snapshot.

## Taper and race dose

Ordinary taper training uses 75% two weeks before a marathon and 60% one week
before an A event; A race-week ordinary training uses 40%. Quality-work dose is
50% during taper and 25% in race week, with familiar intensity and frequency kept
only when current capacity supports them. Recovery removes hard work at 60%
volume; transition removes hard work at 50% volume and 80% frequency. These factors
are passed separately to block and weekly generation. They never imply faster
pace or increased target intensity.

Known event minutes are reserved **inside** the relevant sport's weekly ceiling.
The remaining ordinary sessions cannot push the combined total past that ceiling.
Unknown duration stays unknown, suppresses speculative additional sessions in the
event sport, and prompts confirmation. An event exceeding current capacity is
flagged for goal/event-dose adjustment; the calendar does not manufacture extra
capacity to make it fit. TSS remains a planning estimate using recorded sport
history or the labelled coarse fallback, not a measurement of future race stress.

The [2023 endurance taper meta-analysis](https://pubmed.ncbi.nlm.nih.gov/37163550/)
supports reducing volume while retaining intensity and frequency in studied
athletes. The event-specific windows, capacity gates and quality-dose factors
above are product heuristics; the study does not validate those exact values or
an athlete's event feasibility.

## Verification and limits

`tests/unit/server/utils/plans/macro-policy.test.ts` contains calendar fixtures for
all supported profiles, mixed sport, sparse/stale history, short timelines,
multiple priorities, overlapping events, unknown dose, transition and taper totals.
`progression-entrypoints.test.ts` verifies persisted initialization and subsequent
skeleton edits. The existing prescription validators enforce session write limits;
quality-dose/frequency instructions also need representative generated-session
review under the prescription evaluation rubric before claiming coaching benefits.
No live model replay or independent coach endorsement is implied by unit tests.

Existing plans without the macro snapshot keep their legacy phase targets. Their
captured sport progression still uses global recovery ordinals on skeleton edits.
This change does not retrofit old plans or promise injury prevention/performance.
