"""OKF entity tools exposed to the LLM during agentic extraction.

Each tool is a plain function that receives a JSON-serializable ``arguments`` dict
and returns a JSON-serializable result (or raises).  The OpenAI-compatible
tool-calling loop in :mod:`paraclete.llm` dispatches model-emitted ``tool_calls``
to these functions and feeds the results back as ``role: "tool"`` messages.

Safety rules enforced here (mirroring AGENTS.md):
- Only files under the configured ``okf/`` directory may be read or written.
- ``input/`` is never touched.
- Every write goes through :class:`MarkdownParser` so frontmatter stays valid YAML.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from .parser import MarkdownParser, OKFDocument


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _sanitize_filename(name: str) -> str:
    """Make a string safe for use as an Obsidian filename (no extension)."""
    name = re.sub(r'[\\/:*?"<>|]', " ", str(name or ""))
    name = re.sub(r"\s+", " ", name).strip()
    return name or "untitled"


def _resolve_okf_path(okf_root: Path, rel_path: str) -> Optional[Path]:
    """Resolve *rel_path* against *okf_root*, refusing to escape the okf dir."""
    if not rel_path:
        return None
    candidate = (okf_root / rel_path).resolve()
    try:
        candidate.relative_to(okf_root.resolve())
    except ValueError:
        return None  # path escapes okf/
    return candidate


def _clean_title(val: Any) -> str:
    """Extract a clean title from wikilinks, path strings, or plain text."""
    if not val:
        return ""
    s = str(val).strip()
    m = re.search(r"\[\[(.*?)\]\]", s)
    if m:
        inner = m.group(1).strip()
        s = inner.split("|")[0].strip() if "|" in inner else inner
    if "/" in s or "\\" in s:
        s = Path(s).stem
    return s.strip(" '\"[]\t\r\n").strip()


def format_canonical_session_filename(doc_date: Optional[str], entity_name: Optional[str], title: str) -> Tuple[str, str]:
    """Clean title and construct canonical 'YYYY-MM-DD - Entity - Title' session filename stem.

    Ensures dates and person/group names are not duplicated in the filename or title.
    """
    clean_title = (title or "").strip()
    entity_str = _clean_title(entity_name or "")
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

    canonical_stem = _sanitize_filename(" - ".join(parts))
    return canonical_stem, clean_title


def _resolve_entity(graph, okf_root: Path, ref: str):
    """Resolve an entity reference (title or relative path) to (entity_or_None, full_path_or_None)."""
    if not ref:
        return None, None
    clean = _clean_title(ref)
    # 1. Title lookup in graph
    entity = graph.find_by_title(clean)
    if entity and entity.doc.path:
        try:
            resolved = entity.doc.path.resolve()
            resolved.relative_to(okf_root.resolve())
            return entity, resolved
        except (ValueError, OSError):
            pass
    # 2. Path lookup under okf/
    full = _resolve_okf_path(okf_root, ref.strip().lstrip("/"))
    if full and full.exists():
        return None, full
    return entity, None


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------

def list_entities(
    arguments: Dict[str, Any],
    *,
    graph,
    okf_root: Path,
) -> Dict[str, Any]:
    """List OKF entities, optionally filtered by type and/or folder."""
    entity_type = (arguments.get("type") or "").strip().lower()
    folder = (arguments.get("folder") or "").strip().lstrip("/")
    if folder.startswith("okf/"):
        folder = folder[4:]

    results: List[Dict[str, Any]] = []
    for slug, entity in graph.entities.items():
        if entity_type and entity.doc_type.lower() != entity_type:
            continue
        doc_path = entity.doc.path
        rel_dir = ""
        if doc_path:
            try:
                parent_rel = str(doc_path.parent.relative_to(okf_root)).replace("\\", "/")
                rel_dir = parent_rel
            except ValueError:
                pass
        if folder and not (rel_dir == folder or rel_dir.startswith(folder + "/")):
            continue
        results.append({
            "title": entity.title,
            "type": entity.doc_type,
            "path": str(doc_path.relative_to(okf_root)).replace("\\", "/") if doc_path else "",
        })

    capped = len(results) > 100
    return {"entities": results[:100], "total": len(results), "capped": capped}


def search_entities(
    arguments: Dict[str, Any],
    *,
    graph,
    okf_root: Path,
) -> Dict[str, Any]:
    """Search OKF entities by keyword, title, tag, or content."""
    query = str(arguments.get("query") or "").strip().lower()
    entity_type = (arguments.get("type") or "").strip().lower()
    tag = (arguments.get("tag") or "").strip().lower().lstrip("#")
    limit = int(arguments.get("limit") or 30)

    if not query and not entity_type and not tag:
        return {"error": "Provide at least one search parameter: 'query', 'type', or 'tag'."}

    results: List[Dict[str, Any]] = []
    for slug, entity in graph.entities.items():
        if entity_type and entity.doc_type.lower() != entity_type:
            continue

        entity_tags = [str(t).lower().lstrip("#") for t in entity.metadata.get("tags", []) if t]
        if tag and tag not in entity_tags:
            continue

        score = 0
        match_reason = []
        if query:
            q_clean = _clean_title(query).lower()
            title_lower = (entity.title or "").lower()
            slug_lower = slug.lower()
            aliases = [str(a).lower() for a in entity.metadata.get("aliases", []) if a]

            if q_clean == title_lower:
                score += 100
                match_reason.append("exact title match")
            elif q_clean == slug_lower:
                score += 90
                match_reason.append("exact slug match")
            elif q_clean in aliases:
                score += 80
                match_reason.append("alias match")
            elif q_clean in title_lower:
                score += 60
                match_reason.append("partial title match")
            elif q_clean in slug_lower:
                score += 45
                match_reason.append("partial slug match")
            elif any(q_clean in a for a in aliases):
                score += 40
                match_reason.append("partial alias match")
            elif any(q_clean in t for t in entity_tags):
                score += 30
                match_reason.append("tag match")
            elif q_clean in entity.content.lower():
                score += 10
                match_reason.append("content match")
            else:
                continue
        else:
            score = 10

        doc_path = entity.doc.path
        rel = str(doc_path.relative_to(okf_root)).replace("\\", "/") if doc_path else ""

        # Extract brief snippet
        snippet = ""
        if entity.content:
            first_lines = [l.strip() for l in entity.content.splitlines() if l.strip() and not l.startswith("#")]
            snippet = first_lines[0][:180] if first_lines else ""

        results.append({
            "title": entity.title,
            "type": entity.doc_type,
            "path": rel,
            "tags": entity.metadata.get("tags", []),
            "score": score,
            "snippet": snippet,
        })

    results.sort(key=lambda x: x["score"], reverse=True)
    capped = len(results) > limit
    return {"results": results[:limit], "total": len(results), "capped": capped}


def read_entity(
    arguments: Dict[str, Any],
    *,
    graph,
    okf_root: Path,
) -> Dict[str, Any]:
    """Read the full content of an OKF entity by title or relative path."""
    title = (arguments.get("title") or "").strip()
    rel_path = (arguments.get("path") or "").strip().lstrip("/")

    if title:
        entity = graph.find_by_title(title)
        if not entity:
            return {"error": f"Entity '{title}' not found."}
        doc = entity.doc
        content = doc.dumps()
        rel = str(doc.path.relative_to(okf_root)).replace("\\", "/") if doc.path else ""
    elif rel_path:
        full = _resolve_okf_path(okf_root, rel_path)
        if not full or not full.exists():
            return {"error": f"Path '{rel_path}' not found in okf/."}
        doc = MarkdownParser.parse_file(full)
        content = doc.dumps()
        rel = rel_path
    else:
        return {"error": "Provide either 'title' or 'path'."}

    max_chars = 8000
    truncated = len(content) > max_chars
    if truncated:
        content = content[:max_chars] + "\n\n[... truncated ...]"

    return {"title": doc.title, "type": doc.doc_type, "path": rel, "content": content, "truncated": truncated}


def get_backlinks(
    arguments: Dict[str, Any],
    *,
    graph,
    okf_root: Path,
) -> Dict[str, Any]:
    """Get all entities that link to this entity (inbound links)."""
    title = (arguments.get("title") or "").strip()
    rel_path = (arguments.get("path") or "").strip().lstrip("/")

    entity, full_path = _resolve_entity(graph, okf_root, title or rel_path)
    if not entity:
        clean = _clean_title(title or rel_path)
        entity = graph.find_by_title(clean)

    if not entity:
        return {"error": f"Entity '{title or rel_path}' not found in graph."}

    backlinks = []
    for link_in in entity.links_in:
        src_entity = graph.find_by_title(link_in)
        backlinks.append({
            "title": link_in,
            "type": src_entity.doc_type if src_entity else "unknown",
        })

    return {"title": entity.title, "backlinks": backlinks, "total": len(backlinks)}


def get_persona_landscape(
    arguments: Dict[str, Any],
    *,
    graph,
    okf_root: Path,
) -> Dict[str, Any]:
    """Retrieve the macro practice landscape (groups, clients, session catalog, framework) for a persona."""
    persona = str(arguments.get("persona") or "").strip()
    since = arguments.get("since")
    if not persona:
        return {"error": "Please provide a 'persona' name (e.g. 'Executive Coach', 'Technical Mentor')."}
    return graph.get_persona_landscape(persona, since_date=since)


def create_entity(
    arguments: Dict[str, Any],
    *,
    graph,
    okf_root: Path,
    source_input: Optional[str] = None,
    touched_paths: Optional[Set[Path]] = None,
) -> Dict[str, Any]:
    """Create a new OKF entity file.

    Required: type, title
    Optional: frontmatter (dict), body (str), path (relative to okf/)
    """
    raw_type = (arguments.get("type") or "").strip().lower()
    title = (arguments.get("title") or "").strip()
    if not raw_type:
        return {"error": "'type' is required."}
    if not title:
        return {"error": "'title' is required."}

    # Normalize entity type
    type_alias_map = {
        "practice_framework": "practise_framework",
        "framework": "practise_framework",
        "practise_framework": "practise_framework",
        "concept": "reference",
        "technique": "reference",
        "resource": "reference",
        "pattern": "reference",
        "template": "reference",
    }
    entity_type = type_alias_map.get(raw_type, raw_type)

    frontmatter: Dict[str, Any] = dict(arguments.get("frontmatter") or {})
    body: str = (arguments.get("body") or "").strip()

    # Enforce canonical fields
    frontmatter["type"] = entity_type
    frontmatter["title"] = title
    if "created_at" not in frontmatter:
        frontmatter["created_at"] = _now_iso()
    if "updated_at" not in frontmatter:
        frontmatter["updated_at"] = _now_iso()

    # Format persona as canonical wikilink if present
    if "persona" in frontmatter and frontmatter["persona"]:
        p_clean = _clean_title(frontmatter["persona"])
        if p_clean:
            frontmatter["persona"] = f"[[{p_clean}]]"

    # Inject source_input provenance automatically if available
    if source_input and "source_input" not in frontmatter:
        frontmatter["source_input"] = source_input


    # Determine target path
    rel_path = (arguments.get("path") or "").strip().lstrip("/")
    if entity_type == "session_note":
        doc_date = str(frontmatter.get("date") or "").strip()
        person_val = _clean_title(frontmatter.get("person")) or _clean_title(frontmatter.get("group")) or ""
        if rel_path:
            # If path was explicitly passed, clean both path stem and title
            passed_stem = Path(rel_path).stem
            canonical_name, clean_title = format_canonical_session_filename(doc_date, person_val, passed_stem)
            rel_path = f"sessions/{canonical_name}.md"
            _, clean_t = format_canonical_session_filename(doc_date, person_val, title)
            title = clean_t
        else:
            canonical_name, clean_title = format_canonical_session_filename(doc_date, person_val, title)
            title = clean_title
            rel_path = f"sessions/{canonical_name}.md"
        frontmatter["title"] = title
    elif not rel_path:
        folder_map = {
            "person": "persons",
            "group": "groups",
            "persona": "personas",
            "practise_framework": "frameworks",
            "session_note": "sessions",
            "reference": "references",
            "reflection": "reflections",
            "topic": "topics",
            "message": "messages",
        }
        folder = folder_map.get(entity_type, entity_type + "s")
        rel_path = f"{folder}/{_sanitize_filename(title)}.md"

    # Ensure aliases are populated so Obsidian resolves both title and filename stem
    stem = Path(rel_path).stem
    aliases = frontmatter.get("aliases")
    if not isinstance(aliases, list):
        aliases = [] if aliases is None else [str(aliases)]
    if title not in aliases:
        aliases.append(title)
    if stem != title and stem not in aliases:
        aliases.append(stem)
    frontmatter["aliases"] = aliases

    full_path = _resolve_okf_path(okf_root, rel_path)
    if not full_path:
        return {"error": f"Invalid or unsafe path: '{rel_path}'"}

    if full_path.exists():
        existing = MarkdownParser.parse_file(full_path)
        existing_src = str(existing.metadata.get("source_input") or "")

        # If regenerable from raw input, merge and update
        if existing_src or (source_input and existing_src == source_input):
            existing.metadata.update(frontmatter)
            existing.metadata["updated_at"] = _now_iso()
            if body:
                existing.content = body.strip()
            MarkdownParser.write_file(existing, full_path)
            graph.load()
            if touched_paths is not None:
                touched_paths.add(full_path.resolve())
            return {
                "created": False,
                "updated": True,
                "path": rel_path,
                "title": title,
                "type": entity_type,
                "wikilink": f"[[{stem}]]" if stem != title else f"[[{title}]]",
            }

        # Otherwise, the entity is pre-existing or user-authored; do not clobber it
        return {
            "created": False,
            "exists": True,
            "path": rel_path,
            "title": title,
            "type": entity_type,
            "message": f"Entity already exists at '{rel_path}'. Use update_entity or link_entities to modify or link to it.",
        }

    doc = OKFDocument(metadata=frontmatter, content=body)
    MarkdownParser.write_file(doc, full_path)

    if touched_paths is not None:
        touched_paths.add(full_path.resolve())

    graph.load()
    wikilink_val = f"[[{stem}]]" if stem != title else f"[[{title}]]"
    print(f"       -> [TOOL] create_entity: {rel_path} (type={entity_type})")
    return {
        "created": True,
        "path": rel_path,
        "title": title,
        "type": entity_type,
        "wikilink": wikilink_val,
    }


def update_entity(
    arguments: Dict[str, Any],
    *,
    graph,
    okf_root: Path,
    touched_paths: Optional[Set[Path]] = None,
) -> Dict[str, Any]:
    """Update an existing OKF entity's frontmatter and/or body.

    Required: path (relative to okf/) or title
    Optional: frontmatter (dict, merged into existing), body (str, replaces body)
    """
    rel_path = (arguments.get("path") or "").strip().lstrip("/")
    title = (arguments.get("title") or "").strip()

    if not rel_path and title:
        entity = graph.find_by_title(title)
        if not entity or not entity.doc.path:
            return {"error": f"Entity '{title}' not found."}
        try:
            rel_path = str(entity.doc.path.relative_to(okf_root)).replace("\\", "/")
        except ValueError:
            return {"error": "Could not resolve entity path."}

    if not rel_path:
        return {"error": "Provide either 'path' or 'title'."}

    full_path = _resolve_okf_path(okf_root, rel_path)
    if not full_path or not full_path.exists():
        return {"error": f"Entity not found at '{rel_path}'."}

    doc = MarkdownParser.parse_file(full_path)

    new_fm: Dict[str, Any] = dict(arguments.get("frontmatter") or {})
    if new_fm:
        doc.metadata.update(new_fm)

    # Ensure aliases include title and stem
    stem = full_path.stem
    aliases = doc.metadata.get("aliases")
    if not isinstance(aliases, list):
        aliases = [] if aliases is None else [str(aliases)]
    doc_title = doc.title or title
    if doc_title and doc_title not in aliases:
        aliases.append(doc_title)
    if stem != doc_title and stem not in aliases:
        aliases.append(stem)
    doc.metadata["aliases"] = aliases
    doc.metadata["updated_at"] = _now_iso()

    body = arguments.get("body")
    if isinstance(body, str):
        doc.content = body.strip()

    MarkdownParser.write_file(doc, full_path)
    if touched_paths is not None:
        touched_paths.add(full_path.resolve())

    graph.load()
    return {"updated": True, "path": rel_path, "title": doc.title}


def link_entities(
    arguments: Dict[str, Any],
    *,
    graph,
    okf_root: Path,
    touched_paths: Optional[Set[Path]] = None,
) -> Dict[str, Any]:
    """Add a wikilink or frontmatter relation between two entities.

    Args:
        source: title or path of the entity to modify.
        target_title: title of the entity being linked to (must exist).
        field: optional frontmatter list field name (e.g. "groups", "sessions").
               If omitted, a wikilink is appended to a '## Related' section in the body.
    """
    source = (arguments.get("source") or "").strip()
    target_title = (arguments.get("target_title") or "").strip()
    field_name = (arguments.get("field") or "").strip()

    if not source or not target_title:
        return {"error": "Both 'source' and 'target_title' are required."}

    # Resolve source entity (title or path)
    src_entity, full_src = _resolve_entity(graph, okf_root, source)
    if not full_src:
        return {"error": f"Source entity '{source}' not found."}

    # Verify target exists
    tgt_entity, _ = _resolve_entity(graph, okf_root, target_title)
    if not tgt_entity and not _resolve_okf_path(okf_root, target_title.strip().lstrip("/")):
        return {"error": f"Target entity '{target_title}' does not exist. Create it first with create_entity."}

    # For session notes with canonical filenames, use the full filename slug for guaranteed Obsidian resolution
    if tgt_entity and tgt_entity.doc_type == "session_note" and tgt_entity.slug != tgt_entity.title:
        tgt_name = tgt_entity.slug
        link_val = f"[[{tgt_entity.slug}|{tgt_entity.title}]]"
    else:
        tgt_name = tgt_entity.title if tgt_entity else _clean_title(target_title)
        link_val = f"[[{tgt_name}]]"

    doc = MarkdownParser.parse_file(full_src)

    # Auto-detect canonical frontmatter list field if not explicitly specified
    if not field_name:
        src_type = doc.doc_type or (src_entity.doc_type if src_entity else None)
        tgt_type = tgt_entity.doc_type if tgt_entity else None
        if src_type == "person":
            if tgt_type == "session_note":
                field_name = "sessions"
            elif tgt_type == "message":
                field_name = "messages"
            elif tgt_type == "group":
                field_name = "groups"
        elif src_type == "group" and tgt_type == "person":
            field_name = "members"

    if field_name:
        existing = doc.metadata.get(field_name)
        if isinstance(existing, list):
            normalized = [str(x).strip().strip("[]") for x in existing]
            if tgt_name not in normalized and link_val not in [str(x) for x in existing]:
                existing.append(link_val)
        else:
            doc.metadata[field_name] = [link_val]
    else:
        related_line = f"- {link_val}"
        if "## Related" in doc.content:
            lines = doc.content.splitlines()
            insert_at = None
            for i, line in enumerate(lines):
                if line.strip().lower() == "## related":
                    insert_at = i + 1
                    break
            if insert_at is not None:
                section_text = "\n".join(lines[insert_at:])
                if tgt_name not in section_text and link_val not in section_text:
                    lines.insert(insert_at, related_line)
                    doc.content = "\n".join(lines)
        else:
            suffix = f"\n\n## Related\n{related_line}"
            doc.content = (doc.content.rstrip() + suffix)

    doc.metadata["updated_at"] = _now_iso()
    MarkdownParser.write_file(doc, full_src)

    if touched_paths is not None:
        touched_paths.add(full_src.resolve())

    graph.load()
    print(f"       -> [TOOL] link_entities: {source} -> [[{tgt_name}]] (field={field_name or 'body'})")
    return {"linked": True, "source": source, "target": tgt_name, "field": field_name or None}


def delete_entity(
    arguments: Dict[str, Any],
    *,
    graph,
    okf_root: Path,
    touched_paths: Optional[Set[Path]] = None,
) -> Dict[str, Any]:
    """Delete an OKF entity file. Use with caution."""
    rel_path = (arguments.get("path") or "").strip().lstrip("/")
    title = (arguments.get("title") or "").strip()

    if not rel_path and title:
        entity = graph.find_by_title(title)
        if not entity or not entity.doc.path:
            return {"error": f"Entity '{title}' not found."}
        try:
            rel_path = str(entity.doc.path.relative_to(okf_root)).replace("\\", "/")
        except ValueError:
            return {"error": "Could not resolve entity path."}

    if not rel_path:
        return {"error": "Provide either 'path' or 'title'."}

    full_path = _resolve_okf_path(okf_root, rel_path)
    if not full_path or not full_path.exists():
        return {"error": f"Entity not found at '{rel_path}'."}

    if full_path.name == "AGENTS.md":
        return {"error": "Refusing to delete AGENTS.md."}

    full_path.unlink()
    if touched_paths is not None and full_path.resolve() in touched_paths:
        touched_paths.remove(full_path.resolve())

    graph.load()
    print(f"       -> [TOOL] delete_entity: {rel_path}")
    return {"deleted": True, "path": rel_path}


# ---------------------------------------------------------------------------
# Tool registry (OpenAI function-calling schema)
# ---------------------------------------------------------------------------

def get_tool_schemas() -> List[Dict[str, Any]]:
    """Return the list of tool definitions in OpenAI tools[] format."""
    return [
        {
            "type": "function",
            "function": {
                "name": "search_entities",
                "description": (
                    "Search OKF entities in the knowledge base by keyword, title, tag, or content snippet. "
                    "Use this tool to find existing entities before creating new ones."
                ),
                "parameters": {
                    "properties": {
                        "query": {"type": "string", "description": "Search keyword or entity title (e.g. 'audiation', 'Jane Doe')."},
                        "type": {"type": "string", "description": "Optional entity type filter (person, group, session_note, reference, topic, reflection, message, persona, practise_framework)."},
                        "tag": {"type": "string", "description": "Optional tag filter (e.g. 'coaching', 'harmony')."},
                        "limit": {"type": "integer", "description": "Maximum results to return (default: 30)."},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "list_entities",
                "description": (
                    "List OKF entities in the knowledge base. Optionally filter by entity type "
                    "(person, group, session_note, reference, topic, reflection, message, persona, practise_framework) "
                    "and/or subfolder (persons, groups, sessions, references, topics, reflections, messages)."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "type": {"type": "string", "description": "Filter by OKF entity type."},
                        "folder": {"type": "string", "description": "Filter by okf/ subfolder name (e.g. 'persons', 'sessions')."},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "read_entity",
                "description": "Read the full content of an existing OKF entity by title or relative path.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "Entity title (e.g. 'Jane Doe')."},
                        "path": {"type": "string", "description": "Relative path from okf/ (e.g. 'persons/Jane Doe.md')."},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_backlinks",
                "description": "Get all entities that link to this entity (inbound links).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "Entity title (e.g. 'Jane Doe')."},
                        "path": {"type": "string", "description": "Relative path from okf/."},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "create_entity",
                "description": (
                    "Create a new OKF entity file with YAML frontmatter and markdown body. "
                    "The type determines the subfolder if path is omitted. "
                    "Use this for persons, groups, session notes, references, topics, reflections, messages, etc."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "type": {"type": "string", "description": "OKF entity type (person, group, session_note, reference, topic, reflection, message, persona, practise_framework)."},
                        "title": {"type": "string", "description": "Human-readable title for the entity."},
                        "frontmatter": {
                            "type": "object",
                            "description": (
                                "Additional YAML frontmatter fields beyond type/title. "
                                "Include date, stage, person, group, persona ('[[Executive Coach]]', '[[Technical Mentor]]'), tags, reference_type, url, etc. as appropriate."
                            ),
                            "additionalProperties": True,
                        },
                        "body": {"type": "string", "description": "Markdown body content (without frontmatter)."},
                        "path": {"type": "string", "description": "Optional explicit relative path from okf/. Omit to auto-derive."},
                    },
                    "required": ["type", "title"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "update_entity",
                "description": (
                    "Update an existing OKF entity. Merge new frontmatter fields into the existing document "
                    "and/or replace the markdown body."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Relative path from okf/ to the entity file."},
                        "title": {"type": "string", "description": "Entity title (alternative to path)."},
                        "frontmatter": {
                            "type": "object",
                            "description": "Frontmatter fields to merge into the existing document.",
                            "additionalProperties": True,
                        },
                        "body": {"type": "string", "description": "New markdown body (replaces existing)."},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "link_entities",
                "description": (
                    "Add a relationship between two OKF entities. Either add the target to a frontmatter list field "
                    "(e.g. 'groups', 'sessions') or append a wikilink to a '## Related' section in the body."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "source": {"type": "string", "description": "Title or path of the entity to modify."},
                        "target_title": {"type": "string", "description": "Title of the entity to link to (must already exist)."},
                        "field": {"type": "string", "description": "Optional frontmatter list field name (e.g. 'groups', 'sessions'). Omit for body wikilink."},
                    },
                    "required": ["source", "target_title"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_persona_landscape",
                "description": (
                    "Retrieve the macro practice landscape for a persona across all its cohorts/groups, "
                    "clients, session distribution, framework principles, top tags, and previous reflection goals. "
                    "Use this tool to get an overarching view of the entire practice before doing deep dives."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "persona": {"type": "string", "description": "Persona title (e.g. 'Executive Coach', 'Technical Mentor')."},
                        "since": {"type": "string", "description": "Optional start date filter (YYYY-MM-DD)."},
                    },
                    "required": ["persona"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "delete_entity",
                "description": "Delete an OKF entity file. Use only for duplicates or misfiled entities.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Relative path from okf/."},
                        "title": {"type": "string", "description": "Entity title (alternative to path)."},
                    },
                },
            },
        },
    ]


def build_tool_dispatch(
    graph,
    okf_root: Path,
    source_input: Optional[str] = None,
    touched_paths: Optional[Set[Path]] = None,
) -> Dict[str, Any]:
    """Build a dispatch dict of tool name -> bound callable for the LLM loop.

    Each returned callable accepts a single ``arguments`` dict (as parsed from the
    model's tool_call JSON) and returns a JSON-serializable result.
    """
    return {
        "search_entities": lambda args: search_entities(args, graph=graph, okf_root=okf_root),
        "list_entities": lambda args: list_entities(args, graph=graph, okf_root=okf_root),
        "read_entity": lambda args: read_entity(args, graph=graph, okf_root=okf_root),
        "get_backlinks": lambda args: get_backlinks(args, graph=graph, okf_root=okf_root),
        "get_persona_landscape": lambda args: get_persona_landscape(args, graph=graph, okf_root=okf_root),
        "create_entity": lambda args: create_entity(
            args,
            graph=graph,
            okf_root=okf_root,
            source_input=source_input,
            touched_paths=touched_paths,
        ),
        "update_entity": lambda args: update_entity(
            args,
            graph=graph,
            okf_root=okf_root,
            touched_paths=touched_paths,
        ),
        "link_entities": lambda args: link_entities(
            args,
            graph=graph,
            okf_root=okf_root,
            touched_paths=touched_paths,
        ),
        "delete_entity": lambda args: delete_entity(
            args,
            graph=graph,
            okf_root=okf_root,
            touched_paths=touched_paths,
        ),
    }
