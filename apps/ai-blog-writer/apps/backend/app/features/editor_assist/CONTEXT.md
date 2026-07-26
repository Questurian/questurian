# Context: AI Blog Writer / Backend / Editor Assist

Editor Assist owns operator-triggered AI changes to Draft content that do not create or persist a pipeline Run.

## Language

**Editor Assist**:
The umbrella HTTP namespace for AI-assisted Draft editing operations.
_Avoid_: pipeline, run controller

**Editorial Action**:
A focused title or Markdown-block transformation driven by an operator instruction.
_Avoid_: pipeline stage, generic generation

**Itinerary Composition**:
The family that turns current itinerary plan signal into a Traveler Profile brief, Intro, day blurbs, or Selection Reason.
_Avoid_: Itinerary Autobuild, isolated blurb writer

**Listicle Content Generation**:
The batch that applies Critical Fields, Research Profile, Writer Brief, composition, and validation to selected listicle targets.
_Avoid_: Itinerary Composition, article pipeline

**SEO Metadata**:
A schema-shaped patch for the SEO fields explicitly requested by the operator.
_Avoid_: article prose, full SEO document

## Relationships

- **Editor Assist** contains **Editorial Action**, **Itinerary Composition**, **Listicle Content Generation**, and **SEO Metadata** operations.
- **Itinerary Composition** consumes current Draft plan signal and preserves the rules recorded in ADRs 0018–0022.
- **Listicle Content Generation** consumes zero or more Research Profiles and Writer Briefs without owning their vocabulary.
- **SEO Metadata** and **Editorial Action** share writer invocation but do not share composition rules.

## Example dialogue

> **Dev:** "Should this new stop use **Listicle Content Generation**?"
> **Domain expert:** "No. A stop blurb must remain sequence-aware, so it belongs to **Itinerary Composition**."

## Flagged ambiguities

- "editor assist" previously meant both the HTTP namespace and every implementation inside one route file; resolved: **Editor Assist** is the umbrella, while each operation belongs to one named family above.

## Decisions

- HTTP paths remain under `/editor-assist`; internal Module ownership does not change the frontend contract.
- Simple operations use the shared traced graph executor. Their one-step shape is intentional.
- Writer calls enter through `EditorAssistDependencies`; tests provide fake adapters at the same seam.
- The root `routes.py` only aggregates family routers.
