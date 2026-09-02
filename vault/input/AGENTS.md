# Input Folder Agent Directives

The `input/` directory contains raw, uncurated practitioner notes, session audio transcripts, dictations, and scratch files.

## Guidelines for Agents
1. **Read-Only**: NEVER modify or delete any file in `input/` during processing runs. (The only tool creating files in `input/reflections/` is the explicit `paraclete reflect` generator command).
2. **Entity Discovery**:
   - Extract dates from filenames (`YYYY-MM-DD-*.md`) or document headers.
   - Map speaker mentions and names to existing files in `okf/persons/` or `okf/groups/`.
   - Identify action items (`TODO:`, `- [ ]`, `Action:`) and map them into the resulting `okf/sessions/` note.
   - Detect references to concepts, models, techniques, or external URLs for creation/linking in `okf/references/`.
   - For completed questionnaires in `input/reflections/`, synthesize domain-specific supervisory insights and extract canonical entities into `okf/reflections/`.
3. **Idempotency**:
   - The engine uses SHA-256 hashes to track processed files. If a file has not changed, do not re-process it.

