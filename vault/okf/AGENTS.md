# OKF (Open Knowledge Format v0.2) Agent Directives

The `okf/` directory holds the canonical, structured knowledge base. Every file represents an entity or concept stored as a Markdown document with YAML frontmatter.

## Subfolder Structure
- `persons/`: Individual client/student/coachee dossiers.
- `groups/`: Cohorts, teams, or groups of persons.
- `personas/`: Practitioner working modes/personas (e.g. `Executive Coach`, `Technical Mentor`).
- `frameworks/`: Practitioner frameworks defining Tone, Phrasing, Formatting, and Principles.
- `sessions/`: Structured session records (with stage: `Prepare`, `Capture`, `Clean`, `Published`, `Archived`).
- `references/`: Intellectual capital (types: `CONCEPT`, `RESOURCE`, `TECHNIQUE`, `PATTERN`, `TEMPLATE`).
- `reflections/`: Meta-reflections on practice dynamics and client growth.
- `topics/`: Thematic developmental tracks (`future`, `active`, `closed`).
- `messages/`: Communication drafts and sent messages.

## Schema Specifications

### Person Frontmatter
```yaml
---
type: person
title: string
description: string
contact_method: string | null
avatar_logo: string | null
persona: "[[Persona Title]]" | null
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
persona: "[[Persona Title]]" | null
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
persona: "[[Persona Title]]" | null
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
- **Session & Message Persona Tagging**: Every `session_note` and `message` should be tagged with the `persona` under which the interaction was conducted (e.g. `[[Executive Coach]]` for leadership/organizational coaching, `[[Technical Mentor]]` for technical advising). This allows clients who engage across multiple practices to have their sessions and communications accurately contextualized.

