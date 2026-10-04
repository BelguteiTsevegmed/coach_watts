<template>
  <div
    v-if="hasAnalysisFactsPanel"
    class="bg-white dark:bg-gray-900 rounded-none sm:rounded-xl shadow-none sm:shadow p-6 border-x-0 sm:border-x border-y border-gray-100 dark:border-gray-800"
  >
    <div class="flex flex-col gap-5">
      <div class="flex items-center justify-between gap-4 flex-wrap">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-beaker" class="w-5 h-5 text-amber-500" />
          <div class="flex flex-col">
            <h3 class="text-sm font-black uppercase tracking-widest text-gray-900 dark:text-white">
              Calculated Workout Facts
            </h3>
            <div
              class="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500"
            >
              Derived training interpretation signals for this workout
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <UBadge
            color="primary"
            variant="soft"
            class="font-black uppercase tracking-widest text-[9px]"
          >
            Schema: {{ analysisFactsVersionLabel }}
          </UBadge>
          <UBadge
            color="success"
            variant="soft"
            class="font-black uppercase tracking-widest text-[9px]"
          >
            Included: {{ includedPromptFactsCount }}
          </UBadge>
          <UBadge
            color="neutral"
            variant="soft"
            class="font-black uppercase tracking-widest text-[9px]"
          >
            Ignored: {{ ignoredPromptFactsCount }}
          </UBadge>
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            class="font-black uppercase tracking-widest text-[10px]"
            :icon="analysisFactsOpen ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
            :label="analysisFactsOpen ? 'Hide Facts' : 'Show Facts'"
            @click="
              () => {
                analysisFactsOpen = !analysisFactsOpen
              }
            "
          />
        </div>
      </div>

      <div
        v-if="!analysisFactsOpen"
        class="rounded-xl bg-amber-50/70 dark:bg-amber-950/20 p-4 border border-amber-100 dark:border-amber-900/40"
      >
        <div
          class="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400 mb-2"
        >
          Collapsed Summary
        </div>
        <div class="flex flex-wrap gap-2">
          <UBadge
            v-for="badge in analysisFactsSummaryBadges"
            :key="badge.key"
            :color="getSummaryBadgeColor(badge.value)"
            variant="soft"
            class="font-black uppercase tracking-widest text-[9px]"
          >
            {{ badge.label }}: {{ formatFactValue(badge.value) }}
          </UBadge>
        </div>
      </div>

      <div v-else class="space-y-4">
        <div class="flex flex-wrap gap-2 mb-1">
          <UBadge
            v-for="badge in analysisFactsSummaryBadges"
            :key="badge.key"
            :color="getSummaryBadgeColor(badge.value)"
            variant="soft"
            class="font-black uppercase tracking-widest text-[9px]"
          >
            {{ badge.label }}: {{ formatFactValue(badge.value) }}
          </UBadge>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div
            v-for="group in analysisFactsGroups"
            :key="group.key"
            class="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden"
          >
            <div
              class="px-4 py-3 bg-gray-50/70 dark:bg-gray-950/50 border-b border-gray-100 dark:border-gray-800"
            >
              <h4
                class="text-[10px] font-black uppercase tracking-widest text-gray-900 dark:text-white"
              >
                {{ group.label }}
              </h4>
            </div>
            <div class="px-4 py-3 space-y-2">
              <div
                v-for="entry in group.entries"
                :key="entry.key"
                class="flex items-start justify-between gap-4 text-xs"
              >
                <UTooltip
                  :text="analysisFactTooltips[entry.key] || entry.label"
                  :popper="{ placement: 'top' }"
                  :ui="{ content: 'w-[280px] h-auto whitespace-normal' }"
                  arrow
                >
                  <div
                    class="font-black uppercase tracking-widest text-gray-400 border-b border-dashed border-gray-300 dark:border-gray-700 inline-block cursor-help"
                  >
                    {{ entry.label }}
                  </div>
                </UTooltip>
                <UTooltip
                  :text="getPromptDecisionReason(entry.path)"
                  :popper="{ placement: 'left' }"
                  :ui="{ content: 'w-[260px] h-auto whitespace-normal' }"
                  arrow
                >
                  <div
                    class="text-right font-medium cursor-help"
                    :class="getPromptDecisionValueClass(entry.path)"
                  >
                    {{ formatFactValue(entry.value) }}
                  </div>
                </UTooltip>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  /**
   * Admin-only diagnostics: the calculated fact payload the workout analysis is
   * built from, including which facts were included in / ignored by the prompt.
   * Never render this for athletes — the parent page gates it on `isAdmin`.
   */
  const props = defineProps<{
    analysisFacts?: any
    analysisFactsV2?: any
  }>()

  const analysisFactsOpen = ref(false)

  const analysisFacts = computed(() => props.analysisFacts || null)
  const analysisFactsV2 = computed(() => props.analysisFactsV2 || null)
  const hasAnalysisFactsPanel = computed(() =>
    Boolean(analysisFactsV2.value || analysisFacts.value)
  )
  const analysisFactsVersionLabel = computed(() => (analysisFactsV2.value ? 'v2' : 'v1'))
  const analysisFactTooltips: Record<string, string> = {
    rpe: 'The athlete-reported intensity of the full session on the RPE scale.',
    sessionRpeLoad:
      'Session RPE multiplied by duration in minutes. This reflects total subjective toll, not a heart-rate zone.',
    subjectiveObjectiveGap:
      'How far the athlete’s subjective load diverges from objective load markers like TSS or training load.',
    musculoskeletalToll:
      'Estimated impact and tissue stress from the session, especially useful for running and strength work.',
    impactProfile:
      'Baseline mechanical impact expectation for the sport, used to contextualize subjective load.',
    analysisMode:
      'Which signal family should lead interpretation for this workout: power, pace, RPE, or a mixed view.',
    hrUsable:
      'Whether heart-rate telemetry is trustworthy enough to support physiological conclusions.',
    hrZeroRatio:
      'Share of HR samples that were literal zero values, which are treated as invalid telemetry.',
    hrMissingRatio:
      'Share of HR samples that were missing or invalid, indicating unreliable heart-rate coverage.',
    hrArtifactFlag:
      'True when the heart-rate stream shows enough placeholder or invalid data to treat it as artifact-prone.',
    powerSourceType:
      'Whether power is treated as direct measured mechanical power, estimated/modelled power, or unknown.',
    powerAbsoluteUsable:
      'Whether the absolute power number is reliable enough to use as a benchmark, not just a relative trend.',
    powerRelativeUsable:
      'Whether available power can still be used for within-athlete trend tracking even if absolute accuracy is uncertain.',
    lrBalanceUsable:
      'Whether left/right balance can be interpreted safely after checking source semantics and possible channel issues.',
    normalHrLagExpected:
      'Whether delayed HR response should be expected physiologically for this workout type and effort profile.',
    normalHrLagDetected:
      'Whether the workout shows a normal delayed HR rise after power or pace increases rather than a sensor problem.',
    steadyStateSegmentsAvailable:
      'Whether there is enough sustained steady work after warm-up to support durability-style physiology checks.',
    warmupExcludedMinutes:
      'Minutes excluded from decoupling logic so warm-up kinetics do not create false positives.',
    decouplingValid:
      'Whether decoupling should be interpreted at all for this session based on duration and telemetry quality.',
    decouplingEffective:
      'The effective post-warm-up decoupling value used for debugging. Negative values can indicate efficiency gain.',
    decouplingDirection:
      'Classifies the session as positive drift, stable, or efficiency gain after excluding the warm-up phase.',
    decouplingConfidence:
      'Confidence in the decoupling reading based on workout duration and signal quality.',
    sourceSemantics:
      'Describes what the L/R balance channels likely represent: true left/right legs, human-vs-motor, or unknown.',
    inversionSuspected:
      'True when the balance channels appear reversed and need correction before interpretation.',
    correctedLeftPct:
      'Left-side percentage after any sanity correction or inversion handling has been applied.',
    correctedRightPct:
      'Right-side percentage after any sanity correction or inversion handling has been applied.',
    interpretationMode:
      'Whether L/R balance is used normally, corrected first, or disabled entirely.',
    correctionReason: 'Short explanation for why L/R interpretation was corrected or disabled.',
    detected:
      'Whether ERG mode was detected from explicit metadata or a strong inferred trainer-control signature.',
    confidence:
      'Confidence level for the current diagnostic group, especially ERG and decoupling inference.',
    source:
      'Whether the ERG inference came from explicit metadata, heuristic inference, or remains unknown.',
    powerControlMode:
      'The likely trainer control mode: ERG, resistance/slope-style control, free ride, or unknown.',
    reasons: 'Short reasons explaining why the system inferred the current ERG status.',
    computedFrom: 'Inputs used to compute this fact payload for the current workout.',
    unavailableInputs: 'Inputs that were missing, so some facts may be downgraded or unavailable.',
    disabledInterpretations:
      'Interpretations intentionally suppressed because the available data is not trustworthy enough.',
    primaryArchetype: 'High-level workout intent classification used to drive the AI analysis.',
    executionEnvironment:
      'Execution environment determines whether pacing is athlete-driven, trainer-enforced, or treadmill-based.',
    primaryMetric:
      'The primary metric the AI should prioritize for interpreting execution quality.',
    sessionSteadiness:
      'Describes whether the session is steady, rolling, stochastic, or interval-based.',
    hrArtifactSeverity: 'How severe the HR telemetry artifacts are if present.',
    paceUsable: 'Whether pace should be trusted as a meaningful execution signal.',
    gpsConfidence: 'Confidence in pace/GPS interpretation, mainly for running-style sessions.',
    suppressions: 'Signals the AI is explicitly instructed not to interpret from this workout.',
    planLinked: 'Whether this workout was linked to a planned session.',
    adherenceAssessable:
      'Whether planned-vs-actual adherence can be scored defensibly with the available data.',
    adherenceReason: 'Explanation for why adherence is or is not assessable.',
    completionPct: 'Compact summary of how much of the planned session was completed.',
    durationVsPlanPct: 'Actual duration as a percentage of planned duration.',
    workIntervalHitRate:
      'Percentage of planned work intervals that landed near their intended target.',
    recoveryHitRate: 'Percentage of planned recovery intervals that matched the expected target.',
    targetOvershootPct:
      'Average amount the athlete overshot planned targets when they went too hard.',
    targetUndershootPct:
      'Average amount the athlete undershot planned targets when they went too easy.',
    structureMatched:
      'Whether the actual session structure resembled the planned work/recovery pattern.',
    executionClassification:
      'High-level classification of how the session was executed relative to the plan.',
    decouplingInterpretable: 'Whether classic decoupling is valid to discuss for this workout.',
    decouplingReason: 'Explanation for why classic decoupling was suppressed or allowed.',
    lateSessionFadePct:
      'Late-session change in the primary workload signal, used as a durability marker.',
    firstVsLastIntervalDeltaPct:
      'Change between the first and last hard interval, used as a repeatability signal.',
    recoveryTrendScore: 'Normalized score for short-term recovery behavior between efforts.',
    executionStabilityScore:
      'Normalized score for how consistently the athlete delivered the session.',
    repeatabilityScore: 'Normalized score for interval-to-interval repeatability.',
    dominantPowerZone: 'Power zone containing the largest share of the session.',
    dominantHrZone: 'Heart-rate zone containing the largest share of the session.',
    timeAboveThresholdPct: 'Share of the session spent above threshold-like intensity bins.',
    cadenceDriftPct: 'Change in cadence between early and late parts of the session.',
    cadenceStabilityScore: 'Normalized score for cadence consistency.',
    torqueProfile: 'Simple cadence-based characterization of pedaling style for cycling workouts.',
    pacingDriftPct: 'Change in running pace/speed between early and late parts of the session.',
    suppressedMetrics: 'Metrics intentionally hidden from AI interpretation for safety.',
    overallConfidence: 'Confidence level for the entire v2 fact payload.'
  }

  const analysisFactsGroups = computed(() => {
    if (analysisFactsV2.value) {
      return [
        {
          key: 'guardrails',
          label: 'Guardrails',
          entries: [
            {
              key: 'analysisMode',
              path: 'guardrails.analysisMode',
              label: 'Analysis Mode',
              value: analysisFactsV2.value.guardrails.analysisMode
            },
            {
              key: 'primaryArchetype',
              path: 'guardrails.archetype.primaryArchetype',
              label: 'Primary Archetype',
              value: analysisFactsV2.value.guardrails.archetype.primaryArchetype
            },
            {
              key: 'executionEnvironment',
              path: 'guardrails.archetype.executionEnvironment',
              label: 'Execution Environment',
              value: analysisFactsV2.value.guardrails.archetype.executionEnvironment
            },
            {
              key: 'primaryMetric',
              path: 'guardrails.archetype.primaryMetric',
              label: 'Primary Metric',
              value: analysisFactsV2.value.guardrails.archetype.primaryMetric
            },
            {
              key: 'sessionSteadiness',
              path: 'guardrails.archetype.sessionSteadiness',
              label: 'Session Steadiness',
              value: analysisFactsV2.value.guardrails.archetype.sessionSteadiness
            },
            {
              key: 'hrUsable',
              path: 'guardrails.telemetry.hrUsable',
              label: 'HR Usable',
              value: analysisFactsV2.value.guardrails.telemetry.hrUsable
            },
            {
              key: 'hrArtifactSeverity',
              path: 'guardrails.telemetry.hrArtifactSeverity',
              label: 'HR Artifact Severity',
              value: analysisFactsV2.value.guardrails.telemetry.hrArtifactSeverity
            },
            {
              key: 'powerSourceType',
              path: 'guardrails.telemetry.powerSourceType',
              label: 'Power Source Type',
              value: analysisFactsV2.value.guardrails.telemetry.powerSourceType
            },
            {
              key: 'paceUsable',
              path: 'guardrails.telemetry.paceUsable',
              label: 'Pace Usable',
              value: analysisFactsV2.value.guardrails.telemetry.paceUsable
            },
            {
              key: 'gpsConfidence',
              path: 'guardrails.telemetry.gpsConfidence',
              label: 'GPS Confidence',
              value: analysisFactsV2.value.guardrails.telemetry.gpsConfidence
            },
            {
              key: 'lrBalanceUsable',
              path: 'guardrails.telemetry.lrBalanceUsable',
              label: 'L/R Balance Usable',
              value: analysisFactsV2.value.guardrails.telemetry.lrBalanceUsable
            },
            {
              key: 'detected',
              path: 'guardrails.erg.detected',
              label: 'ERG Detected',
              value: analysisFactsV2.value.guardrails.erg.detected
            },
            {
              key: 'powerControlMode',
              path: 'guardrails.erg.powerControlMode',
              label: 'Power Control Mode',
              value: analysisFactsV2.value.guardrails.erg.powerControlMode
            },
            {
              key: 'suppressions',
              path: 'guardrails.suppressions',
              label: 'Suppressions',
              value: analysisFactsV2.value.guardrails.suppressions
            }
          ]
        },
        {
          key: 'adherence',
          label: 'Adherence',
          entries: [
            {
              key: 'planLinked',
              path: 'adherence.planLinked',
              label: 'Plan Linked',
              value: analysisFactsV2.value.adherence.planLinked
            },
            {
              key: 'adherenceAssessable',
              path: 'adherence.adherenceAssessable',
              label: 'Adherence Assessable',
              value: analysisFactsV2.value.adherence.adherenceAssessable
            },
            {
              key: 'adherenceReason',
              path: 'adherence.adherenceReason',
              label: 'Adherence Reason',
              value: analysisFactsV2.value.adherence.adherenceReason
            },
            {
              key: 'completionPct',
              path: 'adherence.completionPct',
              label: 'Completion %',
              value: analysisFactsV2.value.adherence.completionPct
            },
            {
              key: 'durationVsPlanPct',
              path: 'adherence.durationVsPlanPct',
              label: 'Duration vs Plan %',
              value: analysisFactsV2.value.adherence.durationVsPlanPct
            },
            {
              key: 'workIntervalHitRate',
              path: 'adherence.workIntervalHitRate',
              label: 'Work Interval Hit Rate',
              value: analysisFactsV2.value.adherence.workIntervalHitRate
            },
            {
              key: 'recoveryHitRate',
              path: 'adherence.recoveryHitRate',
              label: 'Recovery Hit Rate',
              value: analysisFactsV2.value.adherence.recoveryHitRate
            },
            {
              key: 'targetOvershootPct',
              path: 'adherence.targetOvershootPct',
              label: 'Target Overshoot %',
              value: analysisFactsV2.value.adherence.targetOvershootPct
            },
            {
              key: 'targetUndershootPct',
              path: 'adherence.targetUndershootPct',
              label: 'Target Undershoot %',
              value: analysisFactsV2.value.adherence.targetUndershootPct
            },
            {
              key: 'structureMatched',
              path: 'adherence.structureMatched',
              label: 'Structure Matched',
              value: analysisFactsV2.value.adherence.structureMatched
            },
            {
              key: 'executionClassification',
              path: 'adherence.executionClassification',
              label: 'Execution Classification',
              value: analysisFactsV2.value.adherence.executionClassification
            }
          ]
        },
        {
          key: 'performanceSignals',
          label: 'Performance Signals',
          entries: [
            {
              key: 'decouplingInterpretable',
              path: 'performanceSignals.decoupling.interpretable',
              label: 'Decoupling Interpretable',
              value: analysisFactsV2.value.performanceSignals.decoupling.interpretable
            },
            {
              key: 'decouplingReason',
              path: 'performanceSignals.decoupling.reason',
              label: 'Decoupling Reason',
              value: analysisFactsV2.value.performanceSignals.decoupling.reason
            },
            {
              key: 'decouplingEffective',
              path: 'performanceSignals.decoupling.effective',
              label: 'Decoupling Effective',
              value: analysisFactsV2.value.performanceSignals.decoupling.effective
            },
            {
              key: 'decouplingDirection',
              path: 'performanceSignals.decoupling.direction',
              label: 'Decoupling Direction',
              value: analysisFactsV2.value.performanceSignals.decoupling.direction
            },
            {
              key: 'lateSessionFadePct',
              path: 'performanceSignals.durability.lateSessionFadePct',
              label: 'Late Session Fade %',
              value: analysisFactsV2.value.performanceSignals.durability.lateSessionFadePct
            },
            {
              key: 'firstVsLastIntervalDeltaPct',
              path: 'performanceSignals.durability.firstVsLastIntervalDeltaPct',
              label: 'First vs Last Interval Delta %',
              value: analysisFactsV2.value.performanceSignals.durability.firstVsLastIntervalDeltaPct
            },
            {
              key: 'recoveryTrendScore',
              path: 'performanceSignals.durability.recoveryTrendScore',
              label: 'Recovery Trend Score',
              value: analysisFactsV2.value.performanceSignals.durability.recoveryTrendScore
            },
            {
              key: 'executionStabilityScore',
              path: 'performanceSignals.durability.executionStabilityScore',
              label: 'Execution Stability Score',
              value: analysisFactsV2.value.performanceSignals.durability.executionStabilityScore
            },
            {
              key: 'repeatabilityScore',
              path: 'performanceSignals.durability.repeatabilityScore',
              label: 'Repeatability Score',
              value: analysisFactsV2.value.performanceSignals.durability.repeatabilityScore
            },
            {
              key: 'dominantPowerZone',
              path: 'performanceSignals.zones.dominantPowerZone',
              label: 'Dominant Power Zone',
              value: analysisFactsV2.value.performanceSignals.zones.dominantPowerZone
            },
            {
              key: 'dominantHrZone',
              path: 'performanceSignals.zones.dominantHrZone',
              label: 'Dominant HR Zone',
              value: analysisFactsV2.value.performanceSignals.zones.dominantHrZone
            },
            {
              key: 'timeAboveThresholdPct',
              path: 'performanceSignals.zones.timeAboveThresholdPct',
              label: 'Time Above Threshold %',
              value: analysisFactsV2.value.performanceSignals.zones.timeAboveThresholdPct
            },
            {
              key: 'cadenceDriftPct',
              path: 'performanceSignals.sportSpecific.cadenceDriftPct',
              label: 'Cadence Drift %',
              value: analysisFactsV2.value.performanceSignals.sportSpecific.cadenceDriftPct
            },
            {
              key: 'cadenceStabilityScore',
              path: 'performanceSignals.sportSpecific.cadenceStabilityScore',
              label: 'Cadence Stability Score',
              value: analysisFactsV2.value.performanceSignals.sportSpecific.cadenceStabilityScore
            },
            {
              key: 'torqueProfile',
              path: 'performanceSignals.sportSpecific.torqueProfile',
              label: 'Torque Profile',
              value: analysisFactsV2.value.performanceSignals.sportSpecific.torqueProfile
            },
            {
              key: 'pacingDriftPct',
              path: 'performanceSignals.sportSpecific.pacingDriftPct',
              label: 'Pacing Drift %',
              value: analysisFactsV2.value.performanceSignals.sportSpecific.pacingDriftPct
            }
          ]
        },
        {
          key: 'confidence',
          label: 'Confidence',
          entries: [
            {
              key: 'overallConfidence',
              path: 'confidence.overall',
              label: 'Overall Confidence',
              value: analysisFactsV2.value.confidence.overall
            },
            {
              key: 'computedFrom',
              path: 'confidence.debugMeta.computedFrom',
              label: 'Computed From',
              value: analysisFactsV2.value.confidence.debugMeta.computedFrom
            },
            {
              key: 'unavailableInputs',
              path: 'confidence.debugMeta.unavailableInputs',
              label: 'Unavailable Inputs',
              value: analysisFactsV2.value.confidence.debugMeta.unavailableInputs
            },
            {
              key: 'suppressedMetrics',
              path: 'confidence.debugMeta.suppressedMetrics',
              label: 'Suppressed Metrics',
              value: analysisFactsV2.value.confidence.debugMeta.suppressedMetrics
            }
          ]
        }
      ]
    }

    if (!analysisFacts.value) return []

    return [
      {
        key: 'subjective',
        label: 'Subjective',
        entries: [
          {
            key: 'rpe',
            path: 'subjective.rpe',
            label: 'RPE',
            value: analysisFacts.value.subjective.rpe
          },
          {
            key: 'sessionRpeLoad',
            path: 'subjective.sessionRpeLoad',
            label: 'Session RPE Load',
            value: analysisFacts.value.subjective.sessionRpeLoad
          },
          {
            key: 'subjectiveObjectiveGap',
            path: 'subjective.subjectiveObjectiveGap',
            label: 'Subjective vs Objective Gap',
            value: analysisFacts.value.subjective.subjectiveObjectiveGap
          },
          {
            key: 'musculoskeletalToll',
            path: 'subjective.musculoskeletalToll',
            label: 'Musculoskeletal Toll',
            value: analysisFacts.value.subjective.musculoskeletalToll
          },
          {
            key: 'impactProfile',
            path: 'subjective.impactProfile',
            label: 'Impact Profile',
            value: analysisFacts.value.subjective.impactProfile
          }
        ]
      },
      {
        key: 'telemetry',
        label: 'Telemetry',
        entries: [
          {
            key: 'analysisMode',
            path: 'telemetry.analysisMode',
            label: 'Analysis Mode',
            value: analysisFacts.value.telemetry.analysisMode
          },
          {
            key: 'hrUsable',
            path: 'telemetry.hrUsable',
            label: 'HR Usable',
            value: analysisFacts.value.telemetry.hrUsable
          },
          {
            key: 'hrZeroRatio',
            path: 'telemetry.hrZeroRatio',
            label: 'HR Zero Ratio',
            value: analysisFacts.value.telemetry.hrZeroRatio
          },
          {
            key: 'hrMissingRatio',
            path: 'telemetry.hrMissingRatio',
            label: 'HR Missing Ratio',
            value: analysisFacts.value.telemetry.hrMissingRatio
          },
          {
            key: 'hrArtifactFlag',
            path: 'telemetry.hrArtifactFlag',
            label: 'HR Artifact Flag',
            value: analysisFacts.value.telemetry.hrArtifactFlag
          },
          {
            key: 'powerSourceType',
            path: 'telemetry.powerSourceType',
            label: 'Power Source Type',
            value: analysisFacts.value.telemetry.powerSourceType
          },
          {
            key: 'powerAbsoluteUsable',
            path: 'telemetry.powerAbsoluteUsable',
            label: 'Power Absolute Usable',
            value: analysisFacts.value.telemetry.powerAbsoluteUsable
          },
          {
            key: 'powerRelativeUsable',
            path: 'telemetry.powerRelativeUsable',
            label: 'Power Relative Usable',
            value: analysisFacts.value.telemetry.powerRelativeUsable
          },
          {
            key: 'lrBalanceUsable',
            path: 'telemetry.lrBalanceUsable',
            label: 'L/R Balance Usable',
            value: analysisFacts.value.telemetry.lrBalanceUsable
          }
        ]
      },
      {
        key: 'physiology',
        label: 'Physiology',
        entries: [
          {
            key: 'normalHrLagExpected',
            path: 'physiology.normalHrLagExpected',
            label: 'Normal HR Lag Expected',
            value: analysisFacts.value.physiology.normalHrLagExpected
          },
          {
            key: 'normalHrLagDetected',
            path: 'physiology.normalHrLagDetected',
            label: 'Normal HR Lag Detected',
            value: analysisFacts.value.physiology.normalHrLagDetected
          },
          {
            key: 'steadyStateSegmentsAvailable',
            path: 'physiology.steadyStateSegmentsAvailable',
            label: 'Steady-State Segments',
            value: analysisFacts.value.physiology.steadyStateSegmentsAvailable
          },
          {
            key: 'warmupExcludedMinutes',
            path: 'physiology.warmupExcludedMinutes',
            label: 'Warmup Excluded Minutes',
            value: analysisFacts.value.physiology.warmupExcludedMinutes
          },
          {
            key: 'decouplingValid',
            path: 'physiology.decouplingValid',
            label: 'Decoupling Valid',
            value: analysisFacts.value.physiology.decouplingValid
          },
          {
            key: 'decouplingEffective',
            path: 'physiology.decouplingEffective',
            label: 'Decoupling Effective',
            value: analysisFacts.value.physiology.decouplingEffective
          },
          {
            key: 'decouplingDirection',
            path: 'physiology.decouplingDirection',
            label: 'Decoupling Direction',
            value: analysisFacts.value.physiology.decouplingDirection
          },
          {
            key: 'decouplingConfidence',
            path: 'physiology.decouplingConfidence',
            label: 'Decoupling Confidence',
            value: analysisFacts.value.physiology.decouplingConfidence
          }
        ]
      },
      {
        key: 'lrBalance',
        label: 'L/R Balance',
        entries: [
          {
            key: 'sourceSemantics',
            path: 'lrBalance.sourceSemantics',
            label: 'Source Semantics',
            value: analysisFacts.value.lrBalance.sourceSemantics
          },
          {
            key: 'inversionSuspected',
            path: 'lrBalance.inversionSuspected',
            label: 'Inversion Suspected',
            value: analysisFacts.value.lrBalance.inversionSuspected
          },
          {
            key: 'correctedLeftPct',
            path: 'lrBalance.correctedLeftPct',
            label: 'Corrected Left %',
            value: analysisFacts.value.lrBalance.correctedLeftPct
          },
          {
            key: 'correctedRightPct',
            path: 'lrBalance.correctedRightPct',
            label: 'Corrected Right %',
            value: analysisFacts.value.lrBalance.correctedRightPct
          },
          {
            key: 'interpretationMode',
            path: 'lrBalance.interpretationMode',
            label: 'Interpretation Mode',
            value: analysisFacts.value.lrBalance.interpretationMode
          },
          {
            key: 'correctionReason',
            path: 'lrBalance.correctionReason',
            label: 'Correction Reason',
            value: analysisFacts.value.lrBalance.correctionReason
          }
        ]
      },
      {
        key: 'erg',
        label: 'ERG',
        entries: [
          {
            key: 'detected',
            path: 'erg.detected',
            label: 'Detected',
            value: analysisFacts.value.erg.detected
          },
          {
            key: 'confidence',
            path: 'erg.confidence',
            label: 'Confidence',
            value: analysisFacts.value.erg.confidence
          },
          {
            key: 'source',
            path: 'erg.source',
            label: 'Source',
            value: analysisFacts.value.erg.source
          },
          {
            key: 'powerControlMode',
            path: 'erg.powerControlMode',
            label: 'Power Control Mode',
            value: analysisFacts.value.erg.powerControlMode
          },
          {
            key: 'reasons',
            path: 'erg.reasons',
            label: 'Reasons',
            value: analysisFacts.value.erg.reasons
          }
        ]
      },
      {
        key: 'debugMeta',
        label: 'Debug Meta',
        entries: [
          {
            key: 'computedFrom',
            path: 'debugMeta.computedFrom',
            label: 'Computed From',
            value: analysisFacts.value.debugMeta.computedFrom
          },
          {
            key: 'unavailableInputs',
            path: 'debugMeta.unavailableInputs',
            label: 'Unavailable Inputs',
            value: analysisFacts.value.debugMeta.unavailableInputs
          },
          {
            key: 'disabledInterpretations',
            path: 'debugMeta.disabledInterpretations',
            label: 'Disabled Interpretations',
            value: analysisFacts.value.debugMeta.disabledInterpretations
          }
        ]
      }
    ]
  })

  function formatFactValue(value: unknown) {
    if (value === null || value === undefined || value === '') return 'Unavailable'
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2)
    if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'None'
    return String(value)
  }

  function getFactBadgeColor(value: boolean) {
    return value ? 'success' : 'warning'
  }

  function getSummaryBadgeColor(value: unknown) {
    return typeof value === 'boolean' ? getFactBadgeColor(value) : 'neutral'
  }

  const analysisFactsSummaryBadges = computed(() => {
    if (analysisFactsV2.value) {
      return [
        {
          key: 'hrUsable',
          label: 'HR Usable',
          value: analysisFactsV2.value.guardrails.telemetry.hrUsable
        },
        {
          key: 'primaryArchetype',
          label: 'Archetype',
          value: analysisFactsV2.value.guardrails.archetype.primaryArchetype
        },
        {
          key: 'executionClassification',
          label: 'Execution',
          value: analysisFactsV2.value.adherence.executionClassification
        },
        {
          key: 'decouplingInterpretable',
          label: 'Decoupling',
          value: analysisFactsV2.value.performanceSignals.decoupling.interpretable
        }
      ]
    }

    if (!analysisFacts.value) return []
    return [
      {
        key: 'hrUsable',
        label: 'HR Usable',
        value: analysisFacts.value.telemetry.hrUsable
      },
      {
        key: 'analysisMode',
        label: 'Analysis Mode',
        value: analysisFacts.value.telemetry.analysisMode
      },
      {
        key: 'lrMode',
        label: 'L/R Mode',
        value: analysisFacts.value.lrBalance.interpretationMode
      }
    ]
  })

  const promptDecisions = computed(
    () =>
      analysisFactsV2.value?.confidence?.debugMeta?.promptDecisions ||
      analysisFacts.value?.debugMeta?.promptDecisions ||
      {}
  )
  const includedPromptFactsCount = computed(
    () => Object.values(promptDecisions.value).filter((decision: any) => decision.include).length
  )
  const ignoredPromptFactsCount = computed(
    () => Object.values(promptDecisions.value).filter((decision: any) => !decision.include).length
  )

  function getPromptDecision(path: string) {
    return (
      promptDecisions.value[path] || { include: false, reason: 'No prompt decision available.' }
    )
  }

  function getPromptDecisionInclude(path: string) {
    return getPromptDecision(path).include
  }

  function getPromptDecisionReason(path: string) {
    return getPromptDecision(path).reason
  }

  function getPromptDecisionValueClass(path: string) {
    return getPromptDecisionInclude(path)
      ? 'text-emerald-700 dark:text-emerald-300'
      : 'text-gray-500 dark:text-gray-400'
  }
</script>
