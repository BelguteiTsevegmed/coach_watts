# Athlete references and effort prescriptions

Structured generation and adjustment resolve FTP, LTHR, max HR, and threshold speed through `shared/physiology-references.ts`. Missing, zero, invalid, and inapplicable sport values remain unknown. The arithmetic boundary uses zero to represent unavailable references; persisted thresholds and derived metrics use `null`.

Resolution records the accepted value, source, sport, measurement date, confidence, freshness, conflicting alternatives, and usability. A legacy configured value remains usable with unknown measurement date and confidence. Updating a profile is not evidence that the athlete was measured on that date. Never use pending threshold recommendations as accepted references.

A dated reference older than the 90-day product review horizon requires calibration before precise prescriptions. This horizon is a conservative product review policy, not a claim that physiology expires after 90 days. Qualified workout-derived estimates retain their evidence workout and date when accepted. Unqualified estimates and references recorded for another sport cannot drive precise targets.

Sport profiles are selected consistently: exact activity matches precede partial matches, profiles with FTP/LTHR data precede empty profiles, and stable IDs break ties. Conflicting values are recorded; the selected sport profile wins. Legacy user FTP is a cycling fallback and cannot become running power. Profile changes, gained/lost references, max HR changes, and provenance changes trigger regeneration guidance.

When a requested metric is unavailable, generation uses another usable metric or RPE. Server normalization removes unsupported power, HR, and pace targets, including inside repeats. Effort sessions retain duration, interval intent, a 1–10 RPE cue, and talk-test instructions. Their stress estimate is unavailable rather than derived from RPE as though RPE were a physiological intensity factor. Running/cycling views show effort steps without an invented percentage chart.

The generation settings snapshot and canonical structure retain reference provenance and whether stress/distance estimates are available. Frozen unknown values remain unknown at export; later live settings must not silently change an accepted prescription. Effort cues export as Intervals text or open device targets. Formats that require absolute power (ERG and power-target FIT/Garmin conversion) require a real FTP and return a clear error if it is absent. Existing measured power prescriptions remain supported.

## Calibration options

- Cycling: enter a recent tested FTP, or review a dedicated power benchmark. The existing 20-minute estimator uses 95% of sustained power. A first automatic nomination requires independent threshold-intensity HR evidence with adequate coverage; an ordinary easy ride is insufficient.
- Running: enter a recent tested threshold speed, or review a sustained 40-minute running effort. A first automatic pace nomination requires threshold-intensity HR evidence with adequate coverage. Stored sport thresholds use m/s; recommendation histories use s/km and are converted on acceptance.
- LTHR: a first automatic estimate requires independent power/pace corroboration, rather than using HR to validate its own inferred threshold.
- Max HR: manually enter a tested value or review qualified coaching-service evidence. Profile-page scanning improves an existing max HR; it does not equate an ordinary session peak with an athlete's first maximum.

Accepted estimate provenance lives in `SportSettings.zoneConfiguration.physiologyReferences`, keyed by metric. The metadata value must match the accepted setting to apply. Ordinary manual edits preserve configured settings and do not acquire a fabricated measurement date. Existing threshold-detection corroboration rules are reused; this change does not introduce new physiological estimation formulas.
