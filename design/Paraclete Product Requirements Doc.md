# PARACLETE

## Product Requirements Document

|              |                                    |
| ------------ | ---------------------------------- | --- |
| **Version**  | v0.3 — Reference Mapping & Tagging |
| **Date**     | April 2026                         |
| **Author**   | Sharim                             | ()  |
| **Status**   | Draft — For Iteration              |
| **Platform** | Web Application (React / PWA)      |

---

> _Paraclete is a personal practice OS for 1-1 service providers — coaches, tutors, consultants, and teachers. Named after the Greek parakletos (one called alongside to help), it is built on a single conviction: AI should augment human relationships, not replace them._

---

## Table of Contents

1. [Overview](https://claude.ai/chat/86f48120-62e8-42cb-ae42-634d3d81d5d6#1-overview)
2. [Core Entities](https://claude.ai/chat/86f48120-62e8-42cb-ae42-634d3d81d5d6#2-core-entities)
3. [The Note Lifecycle](https://claude.ai/chat/86f48120-62e8-42cb-ae42-634d3d81d5d6#3-the-note-lifecycle)
4. [Note Structure](https://claude.ai/chat/86f48120-62e8-42cb-ae42-634d3d81d5d6#4-note-structure)
5. [References](https://claude.ai/chat/86f48120-62e8-42cb-ae42-634d3d81d5d6#5-references)
6. [Messages](https://claude.ai/chat/86f48120-62e8-42cb-ae42-634d3d81d5d6#6-messages)
7. [Filtering & Search](https://claude.ai/chat/86f48120-62e8-42cb-ae42-634d3d81d5d6#7-filtering--search)
8. [Dashboards](https://claude.ai/chat/86f48120-62e8-42cb-ae42-634d3d81d5d6#8-dashboards)
9. [Capture Tools](https://claude.ai/chat/86f48120-62e8-42cb-ae42-634d3d81d5d6#9-capture-tools)
10. [MVP Scope](https://claude.ai/chat/86f48120-62e8-42cb-ae42-634d3d81d5d6#10-mvp-scope)
11. [Technical Considerations](https://claude.ai/chat/86f48120-62e8-42cb-ae42-634d3d81d5d6#11-technical-considerations)
12. [Resolved Design Decisions](https://claude.ai/chat/86f48120-62e8-42cb-ae42-634d3d81d5d6#12-resolved-design-decisions)
13. [Success Metrics](https://claude.ai/chat/86f48120-62e8-42cb-ae42-634d3d81d5d6#13-success-metrics)
14. [Admin Screen](https://claude.ai/chat/86f48120-62e8-42cb-ae42-634d3d81d5d6#14-admin-screen)

---

## 1. Overview

### 1.1 Problem Statement

Practitioners who provide 1-1 services — coaching, music teaching, consulting, tutoring — rely on deep knowledge of individual clients accumulated over time. Today this knowledge is scattered across note-taking apps, spreadsheets, dictation tools, AI assistants, and email clients, with the practitioner acting as the manual plumbing between each. The cost is threefold:

- Time lost to copying, formatting, and context-switching between tools
- Insight lost because patterns across people and sessions are invisible
- Quality lost because messages and session prep are disconnected from accumulated knowledge

### 1.2 Vision

Paraclete is a single, coherent workspace where the entire practitioner workflow — prepare, capture, clean, store, communicate — happens without leaving the app. The AI layer handles the administrative and synthesising work so the practitioner can focus entirely on the human in front of them.

### 1.3 Core Philosophy

> _"The Paraclete stands beside, not in front. Every AI feature in this product should make the practitioner more present with their client, not less."_

- Human relationships are the product. The app is the infrastructure.
- Notes are the source of truth. Everything else — references, messages, dashboards — derives from notes.
- The practitioner's voice is preserved. AI drafts; the practitioner approves and sends.
- Accumulated knowledge compounds. Each session makes the next one better.

### 1.4 Target Users

Primary persona: an independent practitioner providing a 1-1 knowledge or skills service to a recurring client base. Examples:

- Music coaches and instrument teachers
- Executive and life coaches
- Tutors and academic mentors
- Therapists and counsellors _(note: not a clinical records system)_
- Personal trainers and nutritionists
- Language teachers

The practitioner typically manages between 5 and 50 active clients, sessions are recurring (weekly or fortnightly), and the relationship and context from previous sessions is central to the value they provide.

---

## 2. Core Entities

Paraclete is organised around two first-class entities. All other data — notes, references, messages — attaches to one of these.

### 2.1 Person

A Person represents an individual client, student, or coachee. Each Person record contains:

- Basic profile: name, preferred contact method, tags/labels
- Session history: all Notes attached to this Person, in reverse chronological order
- Reference library: all References created from or linked to this Person's notes
- Message history: all Messages sent to or regarding this Person
- Custom fields: domain-specific attributes defined by the practitioner in the Admin screen (see Section 14), supporting categorical and numerical types (e.g. Instrument: Guitar, Grade: 1–8)

### 2.2 Group

A Group represents a cohort, class, ensemble, or workshop — any context where multiple People are worked with together. Groups allow:

- Notes created at the group level (e.g. a workshop session)
- Individual People to be tagged as members of a Group
- Group-level notes to optionally link observations to individual members
- References created at the group level, shareable across member Persons

### 2.3 Entity Capabilities

| Entity | Has Notes | Has References | Has Messages        | Has Members |
| ------ | --------- | -------------- | ------------------- | ----------- |
| Person | ✓         | ✓              | ✓                   | —           |
| Group  | ✓         | ✓              | — (individual only) | ✓ (Persons) |

---

## 3. The Note Lifecycle

The Note is the central unit of work in Paraclete. Every Note passes through up to five stages, and the product actively assists at each transition.

```
Prepare → Capture → Clean → Publish → Archive
```

### 3.1 Stage 1 — Prepare

Before a session, the practitioner opens the Person record and initiates a new Note in Prepare mode. Paraclete surfaces:

- A summary of the most recent Note(s) for this Person
- Any open action items or commitments from prior sessions
- Relevant References linked to this Person
- An AI-generated session brief: key themes to revisit, suggested focus areas

The practitioner can annotate the brief with their own intentions before the session begins.

### 3.2 Stage 2 — Capture

During the session, the practitioner uses one of three capture modes:

- **Typed scratchpad** — full-screen, distraction-free text input
- **Dictation** — browser-native or Whisper-powered speech-to-text, producing a running transcript
- **OCR** — upload a photo of handwritten notes; Paraclete extracts and stores the text

Raw capture is intentionally low-friction. No formatting required. The clean-up happens in Stage 3.

### 3.3 Stage 3 — Clean

After the session, the practitioner triggers Clean. Paraclete's AI:

- Structures the raw capture into a readable note
- Identifies key topics, decisions, and themes
- Flags potential action items and commitments
- Suggests References to create or link

The practitioner reviews and edits the cleaned note before publishing. This step preserves practitioner voice and judgment — the AI proposes, the practitioner decides.

### 3.4 Stage 4 — Publish

Publishing saves the Note to the Person's record and makes it available as context for future sessions. On publish, Paraclete prompts:

- Create or link References (see Section 5)
- Draft a Message (see Section 6)
- Log any actions or next-session intentions

### 3.5 Stage 5 — Archive

Notes are never deleted — they are archived. Archived notes remain searchable and available as AI context but are removed from the active timeline view. The practitioner can archive manually or set an automatic archival policy (e.g. after 12 months).

---

## 4. Note Structure

A published Note contains the following fields:

| Field          | Type                      | Description                                           |
| -------------- | ------------------------- | ----------------------------------------------------- |
| Title          | Auto-generated / editable | AI-generated summary title; practitioner can override |
| Date           | Date                      | Session date (defaults to today)                      |
| Person / Group | Relation                  | The entity this note is attached to                   |
| Stage          | Enum                      | Prepare / Capture / Clean / Published / Archived      |
| Raw capture    | Text                      | Unedited dictation, OCR output, or scratchpad         |
| Cleaned note   | Rich text                 | Structured, AI-cleaned version of the capture         |
| Topics / Tags  | Multi-select              | Practitioner-defined or AI-suggested themes           |
| Actions        | List                      | Commitments or next-steps flagged in the session      |
| References     | Relations                 | References created from or linked to this Note        |
| Message        | Relation                  | The outbound Message drafted from this Note           |

---

## 5. References

### 5.1 What is a Reference?

A Reference is a reusable piece of knowledge extracted from the practitioner's work. It may be:

- A concept or framework introduced in a session (e.g. "The Musician's Flywheel")
- A resource recommended to a client (e.g. a book, exercise, tool)
- A technique or intervention that proved effective
- A pattern observed across multiple clients
- A template for a type of session or communication

References are the practitioner's accumulating knowledge asset. Over time, they represent the intellectual capital of the practice — what you've learned, what works, and for whom.

### 5.2 Reference Structure

| Field        | Description                                                                 |
| ------------ | --------------------------------------------------------------------------- |
| Title        | Name of the concept or resource                                             |
| Type         | Concept / Resource / Technique / Pattern / Template                         |
| Body         | Description, notes, or content of the reference                             |
| Source Note  | The note it was first created from (if applicable)                          |
| Linked Notes | All notes where this reference has been used or cited                       |
| Tags         | Themes or domains — the primary vocabulary for relevance matching (see 5.3) |

References are internal to the practitioner's workspace. There is no shareable link or client-facing access. A future content publishing workflow (e.g. converting a Reference into an article or social post) is noted as a later-stage feature but is out of scope for now.

### 5.3 Tagging

Tags are the shared vocabulary that connects References to People, Groups, and Notes. They should be treated as a first-class concept across the system — not just labels for filing, but the mechanism through which relevance is inferred and surfaces.

A Reference tagged "ear training" will be considered relevant to a Person whose notes frequently mention ear training, or who has a custom field or tag on their profile that matches. The tag vocabulary is shared across the workspace and managed in the Admin screen (see Section 14.5).

Design principles for tagging:

- Tags are practitioner-defined and workspace-scoped — the same tag means the same thing across all entities
- People and Groups can also carry tags (independent of their notes) representing standing characteristics, e.g. "beginner", "leadership", "jazz"
- The system uses tag overlap as one of the primary signals for inferring Reference–Person relevance (see 5.5)
- Tags should be kept broad enough to be reusable but specific enough to be meaningful — the Admin screen will surface tags that are only used once as candidates for consolidation

### 5.4 How References are Created

- **Manually** — practitioner creates a Reference at any time
- **From a Note** — AI suggests potential References during the Clean or Publish stage
- **From a Message** — a concept elaborated in a message can be saved back as a Reference

### 5.5 Person & Group Mapping

Beyond note-level linking, References can be mapped directly to People and Groups. This mapping has a distinct meaning from a note link:

| Link type      | Meaning                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------ |
| Note link      | "I used or discussed this Reference in this session"                                       |
| Direct mapping | "This Reference is relevant to this person" — prospective, observational, or retrospective |

Direct mappings can be established in two ways:

- **Manual mapping** — the practitioner explicitly maps a Reference to a Person or Group from either the Reference detail view or the Person/Group profile
- **Inferred mapping** — the system analyses a Person's note history, topics, tags, and custom fields and surfaces References that appear relevant, ranked by signal strength

Inferred mappings are **surfaced as suggestions only**. The practitioner accepts or dismisses each suggestion; accepted suggestions become confirmed mappings, dismissed suggestions are not shown again unless the practitioner requests them. The system does not apply mappings automatically.

For Groups, the same suggestion mechanism applies at the group level. A Reference mapped to a Group will additionally suggest itself for individual members — but again as a suggestion, not an automatic mapping. The practitioner decides whether a group-level relevance carries through to each individual.

### 5.6 Inference Signals

The system uses the following signals to rank inferred Reference suggestions, in rough priority order:

- **Tag overlap** — shared tags between Reference and Person/Group profile or note topics
- **Co-occurrence in notes** — the Reference has appeared in sessions with People who share characteristics with this Person
- **Custom field matching** — e.g. a Reference tagged "Grade 5" is more relevant to a Person with Grade: 5 on their profile
- **Explicit note topics** — recurring themes in a Person's note history that align with Reference tags
- **Recency** — recently created or recently used References are weighted slightly higher

Relevance scores are used internally to rank suggestions but are not exposed to the practitioner. Suggestions are presented as an ordered list: most relevant first.

### 5.7 How References are Used

- **Surfaced during Prepare** — confirmed mappings and top inferred suggestions shown before a session
- **Linked in Notes** — practitioner or AI links a Reference to a Note during Clean
- **Injected into Messages** — when drafting, AI can draw on References mapped to this Person
- **Browsed in the Reference Library** — a searchable, filterable library view of all References
- **Managed on Person/Group profiles** — confirmed mappings visible on each profile, with pending suggestions accessible via a "Suggestions" tab

---

## 6. Messages

### 6.1 Purpose

A Message is an outbound communication drafted by Paraclete's AI and sent (or copied) by the practitioner to a client after a session. It replaces the manual work of summarising a session and writing a personalised follow-up from scratch.

### 6.2 Message Context

When drafting a Message, the AI draws on:

- The cleaned Note from the current session
- Previous Notes for this Person (configurable window: last 1, 3, or 5 sessions)
- References linked to this Person or this Note
- The practitioner's voice profile — inferred from the history of sent messages and refined through practitioner edits and feedback (see Section 6.5)
- The Person's profile (name, goals, custom fields)

### 6.3 Message Structure

A drafted Message includes:

- **Opening** — personalised greeting and session acknowledgement
- **Summary** — key themes and insights from the session
- **Actions** — what the client committed to before the next session
- **Resources** — any References flagged as shareable, included as links or inline content
- **Close** — warm, practitioner-voiced sign-off

The practitioner reviews and edits the draft before sending. Paraclete does not send autonomously.

### 6.4 Message Delivery

- **Copy to clipboard** — paste into any email or messaging client
- **Email integration** _(v2)_ — send directly from Paraclete via connected email account
- **Message history** — all sent (or copied) messages are stored against the Person record

### 6.5 Practitioner Voice Profile

Paraclete learns the practitioner's tone and style rather than requiring it to be explicitly defined. The voice profile is built and refined over time through two mechanisms:

- **Inference from sent messages** — each message marked as sent contributes to an evolving style model: sentence length, formality, characteristic phrases, sign-off conventions
- **Edit feedback** — when the practitioner edits an AI draft before sending, the delta between draft and final is treated as a style signal; the model adjusts accordingly

On first use, the practitioner can jumpstart the voice profile by importing existing messages (plain text or email export). These are stored as reference examples and used to seed the style model before any new messages are generated.

The voice profile is visible and editable in the Admin screen (see Section 14) as a plain-language style summary (e.g. _"Warm and conversational. Uses first names. Avoids jargon. Signs off with 'Warmly'."_) which the practitioner can manually correct at any time.

---

## 7. Filtering & Search

### 7.1 Note Filtering

The practitioner can filter Notes across all People and Groups by:

- Person or Group
- Date range
- Topics / Tags
- Stage (Published, Archived, etc.)
- Linked References
- Has open actions

### 7.2 Reference Library

The Reference Library is a dedicated view showing all References across the practice. Filterable by:

- Type (Concept, Resource, Technique, Pattern, Template)
- Tags / domains
- Linked People
- Date created

### 7.3 Full-Text Search

Global search across all Notes, References, and Messages. Results grouped by entity type and ranked by recency.

### 7.4 AI Query _(v2)_

Natural language queries against the practitioner's knowledge base. Examples:

- _"What have I covered with Jonas on fingerstyle technique?"_
- _"Which clients have I introduced the Musician's Flywheel to?"_
- _"What exercises have I assigned in the last month?"_

---

## 8. Dashboards

### 8.1 Calendar View

A monthly or weekly calendar showing all sessions (Notes) across all People and Groups. Clicking a session opens the Note. Upcoming sessions (from integrations or manual entry) shown in a distinct colour.

### 8.2 Practice Overview

Top-level metrics across the whole practice:

- Active clients (People with a Note in the last 30/60/90 days)
- Sessions this month vs. last month
- Messages sent
- References created
- Most-used topics / tags (tag cloud or bar chart)

### 8.3 Person Dashboard

Per-Person metrics on the Person profile:

- Session frequency over time (line chart)
- Topics covered (tag distribution)
- References used with this person
- Message history summary
- Open actions count

### 8.4 Engagement Heatmap _(v2)_

A GitHub-style contribution heatmap showing session activity across the year — useful for identifying gaps in engagement and seasonal patterns.

---

## 9. Capture Tools

### 9.1 Typed Scratchpad

A full-screen, distraction-free text editor activated during the Capture stage. No formatting controls. Autosaves every 30 seconds.

### 9.2 Dictation

Speech-to-text integrated directly in the Capture stage. Implementation options:

- **Browser Web Speech API** — zero cost, works offline, lower accuracy
- **Whisper API** — higher accuracy, requires internet, small cost per session

The practitioner can dictate during or immediately after a session. The transcript is treated as raw capture and passed to the Clean stage.

### 9.3 OCR

The practitioner uploads a photo of handwritten notes. Paraclete uses a vision model to extract text and store it as raw capture. Particularly valuable for practitioners who prefer to handwrite during sessions.

### 9.4 Quick Capture _(v2)_

A minimal mobile interface — tap to open, speak or type, tap to save. Designed for capturing observations between sessions (e.g. a thought before next week's call). Saves as a draft Note against a Person.

---

## 10. MVP Scope

The MVP is scoped to validate the core workflow loop: **prepare → capture → clean → message**. Everything else builds on this foundation.

| Feature                               | MVP | v2  | Later |
| ------------------------------------- | --- | --- | ----- |
| Person entity + profile               | ✓   |     |       |
| Custom person fields (admin-defined)  | ✓   |     |       |
| Note lifecycle (all 5 stages)         | ✓   |     |       |
| Typed scratchpad capture              | ✓   |     |       |
| OCR capture                           | ✓   |     |       |
| Dictation capture                     | ✓   |     |       |
| AI note cleaning                      | ✓   |     |       |
| Message drafting                      | ✓   |     |       |
| Practitioner voice profile (learned)  | ✓   |     |       |
| Message import (voice profile seed)   | ✓   |     |       |
| References (create & link)            | ✓   |     |       |
| Reference library                     | ✓   |     |       |
| Note filtering & search               | ✓   |     |       |
| Multi-user tenancy                    | ✓   |     |       |
| Admin screen                          | ✓   |     |       |
| Group entity                          |     | ✓   |       |
| Calendar view                         |     | ✓   |       |
| Practice overview dashboard           |     | ✓   |       |
| Email send integration                |     | ✓   |       |
| Scheduling / booking                  |     | ✓   |       |
| AI natural language query             |     |     | ✓     |
| Mobile quick capture                  |     |     | ✓     |
| Engagement heatmap                    |     |     | ✓     |
| Content publishing (articles, social) |     |     | ✓     |

---

## 11. Technical Considerations

### 11.1 Recommended Stack

| Layer        | Technology                               |
| ------------ | ---------------------------------------- |
| Frontend     | React 18 + TypeScript                    |
| Styling      | Tailwind CSS                             |
| State        | Zustand                                  |
| Database     | Supabase (Postgres + Auth)               |
| AI / LLM     | Claude Sonnet via Anthropic API          |
| OCR          | Claude Vision (image → text)             |
| Dictation    | Web Speech API (MVP); Whisper API (v2)   |
| Hosting      | Vercel                                   |
| File storage | Supabase Storage (for OCR image uploads) |

### 11.2 Data Model Overview

Core tables:

- `tenants` — organisation/workspace record; all other data is scoped to a tenant
- `users` — practitioner accounts, linked to a tenant
- `persons` — profile, custom field values, tenant_id
- `person_tags` — tags applied directly to a Person (independent of note topics)
- `person_field_definitions` — admin-defined custom field schema (name, type, options)
- `groups` — name, description, member links, tenant_id
- `group_tags` — tags applied directly to a Group
- `notes` — stage, raw_capture, cleaned_text, date, person_id / group_id
- `note_topics` — tags/topics extracted or assigned per note
- `references` — type, body, tags, tenant_id
- `reference_tags` — tags on a Reference (normalised join to shared tag vocabulary)
- `note_references` — junction: note ↔ reference (note-level link)
- `person_references` — junction: person ↔ reference; includes `mapping_type` (manual / inferred), `status` (confirmed / suggested / dismissed)
- `group_references` — junction: group ↔ reference; same `mapping_type` and `status` fields
- `tags` — workspace-scoped tag vocabulary (name, tenant_id)
- `messages` — draft, sent_at, note_id, person_id
- `message_imports` — historical messages imported to seed voice profile
- `voice_profile` — per-user style summary and example store
- `actions` — text, resolved, note_id, person_id

### 11.3 AI Integration Points

| Feature                            | Prompt type                             | Model                      |
| ---------------------------------- | --------------------------------------- | -------------------------- |
| Session brief (Prepare)            | Retrieval + synthesis                   | Claude Sonnet              |
| Note cleaning (Clean)              | Transformation                          | Claude Sonnet              |
| Reference suggestions              | Extraction                              | Claude Sonnet              |
| Reference–Person mapping inference | Signal analysis + ranking               | Claude Sonnet              |
| Message drafting                   | Generation with context + voice profile | Claude Sonnet              |
| Voice profile inference            | Style analysis from message history     | Claude Sonnet              |
| OCR                                | Vision + transcription                  | Claude Sonnet (vision)     |
| AI query (v2)                      | RAG over notes                          | Claude Sonnet + embeddings |

### 11.4 Privacy & Data

Client data is sensitive. Key considerations:

- All data is stored per-user; no data is shared between practitioners
- AI prompts are constructed server-side; raw client notes do not persist in AI provider logs where avoidable
- Practitioner can export all data (JSON / CSV) at any time
- Practitioner can delete a Person record and all associated data

---

## 12. Resolved Design Decisions

The following questions were raised during initial drafting and have been resolved.

| #   | Question                                        | Decision                                                                                                                                                                        |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Scheduling / booking feature?                   | Out of MVP scope. Noted as a v2 candidate; the calendar view will support manual session entry in the interim.                                                                  |
| 2   | Practitioner voice model — explicit or learned? | Learned from sent message history, refined through edit feedback. Practitioner can import existing messages to seed the profile. Editable as a plain-language summary in Admin. |
| 3   | Domain-specific Person fields — how managed?    | Practitioner-defined via Admin screen. Supports categorical (e.g. Instrument: Guitar) and numerical (e.g. Grade: 1–8) field types.                                              |
| 4   | References — shareable with clients?            | Internal only for now. A content publishing workflow (Reference → article / social post) is a future feature, not current scope.                                                |
| 5   | B2B / multi-user?                               | Multi-user tenancy built in from the start. Each workspace is a tenant; multiple practitioners can share a workspace. B2B product packaging to be considered later.             |
| 6   | Invoicing / payment tracking?                   | Out of scope. Paraclete is a knowledge and relationship tool, not a practice management suite.                                                                                  |

---

## 13. Success Metrics

For MVP validation:

- **Time to Message** — session end to Message sent; target under 10 minutes
- **Cleaning satisfaction** — practitioner rates AI cleaning quality per note
- **References created** — per practitioner per month; indicator of knowledge accumulation
- **DAU/WAU ratio** — are practitioners returning between sessions (prep behaviour)?
- **Session-to-message rate** — what % of sessions result in a sent message?

---

## 14. Admin Screen

The Admin screen is the practitioner's configuration layer. It is separate from the main workflow and accessed via settings. It contains:

### 14.1 Person Field Definitions

A schema builder for custom fields that appear on every Person profile. The practitioner can:

- Add a field with a name, type (Text / Number / Categorical), and optional constraints
- For Categorical fields: define the allowed values (e.g. Instrument: Guitar, Piano, Voice, Bass)
- For Number fields: define a range (e.g. Grade: 1–8)
- Reorder, edit, or delete fields (deletion hides the field but preserves historical data)

Example fields for a music coaching practice:

| Field name      | Type        | Values / Range                    |
| --------------- | ----------- | --------------------------------- |
| Instrument      | Categorical | Guitar, Piano, Voice, Bass, Drums |
| Grade           | Number      | 1–8                               |
| Exam board      | Categorical | AMEB, ABRSM, Trinity              |
| Lesson duration | Number      | 30, 45, 60 (minutes)              |

### 14.2 Voice Profile

Displays the current practitioner voice summary inferred from message history. The practitioner can:

- View the auto-generated style summary
- Edit the summary directly to correct or refine it
- Import historical messages (plain text paste or file upload) to seed or augment the profile
- Reset the profile to start fresh

### 14.3 Workspace & Users _(multi-tenancy)_

- Invite additional practitioners to the workspace
- Assign roles: Admin (full access) or Practitioner (own People and Notes only)
- Shared resources: References and custom field definitions are shared across the workspace; Notes and Messages are scoped to the individual practitioner by default

### 14.5 Tag Management

The workspace tag vocabulary is shared across all entities — References, People, Groups, and Notes. The Admin screen provides a tag management view where the practitioner can:

- Browse all tags in use across the workspace with usage counts per entity type
- Rename a tag (propagates across all uses)
- Merge two tags into one (e.g. "ear-training" and "ear training" → "ear training")
- Delete a tag (removes it from all entities; prompts confirmation)
- Review tags used only once, surfaced as candidates for consolidation or removal

Keeping the tag vocabulary clean and consistent is what makes the inference engine useful — a fragmented tag set produces noisy suggestions.

### 14.4 Data Management

- Export all data as JSON or CSV
- Delete a Person record and all associated data
- Account deletion

---

_Paraclete PRD v0.3 — Draft for iteration. All sections subject to change._
