import sqlite3
import re
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

from .parser import MarkdownParser, OKFDocument
from .indexer import Indexer

def sanitize_filename(text: str) -> str:
    """Sanitize string for clean, human-readable filenames on Windows and Unix."""
    clean = re.sub(r'[\\/*?:"<>|]', "", str(text or "")).strip()
    return clean or "Untitled"

class Migrator:
    def __init__(self, db_path: Path, vault_root: Path):
        self.db_path = db_path
        self.vault_root = vault_root
        self.okf_dir = vault_root / "okf"
        self.input_dir = vault_root / "input"
        self.indexer = Indexer(vault_root / ".paraclete" / "cache.json", vault_root)

    def migrate(self) -> Dict[str, int]:
        """Migrate all SQLite tables to OKF Markdown and raw input files."""
        if not self.db_path.exists():
            raise FileNotFoundError(f"Database not found at {self.db_path}")

        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        stats = {
            "persons": 0,
            "groups": 0,
            "personas": 0,
            "frameworks": 0,
            "sessions": 0,
            "messages": 0,
            "references": 0,
            "topics": 0,
            "reflections": 0,
        }

        # 1. Lookup Caches
        tags_cache = {row["id"]: row["value"] for row in cur.execute("SELECT id, value FROM tags").fetchall()}
        frameworks_cache = {row["id"]: row["name"] for row in cur.execute("SELECT id, name FROM practise_frameworks").fetchall()}
        personas_cache = {row["id"]: row["name"] for row in cur.execute("SELECT id, name FROM personas").fetchall()}
        persons_cache = {row["id"]: row["name"] for row in cur.execute("SELECT id, name FROM persons").fetchall()}
        groups_cache = {row["id"]: row["name"] for row in cur.execute("SELECT id, name FROM groups").fetchall()}

        # 2. Migrate Practise Frameworks
        framework_rows = cur.execute("SELECT * FROM practise_frameworks").fetchall()
        for f_row in framework_rows:
            f_id = f_row["id"]
            f_name = sanitize_filename(f_row["name"] or f"Framework {f_id}")
            is_core = bool(f_row["is_core"])
            
            items = cur.execute("SELECT aspect, value FROM practise_framework_items WHERE framework_id = ?", (f_id,)).fetchall()
            by_aspect = {}
            for it in items:
                aspect = it["aspect"] or "Principles"
                by_aspect.setdefault(aspect, []).append(it["value"])

            doc_body = f"# {f_name}\n\n"
            for aspect, vals in by_aspect.items():
                doc_body += f"## {aspect}\n"
                for v in vals:
                    doc_body += f"- {v}\n"
                doc_body += "\n"

            doc = OKFDocument(
                metadata={
                    "type": "practise_framework",
                    "title": f_name,
                    "aliases": [f_name],
                    "is_core": is_core,
                    "tags": ["framework"]
                },
                content=doc_body.strip()
            )
            out_file = self.okf_dir / "frameworks" / f"{f_name}.md"
            MarkdownParser.write_file(doc, out_file)
            stats["frameworks"] += 1

        # 3. Migrate Personas
        persona_rows = cur.execute("SELECT * FROM personas").fetchall()
        for p_row in persona_rows:
            p_name = sanitize_filename(p_row["name"])
            p_desc = p_row["description"] or ""
            f_name = frameworks_cache.get(p_row["framework_id"])
            f_link = f"[[{sanitize_filename(f_name)}]]" if f_name else None

            doc_body = f"# {p_name}\n\n{p_desc}\n"
            if f_link:
                doc_body += f"\n## Framework\n- {f_link}\n"

            doc = OKFDocument(
                metadata={
                    "type": "persona",
                    "title": p_name,
                    "aliases": [p_name],
                    "avatar_logo": p_row["avatar_logo"],
                    "framework": f_link,
                    "tags": ["persona"]
                },
                content=doc_body.strip()
            )
            out_file = self.okf_dir / "personas" / f"{p_name}.md"
            MarkdownParser.write_file(doc, out_file)
            stats["personas"] += 1

        # 4. Migrate Groups
        group_rows = cur.execute("SELECT * FROM groups").fetchall()
        for g_row in group_rows:
            g_id = g_row["id"]
            g_name = sanitize_filename(g_row["name"])
            g_desc = g_row["description"] or ""
            
            members = cur.execute(
                "SELECT p.name FROM group_members gm JOIN persons p ON gm.person_id = p.id WHERE gm.group_id = ?",
                (g_id,)
            ).fetchall()
            member_links = [f"[[{sanitize_filename(m['name'])}]]" for m in members if m["name"]]

            g_tags = cur.execute(
                "SELECT t.value FROM group_tags gt JOIN tags t ON gt.tag_id = t.id WHERE gt.group_id = ?",
                (g_id,)
            ).fetchall()
            tag_list = [t["value"] for t in g_tags if t["value"]]

            persona_name = personas_cache.get(g_row["persona_id"])
            framework_name = frameworks_cache.get(g_row["custom_framework_id"])

            doc_body = f"# {g_name}\n\n{g_desc}\n\n## Members\n"
            for ml in member_links:
                doc_body += f"- {ml}\n"

            doc = OKFDocument(
                metadata={
                    "type": "group",
                    "title": g_name,
                    "aliases": [g_name],
                    "description": g_desc,
                    "members": member_links,
                    "persona": f"[[{sanitize_filename(persona_name)}]]" if persona_name else None,
                    "framework": f"[[{sanitize_filename(framework_name)}]]" if framework_name else None,
                    "tags": tag_list or ["cohort"],
                    "created_at": g_row["created_at"],
                    "updated_at": g_row["updated_at"]
                },
                content=doc_body.strip()
            )
            out_file = self.okf_dir / "groups" / f"{g_name}.md"
            MarkdownParser.write_file(doc, out_file)
            stats["groups"] += 1

        # 5. Migrate Persons
        person_rows = cur.execute("SELECT * FROM persons").fetchall()
        for p_row in person_rows:
            p_id = p_row["id"]
            p_name = sanitize_filename(p_row["name"])
            
            p_tags = cur.execute(
                "SELECT t.value FROM person_tags pt JOIN tags t ON pt.tag_id = t.id WHERE pt.person_id = ?",
                (p_id,)
            ).fetchall()
            tag_list = [t["value"] for t in p_tags if t["value"]]

            p_groups = cur.execute(
                "SELECT g.name FROM group_members gm JOIN groups g ON gm.group_id = g.id WHERE gm.person_id = ?",
                (p_id,)
            ).fetchall()
            group_links = [f"[[{sanitize_filename(g['name'])}]]" for g in p_groups if g["name"]]

            persona_name = personas_cache.get(p_row["persona_id"])
            framework_name = frameworks_cache.get(p_row["custom_framework_id"])

            doc_body = f"# {p_name}\n\n## Overview\nClient dossier for {p_name}.\n"
            if group_links:
                doc_body += "\n## Cohorts & Groups\n"
                for gl in group_links:
                    doc_body += f"- {gl}\n"

            doc = OKFDocument(
                metadata={
                    "type": "person",
                    "title": p_name,
                    "aliases": [p_name],
                    "contact_method": p_row["contact_method"],
                    "avatar_logo": p_row["avatar_logo"],
                    "persona": f"[[{sanitize_filename(persona_name)}]]" if persona_name else None,
                    "framework": f"[[{sanitize_filename(framework_name)}]]" if framework_name else None,
                    "groups": group_links,
                    "tags": tag_list or ["client"],
                    "created_at": p_row["created_at"],
                    "updated_at": p_row["updated_at"]
                },
                content=doc_body.strip()
            )
            out_file = self.okf_dir / "persons" / f"{p_name}.md"
            MarkdownParser.write_file(doc, out_file)
            stats["persons"] += 1

        # 6. Migrate References
        ref_rows = cur.execute("SELECT * FROM \"references\"").fetchall()
        for r_row in ref_rows:
            r_title = sanitize_filename(r_row["title"])
            r_type = r_row["type"] or "CONCEPT"
            r_body = r_row["body"] or ""
            r_url = r_row["url"]

            doc_body = f"# {r_title}\n\n{r_body}\n"
            if r_url:
                doc_body += f"\n**Reference URL**: [{r_url}]({r_url})\n"

            doc = OKFDocument(
                metadata={
                    "type": "reference",
                    "title": r_title,
                    "aliases": [r_title],
                    "reference_type": r_type,
                    "url": r_url,
                    "tags": ["reference", r_type.lower()],
                    "created_at": r_row["created_at"]
                },
                content=doc_body.strip()
            )
            out_file = self.okf_dir / "references" / f"{r_title}.md"
            MarkdownParser.write_file(doc, out_file)
            stats["references"] += 1

        # 7. Migrate Notes (Session Notes + Raw Inputs)
        note_rows = cur.execute("SELECT * FROM notes").fetchall()
        used_session_filenames = set()

        for n_row in note_rows:
            n_id = n_row["id"]
            title = sanitize_filename(n_row["title"] or f"Session {n_id}")
            date_str = str(n_row["date"] or "")
            stage = n_row["stage"] or "Published"
            raw_capture = n_row["raw_capture"] or ""
            cleaned_text = n_row["cleaned_text"] or ""
            session_brief = n_row["session_brief"] or ""
            person_name = persons_cache.get(n_row["person_id"])
            group_name = groups_cache.get(n_row["group_id"])
            entity_name = person_name or group_name or ""

            # Actions
            actions = cur.execute("SELECT text, resolved FROM actions WHERE note_id = ?", (n_id,)).fetchall()
            
            # Tags
            n_tags = cur.execute(
                "SELECT t.value FROM note_tags nt JOIN tags t ON nt.tag_id = t.id WHERE nt.note_id = ?",
                (n_id,)
            ).fetchall()
            tag_list = [t["value"] for t in n_tags if t["value"]]

            # Build canonical session note filename: "YYYY-MM-DD - Entity - Title"
            parts = []
            if date_str:
                parts.append(date_str)
            if entity_name and entity_name.lower() not in title.lower():
                parts.append(entity_name)
            parts.append(title)
            
            base_filename = " - ".join(parts)
            clean_filename = sanitize_filename(base_filename)
            
            final_filename = clean_filename
            counter = 1
            while final_filename in used_session_filenames:
                final_filename = f"{clean_filename} ({counter})"
                counter += 1
            used_session_filenames.add(final_filename)

            raw_input_path = self.input_dir / "sessions" / f"{final_filename} (Raw).md"
            raw_input_content = f"# Raw Capture: {title}\nDate: {date_str}\n\n{raw_capture or cleaned_text}\n"
            raw_input_path.parent.mkdir(parents=True, exist_ok=True)
            raw_input_path.write_text(raw_input_content, encoding="utf-8")

            # Build OKF Session Note
            doc_body = f"# {title}\n\n"
            if session_brief:
                doc_body += f"## Session Brief\n{session_brief}\n\n"
            
            doc_body += f"## Session Notes\n{cleaned_text or raw_capture}\n\n"

            if actions:
                doc_body += "## Action Items\n"
                for act in actions:
                    mark = "x" if act["resolved"] else " "
                    doc_body += f"- [{mark}] {act['text']}\n"
                doc_body += "\n"

            rel_input = str(raw_input_path.relative_to(self.vault_root)).replace("\\", "/")
            person_link = f"[[{sanitize_filename(person_name)}]]" if person_name else None
            group_link = f"[[{sanitize_filename(group_name)}]]" if group_name else None

            doc = OKFDocument(
                metadata={
                    "type": "session_note",
                    "title": title,
                    "aliases": [title, final_filename],
                    "date": date_str,
                    "stage": stage,
                    "person": person_link,
                    "group": group_link,
                    "source_input": rel_input,
                    "tags": tag_list or ["session"],
                    "created_at": n_row["created_at"]
                },
                content=doc_body.strip()
            )
            okf_file = self.okf_dir / "sessions" / f"{final_filename}.md"
            MarkdownParser.write_file(doc, okf_file)

            # Record in Indexer cache
            self.indexer.update_entry(raw_input_path, okf_file)
            stats["sessions"] += 1

        # 8. Migrate Messages
        message_rows = cur.execute("SELECT * FROM messages").fetchall()
        for m_row in message_rows:
            m_id = m_row["id"]
            date_str = str(m_row["date"] or "")
            status = m_row["status"] or "draft"
            draft_text = m_row["draft_text"] or ""
            sent_text = m_row["sent_text"] or ""
            person_name = persons_cache.get(m_row["person_id"])
            group_name = groups_cache.get(m_row["group_id"])

            m_title = sanitize_filename(f"Message {m_id} ({date_str})" if date_str else f"Message {m_id}")
            doc_body = f"# {m_title}\n\n"
            if sent_text:
                doc_body += f"## Sent Message\n{sent_text}\n\n"
            if draft_text and draft_text != sent_text:
                doc_body += f"## Draft\n{draft_text}\n\n"

            person_link = f"[[{sanitize_filename(person_name)}]]" if person_name else None
            group_link = f"[[{sanitize_filename(group_name)}]]" if group_name else None

            doc = OKFDocument(
                metadata={
                    "type": "message",
                    "title": m_title,
                    "aliases": [m_title],
                    "date": date_str,
                    "status": status,
                    "person": person_link,
                    "group": group_link,
                    "tags": ["message", status],
                    "sent_at": m_row["sent_at"],
                    "created_at": m_row["created_at"],
                    "updated_at": m_row["updated_at"]
                },
                content=doc_body.strip()
            )
            out_file = self.okf_dir / "messages" / f"{m_title}.md"
            MarkdownParser.write_file(doc, out_file)
            stats["messages"] += 1

        # 9. Migrate Reflections & Topics
        for r_row in cur.execute("SELECT * FROM reflections").fetchall():
            r_id = r_row["id"]
            r_content = r_row["content"]
            person_name = persons_cache.get(r_row["person_id"])
            r_title = sanitize_filename(f"Reflection {r_id}")
            person_link = f"[[{sanitize_filename(person_name)}]]" if person_name else None
            doc = OKFDocument(
                metadata={
                    "type": "reflection",
                    "title": r_title,
                    "aliases": [r_title],
                    "person": person_link,
                    "tags": ["reflection"],
                    "created_at": r_row["created_at"],
                    "updated_at": r_row["updated_at"]
                },
                content=f"# {r_title}\n\n{r_content}"
            )
            out_file = self.okf_dir / "reflections" / f"{r_title}.md"
            MarkdownParser.write_file(doc, out_file)
            stats["reflections"] += 1

        for t_row in cur.execute("SELECT * FROM topics").fetchall():
            t_id = t_row["id"]
            t_title = sanitize_filename(t_row["title"] or f"Topic {t_id}")
            person_link = f"[[{sanitize_filename(persons_cache.get(t_row['person_id']))}]]" if persons_cache.get(t_row["person_id"]) else None
            doc = OKFDocument(
                metadata={
                    "type": "topic",
                    "title": t_title,
                    "aliases": [t_title],
                    "state": t_row["state"] or "active",
                    "person": person_link,
                    "tags": ["topic", t_row["state"] or "active"],
                    "created_at": t_row["created_at"],
                    "updated_at": t_row["updated_at"]
                },
                content=f"# {t_title}\n\n{t_row['summary'] or ''}"
            )
            out_file = self.okf_dir / "topics" / f"{t_title}.md"
            MarkdownParser.write_file(doc, out_file)
            stats["topics"] += 1

        conn.close()
        return stats
