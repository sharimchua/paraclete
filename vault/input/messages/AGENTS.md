# Input Messages Directives

The `input/messages/` directory contains raw message captures, client emails, follow-up digests, and communications sent to students and clients.

## Extraction Rules for Agents
1. **Infer Both Session & Message**: When an input message summarizes or discusses a coaching/teaching session (e.g. sharing tabs/notation, session recap, practice focus areas, technique breakdowns):
   - **Create a `session_note`** capturing the session details (discussion points, techniques, breakthroughs, pending action items, referenced concepts, and the **practitioner's** working-mode `persona` — how *the practitioner* engaged, e.g. `[[Midlife Muso]]` for music coaching or `[[Respec]]` for professional/leadership coaching).
   - **Create or update the `message`** entity capturing the communication draft, status, and associated `persona`.
   - **Cross-link** the session note, person, and message so the student's timeline and dossier are complete.
2. **Persona Mindset Awareness**: Ensure the **practitioner's** working-mode `persona` is tagged on every session and message (e.g. `[[Midlife Muso]]` for music coaching, `[[Respec]]` for professional/leadership coaching). The persona names *the practitioner's* engagement stance — never the client's identity or "type" — so multi-track client records stay clear.
3. **Read-Only**: Treat files in `input/messages/` as source artifacts; do not modify or delete them.

