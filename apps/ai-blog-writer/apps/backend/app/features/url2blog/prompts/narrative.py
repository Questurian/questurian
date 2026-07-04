"""URL2Blog narrative-focus presets and auto-selection prompt.

The preset list mirrors NARRATIVE_FOCUS_PRESETS in
apps/frontend/src/features/url2blog/constants/pipeline-ui.constants.ts —
keep the two in sync when editing.
"""

NARRATIVE_FOCUS_PRESETS: list[dict[str, str]] = [
    {"id": id_, "label": label, "prompt": prompt}
    for id_, label, prompt in [
        (
            "news_story",
            "News Story",
            "Write this as a polished travel news article for a new travel/aviation news website. "
            "Prioritize a newsroom-style travel news tone over an SEO blog tone. Start with a clear lead "
            "that explains the main news: who is launching what, where, and when. Use short paragraphs, "
            "natural transitions, and factual language. The article may include helpful structure such as "
            "a headline, short subhead, and optional key takeaways, but avoid robotic SEO-style headings; "
            "use natural section headings only when they improve readability. Do not repeat the same facts "
            "across the article — mention route details clearly once, then use the rest of the article to "
            "explain market context, traveler impact, and competitive changes. Use aviation data as "
            "supporting context, not as the main focus; keep the route launch and traveler relevance at "
            "the center of the story. Keep the tone professional, neutral, and human-edited; avoid "
            "marketing language, filler, exaggerated claims, or phrases that make the article sound "
            "AI-generated. Separate any CMS instructions, editorial blocks, schema notes, or component "
            "metadata from the final article body — the final article body should read cleanly as "
            "publishable travel news.",
        ),
        (
            "news_brief",
            "News Brief",
            "Write a fast, factual update: what happened, when it happened, who is affected, and what changes now.",
        ),
        (
            "traveler_impact",
            "Traveler Impact",
            "Prioritize what readers need to do next, including bookings, routes, documents, timing, refunds, or practical precautions.",
        ),
        (
            "policy_visa_update",
            "Policy / Visa Update",
            "Explain the rule change, effective dates, eligibility, exceptions, official-source context, and next steps for affected travelers.",
        ),
        (
            "airline_airport_update",
            "Airline / Airport Update",
            "Focus on routes, schedules, baggage, loyalty, strikes, delays, airport operations, and passenger impact.",
        ),
        (
            "opening_new_place",
            "Opening / New Place",
            "Cover new restaurants, hotels, attractions, landmarks, museums, resorts, or routes with why it matters, opening timing, and how to visit.",
        ),
        (
            "safety_crime_advisory",
            "Safety / Crime Advisory",
            "Frame risk clearly without sensationalism: where, what happened, who is affected, and practical precautions readers can take.",
        ),
        (
            "destination_change",
            "Destination Change",
            "Explain shifts in a place, such as tourism rules, taxes, closures, weather impacts, protests, transport changes, or local conditions.",
        ),
        (
            "trend_watch",
            "Trend Watch",
            "Connect the story to a broader travel pattern, including pricing, demand, route shifts, traveler behavior, or regulatory movement.",
        ),
        (
            "explainer",
            "Explainer",
            "Make confusing travel changes clear with background, definitions, why the issue matters, and likely consequences.",
        ),
        (
            "service_alert",
            "Service Alert",
            "Keep the piece short and practical for disruptions such as strikes, closures, outages, storms, delays, or advisories.",
        ),
        (
            "local_lens",
            "Local Lens",
            "Use local context and place-aware detail for restaurant, landmark, culture, and destination news without turning it into a generic guide.",
        ),
        (
            "deal_value_angle",
            "Deal / Value Angle",
            "Focus on travel deals, fare sales, points promos, price drops, booking conditions, deadlines, and caveats.",
        ),
        (
            "executive_summary",
            "Executive Summary",
            "Front-load key takeaways and high-impact recommendations for readers with limited time.",
        ),
        (
            "comparison_framework",
            "Comparison Framework",
            "Present options with pros, cons, and decision criteria so readers can choose based on their priorities.",
        ),
        (
            "data_evidence",
            "Data & Evidence",
            "Ground claims with verifiable facts, concrete examples, and explicit reasoning to reduce fluff.",
        ),
        (
            "journalistic_neutral",
            "Journalistic Neutral",
            "Keep tone balanced and credible, separating claims from interpretation while maintaining readability.",
        ),
    ]
]

V2_NARRATIVE_FOCUS_SELECTION_PROMPT = """You are an editorial planner for a travel publication.

Select the single best narrative / audience focus for rewriting the source article below. You must choose exactly one preset from the list — pick the focus that best serves readers of this specific story, not the most generic option.

Preset options (id: label — guidance):
{preset_options}

Source article title:
{title}

Source article content:
{content}

Article type classification:
{article_type}

Return ONLY valid JSON in this exact shape:
{"focus_id": "<one preset id from the list>", "reasoning": "<one sentence explaining why this focus fits the story>"}
"""
