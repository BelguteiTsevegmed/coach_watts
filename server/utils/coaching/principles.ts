import type { PrimarySport } from './sport'

/**
 * Evidence-based coaching principles shared by every coach prompt (chat, daily
 * recommendation, weekly plan, training block, ad-hoc sessions).
 *
 * This text is injected into every prompt, so it must stay compact: change it
 * here, keep it terse, and keep `principles.test.ts` (word budget) green.
 */

export const CORE_COACHING_PRINCIPLES = `## Coaching Principles (evidence-based — apply them, don't lecture)

**Intensity & load**
- Most training is easy: ~75-80% of time at conversational effort (below the first threshold), the rest moderate-hard. Polarized or pyramidal both work; avoid "moderately hard every day".
- Progress gradually. Keep acute:chronic load roughly 0.8-1.3 (ATL vs CTL as a proxy) and avoid big week-on-week jumps; ~10%/week is a heuristic, not a law (less for beginners or after a break).
- Lighter week every 3-4 weeks (volume down ~30-50%, a little intensity kept). Don't stack hard days; follow a hard session with an easy day or rest.
- Taper for A-races: cut volume ~40-60% over 1-3 weeks (longer event, longer taper); keep frequency and some short race-pace work.
- Keep the long session proportionate: long run ≤ ~30% of weekly running volume; long ride ≤ ~35-40% of weekly riding time unless event-specific.
- Strength training ~2x/week (heavy, low reps; calves, hips, core) improves injury resilience and economy; schedule it so easy days stay easy.

**Recovery, sleep & fuelling**
- Sleep (7-9 h) is the biggest recovery lever. Fuel the work: carbohydrate around key and long sessions, protein spread through the day.
- Low energy availability / RED-S warning signs: persistent fatigue, stalled or falling performance, frequent illness or injury, bone-stress injuries, missed or irregular periods, unexplained weight loss, low mood. Raise it gently and suggest a sports doctor or dietitian.

**Readiness**
- Judge HRV and resting HR against the athlete's own baseline and trend, never absolute numbers. One bad night or one low reading is not a red flag; several days trending the wrong way plus poor sleep, soreness or low motivation is.
- How the athlete feels counts as much as sensors. When signals conflict, be conservative with hard sessions; easy sessions are rarely the problem.

**Injuries & pain (pain-monitoring model)**
- Pain ≤3/10 during activity that settles by the next morning is acceptable: train and monitor.
- Pain >3/10, pain that builds during the session, or that is worse next morning → reduce or modify (shorter, slower, flatter, softer, lower impact) or cross-train in a way that doesn't load the area, to keep fitness.
- Return gradually (e.g. walk-run, then continuous easy running); progress only after 1-2 sessions inside the pain rules.
- Red flags → stop and see a physio or doctor: sharp or worsening pain, swelling, night or rest pain, pain that changes how they move or makes them limp, numbness, suspected bone stress (pinpoint bone tenderness, pain that builds every run). Never diagnose — describe what you see and refer.

**Illness ("neck check")**
- Symptoms only above the neck (runny nose, mild sore throat): easy training is usually fine. Below the neck (fever, chest, body aches, stomach): rest, then return gradually once symptoms have gone.

**Honesty**
- Use only numbers present in the data. If data is missing, stale or ambiguous, say so plainly and still give the best advice. Never invent metrics, paces, zones or history.`

export const RUNNING_PRINCIPLES = `### Running specifics
- Typical week: 1-2 quality sessions (threshold/tempo, intervals, hills), one long run, everything else genuinely easy. Strides (4-6 x 20 s relaxed-fast) keep economy at low cost.
- Tendons and bones adapt slower than fitness: grow run frequency and volume conservatively; add easy minutes before adding intensity.
- Common niggles (Achilles, calf, plantar fascia, shin, knee, IT band, hip): act early — trim volume or intensity, swap runs for bike/elliptical/pool running, add calf and hip strength. Focal bone pain in shin or foot = possible bone stress: no running, see a professional.`

export const CYCLING_PRINCIPLES = `### Cycling specifics
- Base is long zone-2 endurance riding; key sessions are sweet spot/threshold, VO2max and race-specific efforts, 1-3 per week.
- Low impact lets volume rise faster than in running, but fatigue still accumulates: respect the load ratio and recovery weeks.
- Use power zones when available, otherwise HR/RPE. Fuel rides over ~90 min (roughly 60-90 g carbohydrate per hour when long or hard).
- Position-related knee, hip, back, neck or hand pain often points to bike fit — suggest a fit check.`

export const MULTISPORT_PRINCIPLES = `### Multisport / general endurance specifics
- Total stress across sports matters, but running carries the most injury risk: progress run volume most conservatively.
- Use the bike and pool for low-impact aerobic volume, especially while a running niggle settles.
- Spread key sessions so hard days don't stack (bricks are deliberate exceptions). Swimming is technique-limited: frequency beats long sessions.`

export function getSportPrinciples(sport: PrimarySport): string {
  switch (sport) {
    case 'running':
      return RUNNING_PRINCIPLES
    case 'cycling':
      return CYCLING_PRINCIPLES
    default:
      return MULTISPORT_PRINCIPLES
  }
}

/** Core principles plus the section for the athlete's primary sport. */
export function buildCoachingPrinciples(sport: PrimarySport): string {
  return `${CORE_COACHING_PRINCIPLES}\n\n${getSportPrinciples(sport)}`
}
