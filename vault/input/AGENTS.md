# Input Folder Agent Directives

The `input/` directory contains raw, uncurated practitioner notes, session audio transcripts, dictations, and scratch files.

## Guidelines for Agents
1. **Read-Only During Processing Runs**: NEVER modify or delete an existing file in `input/` while the engine is extracting (`paraclete process`). The only sanctioned ways to create new files under `input/` are (a) the explicit `paraclete reflect` generator command writing to `input/reflections/`, and (b) the agent-assisted session intake step described below — both performed *outside* a processing run.
2. **Entity Discovery**:
   - Extract dates from filenames (`YYYY-MM-DD-*.md`) or document headers.
   - Map speaker mentions and names to existing files in `okf/persons/` or `okf/groups/`.
   - Identify action items (`TODO:`, `- [ ]`, `Action:`) and map them into the resulting `okf/sessions/` note.
   - Detect references to concepts, models, techniques, or external URLs for creation/linking in `okf/references/`.
   - For completed questionnaires in `input/reflections/`, synthesize domain-specific supervisory insights and extract canonical entities into `okf/reflections/`.
3. **Idempotency**:
   - The engine uses SHA-256 hashes to track processed files. If a file has not changed, do not re-process it.

## Agent-Assisted Session Intake (Pre-Processing Step)

On **explicit user request** (e.g., the user dictates or describes a coaching session), an agent may create a new raw session note in `input/sessions/` as a distinct, pre-processing intake step. This is separate from — and must never run inside — a `paraclete process` run.

Guardrails:
- **Create-only**: Only add a new file. Never modify or delete an existing input file. If the target filename already exists, stop and ask rather than overwriting.
- **Explicit request only**: Do this only when the user asks you to capture/draft the session note. Never auto-create intake files.
- **Naming**: `YYYY-MM-DD-<short-slug>.md` (date = session date), e.g. `2026-09-03-paul-spence.md`.
- **Format**: A small YAML frontmatter block (`date`, `type: session`, `participants`, `context`) followed by free-form, practitioner-voice Markdown sections — typically **Context**, the drilled/focus areas, **Action Items** (as `- [ ]` checkboxes), and a brief **Reflections**. Preserve the user's own terminology; do not invent content or over-formalise.
- **Hand-off**: After writing the file, leave it for the user to run `paraclete process`. Do not run the pipeline or edit `okf/` as part of intake unless separately asked.

The engine treats the resulting note like any other raw input: it is hashed and extracted into `okf/sessions/`, `okf/persons/`, and `okf/references/` on the next processing run.
