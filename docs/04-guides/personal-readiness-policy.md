# Personal readiness for coaching

`shared/readiness.ts` defines the versioned `readiness-v1` product policy. `readinessContextService` loads one athlete calendar-date snapshot for weekly generation/recalculation, ad-hoc planning, daily coaching, activity recommendations and chat. Prescription validation reloads these facts inside the schedule transaction when a proposed change is applied. Generation uses today's facts even when planning a future week; current advice expires after today plus two days and requires reassessment.

## Windows and provenance

The baseline is the **28 calendar days ending three days before the snapshot**. The recent window is **today and the two preceding days**. Medians are calculated within metric/source/device/method groups. A trend needs seven valid baseline days, at least two adverse recent readings, and an adverse reading today. Counts, missing days, excluded non-comparable samples, observation dates and record IDs are retained. Missing sensors, nonfinite values and sensor zero are unavailable; subjective zero and a recovery score of zero are retained. No missing score is replaced with 50%.

rMSSD (`hrv`) and SDNN (`hrvSdnn`) have separate baselines and never substitute for each other. Recovery scores remain separate dated, attributed observations; they are neither averaged across sources nor converted into a universal readiness score.

Wellness upserts retain `_readinessProvenance` for each accepted field, including repeated values. Updating fatigue from one provider does not relabel HRV from another. Raw-snapshot replacement preserves untouched field origins. Device ID and measurement method are captured when supplied. Legacy rows with a single recorded source are usable with explicit uncertainty about device/method; mixed or unproven legacy rows cannot establish a comparable baseline. No migration or invented attribution is performed. Providers that do not supply device or protocol identifiers cannot establish a device change; the prompt asks the athlete to confirm comparability.

## Decisions and their limits

These thresholds are conservative, bounded **product heuristics**, not validated clinical cutoffs or a universal training optimizer:

- At least two recent HRV readings 15% below their source-specific median, or resting HR 5 bpm above its median, mark a persistent adverse trend. A single anomaly or a sensor trend alone only prompts review.
- Persistent sensor trends together with today's sleep under six hours or low motivation (0–3/10) support a reduction. Sleep, motivation and all missing fields remain explicit.
- Today's athlete-reported fatigue, soreness or stress at 7–10/10 can independently support a reduction. Device-generated or unproven stress scores cannot serve as an athlete report; stress needs manual, athlete OAuth, or Intervals subjective provenance. Usual sensors do not override that report; the conflict is explained.
- Explicit current `Sick` wellness tags/status or a calendar note categorized `SICK` support rest. Arbitrary free text, negated illness descriptions and sensor measurements are not classified as diagnoses.
- Completed check-ins (answers and notes from the last three days), active calendar notes, logged injuries and completed activity (including extra sessions) are passed through as evidence. Free-text athlete reports can justify a coach-proposed reduction but are not parsed into fabricated numbers or deterministic diagnoses. Injury restrictions remain subject to the existing injury rules.
- CTL/ATL/TSB carry their recorded date and remain load descriptors. The last seven athlete-local calendar days of completed activity are included, with missing TSS left null. These values are never proof of race readiness, illness, overtraining or injury risk.

Daily suggestions persist advice with original session, proposed change, reason and source context. A readiness reduction proposes easy conversational RPE 2–3 work for at most 30 minutes, no longer than the original session; an injury conflict or unresolved session can instead propose rest. Explicit RPE instructions can establish a product-level easy prescription without mapping RPE to a threshold, physiological domain or invented TSS. Confirmed illness proposes zero-dose rest. Normal readings never provide medical clearance.

## Application

Advice never writes the calendar. Existing recommendation acceptance and prescription/adaptation validation own accepted changes, preserving completed/locked sessions, checking target freshness and validating the combined schedule before publication. A near-term hard, unresolved-intensity or over-30-minute proposal is rejected while resolved readiness calls for reduction; confirmed illness blocks active training. Imported plans remain observations with warnings rather than being rewritten.

Readiness reductions carry an easy replacement structure through canonical validation rather than retaining old hard intervals beneath reduced scalar totals. Rest conversion clears structure, derived metrics and advances revisions so older generation jobs cannot restore the previous session. Rejected edits leave the schedule intact and retain a durable assessment receipt. Reassess readiness before applying an old suggestion; an accepted recommendation does not make old symptoms permanent.

## Evidence

The [2021 HRV-guided training meta-analysis](https://pubmed.ncbi.nlm.nih.gov/34489178/) found mixed benefits, including small nonsignificant performance and VO2peak effects. This supports caution about promising outcomes from a sensor rule. The [subjective stress-guided randomized trial](https://pubmed.ncbi.nlm.nih.gov/36940300/) supports considering athlete reports alongside HRV, but studied only 36 male recreational runners over a short intervention. Neither paper validates the policy's numerical cutoffs, three-day window, seven-sample minimum, 30-minute proposal or application horizon. Those choices are versioned product defaults and require evaluation before broader claims.

## Verification

Fixtures cover isolated and persistent anomalies, sensor/report disagreement, sparse/stale/future measurements, mixed providers and device/protocol changes, SDNN/rMSSD separation, zeros/missing values, explicit illness and negated free text. Consumer tests verify the same prompt block in all planning entrypoints. PostgreSQL integration tests verify fresh-feedback rejection, accepted easy/rest replacement, preserved schedule on rejection and revision handling alongside the existing prescription protection tests.
