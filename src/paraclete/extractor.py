from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone
import json
import re

from .config import AppConfig
from .parser import MarkdownParser, OKFDocument
from .graph import OKFGraph
from .llm import LLMClient, ToolCallError
from .indexer import Indexer, CacheEntry
from .tools import get_tool_schemas, build_tool_dispatch

EXTRACTION_SYSTEM_PROMPT = """You are an expert practitioner assistant and knowledge architect.
Your job is to read raw session notes, dictations, or multi-session daily logs and extract structured Open Knowledge Format (OKF v0.2) markdown documents.

CRITICAL INSTRUCTION - NO CODE BLOCKS:
- DO NOT wrap the output or individual documents in markdown code blocks or triple backticks (e.g., do NOT output ```markdown ... ``` or ``` ... ```).
- Output raw markdown text directly, starting with `---` on the very first line.

IMPORTANT INSTRUCTION FOR MULTI-SESSION DAILY LOGS:
If the input file contains MULTIPLE distinct client sessions, meetings, or cohort discussions (for example, separate headings for different students/clients, messages, or debriefs):
- You MUST extract EACH session as its own separate, independent OKF markdown document.
- Separate multiple session documents with the exact delimiter: `=== DOCUMENT BREAK ===`

Rules for each extracted session document:
1. YAML Frontmatter block enclosed by `---`:
   - type: "session_note"
   - title: Descriptive and meaningful title capturing the core focus, repertoire, or outcome (e.g. "Audiation vs. Analysis in Technique", "Harmonic Mapping & Repertoire Architecture", "PD Debrief & Career Path Fork"). DO NOT use generic titles like "Session 1", "Session 2", or "Daily Session".
   - date: "YYYY-MM-DD" (Use the date from the transcript header or daily note date)
   - stage: "Published"
   - person: "[[Person Name]]" (e.g. "[[Jane Doe]]", "[[Alex Rivera]]"). Extract the clean individual person name. If no 1-on-1 person is involved, use null.
   - group: "[[Group Name]]" (e.g. "[[Cohort Alpha]]", "[[Team Beta]]" if cohort/group is mentioned, otherwise null)
   - persona: "[[Persona Name]]" (e.g. "[[Executive Coach]]", "[[Technical Mentor]]", indicating practitioner mindset/operating mode)
   - tags: list of 4-8 relevant topic keywords (e.g. ["audiation", "harmony", "rhythm", "leadership"])
2. Markdown Body structure:
   - # [Title matching frontmatter title]
   - ## Overview / Key Themes
   - ## Notes & Discussion Points
   - ## Action Items (formatted strictly as checklist `- [ ] task description`)
   - ## Mentioned Concepts & References (using `[[Concept Name]]` wikilinks)
3. Return each output as a complete Markdown file containing the YAML frontmatter block enclosed by `---`.
"""

MERGE_SYSTEM_PROMPT = """You are a conflict reconciliation assistant for an Obsidian knowledge base.
A practitioner manually edited a structured session note in Obsidian, but a refreshed raw input transcription has been processed.

Your job is to perform a 3-Way Reconciliation:
- PRESERVE all custom notes, commentary, reflections, tags, and formatting that the practitioner manually added in their Obsidian note.
- MERGE in any newly discovered facts, quotes, or action items from the refreshed extraction.
- Return the final reconciled Markdown document with valid YAML frontmatter.
"""

SYNTHESIS_SYSTEM_PROMPT = """You are an expert executive practitioner, mentor, and diagnostic analyst.
Your job is to synthesize all recorded session notes and interactions for a specific client into a comprehensive, high-value Practitioner Dossier.

Structure the Markdown output cleanly:
# [Client Name]

## Executive Summary & Context
A concise synthesis of who this person is, their background, and their core developmental objectives.

## Trajectory & Milestone Progress
A chronological narrative of their journey across sessions: where they started, breakthroughs, and how their capabilities/mindset have evolved over time.

## Core Themes & Behavioral Patterns
- **Strengths & Superpowers**: Recurring areas of high performance and natural competence.
- **Bottlenecks & Growth Edges**: Recurring frictions, challenges, or mental blocks observed across sessions.

## Active Mental Models & Working Frameworks
Key frameworks, techniques, and concepts actively introduced, practiced, or referenced in their coaching/teaching.

## Practitioner Guidance & Strategy
Actionable strategic advice and focus areas for the practitioner during upcoming sessions with this client.
"""

REFLECTION_QUESTIONNAIRE_SYSTEM_PROMPT = """You are a master clinical supervisor, executive mentor, and reflective practice facilitator working within the Paraclete Knowledge Engine.
Your job is to generate a deeply insightful, customized Socratic reflective practice questionnaire for a practitioner working under a specific persona.

## CRITICAL: Portfolio Representation & Cross-Cohort Coverage
1. **DO NOT fixate on just the first 1-2 clients or a single group**. A practitioner persona often encompasses MULTIPLE distinct client cohorts/groups (e.g., across startup advisory, enterprise coaching, or teaching cohorts) as well as direct 1-on-1 clients.
2. **Review the entire Macro Practice Landscape** provided in the user prompt. Notice all active cohorts/groups, client distributions, session counts, and recurring tags across the entire window.
3. **Stratified Socratic Case Selection**:
   - For Section 2 ("Client Case Inquiries & Clinical Dilemmas"), select 2–4 distinct client cases drawn from **DIFFERENT groups/cohorts** and client contexts across the active portfolio.
   - For example, if the persona has Cohort A, Cohort B, and 1-on-1 clients, select one client from Cohort A, one from Cohort B, and one direct client to ensure broad and representative supervision.
   - If you need deeper details on a specific client's breakthrough or friction, use `read_entity` on their recent session notes.
4. **Cross-Cohort Dynamics & Framework Alignment**:
   - Compare how the practitioner applies their framework principles across different group cultures and organizational contexts.
   - Contrast different client dynamics (e.g. crisis management vs long-term capability building).

## Questionnaire Design Requirements:
- Write in a supportive, analytical, and Socratic supervisory tone tailored specifically to the persona's domain (e.g. pedagogy & technical execution for a teaching persona; leadership & organizational strategy for an executive advisory persona).
- Reference actual client names, breakthroughs, friction points, and specific discussions from recent sessions so the questions feel grounded and immediately relevant.
- Compare actual session patterns against the principles in the persona's Practise Framework (testing espoused theory vs theory-in-use).
- Structure the markdown output starting IMMEDIATELY with the YAML frontmatter on line 1. Do NOT wrap in triple backticks or markdown code blocks.

## Required Structure:
---
type: reflection_input
title: "Practitioner Reflection: [Persona Title] ([YYYY-MM-DD])"
date: "YYYY-MM-DD"
persona: "[[Persona Title]]"
framework: "[[Framework Title]]"
previous_reflection: "[[Previous Reflection Title]]"  # or null if none
reviewed_persons:
  - "[[Person 1]]"
  - "[[Person 2]]"
tags:
  - reflection
  - supervision
  - "[persona-slug]"
---

# Practitioner Reflection: [Persona Title] ([YYYY-MM-DD])

## 1. Longitudinal Continuity & Goal Follow-Up
[Follow up on specific goals, experiments, or commitments made in the previous reflection. If no prior reflection exists, frame baseline reflection goals].
- **Your Response**:

## 2. Client Case Inquiries & Clinical Dilemmas
[Provide subheadings for 2-4 key clients selected across DIFFERENT active cohorts/groups and 1-on-1 contexts].

### [[Client Name]] (Group: [[Group Name]] or 1-on-1)
> **Context**: [Brief recap of recent topics and sessions across the window]
- **Supervisory Inquiry**: [Targeted question on friction, breakthrough dynamics, or pedagogical/advising choices]
- **Your Response**:

## 3. Framework Alignment & Espoused Principles
[Pick 1-2 core principles from the persona's [[Framework Title]] and challenge the practitioner on how closely casework across the portfolio reflected those principles versus fallback defaults].
- **Supervisory Inquiry**:
- **Your Response**:

## 4. Practitioner State, Portfolio Balance & Energy
- **Energy & Sustainability Rating (1-5)**: 
- **What felt most energizing / highest leverage across these engagements?**:
- **Where did you feel friction, cognitive drain, or cross-cohort context switching strain?**:

## 5. Focus Areas & Pedagogical / Consulting Experiments for Next Cycle
- [ ] Goal 1:
- [ ] Goal 2:
"""

AGENTIC_EXTRACTION_SYSTEM_PROMPT = """You are an expert practitioner assistant and knowledge architect working inside the Paraclete OKF (Open Knowledge Format v0.2) engine.

Your job is to read a raw input file — which may contain session notes, dictations, messages, reflections, or mixed content — and use the provided tools to create and update structured OKF entities in the vault's okf/ directory.

## How to work
1. First search or list existing entities:
   - Use `search_entities` (with query keywords or tags) to check if relevant persons, groups, topics, or concepts already exist before creating new ones.
   - Use `list_entities` (optionally filtered by type) to survey a folder.
   - Use `read_entity` on any entity you plan to link to or update, so your links point at real titles and preserve existing content.
   - Use `get_backlinks` to see what already links to an entity.
2. Classify each distinct piece of content in the input:
   - A 1-on-1 coaching/teaching session or client meeting -> create a `session_note`.
   - **CRITICAL for Email Recaps / Follow-up Messages**: If the input is an email, message, or follow-up note sent to a student/client summarizing a session (e.g. "sharing what we went through today", notation/tab recaps, practice assignments, key takeaways), you MUST create BOTH:
     1. A `session_note` representing the coaching/teaching session itself (with date, person/group, persona, key themes, discussion points, action items, and mentioned references).
     2. A `message` entity representing the communication/draft sent to the student (type `message`, status `SENT` or `DRAFT`, with persona).
     3. Link them bidirectionally so both the session timeline and communication history are captured.
   - A purely administrative or logistical message (scheduling, invoice, brief question without session content) -> create only a `message` entity.
   - A group/cohort discussion -> create a `session_note` with the group set (and no person, or the facilitator).
   - **CRITICAL for Persona Tagging on Sessions and Messages**:
     Every `session_note` and `message` MUST be tagged with the relevant practitioner `persona` (e.g. `persona: "[[Executive Coach]]"` or `persona: "[[Technical Mentor]]"`). For clients who engage across multiple domains (e.g. Jane Doe, Alex Rivera), tagging the persona on each session and message ensures that the practitioner's operating mindset and developmental track remain distinct and unambiguous.
   - **CRITICAL for Completed Practitioner Reflection Questionnaires** (e.g. from `input/reflections/` or with `type: reflection_input` or `# Practitioner Reflection`):

     1. Create or update the canonical `reflection` entity in `vault/okf/reflections/` with path `reflections/YYYY-MM-DD-[persona-slug].md`.
     2. Set frontmatter:
        `type: reflection`
        `title: "[Persona Title] Reflection - [Date or Month Year]"`
        `date: "YYYY-MM-DD"`
        `persona: "[[Persona Title]]"`
        `framework: "[[Framework Title]]"`
        `reviewed_persons: ["[[Person 1]]", ...]`
        `previous_reflection: "[[Prev Reflection]]"`
        `energy_rating: int` (1-5 if answered)
        `tags: ["reflection", "supervision", ...]`
     3. In the body, preserve the practitioner's answers, case reflections, and self-assessments under `## Practitioner Self-Reflection & Notes`.
     4. Generate an in-depth asynchronous supervisory review under `## Supervisory Synthesis & Insights`:
        - **Meta-Themes & Casework Diagnostics**: High-level patterns observed across the practitioner's reflections and client casework.
        - **Blind Spot & Counter-Transference Detection**: Constructive, empathetic analysis of potential blind spots, communication defaults, or unexamined assumptions.
        - **Framework Alignment Review**: Evaluating practice against the persona's [[Framework Title]] principles.
        - **Supervisory Recommendations & Next Cycle Focus**: Prioritized developmental recommendations for the practitioner.
     5. Link the reflection back to the persona entity and referenced clients.
   - A standalone reflection, journal entry, or insight without a structured questionnaire -> create a `reflection`.
   - A thematic developmental track or goal -> create a `topic` entity.
   - A concept, technique, resource, pattern, or template discussed in depth -> create a `reference` with the appropriate reference_type (CONCEPT / RESOURCE / TECHNIQUE / PATTERN / TEMPLATE) and substantive body content summarizing what was said about it. Do NOT create empty stub references; only create a reference when the input contains real substance about that concept.
   - A person or group not yet in the vault -> create them with `create_entity` (type `person` or `group`) before linking sessions to them.
     **CRITICAL for Person Tags**: If the person is a direct client, coachee, or music student of the practitioner, include `'client'` in their `tags` (e.g. `tags: ["client", "Piano"]` or `tags: ["client"]`). If the person is a secondary stakeholder, colleague, executive, or team member mentioned during casework, use descriptive tags (e.g. `tags: ["team-member", "engineering"]` or `tags: ["stakeholder"]`) WITHOUT the `'client'` tag.
3. For every entity you create, set:
   - Correct frontmatter per OKF v0.2 (type, title, and type-specific fields such as date/stage/person/group for session notes; reference_type/url for references; members for groups).
   - Wikilinks (`[[Entity Title]]`) in both frontmatter fields and body sections for every meaningful relationship. Session notes MUST link their person and/or group, and SHOULD include a "## Mentioned Concepts & References" section with wikilinks to the references they discuss.
4. Use `link_entities` (or set the field directly in create_entity/update_entity frontmatter) so that relationships are bidirectionally discoverable: when you create a session for a person, make sure the person entity links back to the session using the session's exact wikilink (e.g. `[[2026-09-01 - Person Name - Session Title]]` or `[[Session Title]]`).
5. Prefer updating an existing entity over creating a duplicate. If an entity with the same title already exists, use `update_entity` / `link_entities`.

## Output rules
- Work efficiently: perform your search and read tool calls in early rounds, create and link entities in subsequent rounds, and complete your work with a concise final summary.
- Do your work through tool calls. When you are finished, respond with a short plain-text summary (2-6 sentences) of what you created or updated and why. That final text is all that will be shown to the user — keep it concise.
- Never invent entities that are not supported by the input content. If the input mentions a concept only in passing (one word, no substance), link it if it exists; do not create it.
- All dates must be ISO YYYY-MM-DD. Use the default date provided when the content has no explicit date.
"""

def sanitize_filename(text: str) -> str:
    clean = re.sub(r'[\\/*?:"<>|]', "", str(text or "")).strip()
    return clean or "Untitled"

def clean_entity_name(val: Any) -> Optional[str]:
    """Extract a clean entity name from wikilinks, strings, or nested lists."""
    if not val:
        return None
    while isinstance(val, list):
        if len(val) == 0:
            return None
        val = val[0]
    
    val_str = str(val).strip()
    # Match [[target|alias]] or [[target]]
    match = re.search(r"\[\[(.*?)\]\]", val_str)
    if match:
        raw_inner = match.group(1).strip()
        if "|" in raw_inner:
            target, alias = raw_inner.split("|", 1)
            val_str = alias.strip() if alias.strip() else target.strip()
        else:
            val_str = raw_inner
    
    # If path prefixes like okf/personas/, okf/groups/, okf/persons/ are present, extract stem
    if "/" in val_str or "\\" in val_str:
        val_str = Path(val_str).stem
    
    cleaned = val_str.strip(" '\"[]\t\r\n")
    cleaned = re.sub(r'[\\/*?:"<>|]', "", cleaned).strip()
    return cleaned if cleaned else None

def format_canonical_session_filename(doc_date: Optional[str], entity_name: Optional[str], title: str) -> Tuple[str, str]:
    """Clean title and construct canonical 'YYYY-MM-DD - Entity - Title' session filename stem.

    Ensures dates and person/group names are not duplicated in the filename or title.
    """
    clean_title = (title or "").strip()
    entity_str = clean_entity_name(entity_name) or ""
    date_str = (doc_date or "").strip()

    # Strip repeated leading dates (e.g. "2026-04-10 - 2026-04-10 - ...", "2026-04-10: ...")
    while True:
        m = re.match(r"^(\d{4}-\d{2}-\d{2})\s*[-–—:]\s*(.*)$", clean_title)
        if m:
            if not date_str:
                date_str = m.group(1)
            clean_title = m.group(2).strip()
        else:
            break

    # Strip leading entity name if present (e.g. "Jane Doe - ...")
    if entity_str:
        entity_pattern = re.compile(rf"^{re.escape(entity_str)}\s*[-–—:]\s*(.*)$", re.IGNORECASE)
        m2 = entity_pattern.match(clean_title)
        if m2:
            clean_title = m2.group(1).strip()

    if not clean_title:
        clean_title = "Session Note"

    parts = []
    if date_str and re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
        parts.append(date_str)
    if entity_str:
        parts.append(entity_str)
    parts.append(clean_title)

    canonical_stem = sanitize_filename(" - ".join(parts))
    return canonical_stem, clean_title

def compact_session_note(s_body: str, max_chars: int = 1200) -> str:
    """Extract high-signal summary sections from session note body within a token budget."""
    if not s_body or len(s_body.strip()) <= max_chars:
        return s_body.strip()

    sections = []
    lines = s_body.splitlines()
    curr_heading = ""
    curr_lines = []
    
    for line in lines:
        if line.startswith("#"):
            if curr_heading:
                sections.append((curr_heading, "\n".join(curr_lines).strip()))
            curr_heading = line.strip()
            curr_lines = []
        else:
            curr_lines.append(line)
    if curr_heading:
        sections.append((curr_heading, "\n".join(curr_lines).strip()))

    compact_parts = []
    for h, b in sections:
        h_lower = h.lower()
        if "overview" in h_lower or "theme" in h_lower:
            compact_parts.append(f"{h}\n{b[:400]}")
        elif "action" in h_lower or "item" in h_lower:
            compact_parts.append(f"{h}\n{b}")
        elif "concept" in h_lower or "reference" in h_lower:
            compact_parts.append(f"{h}\n{b}")
        elif "note" in h_lower or "discussion" in h_lower:
            compact_parts.append(f"{h}\n{b[:450]}")
        else:
            compact_parts.append(f"{h}\n{b[:250]}")

    result = "\n\n".join(compact_parts).strip()
    if len(result) > max_chars:
        return result[:max_chars] + "\n...(summary continued)"
    return result

class Extractor:
    def __init__(self, config: AppConfig, graph: OKFGraph, indexer: Indexer):
        self.config = config
        self.graph = graph
        self.indexer = indexer
        self.llm = LLMClient(config.llm)

    def ensure_person_exists(self, person_name: str, group_name: Optional[str] = None) -> Optional[Path]:
        """Auto-scaffold a person entity note in okf/persons/ if missing."""
        if not person_name:
            return None
        persons_dir = self.config.get_path(self.config.paths.okf_dir) / "persons"
        persons_dir.mkdir(parents=True, exist_ok=True)

        person_file = persons_dir / f"{person_name}.md"
        group_link = f"[[{group_name}]]" if group_name else None

        # If it was erroneously created as a reference note in okf/references/, clean it up
        references_file = self.config.get_path(self.config.paths.okf_dir) / "references" / f"{person_name}.md"
        if references_file.exists() and not person_file.exists():
            try:
                references_file.unlink()
            except Exception:
                pass

        if person_file.exists():
            doc = MarkdownParser.parse_file(person_file)
            if group_link and group_link not in (doc.metadata.get("groups") or []):
                groups = doc.metadata.get("groups") or []
                groups.append(group_link)
                doc.metadata["groups"] = groups
                MarkdownParser.write_file(doc, person_file)
            return person_file

        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        groups_list = [group_link] if group_link else []
        doc = OKFDocument(
            metadata={
                "type": "person",
                "title": person_name,
                "aliases": [person_name],
                "contact_method": None,
                "avatar_logo": None,
                "persona": None,
                "framework": None,
                "groups": groups_list,
                "tags": ["client"],
                "created_at": now_iso,
                "updated_at": now_iso
            },
            content=f"# {person_name}\n\n## Overview\nClient dossier for {person_name}.\n"
        )
        MarkdownParser.write_file(doc, person_file)
        print(f"       -> [NEW PERSON] Auto-created entity: okf/persons/{person_name}.md")
        self.graph.load()
        return person_file

    def ensure_group_exists(self, group_name: str, member_name: Optional[str] = None) -> Optional[Path]:
        """Auto-scaffold a group entity note in okf/groups/ if missing, and ensure member is listed."""
        if not group_name:
            return None
        groups_dir = self.config.get_path(self.config.paths.okf_dir) / "groups"
        groups_dir.mkdir(parents=True, exist_ok=True)

        group_file = groups_dir / f"{group_name}.md"
        member_link = f"[[{member_name}]]" if member_name else None

        if group_file.exists():
            doc = MarkdownParser.parse_file(group_file)
            modified = False
            if member_link and member_link not in (doc.metadata.get("members") or []):
                members = doc.metadata.get("members") or []
                members.append(member_link)
                doc.metadata["members"] = members
                modified = True
            if member_link and "## Members" in doc.content and member_link not in doc.content:
                doc.content = doc.content.rstrip() + f"\n- {member_link}\n"
                modified = True
            if modified:
                MarkdownParser.write_file(doc, group_file)
            return group_file

        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        members_list = [member_link] if member_link else []
        content_members = f"\n- {member_link}\n" if member_link else "\n"
        doc = OKFDocument(
            metadata={
                "type": "group",
                "title": group_name,
                "aliases": [group_name],
                "description": f"Cohort group for {group_name}.",
                "members": members_list,
                "persona": None,
                "framework": None,
                "tags": ["cohort"],
                "created_at": now_iso,
                "updated_at": now_iso
            },
            content=f"# {group_name}\n\nCohort group for {group_name}.\n\n## Members{content_members}"
        )
        MarkdownParser.write_file(doc, group_file)
        print(f"       -> [NEW GROUP] Auto-created entity: okf/groups/{group_name}.md")
        self.graph.load()
        return group_file

    def ensure_concepts_exist(self, concept_names: List[str]) -> List[Path]:
        """Auto-scaffold reference notes in okf/references/ for newly mentioned concepts."""
        created = []
        references_dir = self.config.get_path(self.config.paths.okf_dir) / "references"
        references_dir.mkdir(parents=True, exist_ok=True)

        for concept in concept_names:
            c_name = clean_entity_name(concept)
            if not c_name or len(c_name) < 2:
                continue
            if re.match(r"^\d{4}-\d{2}-\d{2}$", c_name):
                continue
            existing = self.graph.find_by_title(c_name) or self.graph.find_by_title(str(concept).strip("[]"))
            if existing:
                continue

            ref_file = references_dir / f"{c_name}.md"
            if not ref_file.exists():
                raw_clean = str(concept).strip("[] ")
                aliases = [c_name]
                if raw_clean and raw_clean != c_name:
                    aliases.append(raw_clean)

                now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                doc = OKFDocument(
                    metadata={
                        "type": "reference",
                        "title": c_name,
                        "aliases": aliases,
                        "reference_type": "CONCEPT",
                        "url": None,
                        "tags": ["concept", "reference"],
                        "created_at": now_iso
                    },
                    content=f"# {c_name}\n\n## Overview\nConcept referenced in session notes.\n"
                )
                MarkdownParser.write_file(doc, ref_file)
                created.append(ref_file)
                print(f"       -> [NEW CONCEPT] Auto-created reference: okf/references/{c_name}.md")

        if created:
            self.graph.load()
        return created

    def synthesize_person_profile(self, person_name: str, max_recent: Optional[int] = None) -> Optional[Path]:
        """Synthesize a rich practitioner profile for a person using tiered windowing and smart compaction."""
        person_entity = self.graph.find_by_title(person_name)
        if not person_entity:
            person_file = self.config.get_path(self.config.paths.okf_dir) / "persons" / f"{person_name}.md"
            if not person_file.exists():
                raise FileNotFoundError(f"Person '{person_name}' not found in OKF knowledge base.")
            doc = MarkdownParser.parse_file(person_file)
        else:
            doc = person_entity.doc
            person_file = doc.path

        # Gather sessions for this person
        sessions = self.graph.get_sessions_for_entity(person_name)
        if not sessions:
            print(f"No session notes found for '{person_name}'. Cannot synthesize history.")
            return None

        # Sort chronologically
        sorted_sessions = sorted(sessions, key=lambda x: str(x.get("date", "")))
        total_count = len(sorted_sessions)

        limit_recent = max_recent if max_recent is not None else self.config.llm.max_history_sessions
        compact_limit = self.config.llm.compact_chars_per_session

        history_blocks = []

        # 1. Tiered Milestone Timeline for older sessions
        if total_count > limit_recent:
            older_sessions = sorted_sessions[:-limit_recent]
            recent_sessions = sorted_sessions[-limit_recent:]

            timeline_items = []
            for s in older_sessions:
                s_entity = self.graph.find_by_title(s["title"])
                s_summary = s.get("summary") or ""
                if not s_summary and s_entity:
                    lines = [l.strip() for l in s_entity.content.splitlines() if l.strip() and not l.startswith("#")]
                    s_summary = lines[0][:150] if lines else "Session conducted."
                timeline_items.append(f"- **{s['date']}** (`{s['title']}`): {s_summary}")

            history_blocks.append("### Historical Milestone Timeline (Older Sessions):\n" + "\n".join(timeline_items))
        else:
            recent_sessions = sorted_sessions

        # 2. Detailed Compaction for Recent Sessions
        history_blocks.append(f"### Recent In-Depth Session Notes ({len(recent_sessions)} sessions):")
        for s in recent_sessions:
            s_entity = self.graph.find_by_title(s["title"])
            s_body = s_entity.content if s_entity else ""
            compact_body = compact_session_note(s_body, max_chars=compact_limit)
            history_blocks.append(f"#### Session Date: {s['date']} | Title: {s['title']}\n{compact_body}\n")

        full_history_text = "\n\n---\n\n".join(history_blocks)

        prompt = f"""Client: {person_name}
Persona/Role: {doc.metadata.get('persona', 'Standard Practitioner')}
Framework: {doc.metadata.get('framework', 'Core Framework')}
Total Recorded Sessions: {total_count} (Showing {len(recent_sessions)} in-depth sessions + historical milestone digest)

Session History:
---
{full_history_text}
---

Synthesize a comprehensive Practitioner Dossier and Profile for {person_name} now."""

        messages = [
            {"role": "system", "content": SYNTHESIS_SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ]

        synthesized_text = self.llm.chat_completion(messages)
        if not synthesized_text or len(synthesized_text.strip()) < 50:
            raise RuntimeError(f"LLM returned an empty synthesis for '{person_name}'.")

        # Parse output and extract body
        parsed = MarkdownParser.parse_text(synthesized_text, path=person_file)
        doc.content = parsed.content.strip()
        doc.metadata["updated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

        MarkdownParser.write_file(doc, person_file)
        self.graph.load()
        print(f"       -> Synthesized practitioner profile for {person_name}: okf/persons/{person_file.name}")
        return person_file

    def generate_reflection_questionnaire(
        self,
        persona_name: str,
        since: Optional[str] = None,
        focus: Optional[str] = None,
    ) -> Path:
        """Generate a tailored Socratic reflection questionnaire for a persona using agentic tool calls."""
        clean_name = re.sub(r"\[\[(.*?)\]\]", r"\1", str(persona_name or "")).strip()

        # Resolve persona from graph
        persona_entity = self.graph.find_by_title(clean_name)
        if not persona_entity:
            for p_dict in self.graph.get_personas():
                if p_dict["title"].lower() == clean_name.lower() or p_dict["slug"].lower() == clean_name.lower():
                    clean_name = p_dict["title"]
                    persona_entity = self.graph.find_by_title(clean_name)
                    break

        persona_title = persona_entity.title if persona_entity else clean_name
        framework_title = None
        if persona_entity:
            f_val = persona_entity.metadata.get("framework")
            if f_val:
                framework_title = re.sub(r"\[\[(.*?)\]\]", r"\1", str(f_val)).strip()

        # Find latest reflection
        last_ref = self.graph.get_latest_reflection_for_persona(persona_title)
        last_date = last_ref.get("date") if last_ref else None
        since_date = since or (str(last_date)[:10] if last_date else None)
        prev_ref_title = last_ref.get("title") if last_ref else None

        # Retrieve pre-computed Macro Practice Landscape across all cohorts and clients
        landscape = self.graph.get_persona_landscape(persona_title, since_date=since_date)

        # Setup agentic tools for context gathering
        okf_root = self.config.get_path(self.config.paths.okf_dir).resolve()
        touched_paths: Set[Path] = set()
        dispatch = build_tool_dispatch(
            self.graph,
            okf_root,
            source_input=f"reflection-kickoff:{persona_title}",
            touched_paths=touched_paths,
        )
        read_tools = [
            t for t in get_tool_schemas()
            if t["function"]["name"] in ("get_persona_landscape", "search_entities", "list_entities", "read_entity", "get_backlinks")
        ]

        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        # Format Macro Landscape for user prompt
        groups_text = []
        for g in landscape.get("groups", []):
            sess_samples = ", ".join([f"{s['date']} ({s.get('person') or 'cohort'})" for s in g.get("recent_sessions", [])[:4]])
            groups_text.append(
                f"- Cohort/Group: [[{g['title']}]] ({g.get('client_count', 0)} members, {g.get('sessions_in_window_count', 0)} sessions in period)\n"
                f"  Overview: {g.get('description') or 'N/A'}\n"
                f"  Sample sessions: {sess_samples or 'None'}"
            )

        clients_text = []
        for c in landscape.get("active_clients", [])[:12]:
            grp_tag = "in group" if c.get("is_in_group") else "direct 1-on-1"
            clients_text.append(f"- [[{c['name']}]] ({c['session_count_in_window']} sessions in period, {grp_tag})")

        principles_text = "\n".join([f"- {p}" for p in landscape.get("framework_principles", [])]) or "Standard principles."
        top_tags_text = ", ".join(landscape.get("top_tags", [])) or "None"
        open_actions_text = "\n".join([f"- {act}" for act in landscape.get("open_action_items", [])[:8]]) or "None recorded."

        prev_ref_text = "None (Initial Baseline Reflection)"
        if landscape.get("previous_reflection"):
            p_ref = landscape["previous_reflection"]
            prev_ref_text = f"[[{p_ref.get('title')}]] ({p_ref.get('date')}) - Energy: {p_ref.get('energy_rating') or 'N/A'}\n{p_ref.get('summary', '')}"

        user_prompt = f"""Generate a comprehensive Socratic guided reflection questionnaire for the practitioner working under the persona '{persona_title}'.

Target Persona: {persona_title}
Associated Framework: {framework_title or 'None'}
Date of Reflection: {today_str}
Activity Period: Since {since_date or 'Beginning of Records'} ({landscape.get('total_sessions_in_window', 0)} total sessions across {landscape.get('total_groups_count', 0)} cohorts/groups)
Optional Focus: {focus or 'Holistic Practice Review & Supervision'}

=== MACRO PRACTICE LANDSCAPE ({persona_title}) ===

1. Active Cohorts & Groups:
{chr(10).join(groups_text) if groups_text else '- No discrete groups; individual client practice.'}

2. Active Clients in Period:
{chr(10).join(clients_text) if clients_text else '- None in active window.'}

3. Espoused Framework Principles:
{principles_text}

4. Top Thematic Tags across Period:
{top_tags_text}

5. Open Action Items from Recent Sessions:
{open_actions_text}

6. Previous Reflection Context:
{prev_ref_text}

=== END MACRO LANDSCAPE ===

Instructions:
- Review the entire macro landscape above to ensure cross-cohort and cross-client representation.
- In Section 2 ("Client Case Inquiries & Clinical Dilemmas"), choose 2–4 distinct client cases drawn from DIFFERENT cohorts/groups and client archetypes.
- If you need deeper details on a specific client's breakthrough or friction, use `read_entity` on their recent session notes.
- In Section 3 ("Framework Alignment"), test how the practitioner applied their principles across different cohort cultures.
- In Section 4 ("Practitioner State & Portfolio Balance"), explore energy distribution and cross-cohort context switching.

Return the complete Markdown questionnaire.
Start line 1 directly with `---` YAML frontmatter (type: reflection_input). Do not wrap the output in markdown code blocks."""

        messages = [
            {"role": "system", "content": REFLECTION_QUESTIONNAIRE_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]

        questionnaire_content = self.llm.chat_completion_with_tools(
            messages,
            tools=read_tools,
            tool_dispatch=dispatch,
            max_rounds=self.config.processing.tool_max_rounds,
        )

        content = (questionnaire_content or "").strip()
        if content.startswith("```markdown"):
            content = content[11:].lstrip("\r\n")
        elif content.startswith("```"):
            content = content[3:].lstrip("\r\n")
        if content.endswith("```"):
            content = content[:-3].rstrip("\r\n")

        # Guarantee valid frontmatter if LLM produced plain text
        if not content.startswith("---"):
            fm_lines = [
                "---",
                "type: reflection_input",
                f'title: "Practitioner Reflection: {persona_title} ({today_str})"',
                f'date: "{today_str}"',
                f'persona: "[[{persona_title}]]"',
                f'framework: "[[{framework_title}]]"' if framework_title else "framework: null",
                f'previous_reflection: "[[{prev_ref_title}]]"' if prev_ref_title else "previous_reflection: null",
                "tags:",
                "  - reflection",
                "  - supervision",
                "---",
                "",
            ]
            content = "\n".join(fm_lines) + content

        input_reflections_dir = self.config.get_path(self.config.paths.input_dir) / "reflections"
        input_reflections_dir.mkdir(parents=True, exist_ok=True)

        persona_slug = sanitize_filename(persona_title).lower().replace(" ", "-")
        target_file = input_reflections_dir / f"{today_str}-{persona_slug}-reflection.md"
        target_file.write_text(content, encoding="utf-8")
        return target_file

    def extract(self, input_file: Path, strategy: str = "warn") -> List[Path]:
        """Process a raw input file using the configured extraction mode.

        Returns all OKF paths created or updated for this input (session notes in
        legacy mode; any entity type in agentic mode).
        """
        if self.config.processing.extraction_mode == "agentic":
            return self._extract_agentic(input_file, strategy=strategy)
        return self.extract_session_notes(input_file, strategy=strategy)

    def _extract_agentic(self, input_file: Path, strategy: str = "warn") -> List[Path]:
        """Agentic extraction: the LLM drives entity creation via tool calls."""
        raw_text = input_file.read_text(encoding="utf-8")
        status, entry = self.indexer.get_file_status(input_file)

        # Fallback date from raw input header or filename (e.g. 2026-08-27.md)
        raw_date_match = re.search(r"(?:Date:\s*|# Raw Capture:.*?Date:\s*)(\d{4}-\d{2}-\d{2})", raw_text, re.IGNORECASE)
        if not raw_date_match:
            raw_date_match = re.search(r"(\d{4}-\d{2}-\d{2})", input_file.name)
        fallback_date = raw_date_match.group(1) if raw_date_match else datetime.now().strftime("%Y-%m-%d")

        # Record source input relative path (for provenance frontmatter)
        rel_input = str(input_file.relative_to(self.config.vault_root)).replace("\\", "/")

        okf_root = self.config.get_path(self.config.paths.okf_dir).resolve()

        user_prompt = f"""Source Input File: {input_file.name}
Default Date (use when content has no explicit date): {fallback_date}
source_input value to record on newly created entities: "{rel_input}"

--- RAW INPUT CONTENT ---
{raw_text}
--- END RAW INPUT ---

Classify this content and create/update the appropriate OKF entities using your tools. Remember: session notes, messages, reflections, topics, references with real substance, persons, groups — whatever the input actually contains."""

        # Conflict handling: if the input was previously processed and an OKF file it
        # produced has since been manually edited, apply the configured strategy.
        if entry and self.indexer.check_okf_conflict(entry):
            if strategy == "warn":
                raise RuntimeError(
                    f"Conflict detected for '{input_file.name}': a previously generated OKF file was manually edited in Obsidian. "
                    f"Use --strategy overwrite or --strategy merge to proceed."
                )
            elif strategy == "skip":
                return []
            elif strategy == "merge":
                conflicted_docs = []
                paths_to_check = entry.okf_paths if entry.okf_paths else ([entry.okf_path] if entry.okf_path else [])
                for rel_p in paths_to_check:
                    okf_p = self.config.vault_root / rel_p
                    if okf_p.exists():
                        conflicted_docs.append(f"### File: {rel_p}\n{okf_p.read_text(encoding='utf-8')}")
                if conflicted_docs:
                    user_prompt += (
                        "\n\n--- 3-WAY RECONCILIATION NOTICE ---\n"
                        "The following OKF file(s) previously generated for this input have been manually edited in Obsidian by the practitioner.\n"
                        "You MUST perform a 3-way merge: PRESERVE all custom practitioner notes, reflections, custom tags, and edits, while merging in any new facts, concepts, and updates from the raw input.\n\n"
                        + "\n\n---\n\n".join(conflicted_docs)
                        + "\n--- END RECONCILIATION CONTENT ---"
                    )

        touched_paths: Set[Path] = set()
        dispatch = build_tool_dispatch(
            self.graph,
            okf_root,
            source_input=rel_input,
            touched_paths=touched_paths,
        )
        tools = get_tool_schemas()

        messages = [
            {"role": "system", "content": AGENTIC_EXTRACTION_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]

        try:
            summary = self.llm.chat_completion_with_tools(
                messages,
                tools=tools,
                tool_dispatch=dispatch,
                max_rounds=self.config.processing.tool_max_rounds,
            )
        except ToolCallError as exc:
            raise RuntimeError(f"Agentic extraction failed for '{input_file.name}': {exc}") from exc

        # If the endpoint did not support tools and fell back to plain completion, no
        # entities were created via tool calls. Parse the response as legacy-style
        # multi-doc markdown so agentic mode still produces output on non-tool endpoints.
        if summary and "=== DOCUMENT BREAK ===" in summary:
            fallback_paths = self._write_fallback_docs(summary, input_file, fallback_date, rel_input)
            for fp in fallback_paths:
                touched_paths.add(fp.resolve())

        # Refresh graph
        self.graph.load()

        # Collect all valid created or updated paths
        created_paths: List[Path] = [p for p in touched_paths if p.exists()]

        # Clean up any previously cached OKF paths for this input that were not regenerated.
        # Only delete files whose frontmatter source_input matches, so user-authored
        # entities are never removed.
        if entry and entry.okf_paths:
            created_set = {p.resolve() for p in created_paths}
            for old_rel in entry.okf_paths:
                old_full = self.config.vault_root / old_rel
                try:
                    if not old_full.exists():
                        continue
                    if old_full.resolve() in created_set:
                        continue
                    doc = MarkdownParser.parse_file(old_full)
                    if str(doc.metadata.get("source_input") or "") == rel_input:
                        old_full.unlink()
                        print(f"       -> [IDEMPOTENCY] Cleaned up obsolete output: {old_rel}")
                except Exception:
                    pass

        # Update indexer cache with all generated files.
        self.indexer.update_entry(input_file, created_paths or None)

        print(f"       -> Agentic extraction summary: {summary[:400]}")
        return created_paths

    def _write_fallback_docs(
        self,
        extracted_text: str,
        input_file: Path,
        fallback_date: str,
        rel_input: str,
    ) -> List[Path]:
        """Write legacy-style multi-doc markdown produced by a non-tool-capable endpoint."""
        extracted_docs = MarkdownParser.parse_multi_docs(extracted_text, path=input_file)
        sessions_dir = self.config.get_path(self.config.paths.okf_dir) / "sessions"
        sessions_dir.mkdir(parents=True, exist_ok=True)
        written_paths: List[Path] = []

        reflections_dir = self.config.get_path(self.config.paths.okf_dir) / "reflections"
        reflections_dir.mkdir(parents=True, exist_ok=True)

        for doc_index, extracted_doc in enumerate(extracted_docs):
            if not extracted_doc.metadata:
                extracted_doc.metadata = {}

            doc_type = extracted_doc.metadata.get("type") or "session_note"
            if doc_type in ("reflection", "reflection_input"):
                extracted_doc.metadata["type"] = "reflection"
                doc_title = extracted_doc.title or f"Reflection {fallback_date}"
                title_val = sanitize_filename(doc_title)
                extracted_doc.metadata["title"] = title_val
                extracted_doc.metadata["source_input"] = rel_input
                okf_target_path = reflections_dir / f"{title_val}.md"
                MarkdownParser.write_file(extracted_doc, okf_target_path)
                written_paths.append(okf_target_path)
                print(f"       -> [FALLBACK] Wrote reflection: {okf_target_path.name}")
                continue

            extracted_doc.metadata["type"] = "session_note"

            doc_date = str(extracted_doc.metadata.get("date") or "").strip()
            if not (doc_date and re.match(r"^\d{4}-\d{2}-\d{2}$", doc_date)):
                doc_date = fallback_date
                extracted_doc.metadata["date"] = doc_date

            doc_title = extracted_doc.title
            if not doc_title or doc_title.lower() == "untitled":
                h1_match = re.search(r"^#\s+(.+)$", extracted_doc.content, re.MULTILINE)
                doc_title = h1_match.group(1).strip() if h1_match else f"Session {doc_index + 1}"
            title_val = sanitize_filename(doc_title)
            extracted_doc.metadata["title"] = title_val

            if not extracted_doc.metadata.get("stage"):
                extracted_doc.metadata["stage"] = "Published"

            person_name = clean_entity_name(extracted_doc.metadata.get("person"))
            group_name = clean_entity_name(extracted_doc.metadata.get("group"))
            persona_name = clean_entity_name(extracted_doc.metadata.get("persona"))

            tags = extracted_doc.metadata.get("tags")
            if not tags or not isinstance(tags, list) or len(tags) == 0:
                tags = ["session", "coaching"]
                extracted_doc.metadata["tags"] = tags

            if not persona_name:
                if group_name:
                    g_ent = self.graph.find_by_title(group_name)
                    if g_ent and g_ent.metadata.get("persona"):
                        persona_name = clean_entity_name(g_ent.metadata.get("persona"))
                if not persona_name and person_name:
                    p_ent = self.graph.find_by_title(person_name)
                    if p_ent and p_ent.metadata.get("persona"):
                        persona_name = clean_entity_name(p_ent.metadata.get("persona"))

            if persona_name:
                extracted_doc.metadata["persona"] = f"[[{persona_name}]]"
            else:
                extracted_doc.metadata["persona"] = None

            if person_name:
                extracted_doc.metadata["person"] = f"[[{person_name}]]"
                self.ensure_person_exists(person_name, group_name)
            else:
                extracted_doc.metadata["person"] = None
            if group_name:
                extracted_doc.metadata["group"] = f"[[{group_name}]]"
                self.ensure_group_exists(group_name, person_name)
            else:
                extracted_doc.metadata["group"] = None


            entity_str = person_name or group_name or ""
            canonical_filename, clean_title = format_canonical_session_filename(doc_date, entity_str, title_val)
            extracted_doc.title = clean_title
            extracted_doc.metadata["title"] = clean_title

            extracted_doc.metadata["aliases"] = [clean_title]
            if canonical_filename != clean_title:
                extracted_doc.metadata["aliases"].append(canonical_filename)
            extracted_doc.metadata["source_input"] = rel_input

            mentioned_links = extracted_doc.get_links()
            self.ensure_concepts_exist(mentioned_links)

            okf_target_path = sessions_dir / f"{canonical_filename}.md"
            MarkdownParser.write_file(extracted_doc, okf_target_path)
            written_paths.append(okf_target_path)
            print(f"       -> [FALLBACK] Wrote session note: {okf_target_path.name}")

        return written_paths

    def extract_session_notes(self, input_file: Path, strategy: str = "warn") -> List[Path]:
        """Process a raw input file (single or multi-session daily log) into separate OKF session notes."""
        raw_text = input_file.read_text(encoding="utf-8")
        status, entry = self.indexer.get_file_status(input_file)

        # Fallback date from raw input header or filename (e.g. 2026-08-27.md)
        raw_date_match = re.search(r"(?:Date:\s*|# Raw Capture:.*?Date:\s*)(\d{4}-\d{2}-\d{2})", raw_text, re.IGNORECASE)
        if not raw_date_match:
            raw_date_match = re.search(r"(\d{4}-\d{2}-\d{2})", input_file.name)
        fallback_date = raw_date_match.group(1) if raw_date_match else datetime.now().strftime("%Y-%m-%d")

        # Context: Known persons, groups, frameworks, personas
        persons = [p["title"] for p in self.graph.get_persons()]
        groups = [g["title"] for g in self.graph.get_groups()]
        frameworks = [f["title"] for f in self.graph.get_frameworks()]
        personas = [p["title"] for p in self.graph.get_personas()]

        user_prompt = f"""Context:
Known Persons: {', '.join(persons) if persons else 'None yet'}
Known Groups: {', '.join(groups) if groups else 'None yet'}
Known Personas: {', '.join(personas) if personas else 'Standard'}
Practise Frameworks: {', '.join(frameworks) if frameworks else 'Standard'}


Raw Input File: {input_file.name} (Default Date: {fallback_date})
---
{raw_text}
---

Extract the structured OKF session notes now. If this note contains multiple client sessions, separate each with '=== DOCUMENT BREAK ==='."""

        messages = [
            {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ]

        extracted_text = self.llm.chat_completion(messages)

        if not extracted_text or len(extracted_text.strip()) < 30:
            raise RuntimeError(
                f"LLM returned an empty or insufficient response ({len(extracted_text.strip())} chars) for '{input_file.name}'. "
                f"Extraction aborted to protect knowledge base integrity."
            )

        extracted_docs = MarkdownParser.parse_multi_docs(extracted_text, path=input_file)
        created_paths: List[Path] = []

        # Record source input relative path
        rel_input = str(input_file.relative_to(self.config.vault_root)).replace("\\", "/")

        # Collect existing session files for this source input to prevent duplication across runs
        sessions_dir = self.config.get_path(self.config.paths.okf_dir) / "sessions"
        existing_session_files = []
        if sessions_dir.exists():
            for sf in sessions_dir.glob("*.md"):
                try:
                    doc = MarkdownParser.parse_file(sf)
                    if doc.metadata.get("source_input") == rel_input:
                        existing_session_files.append((sf, doc))
                except Exception:
                    pass

        for doc_index, extracted_doc in enumerate(extracted_docs):
            if not extracted_doc.metadata:
                extracted_doc.metadata = {}
            extracted_doc.metadata["type"] = "session_note"

            # Determine authoritative date
            doc_date = str(extracted_doc.metadata.get("date") or "").strip()
            if doc_date and re.match(r"^\d{4}-\d{2}-\d{2}$", doc_date):
                date_val = doc_date
            else:
                date_val = fallback_date
                extracted_doc.metadata["date"] = date_val

            # Determine authoritative title with defensive fallback to body # Header
            doc_title = extracted_doc.title
            if not doc_title or doc_title.lower() == "untitled" or re.match(r"^session\s*\d+$", str(doc_title).strip(), re.IGNORECASE):
                # Search for H1 in body
                h1_match = re.search(r"^#\s+(.+)$", extracted_doc.content, re.MULTILINE)
                if h1_match:
                    doc_title = h1_match.group(1).strip()
                else:
                    doc_title = f"Session {doc_index + 1}"
            title_val = sanitize_filename(doc_title)
            extracted_doc.metadata["title"] = title_val

            # Stage default
            if not extracted_doc.metadata.get("stage"):
                extracted_doc.metadata["stage"] = "Published"

            # Entity identification & normalization
            person_name = clean_entity_name(extracted_doc.metadata.get("person"))
            group_name = clean_entity_name(extracted_doc.metadata.get("group"))

            # Defensive search in content if person was not found in metadata
            if not person_name:
                content_sample = "\n".join(extracted_doc.content.splitlines()[:6])
                for p in persons:
                    if p in content_sample:
                        person_name = p
                        break
                # If still not found, search for [[Person Name]] wikilinks in headings
                if not person_name:
                    for line in extracted_doc.content.splitlines()[:6]:
                        w_match = re.search(r"#+\s*\[\[(.*?)\]\]", line)
                        if w_match:
                            candidate = clean_entity_name(w_match.group(1))
                            if candidate and candidate not in groups:
                                person_name = candidate
                                break

            # Defensive search for group if missing
            if not group_name:
                for g in groups:
                    if g in extracted_doc.content:
                        group_name = g
                        break

            if person_name:
                extracted_doc.metadata["person"] = f"[[{person_name}]]"
                self.ensure_person_exists(person_name, group_name)
            else:
                extracted_doc.metadata["person"] = None

            if group_name:
                extracted_doc.metadata["group"] = f"[[{group_name}]]"
                self.ensure_group_exists(group_name, person_name)
            else:
                extracted_doc.metadata["group"] = None

            # Defensive tags validation
            tags = extracted_doc.metadata.get("tags")
            if not tags or not isinstance(tags, list) or len(tags) == 0:
                tags = ["session", "coaching"]
                extracted_doc.metadata["tags"] = tags

            persona_name = clean_entity_name(extracted_doc.metadata.get("persona"))
            if not persona_name:
                if group_name:
                    g_ent = self.graph.find_by_title(group_name)
                    if g_ent and g_ent.metadata.get("persona"):
                        persona_name = clean_entity_name(g_ent.metadata.get("persona"))
                if not persona_name and person_name:
                    p_ent = self.graph.find_by_title(person_name)
                    if p_ent and p_ent.metadata.get("persona"):
                        persona_name = clean_entity_name(p_ent.metadata.get("persona"))

            if persona_name:
                extracted_doc.metadata["persona"] = f"[[{persona_name}]]"
            else:
                extracted_doc.metadata["persona"] = None


            entity_str = person_name or group_name or ""
            canonical_filename, clean_title = format_canonical_session_filename(date_val, entity_str, title_val)
            okf_filename = f"{canonical_filename}.md"
            okf_target_path = self.config.get_path(self.config.paths.okf_dir) / "sessions" / okf_filename

            extracted_doc.title = clean_title
            extracted_doc.metadata["title"] = clean_title

            # Set aliases in extracted doc
            extracted_doc.metadata["aliases"] = [clean_title]
            if canonical_filename != clean_title:
                extracted_doc.metadata["aliases"].append(canonical_filename)

            extracted_doc.metadata["source_input"] = rel_input

            # Check if there is an existing session note from this input with the same person/date
            matched_old_file = None
            for old_sf, old_doc in existing_session_files:
                old_person = clean_entity_name(old_doc.metadata.get("person"))
                old_date = str(old_doc.metadata.get("date") or "")
                if person_name and old_person == person_name:
                    matched_old_file = old_sf
                    break
                elif old_date == date_val and old_person == person_name:
                    matched_old_file = old_sf
                    break

            # Ensure concept notes exist for any mentioned concepts
            mentioned_links = extracted_doc.get_links()
            self.ensure_concepts_exist(mentioned_links)

            # Conflict check if target OKF file exists and was modified in Obsidian
            if entry and self.indexer.check_okf_conflict(entry):
                if strategy == "warn":
                    raise RuntimeError(
                        f"Conflict detected for {okf_target_path.name}: File was manually edited in Obsidian. "
                        f"Use --strategy overwrite or --strategy merge to proceed."
                    )
                elif strategy == "merge":
                    current_user_okf = okf_target_path.read_text(encoding="utf-8") if okf_target_path.exists() else ""
                    if current_user_okf:
                        merge_prompt = f"""Target Entity: {okf_filename}

--- USER'S MODIFIED OBSIDIAN NOTE (PRESERVE THESE EDITS) ---
{current_user_okf}

--- NEWLY EXTRACTED CONTENT FROM RAW INPUT ---
{extracted_doc.dumps()}

Reconcile both into a single unified Markdown document with YAML frontmatter."""
                        merged_output = self.llm.chat_completion([
                            {"role": "system", "content": MERGE_SYSTEM_PROMPT},
                            {"role": "user", "content": merge_prompt}
                        ])
                        if not merged_output or len(merged_output.strip()) < 30:
                            raise RuntimeError(f"LLM returned an empty merge result for '{okf_filename}'. Merge aborted.")
                        extracted_doc = MarkdownParser.parse_text(merged_output, path=okf_target_path)
                elif strategy == "skip":
                    created_paths.append(okf_target_path)
                    continue

            # If replacing an older file from the same session whose filename changed, remove the obsolete duplicate
            if matched_old_file and matched_old_file.exists() and matched_old_file.resolve() != okf_target_path.resolve():
                try:
                    matched_old_file.unlink()
                    print(f"       -> [IDEMPOTENCY] Replaced older duplicate: {matched_old_file.name}")
                except Exception:
                    pass

            # Write canonical OKF file
            MarkdownParser.write_file(extracted_doc, okf_target_path)
            created_paths.append(okf_target_path)

        # Clean up any previously cached OKF paths for this input that were not regenerated
        if entry and entry.okf_paths:
            for old_rel in entry.okf_paths:
                old_full = self.config.vault_root / old_rel
                if old_full.exists() and old_full not in created_paths:
                    try:
                        old_full.unlink()
                        print(f"       -> [IDEMPOTENCY] Cleaned up obsolete output: {old_rel}")
                    except Exception:
                        pass

        # Update indexer cache with all generated files
        if created_paths:
            self.indexer.update_entry(input_file, created_paths)

        return created_paths

    def extract_session_note(self, input_file: Path, strategy: str = "warn") -> Path:
        """Backwards-compatible wrapper returning the primary extracted session note."""
        paths = self.extract_session_notes(input_file, strategy=strategy)
        if not paths:
            raise RuntimeError(f"No session notes extracted from {input_file.name}")
        return paths[0]
