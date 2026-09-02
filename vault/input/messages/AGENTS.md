# Input Messages Directives

The `input/messages/` directory contains raw message captures, client emails, follow-up digests, and communications sent to students and clients.

## Extraction Rules for Agents
1. **Infer Both Session & Message**: When an input message summarizes or discusses a coaching/teaching session (e.g. sharing tabs/notation, session recap, practice focus areas, technique breakdowns):
   - **Create a `session_note`** capturing the session details (discussion points, techniques, breakthroughs, pending action items, referenced concepts, and the practitioner's `persona` e.g. `[[Executive Coach]]` or `[[Technical Mentor]]`).
   - **Create or update the `message`** entity capturing the communication draft, status, and associated `persona`.
   - **Cross-link** the session note, person, and message so the student's timeline and dossier are complete.
2. **Persona Mindset Awareness**: Ensure `persona` is tagged on every session and message (e.g. `[[Executive Coach]]` for leadership/advisory, `[[Technical Mentor]]` for skills coaching) to keep multi-track client records clear.
3. **Read-Only**: Treat files in `input/messages/` as source artifacts; do not modify or delete them.

