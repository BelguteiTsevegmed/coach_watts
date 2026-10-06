# Coach Watts athlete journey

This personal fork guides an athlete through one clear daily flow. The interface presents the next useful action first and makes depth available in context.

## Experience

Today → prepare → train → reflect → tomorrow.

Three persistent destinations organize the product:

- **Today:** check in, understand the next session, prepare, and reflect. The primary action changes with the actual day, including rest and unscheduled training.
- **Training:** this week and its plan. Goals, events, workout history, and the library become available while planning or reviewing a session.
- **Progress:** one readable account of recent training, with supporting fitness, consistency, and fueling evidence available on request.

Coach stays available from the header and relevant moments. Search and a secondary tools menu keep every established destination reachable. Discovery never requires an arbitrary wait or locks existing features.

New athletes begin with their purpose and the next required setup step. Consent remains explicit. Connections become useful when importing data can improve the experience; failed imports explain the remedy.

## Visual system

| Role                | Color     |
| ------------------- | --------- |
| Reading surface     | `#FFFFFF` |
| Quiet canvas        | `#F6F9FA` |
| Strong text         | `#183B35` |
| Supporting text     | `#586E72` |
| Primary action      | `#23675E` |
| Meaningful boundary | `#D7E3E4` |

Public Sans carries headings, body, and controls, with sentence case and a 14 / 16 / 20 / 28 / 40px scale. Comparable values use tabular numerals. Long text stays below about 65 characters per line.

The compact header leaves room for an approximately 800px working column, centered in the canvas with left-aligned content. The real session and the day’s changing sequence are the memorable elements. Containment groups an actual form or session; it does not split every paragraph into a card.

```text
Coach Watts     Today   Training   Progress       Coach  Search  Account

                Monday, 5 October
                How are you feeling?
                [ Check in ]

                Today’s session
                Easy endurance ride
                Why this session? [optional detail]

                After your ride
                A short reflection shapes tomorrow.
```

A permanent navigation rail was considered and rejected: three daily destinations do not justify the space it consumes. A decorative river graphic and repeated metric cards were also rejected; the brief’s flow comes from useful state transitions, not imagery.

## Implementation boundaries

Keep stores, API contracts, real-time updates, subscription and role gates, consent, exports, editing, and existing deep links intact. The change is information hierarchy, navigation, presentation, and progressive disclosure.

Completed sessions lead with outcome and reflection. Analysis and technical details remain available through labeled views. Planned sessions lead with purpose and execution; fueling, adjustments, export, and rationale appear at the relevant step.

Planning, nutrition, fitness, chat, settings, libraries, profile, coaching, and secondary routes receive the same hierarchy and restrained typography. Public entry and authentication should lead cleanly into the athlete journey.

## Evidence required

Verify new and returning athletes; pending and failed imports; an unfinished and completed check-in; a planned session; a completed session; multiple sessions; a rest day; no plan; disabled nutrition; and coaching roles. Preserve `/dashboard?focus=checkin` and `/dashboard?focus=wellness`.

Check desktop and narrow mobile screens in both themes, keyboard navigation, visible focus, readable contrast, reduced motion, localized fallback copy, and access to advanced routes. Run relevant unit regressions, typechecking, and a production build. Visual review must use the actual running application.

## Implementation and verification

The shared shell, Today, check-in, onboarding, Training and plan creation, session preparation and reflection, Coach, Progress and Fitness, food journaling, goals, settings, public entry, and authentication now follow this hierarchy. Specialist tools retain their routes through search, context navigation, and the tools menu.

The final behavior suite passed 278 tests across 65 app and shared suites. It covers next-action states, check-in omission and retry, goal and plan returns to Today, weekly navigation, delayed reflection links, nutrition without invented targets, and the chat viewport. Typechecking and the production build passed. Changed-source lint, formatting, translation parsing, and template compilation were also checked.

Browser review used the actual local app at desktop and 390px mobile widths in light and dark themes. Live AI generation and third-party OAuth, payment, publishing, and device export were not exercised; their existing contracts and controls were preserved. The local check-in generation worker was unavailable, so its pending, delayed, answer, and failure states were verified through focused regressions.
