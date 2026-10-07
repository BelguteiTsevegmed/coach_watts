# Weekly recalculation

`POST /api/plans/adapt` dispatches `adapt-training-plan` with `RECALCULATE_WEEK`, an owned `planId`, and a `requestId`. The API returns the run ID; its response acknowledges dispatch, not a completed recalculation. The dashboard reads the eventual `changed`, `unchanged`, or `failed` output.

Recalculation starts tomorrow in the athlete's timezone and ends on the active week's last calendar day. Today and earlier sessions remain intact. Completed, athlete-managed, coach-edited, anchored, remotely edited, and conflicted sessions are protected. A day containing a protected session is left alone. Untouched Coach Watts sessions can be replaced, including ones previously published to Intervals.

The task uses weekly generation in proposal-only mode, with the current block/week focus, recent training and recovery, availability, and the budget remaining after completed and preserved load. Actual completed load replaces its linked planned estimate rather than counting both. Validation requires a complete set of eligible days, valid dates and workout types, explicit zero-dose rest days, sessions that fit an available slot, and total dose within the remaining volume/TSS budgets. An empty, incomplete, or invalid proposal leaves the schedule unchanged.

Before committing, the task re-reads the plan, week, schedule, completed load, availability, timezone, and local date. A changed snapshot rejects the proposal. Replacement, the `TrainingPlanAdaptation` receipt, initial structure-generation revisions, and any required remote-delete queue entries commit together in a serializable transaction. Generation, validation, or persistence failure cannot leave a half-replaced local schedule.

After commit, follow-up tasks process obsolete remote sessions and design the replacements. Structure generation publishes accepted structures through the existing integration flow. The remote cleanup uses `SyncQueue`, and design uses `WorkoutStructureGenerationRun` and task run monitoring. Provider or generation failures remain visible in these records and their normal retry controls.

Retrying the original adaptation run resumes follow-up dispatch from its receipt and does not regenerate or duplicate the replacement. `followUpError` records dispatch failures. Structure dispatch keys and generation revisions protect resumed work from duplicates and superseding edits. A new recalculation uses a new request ID.
