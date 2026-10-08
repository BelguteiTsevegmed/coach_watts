# Training prescription assessments

Every authored schedule change is evaluated against the athlete's combined calendar before persistence. The shared server guard includes completed activities, preserved coach sessions, athlete/external sessions and the proposed replacements. Completed activities replace their linked planned dose; extra activities count separately. Imported sessions remain unchanged and receive an assessment receipt.

`server/utils/training-prescription/assessment.ts` implements `training-prescription-v1`. Each receipt records the input snapshot, proposed doses, policy version, source and outcome in `TrainingPrescriptionAssessment`. Successful writes carry the receipt ID in `rawJson`; an authenticated `GET /api/planned-workouts/:id/prescription` returns the latest assessment. Rejected changes return HTTP 422 with the receipt and violations, preserve the old calendar and cannot be published.

## Product policy

These numbers are conservative product defaults, not validated injury-prevention thresholds or medical clearance:

- The existing sport progression policy uses 28 days of completed history, a 1.2 initial multiplier, starter weekly allowances of 60 minutes for running/swimming/strength/other and 90 for riding, and a 0.5 multiplier after a recorded break of at least 14 days. Persisted weekly total duration, sport targets and TSS budgets take precedence over fallback sport allowances.
- A running session is capped at the greater of 30 minutes and 1.2 times the longest preceding completed/planned run in the preceding 30 days. A recorded returning-athlete break halves this allowance. Future planned exposure supports a product duration ramp; it never becomes completed distance evidence.
- Hard endurance sessions need at least one easy/rest calendar day between them across week boundaries. Unknown intensity is reported explicitly and is reassessed when final interval structure is compiled.
- Daily availability includes all sessions and matching sport slots. Active injury loading restrictions or red flags block affected activities. Low pain and free-text athlete requests cannot bypass recorded restrictions. Missing imports are not treated as confirmed inactivity.

An `adjust` outcome supplies a duration ceiling when available and remains rejected for persistence. Revise the intervals, recompile their canonical dose and submit again; any remaining weekly, availability, spacing or injury violation still blocks the change. An adjustment is never a silent proportional interval rewrite.

## Evidence caution

The separately identified `run_distance_exposure` warning compares proposed distance with the longest **completed** run in the preceding 30 days. A distance more than 10% greater produces an observational caution. The [2025 cohort study](https://pubmed.ncbi.nlm.nih.gov/40623829/) supports considering single-session distance exposure, without establishing an individual injury probability or universal safe boundary. This is distinct from the product duration/weekly heuristics. The [ACWR methodological critique](https://pubmed.ncbi.nlm.nih.gov/32502973/) also cautions against presenting workload ratios as established injury-prevention thresholds. Missing distance history produces explicit uncertainty instead of a synthetic baseline.

## Transactions and publication

Schedule writes share an athlete-scoped PostgreSQL advisory lock. Replacement batches are assessed before deletion. Final canonical intervals and their derived dose are assessed atomically with date/type edits. Scalar edits cannot understate retained interval structure.

The publication lock covers the remote send. Structured exports require a captured structure revision; changed date, time, title or dose rejects the send. Intervals resolves the provider identity under the lock and saves its returned event ID before unlocking. Deletions acquire the same lock, supersede pending create/update retries and queue provider deletion transactionally. ROUVY and Garmin publication also use the shared assessment gate.

## Verification

Run `pnpm test:unit`, `pnpm typecheck` and `pnpm lint`. Run `pnpm test:prescription-integration` from an isolated repository-script worktree after `prisma migrate deploy`. Its separate Vitest configuration uses PostgreSQL rather than the unit database mock and refuses the main database (`DATABASE_URL` must name `watts_wt_*`). Tests create one temporary athlete and clean only that athlete's records.
