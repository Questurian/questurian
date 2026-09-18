# Research and compose one itinerary day — dry-run v1

Return one complete JSON object matching the JSON Schema below, with no Markdown fences or surrounding explanation. This is a planning and writing experiment, not a booking or publication request. Use web research. No purchases, accounts, reservations or external writes.

## Job
Turn the agreed direction and supplied slots into a coherent, researched Day 1 with real named places and reader-facing prose. Choose the combination as a whole: an excellent venue that breaks the route is a poor selection. Research enough alternatives internally to choose well, but return one selection per slot, not a menu of alternatives. Never pad the day to hide missing evidence.

The setup and simulated agreement are preferences, not evidence of any venue fact. You must research all real-world selections. Do not assume suggested categories, route suitability or current opening are true. Use the agreed direction for refinements to setup; propose rather than silently resolve any remaining contradiction.

## Method and factual boundary
1. Establish a compact geographic sequence, with lunch as the anchor; then find supporting stops that fit it. Validate actual branches and locations. Prefer official place pages for identity, offerings, hours and booking conditions; use map/routing evidence for connections. Use secondary sources when needed and identify them honestly. Read sources; a guessed URL, search snippet or generic homepage is not proof of a detailed claim.
2. Check opening-day compatibility across selected venues. An evergreen article has no chosen weekday: do not invent one. State a supported operating-day condition if relevant. Unknown critical opening compatibility means unresolved, not ready. Do not claim live reservation availability from ordinary posted opening hours.
3. Assign illustrative times and visit allowances. Account for transfers and at least 45 minutes of explicit recovery, within 09:00–21:00. Keep route estimates visibly distinct from sourced times. For estimates, provide a range and basis, not false precision. Keep walking stretches around the agreed target; taxi for longer legs where plausible. Exact hotel unknown: mark initial/final hotel transfers unknown, never invent its location.
4. Every selected place needs sourced identity and at least one sourced reason it fits its slot. Every factual assertion in reader copy, whatToDo, practicalNotes, address and selectionReason must have a corresponding claim, tied to actually read sources. Editorial judgment and proposed durations may be labeled planning choices in editorNotes. No fake first-person visits, invented dishes, atmosphere, views, prices, opening hours or accessibility claims. If including price, use currency and source date. Unknown noncritical details may be omitted.
5. A required slot without enough evidence stays unresolved: null name/address/start/duration, empty reader copy, clear reason, and a proposed tradeoff where helpful. Optional evening may be omitted; keep its row and stable id. Do not create fake venues or ids to satisfy completeness. “ready_for_editor_review” requires all five required slots selected, a supported identity/fit for every selection, a feasible schedule and no critical outstanding check. It never means booked or guaranteed.
6. If browsing is unavailable, use status insufficient_evidence, browsingUsed false, empty sources/claims and unresolved slots. Do not present remembered venues as researched. State missing capabilities in research.limitations.

## Writing
Use the attached canonical Questurian voice and conventions for reader text only; technical fields remain literal. This export embeds those source files for a portable prompt, not a new independent voice definition.
Write a day title, a 70–110-word day introduction, and roughly 60–100 words of reader copy per selected stop. Lengths are guidance; completeness and truth win. Each stop explains what to do and why it belongs at this point. Let progression connect the day without repetitive “next, head to” transitions or invented sensory scenes. Research provenance belongs in claims/sources, not reader prose. Useful real-world caveats belong in practical notes; missing research belongs in editor notes/checks.

## Output invariants
- Exactly six stop rows, in the original slot order, each original slot id exactly once. Preserve categories. All ids in claims and sources must be unique; all references must resolve.
- Transfer endpoints use slot ids or hotel_base; include connections between selected stops and initial/final hotel transfers. Skip omitted/unresolved stops when connecting selected places; flag any resulting incomplete route.
- A selected stop has a real name and located address or meeting point, nonempty reader copy, and supporting claim ids. A route/roaming stop may name a concrete public route or area with a start point; do not invent a business to fill it.
- Schedule selected stops chronologically; include every transfer and rest allowance. End by 21:00; show uncertain hotel boundary in feasibility. Optional finish must be removable without breaking the required day.
- Source URLs must be actual read pages. Use ISO dates for machine fields; null when publication date is unavailable. No invented timestamps or fabricated evidence.
- Feasibility must cover: opening-day compatibility, total time including transfers/rest, walking/effort, meal balance, geographic continuity, unknown hotel boundaries, and overlap with later days. Give source references where a judgment relies on facts.
- Proposed changes are proposals only, never applied changes. Keep tripMemory concise and specific: actual used places, experiences already covered, later-day reservations and consequences for Day 2.
- This JSON is a standalone experimental view model, NOT a Payload document or production import contract. Do not invent database ids, photos, or booking links.

## Starting data
{
  "fixtureNotice": "Synthetic operator setup using the real Light Full Day template; NOT an export of the saved browser draft. No venue facts or real user experiences are asserted.",
  "trip": {
    "titleSeed": "3 days in Lima for a first visit",
    "dayCountInput": "3",
    "baseCity": "Lima, Peru",
    "scope": "city_only",
    "timing": {
      "mode": "evergreen",
      "startDate": "",
      "firstWeekday": ""
    },
    "preferredAreas": [
      "Miraflores",
      "Barranco"
    ],
    "startingBase": "Miraflores; exact hotel unspecified",
    "sharedPreferences": {
      "audience": "Adults visiting Lima for the first time",
      "budgetStyle": "mid_range",
      "budgetNote": "One worthwhile lunch splurge; avoid tasting-menu commitments",
      "pace": "relaxed",
      "transport": [
        "walking",
        "taxi"
      ],
      "transportNote": "Taxi acceptable when it saves energy",
      "walkingTolerance": "short",
      "dietaryNeeds": "",
      "accessNeeds": "",
      "mustInclude": "Local food and time by the coast",
      "avoid": "Clubs and a checklist of rushed sights"
    },
    "getaway": {
      "destination": "",
      "departureDay": null,
      "returnDay": null
    }
  },
  "day": {
    "id": "dry-run-day-1",
    "label": "An easy first full day",
    "sourceTemplateId": "light_full_day",
    "sourceTemplateName": "Light Full Day",
    "sourceTemplateOrigin": "builtin",
    "availableTime": {
      "id": "custom",
      "customStart": "09:00",
      "customEnd": "21:00",
      "endsNextDay": false
    },
    "setupNotes": "Already checked in the previous night. Day 1 is a full usable day, not an airport arrival day.",
    "preparationNotes": "Prefer a day that feels connected; leave energy for tomorrow.",
    "slots": [
      {
        "id": "day1-coffee_light_breakfast",
        "sourceSlotId": "coffee_light_breakfast",
        "kind": "place",
        "label": "Coffee / light breakfast",
        "daypart": "morning",
        "optional": false,
        "purpose": "Start gently with coffee, pastry or a light breakfast.",
        "allowedCategories": [
          "dining"
        ],
        "preferredCategories": [
          "dining"
        ],
        "cues": [
          "coffee",
          "pastry",
          "light breakfast"
        ],
        "exclusions": []
      },
      {
        "id": "day1-scenic_low_effort",
        "sourceSlotId": "scenic_low_effort",
        "kind": "place",
        "label": "Scenic / low-effort activity",
        "daypart": "morning",
        "optional": false,
        "purpose": "Make a memorable visit without demanding exertion; park, waterfront or accessible overlook.",
        "allowedCategories": [
          "attractions"
        ],
        "preferredCategories": [
          "attractions"
        ],
        "cues": [
          "park",
          "waterfront",
          "accessible overlook"
        ],
        "exclusions": [
          "strenuous",
          "all-day commitment"
        ]
      },
      {
        "id": "day1-special_lunch",
        "sourceSlotId": "special_lunch",
        "kind": "place",
        "label": "Special lunch",
        "daypart": "lunch",
        "optional": false,
        "purpose": "Make lunch a highlight through food or setting.",
        "allowedCategories": [
          "dining"
        ],
        "preferredCategories": [
          "dining"
        ],
        "cues": [
          "highlight",
          "setting",
          "lunch"
        ],
        "exclusions": []
      },
      {
        "id": "day1-leisure_exploration",
        "sourceSlotId": "leisure_exploration",
        "kind": "place",
        "label": "Leisure / neighborhood exploration",
        "daypart": "afternoon",
        "optional": false,
        "purpose": "Explore at an unhurried pace; short walks, shops or gardens.",
        "allowedCategories": [
          "attractions"
        ],
        "preferredCategories": [
          "attractions"
        ],
        "cues": [
          "unhurried",
          "short walks",
          "shops",
          "gardens"
        ],
        "exclusions": []
      },
      {
        "id": "day1-dinner",
        "sourceSlotId": "dinner",
        "kind": "place",
        "label": "Dinner",
        "daypart": "dinner",
        "optional": false,
        "purpose": "Choose a comfortable evening meal.",
        "allowedCategories": [
          "dining"
        ],
        "preferredCategories": [
          "dining"
        ],
        "cues": [
          "comfortable",
          "evening meal"
        ],
        "exclusions": []
      },
      {
        "id": "day1-relaxed_evening",
        "sourceSlotId": "relaxed_evening",
        "kind": "place",
        "label": "Relaxed evening",
        "daypart": "evening",
        "optional": true,
        "purpose": "Offer a quiet lounge or social finish that can be skipped.",
        "allowedCategories": [
          "nightlife"
        ],
        "preferredCategories": [
          "nightlife"
        ],
        "cues": [
          "quiet",
          "lounge",
          "social finish"
        ],
        "exclusions": [
          "high energy",
          "club"
        ]
      }
    ]
  },
  "otherDays": [
    {
      "id": "dry-run-day-2",
      "label": "Historic center and a substantial cultural visit",
      "status": "tentative direction; venues unselected"
    },
    {
      "id": "dry-run-day-3",
      "label": "Barranco, art and a later evening",
      "status": "tentative direction; venues unselected"
    }
  ]
}

## Accepted simulated day direction
{
  "contractVersion": "itinerary-day-direction-dry-run-v1",
  "dayId": "dry-run-day-1",
  "provenance": "Simulated agreement for prompt testing, not actual user testimony",
  "promise": "A relaxed Miraflores introduction with distinctly Peruvian lunch as the main event.",
  "tripRole": "First full day; save historic-center culture for Day 2 and Barranco/art/later evening for Day 3.",
  "geography": {
    "requiredArea": "Miraflores",
    "startingPoint": "Miraflores hotel unspecified; first hotel-to-stop transfer cannot be calculated precisely",
    "avoidToday": [
      "Barranco",
      "historic center"
    ]
  },
  "constraints": {
    "timeWindow": "09:00–21:00, illustrative evergreen schedule",
    "walkTargetMinutesPerLeg": 15,
    "walkTargetPolicy": "Planning target, not verified travel time; propose taxi or flag unresolved when unsuitable",
    "avoid": [
      "cliff stairs",
      "beach descent",
      "clubs",
      "tasting-menu commitments",
      "second major meal",
      "repetitive scenic afternoon"
    ],
    "restMinutesMinimum": 45,
    "restPolicy": "Explicit unallocated recovery interval; do not silently add a seventh venue slot",
    "dietaryNeeds": "unspecified; do not infer none",
    "accessNeeds": "unspecified; short walking does not establish wheelchair accessibility"
  },
  "slotDirections": [
    {
      "slotId": "day1-coffee_light_breakfast",
      "role": "gentle opener",
      "mustHave": [
        "Light breakfast or coffee",
        "Fits morning route"
      ],
      "niceToHave": [
        "Bakery"
      ]
    },
    {
      "slotId": "day1-scenic_low_effort",
      "role": "low-effort coastal highlight",
      "mustHave": [
        "Coastal view from above",
        "No beach descent"
      ],
      "niceToHave": [
        "Seating"
      ]
    },
    {
      "slotId": "day1-special_lunch",
      "role": "food anchor",
      "mustHave": [
        "Distinctly Peruvian food",
        "Fits Miraflores route",
        "A la carte or comparably flexible meal"
      ],
      "niceToHave": [
        "Special setting"
      ]
    },
    {
      "slotId": "day1-leisure_exploration",
      "role": "neighborhood contrast",
      "mustHave": [
        "Adds streets, shops or local texture",
        "No second scenic-park repeat"
      ],
      "niceToHave": [
        "Easy to shorten"
      ]
    },
    {
      "slotId": "day1-dinner",
      "role": "lighter recovery meal",
      "mustHave": [
        "Casual and lighter than lunch"
      ],
      "niceToHave": [
        "Near final daytime area"
      ]
    },
    {
      "slotId": "day1-relaxed_evening",
      "role": "optional quiet finish",
      "mustHave": [
        "Conversation-friendly setting",
        "Fits end of route"
      ],
      "niceToHave": [
        "Near dinner"
      ]
    }
  ],
  "changePolicy": {
    "requiredSlots": "Preserve ids, order and categories; if incompatible, return unresolved slot plus proposed change for operator review",
    "optionalEvening": "May be omitted with explicit reason",
    "layoutApproval": "This fixture has no real app approval record; importing or changing a real layout requires the actual app workflow"
  },
  "failsIf": [
    "Day consists of disconnected venues with excessive transfers",
    "Afternoon repeats the morning",
    "Two heavy destination meals dominate",
    "Evergreen timing is presented as guaranteed on every weekday",
    "Factual gaps are disguised as confirmed recommendations"
  ],
  "agreementTrace": [
    {
      "turn": 1,
      "decision": "What should make Day 1 worth following?",
      "recommendation": "An easy coastal introduction, with lunch as the main destination and room to settle into the city.",
      "answer": "Yes, but lunch should feel distinctly Peruvian. The view alone is not enough.",
      "answerOrigin": "simulated_operator",
      "relationship": "operator_modified_recommendation"
    },
    {
      "turn": 2,
      "decision": "How tightly should we keep the day geographically?",
      "recommendation": "Keep Day 1 in Miraflores; reserve the historic center and Barranco for later days.",
      "answer": "Agreed. Do not use Barranco today merely to find a stronger restaurant.",
      "answerOrigin": "simulated_operator",
      "relationship": "operator_modified_recommendation"
    },
    {
      "turn": 3,
      "decision": "How much walking should each stretch ask of the reader?",
      "recommendation": "Aim for walks of about 15 minutes or less, with taxis for longer transfers.",
      "answer": "Use 15 minutes as the target. No cliff stairs or walk down to the beach; a coastal view from above is enough.",
      "answerOrigin": "simulated_operator",
      "relationship": "operator_modified_recommendation"
    },
    {
      "turn": 4,
      "decision": "What should the afternoon add after the coastal visit?",
      "recommendation": "A short exploration of neighborhood streets and shops, with an explicit rest break.",
      "answer": "Yes. Avoid a second scenic park that repeats the morning. Keep the afternoon flexible.",
      "answerOrigin": "simulated_operator",
      "relationship": "operator_modified_recommendation"
    },
    {
      "turn": 5,
      "decision": "What role should dinner play after the main lunch?",
      "recommendation": "A smaller, casual meal, with the quiet evening stop entirely optional.",
      "answer": "Keep that. No second destination meal or tasting menu.",
      "answerOrigin": "simulated_operator",
      "relationship": "operator_modified_recommendation"
    },
    {
      "turn": 6,
      "decision": "If good candidates cannot fit the route, what may change?",
      "recommendation": "Propose a slot change rather than forcing a distant venue into the day.",
      "answer": "Leave required slots unresolved and tell me the exact tradeoff. You can omit the optional evening if nothing fits.",
      "answerOrigin": "simulated_operator",
      "relationship": "operator_modified_recommendation"
    }
  ]
}

## Canonical Questurian voice (source snapshot)
---
id: questurian-voice
label: Questurian Voice
description: What Questurian is like. The only voice; there is no tone layer (ADR 0032).
summary: What a Questurian article is like: adult, unsold, warm through attention, opinionated, never about itself.
default: true
order: 1
---

# The Questurian voice

**It treats you as an adult with a decision to make.** Not a tourist to be
delighted, not a beginner to be managed. It assumes you can take the real
answer, including when the real answer is inconvenient, expensive or dull.

**It isn't selling anything.** Not the destination, not the trip, not itself. It
has no stake in whether you go. That is why it can tell you a place is a
four-hour round trip for a view that is fogged in most mornings.

**Its warmth is attention.** There are no warm words in a Questurian article and
it still reads as generous, because someone went to the trouble of finding out
the thing that actually matters — that one neighbourhood is flat and the other
is built on a slope, and what that does to your walk home with the groceries.
Care is the warmth. Adjectives are not.

**It is interested without being impressed.** Places deserve attention; none of
them are miracles. It never gushes, never performs enthusiasm it doesn't have,
and never tells you somewhere is special instead of showing you why you'd go.

**It would rather tell you the annoying true thing than the pleasant vague one.**
A caveat that costs the reader something is worth more than three sentences of
reassurance.

**It has a view and says it.** It won't rank things for the sake of it, but it
never hides behind even-handedness either. Where there's a call to make, it
makes it and says what the call costs.

**It doesn't make you wait.** No warming up, no scene-setting before the point,
no restating the heading. It respects that you came for something.

**It knows the difference between what it knows and what it's guessing** — and
leaves the second thing out. What it does know, it says plainly and with its
real limits attached: the price as of a month, the route only two operators
run, the hours that change out of season. A limit that would change your
decision is part of the fact, not a hedge on it. What it never does is pad a
claim it cannot stand behind — no "it seems", no "arguably", no asking you to
grade how sure it is.

**It never talks about itself.** Not about its research, not about how it knows
something, not about what it couldn't find out. The reader is here for the
place, not the process.

**It is never generic.** A paragraph that could sit in any publication's article
about any city is not Questurian.


## Canonical writing conventions (source snapshot)
---
id: writing-conventions
label: Writing conventions
description: The mechanical conventions that cannot be inferred from the voice. Not the pipeline's house-rules.md, which is a different document.
summary: The mechanical conventions the voice cannot imply: address, numbers, dates, names, attribution, headings.
default: true
order: 2
---

# Writing conventions

These are conventions, not character. The voice document says what Questurian
is like; this says how it sets things down. Where the two seem to conflict, the
voice wins — nothing here is worth a sentence that reads wrong.

**Address.** "You" is the reader making the decision, and it is the default
address. Never "we" for the publication: state the recommendation instead of
announcing that you are making one.

**Experience.** Never invent a trip, meal, walk, conversation or visit. First
person is available only for material the brief records as first-hand, and only
in the words it records.

**Numbers and dates.** Give a price with its currency and an as-of frame — "COP
38,000 (about USD 9) as of March 2026". Write dates in full. Give opening hours
as sourced, with the day range. Do not round a number the source did not round.

**Names.** Use the local proper name on first mention with an English gloss
where it helps, then the local name alone, transliterated the same way
throughout.

**Attribution.** An unconfirmed detail is cut, never attributed. No "sources
report", no "according to", no "the publication noted". Attribution belongs in
the evidence record and never in the article.

**Headings and structure.** Sentence case, no terminal punctuation, no stacked
gerunds. No one-sentence sections. Lists only for genuinely parallel items,
never to chop up an argument.


## Required output JSON Schema
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "contractVersion",
    "dayId",
    "research",
    "status",
    "title",
    "dayIntro",
    "tripRole",
    "scheduleLabel",
    "stops",
    "transfers",
    "restWindows",
    "sources",
    "claims",
    "feasibility",
    "proposedChanges",
    "tripMemory",
    "editorNotes"
  ],
  "properties": {
    "contractVersion": {
      "const": "itinerary-finished-day-dry-run-v1"
    },
    "dayId": {
      "const": "dry-run-day-1"
    },
    "research": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "performedAt",
        "browsingUsed",
        "limitations"
      ],
      "properties": {
        "performedAt": {
          "type": [
            "string",
            "null"
          ]
        },
        "browsingUsed": {
          "type": "boolean"
        },
        "limitations": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "status": {
      "type": "string",
      "enum": [
        "ready_for_editor_review",
        "needs_decision",
        "insufficient_evidence"
      ]
    },
    "title": {
      "type": "string"
    },
    "dayIntro": {
      "type": "string"
    },
    "tripRole": {
      "type": "string"
    },
    "scheduleLabel": {
      "const": "Illustrative evergreen plan; check opening days before use"
    },
    "stops": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "slotId",
          "status",
          "name",
          "category",
          "addressOrMeetingPoint",
          "area",
          "mapsUrl",
          "suggestedStart",
          "durationMinutes",
          "whyHere",
          "readerCopy",
          "whatToDo",
          "practicalNotes",
          "claimIds",
          "selectionReason",
          "unresolvedReason"
        ],
        "properties": {
          "slotId": {
            "type": "string",
            "enum": [
              "day1-coffee_light_breakfast",
              "day1-scenic_low_effort",
              "day1-special_lunch",
              "day1-leisure_exploration",
              "day1-dinner",
              "day1-relaxed_evening"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "selected",
              "unresolved",
              "omitted_optional"
            ]
          },
          "name": {
            "type": [
              "string",
              "null"
            ]
          },
          "category": {
            "type": "string",
            "enum": [
              "dining",
              "attractions",
              "nightlife"
            ]
          },
          "addressOrMeetingPoint": {
            "type": [
              "string",
              "null"
            ]
          },
          "area": {
            "type": [
              "string",
              "null"
            ]
          },
          "mapsUrl": {
            "type": [
              "string",
              "null"
            ]
          },
          "suggestedStart": {
            "type": [
              "string",
              "null"
            ]
          },
          "durationMinutes": {
            "type": [
              "number",
              "null"
            ],
            "minimum": 0
          },
          "whyHere": {
            "type": "string"
          },
          "readerCopy": {
            "type": "string"
          },
          "whatToDo": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "practicalNotes": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "claimIds": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "selectionReason": {
            "type": "string"
          },
          "unresolvedReason": {
            "type": [
              "string",
              "null"
            ]
          }
        }
      },
      "minItems": 6,
      "maxItems": 6
    },
    "transfers": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "from",
          "to",
          "mode",
          "minutesMin",
          "minutesMax",
          "basis",
          "sourceIds",
          "note"
        ],
        "properties": {
          "from": {
            "type": "string"
          },
          "to": {
            "type": "string"
          },
          "mode": {
            "type": "string",
            "enum": [
              "walk",
              "taxi",
              "unspecified"
            ]
          },
          "minutesMin": {
            "type": [
              "number",
              "null"
            ],
            "minimum": 0
          },
          "minutesMax": {
            "type": [
              "number",
              "null"
            ],
            "minimum": 0
          },
          "basis": {
            "type": "string",
            "enum": [
              "sourced",
              "planning_estimate",
              "unknown"
            ]
          },
          "sourceIds": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "note": {
            "type": "string"
          }
        }
      }
    },
    "restWindows": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "afterSlotId",
          "beforeSlotId",
          "minutes",
          "description"
        ],
        "properties": {
          "afterSlotId": {
            "type": "string"
          },
          "beforeSlotId": {
            "type": "string"
          },
          "minutes": {
            "type": "number",
            "minimum": 45
          },
          "description": {
            "type": "string"
          }
        }
      }
    },
    "sources": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "url",
          "title",
          "publisher",
          "sourceType",
          "accessedAt",
          "publishedOrUpdatedAt"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "url": {
            "type": "string"
          },
          "title": {
            "type": "string"
          },
          "publisher": {
            "type": "string"
          },
          "sourceType": {
            "type": "string",
            "enum": [
              "official",
              "map",
              "secondary"
            ]
          },
          "accessedAt": {
            "type": "string"
          },
          "publishedOrUpdatedAt": {
            "type": [
              "string",
              "null"
            ]
          }
        }
      }
    },
    "claims": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "text",
          "sourceIds",
          "appliesTo"
        ],
        "properties": {
          "id": {
            "type": "string"
          },
          "text": {
            "type": "string"
          },
          "sourceIds": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "appliesTo": {
            "type": "string"
          }
        }
      }
    },
    "feasibility": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "topic",
          "status",
          "detail",
          "sourceIds"
        ],
        "properties": {
          "topic": {
            "type": "string"
          },
          "status": {
            "type": "string",
            "enum": [
              "supported",
              "conditional",
              "unresolved",
              "not_applicable"
            ]
          },
          "detail": {
            "type": "string"
          },
          "sourceIds": {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        }
      }
    },
    "proposedChanges": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "slotId",
          "proposal",
          "reason",
          "requiresAgreement"
        ],
        "properties": {
          "slotId": {
            "type": "string"
          },
          "proposal": {
            "type": "string"
          },
          "reason": {
            "type": "string"
          },
          "requiresAgreement": {
            "const": true
          }
        }
      }
    },
    "tripMemory": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "usedPlaces",
        "coveredExperiences",
        "reservedForLater",
        "nextDayImplications"
      ],
      "properties": {
        "usedPlaces": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "coveredExperiences": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "reservedForLater": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "nextDayImplications": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      }
    },
    "editorNotes": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  }
}
