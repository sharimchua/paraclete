# OKF (Open Knowledge Format v0.2) Agent Directives

The `okf/` directory holds the canonical, structured knowledge base. Every file represents an entity or concept stored as a Markdown document with YAML frontmatter.

## Subfolder Structure
- `persons/`: Individual client/student/coachee dossiers.
- `groups/`: Cohorts, teams, or groups of persons.
- `personas/`: Canonical **practitioner working modes** — how the practitioner engages a client within a particular framework or domain (e.g. `Midlife Muso` for music coaching, `Respec` for professional/leadership coaching). A persona is always an attribute of the *practitioner*, never of the client.
- `frameworks/`: Practitioner frameworks defining Tone, Phrasing, Formatting, and Principles.
- `sessions/`: Structured session records (with stage: `Prepare`, `Capture`, `Clean`, `Published`, `Archived`).
- `references/`: Intellectual capital (types: `CONCEPT`, `RESOURCE`, `TECHNIQUE`, `PATTERN`, `TEMPLATE`).
- `reflections/`: Meta-reflections on practice dynamics and client growth.
- `topics/`: Thematic developmental tracks (`future`, `active`, `closed`).
- `messages/`: Communication drafts and sent messages.

## Persona Semantics (CRITICAL — read before tagging or synthesizing)

A **persona** is a *practitioner working mode*: a label for **how the practitioner engages** with a client within a particular framework or domain. It describes the practitioner's operating stance, never the client.

- A persona entity (`type: persona`, in `okf/personas/`) is a canonical working mode of the practitioner — e.g. `[[Midlife Muso]]` (music coaching) or `[[Respec]]` (professional/leadership coaching).
- A persona is **never** an attribute, identity, role, or "type" of the client/student/coachee. Do not describe a person *as* a persona.
- A **group** (`okf/groups/`) is a separate dimension — a business, cohort, contract, or revenue grouping (e.g. the `Midlife Muso` and `Respec` businesses, or `Play Music` for clients contracted through). A group may share a name with a persona, but they are different entity types: the persona names *how the practitioner engages*; the group names *which business/cohort/revenue line* the client sits in. Keep the two distinct.

How the `persona` field reads on each entity type:

| Entity | Meaning of `persona` |
| --- | --- |
| `session_note` / `message` | The practitioner working mode under which **this specific** interaction was conducted (how the practitioner engaged for that session/message). |
| `person` | The practitioner working mode used as the **default** when engaging this client overall. Individual sessions/messages may override it. It is a convenience default, not a description of the client. |

Real example: Chandan Kaur's music-coaching sessions are conducted under `[[Midlife Muso]]`; a leadership-coaching session would be conducted under `[[Respec]]`. In both cases the persona names *the practitioner*, not Chandan or any client.

## Schema Specifications

### Person Frontmatter
```yaml
---
type: person
title: string
description: string
contact_method: string | null
avatar_logo: string | null
persona: "[[Persona Title]]" | null   # Default PRACTITIONER working mode for this client (NOT a description of the client)
framework: "[[Framework Title]]" | null
groups:
  - "[[Group Title]]"
sessions:
  - "[[Session Note Slug|Session Note Title]]"
messages:
  - "[[Message Title]]"
tags:
  - client          # CRITICAL: Include 'client' for direct coachees/students; use other tags (e.g. 'team-member', 'stakeholder', 'executive') for secondary contacts
created_at: ISO-8601 string
updated_at: ISO-8601 string
---
```


### Session Note Frontmatter
```yaml
---
type: session_note
title: string
date: "YYYY-MM-DD"
stage: "Prepare" | "Capture" | "Clean" | "Published" | "Archived"
person: "[[Person Title]]" | null
group: "[[Group Title]]" | null
persona: "[[Persona Title]]" | null   # PRACTITIONER working mode for THIS session (how the practitioner engaged)
source_input: string | null
tags:
  - list
created_at: ISO-8601 string
updated_at: ISO-8601 string
---
```

### Message Frontmatter
```yaml
---
type: message
title: string
date: "YYYY-MM-DD"
person: "[[Person Title]]" | null
status: "DRAFT" | "SENT" | "ARCHIVED"
message_type: string | null
persona: "[[Persona Title]]" | null   # PRACTITIONER working mode for THIS message
related_session: "[[Session Title]]" | null
tags:
  - list
source_input: string | null
created_at: ISO-8601 string
updated_at: ISO-8601 string
---
```

### Practise Framework Frontmatter
```yaml
---
type: practise_framework
title: string
is_core: boolean
tags:
  - list
created_at: ISO-8601 string
---
```

### Reference Frontmatter
```yaml
---
type: reference
title: string
reference_type: "CONCEPT" | "RESOURCE" | "TECHNIQUE" | "PATTERN" | "TEMPLATE"
url: string | null
tags:
  - list
created_at: ISO-8601 string
---
```

### Reflection Frontmatter
```yaml
---
type: reflection
title: string
date: "YYYY-MM-DD"
persona: "[[Persona Title]]"
framework: "[[Framework Title]]" | null
reviewed_persons:
  - "[[Person Title]]"
previous_reflection: "[[Reflection Title]]" | null
energy_rating: int | null
tags:
  - reflection
  - supervision
created_at: ISO-8601 string
updated_at: ISO-8601 string
---
```

## Linking & Integrity Rules
- Always use `[[Title]]` wikilinks for entity relationships.
- File names should use kebab-case: `okf/persons/jane-doe.md`.
- Titles in frontmatter should be human-readable capitalized strings matching the primary `# Header 1`.
- **Session & Message Persona Tagging**: Every `session_note` and `message` should be tagged with the **practitioner** `persona` (working mode) under which the interaction was conducted — e.g. `[[Midlife Muso]]` for music coaching, `[[Respec]]` for professional/leadership coaching. The persona names the *practitioner's* engagement stance, never the client's identity or "type". This keeps a client who is engaged across multiple working modes accurately contextualized per interaction.

