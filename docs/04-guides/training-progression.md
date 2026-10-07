# Initial training progression

Plans initialized by the wizard capture `TrainingPlan.progressionContext` and each week's
`sportVolumeTargets`. These are ceilings, not a goal to fill all available training time.

The versioned `sport-progression-v1` policy lives in `server/utils/plans/progression-policy.ts`.
Its parameters are explicit product heuristics, configurable through the builder's `policy`
argument and snapshotted in the plan. They are not validated injury-prevention limits.
The [novice-runner randomized trial](https://pubmed.ncbi.nlm.nih.gov/17940147/) did not establish
injury prevention from the weekly 10% rule. Session-specific distance assessment remains part
of the separate prescription-validator work in GitHub issue #10.

For each selected sport family, take completed, nonduplicate, positive-duration activities
from the previous 28 days, excluding future records and repeated IDs. Divide the recorded
minutes by four. Running includes running only; cycling, swimming and gym sessions never
raise the running allowance. Total endurance exposure is recorded separately.

When the athlete confirms that all 28 days are logged, the initial allowance is 1.2 times the
sport's recent weekly average, without a universal minimum. When import coverage is unknown,
the initial allowance cannot exceed the recorded average. An absence of imported records
is not labelled confirmed inactivity. The context records coverage source, window, activity
count, most recent sport session, and days since that session.

No recent history uses an explicit easy starter allowance: 60 minutes/week for running,
swimming, strength or other activities, and 90 for cycling. A gap of at least 14 days in
recorded sport exposure halves the history-derived starting allowance. The athlete should
confirm missing imports before interpreting that gap as a real break.

The allowance grows by 1.1 per loading week, across block boundaries. Recovery weeks do not
advance that ordinal. Sum sport ceilings, cap by the requested weekly hours and any numeric
availability-slot budget, then apply recovery (0.6) and peak taper factors. Floor rounding
keeps the total within those ceilings. The wizard accepts availability below three hours and
shows why a workload was reduced or cannot reach the requested workload within the timeline.
Such a warning does not predict race readiness.

Replanning, adding, extending, reordering or deleting blocks recalculates week targets from the same stored inputs,
rather than inferring the request from already reduced weeks. Current availability can lower
those targets. Legacy plans without a captured context retain their historical volume logic;
initialize a new plan to capture sport-specific provenance.

Block and linked-week generation validate exact sport and total budgets, and session slot
limits. One corrective model retry is followed by deterministic adjustment and revalidation.
Sessions below the minimum executable duration become rest instead of being rounded up past
the budget. Weekly recalculation subtracts both completed and preserved sessions from each
sport's budget before accepting replacements. Completed/imported activities are retained.
Partial-week generation also deducts AI sessions outside its replacement window that will
remain on the calendar. Planned calendar dates and completed activity timestamps use their
respective date conventions consistently when protecting sessions and inserting replacements.

The migration adds nullable JSON columns only; it does not rewrite existing plans or history.
Apply committed migrations with `prisma migrate deploy` before running updated web/workers.
