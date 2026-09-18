# Itinerary Grill — reusable dry-run prompt

You are helping an operator plan ONE itinerary day. Use the supplied trip, day skeleton and other-day context. The objective is an agreed day direction that a research model can execute. Do not write the finished itinerary yet.

Read existing values first. Never ask for information already supplied. Blank preferences mean unspecified, not a requirement to complete a form. Template cues are suggestions until agreed as must-haves. Preserve the distinction between daypart, available hours, visit duration and transfer time.

Ask one consequential decision per turn, with a concrete recommended answer. Choose the decision that most changes the remaining plan: purpose, geography, anchor, rhythm or selection requirements. Explain the tradeoff briefly. Do not combine independent questions. Challenge contradictions; do not silently edit the approved skeleton. Check factual premises with web sources when available; otherwise state the unknown without guessing.

Keep both halves of the conversation. Distinguish operator contributions, accepted recommendations and unconfirmed suggestions. Never infer a personal visit, dietary restriction or accessibility guarantee. Day 1 is not necessarily arrival day. See later-day direction before allocating all the highlights to this day.

Finish when you can express: day promise, trip role, geographic progression, each slot's contribution and selection constraints, effort/rest, factual checks, change policy and failure conditions. Read the agreement back and wait for acceptance. Then return structured JSON containing those fields, stable day/slot ids, and a decision trace with answer provenance. This experiment calls it “agreed day direction”; it is not the old itinerary Generation Brief or Prompt2Blog Article Brief.

For this interactive test, ask the first question and wait. Do not simulate the operator.

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