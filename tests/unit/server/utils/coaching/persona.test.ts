import { describe, expect, it } from 'vitest'
import {
  COACH_PERSONAS,
  buildChatCoachClosing,
  buildChatCoachPersona,
  buildCoachRoleIntro
} from '../../../../../server/utils/coaching/persona'
import type { PrimarySport } from '../../../../../server/utils/coaching/sport'

const sports: PrimarySport[] = ['running', 'cycling', 'swimming', 'multisport', 'general']

function chatPrompt(persona: string | null, sport: PrimarySport = 'running') {
  return buildChatCoachPersona({
    persona,
    sport,
    preferredName: 'Alex',
    language: 'English',
    telemetryInstruction: 'Use the provided training summary before fetching more data.'
  })
}

// Prompt contract tests protect the instructions sent to the model. They do not
// substitute for evaluating the model's actual responses to coaching scenarios.
describe('independent coaching judgment', () => {
  it.each(COACH_PERSONAS)(
    'keeps %s accountable to the same goals and evidence in every sport',
    (persona) => {
      for (const sport of sports) {
        const prompts = [
          chatPrompt(persona, sport),
          buildCoachRoleIntro({ persona, sport, task: 'planning the next training week.' })
        ]

        for (const prompt of prompts) {
          expect(prompt).toContain("athlete's stated goals")
          expect(prompt).toContain('Persona changes tone, not your assessment')
          expect(prompt).toContain('recent sport-specific training, recovery and symptoms')
          expect(prompt).toContain('do not endorse a choice merely because the athlete proposes it')
          expect(prompt).toContain('the evidence or uncertainty behind it')
          expect(prompt).toContain('the tradeoff for their goal, and a practical alternative')
          expect(prompt).toContain('Do not flatter proposals or open with generic praise')
          expect(prompt).toContain(
            'Never invent personal coaching experience, clients, credentials or anecdotes'
          )
          expect(prompt).toContain('Do not invent physiological explanations')
          expect(prompt).toContain(
            'Distinguish supported evidence from coaching heuristics and uncertainty'
          )
          expect(prompt).toContain('avoid universal claims when the outcome depends on the athlete')
        }
      }
    }
  )

  it('does not turn encouragement or missing data into unsupported clearance', () => {
    const prompt = chatPrompt('Supportive')

    expect(prompt).toContain('praise only specific progress supported by the available evidence')
    expect(prompt).toContain('Never invent goals, metrics, readiness or history')
    expect(prompt).toContain('missing information would materially change the decision')
    expect(prompt).toContain('state the assumption and give a conservative option')
  })

  it('distinguishes a preference from a constraint while respecting informed safe choices', () => {
    const prompt = chatPrompt('Drill Sergeant')

    expect(prompt).toContain('Distinguish preferences (what they enjoy) from constraints')
    expect(prompt).toContain('do not shame the athlete')
    expect(prompt).toContain('do not manufacture an objection to a reasonable request')
    expect(prompt).toContain(
      'Respect an informed choice among safe options, including a changed goal'
    )
    expect(prompt).toContain('Explain a concern once, then help without repeated persuasion')
    expect(prompt).toContain(
      'Do not prescribe through injury/illness red flags or clinician restrictions'
    )
    expect(prompt).toContain('never on pain, injury or illness')
  })

  it('assesses the swim-to-run tradeoff before saving a requested workout swap', () => {
    const prompt = chatPrompt('Motivational', 'multisport')

    expect(prompt).toContain("check the new sport's recent exposure")
    expect(prompt).toContain(
      'proposed duration, intensity and current symptoms fit the intended training purpose'
    )
    expect(prompt).toContain('Equal duration or load alone does not establish equivalence')
    expect(prompt).toContain('Do not claim all swim-to-run swaps lose their recovery purpose')
    expect(prompt).toContain('assess this athlete and this session')
    expect(prompt).toContain('impact, recovery cost or goal specificity before acting')
    expect(prompt).toContain('if the swap is reasonable, help without an unnecessary approval loop')
    expect(prompt).toContain('assess it before using the edit tools')
    expect(prompt).toContain('confirm changes only when the tools report success')
  })

  it('keeps ordinary coaching replies brief without sacrificing requested detail', () => {
    const prompt = chatPrompt('Motivational')

    expect(prompt).toContain('default to 2-5 short sentences')
    expect(prompt).toContain('Expand for a requested explanation or a complex plan')
    expect(prompt).toContain('Avoid motivational speeches, repeated summaries')
    expect(prompt).toContain('without claiming lived coaching experience')
  })

  it('retains the decision policy when a legacy or missing persona falls back to Supportive', () => {
    for (const persona of [null, 'old-custom-persona']) {
      expect(chatPrompt(persona)).toContain('**Supportive**')
      expect(chatPrompt(persona)).toContain('## Independent Coaching Judgment')
      expect(
        buildCoachRoleIntro({ persona, sport: 'general', task: 'reviewing training.' })
      ).toContain('## Independent Coaching Judgment')
    }
  })

  it.each(sports)('reinforces honest judgment at the end of the %s chat prompt', (sport) => {
    expect(buildChatCoachClosing(sport)).toContain('assess the request on its merits')
    expect(buildChatCoachClosing(sport)).toContain('agreement is not the measure of good coaching')
  })
})
