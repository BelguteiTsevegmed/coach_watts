# Athlete-first redesign

## Who it is for

A **self-coached endurance athlete** (running first, cycling/triathlon equally welcome) who wants one coach — think Runna, but with the athlete's real data. They open the app to answer three questions:

1. **What should I do today, and why?**
2. **How is my training going?** (am I getting fitter, am I on track for my goal)
3. **Is anything wrong?** (fatigue, sleep, a niggle or injury) — and does the plan respect it?

Everything in the primary experience serves one of these. Everything else is secondary (reachable, not in the way) or admin/developer tooling (hidden from athletes).

## The coach

- **One coach, one voice.** Sport-aware (talks like a running coach to a runner), evidence-based, honest about uncertainty. No cycling slang to runners.
- **Knows the science.** Intensity distribution (mostly easy, ~80/20 or pyramidal), progressive overload with conservative load increases, recovery weeks every 3–4 weeks, tapering, strength work for injury resilience, sleep and fuelling. Shared principles live in one module and feed chat, daily recommendations and plan generation.
- **Knows your body.** Injuries and niggles are first-class: body area, side, pain 0–10, status (active → recovering → resolved). The coach reads them every time it advises, adapts sessions (pain-monitoring model: ≤3/10 during, settles by next morning), and refers to a professional for red flags. It never diagnoses.
- **Knows your progress.** Fitness/fatigue/form trend, recent consistency, goal countdown.
- **Never contradicts the data on screen.** Structured numbers (duration, load, distance) come from the plan; AI text explains, it does not restate different numbers.

## Information architecture

Primary navigation (desktop sidebar and mobile bottom bar):

| Item         | Route          | Purpose                                                                  |
| ------------ | -------------- | ------------------------------------------------------------------------ |
| **Today**    | `/dashboard`   | Today's session + why, readiness, body status, this week, goal countdown |
| **Calendar** | `/activities`  | Planned and completed sessions over time                                 |
| **Progress** | `/performance` | Fitness trends, goals, records, reports                                  |
| **Coach**    | `/chat`        | Talk to the coach; it can change the plan                                |

Secondary ("More"): Workout history, Goals & events, Injuries, Library, Nutrition (when enabled), Recovery/fitness detail, Reports.

Account menu: Profile, Training zones/sports, Connected apps, AI coach settings, Billing, Help, Admin (admins only). Developer settings and Danger zone live inside Settings, not the main nav.

## Rules for every screen

- One primary action per screen. Everything else is secondary or in an overflow menu.
- Every number has a plain-language label and unit (e.g. "Form −8 · slightly fatigued", not "TSB −8").
- Power-only metrics (FTP, W/kg) are hidden for athletes without power data.
- Engineering diagnostics (fact payloads, guardrails, prompt facts, debug views) are admin-only.
- Empty states tell the athlete what to do next.
- Nothing is deleted outright: old routes keep working or redirect.
