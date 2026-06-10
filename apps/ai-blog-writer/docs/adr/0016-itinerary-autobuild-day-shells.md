# Itinerary Autobuild uses Day Shells as layout source of truth

Itinerary Autobuild treats the operator-selected **Day Shell** as the source of truth for each day's stop count, slot order, rough daypart, and meal/activity/nightlife requirements. The AI may extract creative intent and score candidate records, but it must fill the shell's **Shell Slots** rather than inventing `stops_per_day`, category distribution, or final day structure.

This deliberately prioritizes editorial structure over route optimization: geography may influence candidate choice, but the output order follows the selected shell. Day Shells are an AI Blog Writer planning contract and are not persisted as Questura Payload CMS schema in v1; Payload receives the resulting ordered itinerary rows as it does today.

