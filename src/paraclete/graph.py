import re
from collections import defaultdict, Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Set, Any
from .parser import MarkdownParser, OKFDocument

@dataclass
class OKFEntity:
    doc: OKFDocument
    slug: str
    links_out: List[str] = field(default_factory=list)
    links_in: List[str] = field(default_factory=list)

    @property
    def doc_type(self) -> str:
        return self.doc.doc_type

    @property
    def title(self) -> str:
        return self.doc.title or self.slug

    @property
    def metadata(self) -> Dict[str, Any]:
        return self.doc.metadata

    @property
    def content(self) -> str:
        return self.doc.content

    @property
    def is_client(self) -> bool:
        """Check if entity is marked as a direct client."""
        raw_tags = self.metadata.get("tags", [])
        if not isinstance(raw_tags, list):
            raw_tags = [raw_tags]
        return any(str(t).strip().lower().lstrip("#") == "client" for t in raw_tags if t)

    def extract_action_items(self) -> List[str]:
        """Extract markdown task checkboxes from body."""
        actions = []
        for line in self.content.splitlines():
            line_str = line.strip()
            if line_str.startswith("- [ ]") or line_str.startswith("- [x]"):
                actions.append(line_str)
        return actions

    def extract_pending_actions(self) -> List[str]:
        """Extract unchecked markdown tasks."""
        actions = []
        for line in self.content.splitlines():
            line_str = line.strip()
            if line_str.startswith("- [ ]"):
                actions.append(line_str[5:].strip())
        return actions


class OKFGraph:
    def __init__(self, okf_dir: Path):
        self.okf_dir = okf_dir
        self.entities: Dict[str, OKFEntity] = {} # slug/title -> OKFEntity
        self.by_type: Dict[str, List[OKFEntity]] = defaultdict(list)
        self.by_title: Dict[str, OKFEntity] = {}
        self.title_aliases: Dict[str, str] = {}
        self.load()

    def load(self) -> None:
        self.entities.clear()
        self.by_type.clear()
        self.by_title.clear()

        if not self.okf_dir.exists():
            return

        # 1. Load all OKF documents
        for file_path in self.okf_dir.rglob("*.md"):
            if file_path.is_file() and file_path.name != "AGENTS.md":
                doc = MarkdownParser.parse_file(file_path)
                slug = file_path.stem
                entity = OKFEntity(
                    doc=doc,
                    slug=slug,
                    links_out=doc.get_links()
                )
                self.entities[slug] = entity
                self.by_type[doc.doc_type].append(entity)
                if entity.title:
                    self.by_title[entity.title] = entity
                    self.title_aliases[entity.title.lower()] = entity.title
                # Register aliases
                aliases = doc.metadata.get("aliases", [])
                if isinstance(aliases, list):
                    for a in aliases:
                        if isinstance(a, str) and a:
                            self.title_aliases[a.lower()] = entity.title
                            self.by_title[a] = entity

        # 2. Build bi-directional links
        for slug, entity in self.entities.items():
            for target_title in entity.links_out:
                target_entity = self.find_by_title(target_title)
                if target_entity:
                    target_entity.links_in.append(entity.title)

    def find_by_title(self, title: str) -> Optional[OKFEntity]:
        if not title:
            return None
        clean_title = title.strip().strip("[]")
        # Check by slug
        if clean_title in self.entities:
            return self.entities[clean_title]
        # Check by title
        if clean_title in self.by_title:
            return self.by_title[clean_title]
        # Case-insensitive lookup
        matched_title = self.title_aliases.get(clean_title.lower())
        if matched_title and matched_title in self.by_title:
            return self.by_title[matched_title]
        return None

    def get_persons(self, client_only: bool = False) -> List[Dict[str, Any]]:
        results = []
        for p in self.by_type.get("person", []):
            if client_only and not p.is_client:
                continue
            # Find direct sessions linked to this person
            person_sessions = self.get_sessions_for_entity(p.title, direct_only=True)
            results.append({
                "title": p.title,
                "slug": p.slug,
                "contact_method": p.metadata.get("contact_method"),
                "persona": p.metadata.get("persona"),
                "framework": p.metadata.get("framework"),
                "groups": p.metadata.get("groups", []),
                "tags": p.metadata.get("tags", []),
                "is_client": p.is_client,
                "overview": p.content,
                "summary": p.content,
                "recent_session_count": len(person_sessions),
                "sessions": person_sessions,
                "raw_entity": p
            })
        return sorted(results, key=lambda x: x["title"].lower())

    def get_clients(self) -> List[Dict[str, Any]]:
        """Retrieve only active direct clients (persons with tag 'client')."""
        return self.get_persons(client_only=True)

    def get_groups(self) -> List[Dict[str, Any]]:
        results = []
        all_persons = self.get_persons()
        all_sessions = self.get_sessions()

        for g in self.by_type.get("group", []):
            group_title = g.title
            target_link = f"[[{group_title}]]"

            # Find members from group metadata and person metadata
            raw_members = g.metadata.get("members", [])
            member_names = set()
            for m in raw_members:
                clean = re.sub(r"\[\[(.*?)\]\]", r"\1", str(m)).strip()
                if clean:
                    member_names.add(clean)

            for p in all_persons:
                p_groups = [re.sub(r"\[\[(.*?)\]\]", r"\1", str(grp)).strip() for grp in p.get("groups", [])]
                if group_title in p_groups or g.slug in p_groups:
                    member_names.add(p["title"])

            # Resolve member details
            member_details = []
            client_count = 0
            for m_name in sorted(list(member_names)):
                p_obj = next((p for p in all_persons if p["title"].lower() == m_name.lower() or p["slug"].lower() == m_name.lower()), None)
                if p_obj:
                    member_details.append(p_obj)
                    if p_obj.get("is_client"):
                        client_count += 1
                else:
                    member_details.append({
                        "title": m_name,
                        "slug": m_name,
                        "contact_method": None,
                        "is_client": False,
                        "recent_session_count": 0,
                        "sessions": [],
                    })

            # Find all sessions related to group or any group member with direct sessions
            group_sessions = []
            seen_session_slugs = set()
            for s in all_sessions:
                s_group = str(s.get("group") or "").strip()
                s_person = str(s.get("person") or "").strip()
                clean_person = re.sub(r"\[\[(.*?)\]\]", r"\1", s_person).strip()
                clean_group = re.sub(r"\[\[(.*?)\]\]", r"\1", s_group).strip()

                is_match = (
                    clean_group.lower() == group_title.lower()
                    or s_group == target_link
                    or (clean_person and clean_person in member_names)
                )
                if is_match and s["slug"] not in seen_session_slugs:
                    seen_session_slugs.add(s["slug"])
                    group_sessions.append(s)

            # Extract actions
            action_items = []
            for s in group_sessions:
                if s.get("action_items"):
                    action_items.extend(s["action_items"])

            # Extract mentioned references
            group_refs = set()
            for s in group_sessions:
                for l in s["raw_entity"].links_out:
                    tgt = self.find_by_title(l)
                    if tgt and tgt.doc_type == "reference":
                        group_refs.add(tgt.title)

            results.append({
                "title": g.title,
                "slug": g.slug,
                "description": g.metadata.get("description", ""),
                "persona": g.metadata.get("persona"),
                "framework": g.metadata.get("framework"),
                "members": g.metadata.get("members", []),
                "member_details": member_details,
                "member_count": len(member_details),
                "client_count": client_count,
                "sessions": group_sessions,
                "session_count": len(group_sessions),
                "action_items": action_items,
                "references": sorted(list(group_refs)),
                "tags": g.metadata.get("tags", []),
                "raw_entity": g
            })
        return sorted(results, key=lambda x: x["title"].lower())

    def resolve_entity_persona(self, entity: OKFEntity) -> Optional[str]:
        """Disambiguate and resolve the practitioner persona for an entity using frontmatter, tags, groups, or links."""
        if not entity:
            return None

        known_personas = {p.title.lower(): p.title for p in self.by_type.get("persona", [])}
        for p in self.by_type.get("persona", []):
            known_personas[p.slug.lower()] = p.title
            for a in p.metadata.get("aliases", []):
                if isinstance(a, str):
                    known_personas[a.lower()] = p.title

        # 1. Explicit frontmatter field: persona
        persona_val = entity.metadata.get("persona")
        if persona_val:
            clean = re.sub(r"\[\[(.*?)\]\]", r"\1", str(persona_val)).strip()
            if clean.lower() in known_personas:
                return known_personas[clean.lower()]
            return clean

        # 2. Frontmatter tags (e.g. tags: ["persona/respec"], ["respec"], ["midlife-muso"])
        tags = [str(t).lower().lstrip("#") for t in entity.metadata.get("tags", []) if t]
        for t in tags:
            if t.startswith("persona/"):
                p_slug = t.split("/", 1)[1]
                if p_slug in known_personas:
                    return known_personas[p_slug]
            if t in known_personas:
                return known_personas[t]
            clean_tag = t.replace("-", " ")
            if clean_tag in known_personas:
                return known_personas[clean_tag]

        # 3. Check linked group's persona
        group_val = entity.metadata.get("group")
        if group_val:
            g_clean = re.sub(r"\[\[(.*?)\]\]", r"\1", str(group_val)).strip()
            g_ent = self.find_by_title(g_clean)
            if g_ent:
                g_persona = g_ent.metadata.get("persona")
                if g_persona:
                    clean = re.sub(r"\[\[(.*?)\]\]", r"\1", str(g_persona)).strip()
                    if clean.lower() in known_personas:
                        return known_personas[clean.lower()]
                    return clean
                if g_ent.title.lower() in known_personas:
                    return known_personas[g_ent.title.lower()]

        # 4. Check linked person's persona
        person_val = entity.metadata.get("person") or entity.metadata.get("recipient")
        if person_val:
            p_clean = re.sub(r"\[\[(.*?)\]\]", r"\1", str(person_val)).strip()
            p_ent = self.find_by_title(p_clean)
            if p_ent:
                p_persona = p_ent.metadata.get("persona")
                if p_persona:
                    clean = re.sub(r"\[\[(.*?)\]\]", r"\1", str(p_persona)).strip()
                    if clean.lower() in known_personas:
                        return known_personas[clean.lower()]
                    return clean

        # 5. Check outbound links
        for l in entity.links_out:
            clean_l = l.strip().lower()
            if clean_l in known_personas:
                return known_personas[clean_l]

        return None

    def get_sessions(self) -> List[Dict[str, Any]]:
        results = []
        for s in self.by_type.get("session_note", []):
            actions = s.extract_action_items()
            pending = s.extract_pending_actions()
            resolved_persona = self.resolve_entity_persona(s)
            results.append({
                "title": s.title,
                "slug": s.slug,
                "date": s.metadata.get("date", ""),
                "stage": s.metadata.get("stage", "Capture"),
                "person": s.metadata.get("person"),
                "group": s.metadata.get("group"),
                "persona": resolved_persona,
                "persona_link": f"[[{resolved_persona}]]" if resolved_persona else None,
                "action_items": actions,
                "pending_actions_count": len(pending),
                "summary": s.metadata.get("description", ""),
                "raw_entity": s
            })
        return sorted(results, key=lambda x: str(x.get("date", "")), reverse=True)

    def get_sessions_for_entity(self, title: str, direct_only: bool = False) -> List[Dict[str, Any]]:
        all_sessions = self.get_sessions()
        matched = []
        clean_title = re.sub(r"\[\[(.*?)\]\]", r"\1", str(title or "")).strip().lower()
        target_link = f"[[{title}]]"
        for s in all_sessions:
            s_person = re.sub(r"\[\[(.*?)\]\]", r"\1", str(s.get("person") or "")).strip().lower()
            s_group = re.sub(r"\[\[(.*?)\]\]", r"\1", str(s.get("group") or "")).strip().lower()
            s_persona = str(s.get("persona") or "").strip().lower()
            if (
                s["person"] == target_link
                or s["group"] == target_link
                or s["persona_link"] == target_link
                or s_person == clean_title
                or s_group == clean_title
                or s_persona == clean_title
            ):
                matched.append(s)
            elif not direct_only and (title in s["raw_entity"].links_out or clean_title in [l.lower() for l in s["raw_entity"].links_out]):
                matched.append(s)
        return matched



    def get_frameworks(self) -> List[Dict[str, Any]]:
        results = []
        for f in self.by_type.get("practise_framework", []):
            results.append({
                "title": f.title,
                "slug": f.slug,
                "is_core": bool(f.metadata.get("is_core", False)),
                "raw_entity": f
            })
        return sorted(results, key=lambda x: (not x["is_core"], x["title"].lower()))

    def get_references(self) -> List[Dict[str, Any]]:
        results = []
        for r in self.by_type.get("reference", []):
            results.append({
                "title": r.title,
                "slug": r.slug,
                "reference_type": r.metadata.get("reference_type", "CONCEPT"),
                "url": r.metadata.get("url"),
                "tags": r.metadata.get("tags", []),
                "raw_entity": r
            })
        return sorted(results, key=lambda x: x["title"].lower())

    def get_topics(self) -> List[Dict[str, Any]]:
        results = []
        for t in self.by_type.get("topic", []):
            results.append({
                "title": t.title,
                "slug": t.slug,
                "status": t.metadata.get("status", "active"),
                "tags": t.metadata.get("tags", []),
                "raw_entity": t
            })
        return sorted(results, key=lambda x: x["title"].lower())

    def get_reflections(self) -> List[Dict[str, Any]]:
        results = []
        for ref in self.by_type.get("reflection", []):
            persona_val = ref.metadata.get("persona")
            clean_persona = re.sub(r"\[\[(.*?)\]\]", r"\1", str(persona_val or "")).strip() if persona_val else None
            framework_val = ref.metadata.get("framework")
            clean_framework = re.sub(r"\[\[(.*?)\]\]", r"\1", str(framework_val or "")).strip() if framework_val else None
            
            raw_reviewed = ref.metadata.get("reviewed_persons", [])
            reviewed_persons = []
            if isinstance(raw_reviewed, list):
                for p_str in raw_reviewed:
                    c = re.sub(r"\[\[(.*?)\]\]", r"\1", str(p_str)).strip()
                    if c:
                        reviewed_persons.append(c)

            results.append({
                "title": ref.title,
                "slug": ref.slug,
                "date": ref.metadata.get("date") or ref.metadata.get("created_at", ""),
                "persona": clean_persona,
                "framework": clean_framework,
                "reviewed_persons": reviewed_persons,
                "previous_reflection": ref.metadata.get("previous_reflection"),
                "energy_rating": ref.metadata.get("energy_rating"),
                "tags": ref.metadata.get("tags", []),
                "raw_entity": ref
            })
        return sorted(results, key=lambda x: str(x.get("date", "")), reverse=True)

    def get_messages(self) -> List[Dict[str, Any]]:
        results = []
        for m in self.by_type.get("message", []):
            resolved_persona = self.resolve_entity_persona(m)
            person_val = m.metadata.get("person") or m.metadata.get("recipient")
            clean_person = re.sub(r"\[\[(.*?)\]\]", r"\1", str(person_val or "")).strip() if person_val else None
            results.append({
                "title": m.title,
                "slug": m.slug,
                "recipient": clean_person or m.metadata.get("recipient"),
                "person": clean_person,
                "persona": resolved_persona,
                "persona_link": f"[[{resolved_persona}]]" if resolved_persona else None,
                "related_session": m.metadata.get("related_session"),
                "date": m.metadata.get("date") or m.metadata.get("created_at", ""),
                "stage": m.metadata.get("stage") or m.metadata.get("status", "Draft"),
                "tags": m.metadata.get("tags", []),
                "raw_entity": m
            })
        return sorted(results, key=lambda x: str(x.get("date", "")), reverse=True)

    def get_personas(self) -> List[Dict[str, Any]]:
        results = []
        all_reflections = self.get_reflections()

        for p in self.by_type.get("persona", []):
            p_title = p.title
            p_clean = p_title.lower()

            # Find linked direct client members
            member_names = set(self.get_persona_clients(p_title))

            # Find persona reflections
            persona_reflections = [
                r for r in all_reflections
                if (r.get("persona") and r["persona"].lower() == p_clean)
                or p_title in (r["raw_entity"].links_out if r.get("raw_entity") else [])
            ]

            last_ref = persona_reflections[0] if persona_reflections else None
            last_date = str(last_ref["date"]) if last_ref else None

            # Calculate days elapsed since last reflection
            days_elapsed = None
            if last_date:
                try:
                    d_parsed = datetime.strptime(last_date[:10], "%Y-%m-%d").date()
                    days_elapsed = (datetime.now(timezone.utc).date() - d_parsed).days
                except Exception:
                    days_elapsed = None

            framework_val = p.metadata.get("framework")
            clean_framework = re.sub(r"\[\[(.*?)\]\]", r"\1", str(framework_val or "")).strip() if framework_val else None

            results.append({
                "title": p.title,
                "slug": p.slug,
                "framework": clean_framework,
                "members": sorted(list(member_names)),
                "member_count": len(member_names),
                "last_reflection_date": last_date,
                "last_reflection_slug": last_ref["slug"] if last_ref else None,
                "last_reflection_title": last_ref["title"] if last_ref else None,
                "days_since_reflection": days_elapsed,
                "reflection_count": len(persona_reflections),
                "reflections": persona_reflections,
                "tags": p.metadata.get("tags", []),
                "raw_entity": p
            })
        return sorted(results, key=lambda x: x["title"].lower())

    def get_latest_reflection_for_persona(self, persona_name: str) -> Optional[Dict[str, Any]]:
        """Retrieve the most recent canonical reflection entity for a given persona."""
        if not persona_name:
            return None
        clean_name = persona_name.strip().lower()
        all_reflections = self.get_reflections()
        for ref in all_reflections:
            p = ref.get("persona")
            if p and p.strip().lower() == clean_name:
                return ref
            # Check by links
            if ref.get("raw_entity"):
                out_links = [l.lower() for l in ref["raw_entity"].links_out]
                if clean_name in out_links or f"persona: {clean_name}" in out_links:
                    return ref
        return None

    def get_persona_groups(self, persona_name: str) -> List[Dict[str, Any]]:
        """Find all group dictionaries associated with a persona."""
        if not persona_name:
            return []
        clean_name = persona_name.strip().lower()
        groups = []
        for g in self.get_groups():
            grp_persona = re.sub(r"\[\[(.*?)\]\]", r"\1", str(g.get("persona") or "")).strip().lower()
            if grp_persona == clean_name or g.get("title", "").lower() == clean_name:
                groups.append(g)
            elif g.get("raw_entity") and any(clean_name == l.lower() for l in g["raw_entity"].links_out):
                groups.append(g)
        return sorted(groups, key=lambda x: x["title"].lower())

    def get_persona_clients(self, persona_name: str) -> List[str]:
        """Find all direct client person titles associated with a persona across all its groups and direct links."""
        if not persona_name:
            return []
        clean_name = persona_name.strip().lower()
        clients = set()
        
        # Check persona entity members (only client persons)
        for p in self.by_type.get("persona", []):
            if p.title.lower() == clean_name or p.slug.lower() == clean_name:
                for m in p.metadata.get("members", []):
                    clean = re.sub(r"\[\[(.*?)\]\]", r"\1", str(m)).strip()
                    m_entity = self.find_by_title(clean)
                    if clean and (not m_entity or m_entity.is_client):
                        clients.add(clean)

        # Check groups referencing this persona (all member clients)
        for g in self.get_persona_groups(persona_name):
            for m in g.get("members", []):
                clean = re.sub(r"\[\[(.*?)\]\]", r"\1", str(m)).strip()
                m_entity = self.find_by_title(clean)
                if clean and (not m_entity or m_entity.is_client):
                    clients.add(clean)

        # Check direct clients referencing persona
        for person in self.get_clients():
            pers_persona = re.sub(r"\[\[(.*?)\]\]", r"\1", str(person.get("persona") or "")).strip()
            if pers_persona.lower() == clean_name:
                clients.add(person["title"])
            elif person.get("raw_entity") and any(clean_name == l.lower() for l in person["raw_entity"].links_out):
                clients.add(person["title"])

        # Check sessions explicitly conducted under this persona
        for s in self.get_sessions():
            s_persona = (s.get("persona") or "").strip().lower()
            if s_persona == clean_name:
                s_person = str(s.get("person") or "").strip()
                clean_person = re.sub(r"\[\[(.*?)\]\]", r"\1", s_person).strip()
                if clean_person:
                    p_ent = self.find_by_title(clean_person)
                    if not p_ent or p_ent.is_client:
                        clients.add(clean_person)

        return sorted(list(clients))

    def get_sessions_since(self, date_str: Optional[str] = None, persona_name: Optional[str] = None) -> List[Dict[str, Any]]:
        """Retrieve session notes optionally filtered by start date and/or persona."""
        all_sessions = self.get_sessions()
        clean_target_persona = persona_name.strip().lower() if persona_name else None
        persona_clients = set(self.get_persona_clients(persona_name)) if persona_name else None
        persona_groups = {g["title"].lower() for g in self.get_persona_groups(persona_name)} if persona_name else set()

        filtered = []
        for s in all_sessions:
            s_date = str(s.get("date") or "")
            if date_str and s_date < date_str:
                continue

            if clean_target_persona:
                s_persona = str(s.get("persona") or "").strip().lower()
                # 1. Authoritative check: If session explicitly specifies persona, check exact match
                if s_persona:
                    if s_persona != clean_target_persona:
                        continue
                    filtered.append(s)
                    continue

                # 2. Fallback check: If session does not have persona tag yet, infer from group, links, or client list
                s_person = str(s.get("person") or "").strip()
                clean_person = re.sub(r"\[\[(.*?)\]\]", r"\1", s_person).strip()
                s_group = str(s.get("group") or "").strip()
                clean_group = re.sub(r"\[\[(.*?)\]\]", r"\1", s_group).strip()

                is_match = (
                    clean_group.lower() == clean_target_persona
                    or clean_group.lower() in persona_groups
                    or (clean_person in persona_clients if persona_clients else False)
                    or (s.get("raw_entity") and any(clean_target_persona == l.lower() for l in s["raw_entity"].links_out))
                )
                if not is_match:
                    continue

            filtered.append(s)

        return filtered

    def get_persona_landscape(self, persona_name: str, since_date: Optional[str] = None) -> Dict[str, Any]:
        """Construct a comprehensive macro practice landscape for a persona across all its groups and clients."""
        clean_name = persona_name.strip().lower()

        # 1. Resolve Persona Entity & Framework
        persona_entity = self.find_by_title(clean_name)
        if not persona_entity:
            for p_dict in self.get_personas():
                if p_dict["title"].lower() == clean_name or p_dict["slug"].lower() == clean_name:
                    clean_name = p_dict["title"].lower()
                    persona_entity = self.find_by_title(p_dict["title"])
                    break

        persona_title = persona_entity.title if persona_entity else persona_name
        framework_title = None
        framework_principles = []
        framework_tone = []
        if persona_entity:
            f_val = persona_entity.metadata.get("framework")
            if f_val:
                framework_title = re.sub(r"\[\[(.*?)\]\]", r"\1", str(f_val)).strip()
                f_entity = self.find_by_title(framework_title)
                if f_entity:
                    body = f_entity.content
                    for section, target_list in [("Principles", framework_principles), ("Tone", framework_tone)]:
                        m = re.search(rf"##\s+{section}\s*(.*?)(?=\n##|\Z)", body, re.DOTALL | re.IGNORECASE)
                        if m:
                            for line in m.group(1).splitlines():
                                line_s = line.strip().lstrip("-* \t")
                                if line_s:
                                    target_list.append(line_s)

        # 2. Previous Reflection
        last_ref = self.get_latest_reflection_for_persona(persona_title)
        prev_reflection_info = None
        if last_ref:
            raw_ent = last_ref.get("raw_entity")
            prev_reflection_info = {
                "title": last_ref.get("title"),
                "date": last_ref.get("date"),
                "energy_rating": last_ref.get("energy_rating"),
                "reviewed_persons": last_ref.get("reviewed_persons", []),
                "summary": raw_ent.content[:400] if raw_ent else ""
            }

        # 3. Associated Groups & Cohorts
        persona_groups = self.get_persona_groups(persona_title)
        group_summaries = []
        all_group_member_names = set()

        for g in persona_groups:
            g_title = g["title"]
            g_members = g.get("members", [])
            clean_members = [re.sub(r"\[\[(.*?)\]\]", r"\1", str(m)).strip() for m in g_members]
            all_group_member_names.update(clean_members)

            g_sessions = [
                s for s in g.get("sessions", [])
                if not since_date or str(s.get("date") or "") >= since_date
            ]
            group_summaries.append({
                "title": g_title,
                "description": g.get("description", ""),
                "members": clean_members,
                "client_count": g.get("client_count", len(clean_members)),
                "sessions_in_window_count": len(g_sessions),
                "recent_sessions": [
                    {
                        "date": s.get("date"),
                        "title": s.get("title"),
                        "person": s.get("person"),
                        "summary": s.get("summary", "")[:140]
                    }
                    for s in g_sessions[:8]
                ]
            })

        # 4. Direct / 1-on-1 Clients and Session Distribution
        all_persona_clients = self.get_persona_clients(persona_title)
        all_sessions_in_window = self.get_sessions_since(since_date, persona_title)

        client_summaries = []
        for c_name in all_persona_clients:
            c_sessions = [
                s for s in all_sessions_in_window
                if re.sub(r"\[\[(.*?)\]\]", r"\1", str(s.get("person") or "")).strip().lower() == c_name.lower()
            ]
            if c_sessions:
                client_summaries.append({
                    "name": c_name,
                    "session_count_in_window": len(c_sessions),
                    "is_in_group": c_name in all_group_member_names,
                    "recent_sessions": [
                        {
                            "date": s.get("date"),
                            "title": s.get("title"),
                            "group": s.get("group"),
                            "summary": s.get("summary", "")[:140]
                        }
                        for s in c_sessions[:5]
                    ]
                })

        client_summaries = sorted(client_summaries, key=lambda x: x["session_count_in_window"], reverse=True)

        # 5. Top Topics / Tags & Open Action Items across the window
        tag_counter = Counter()
        open_action_items = []
        for s in all_sessions_in_window:
            for t in (s.get("raw_entity").metadata.get("tags", []) if s.get("raw_entity") else []):
                tag_counter[str(t).lower().lstrip("#")] += 1
            if s.get("raw_entity"):
                pending = s["raw_entity"].extract_pending_actions()
                for p_act in pending:
                    open_action_items.append(f"[{s.get('date')} - {s.get('person') or s.get('group')}] {p_act}")

        # 6. Messages sent in window
        all_messages = self.get_messages()
        persona_messages = []
        for m in all_messages:
            m_date = str(m.get("date") or "")
            if since_date and m_date < since_date:
                continue
            recip = str(m.get("recipient") or m.get("person") or "")
            if recip in all_persona_clients or (m.get("persona") and m["persona"].lower() == clean_name):
                persona_messages.append({
                    "date": m.get("date"),
                    "title": m.get("title"),
                    "recipient": recip,
                    "stage": m.get("stage"),
                })

        return {
            "persona": persona_title,
            "framework": framework_title,
            "framework_principles": framework_principles,
            "framework_tone": framework_tone,
            "previous_reflection": prev_reflection_info,
            "since_date": since_date or "Beginning of Records",
            "total_sessions_in_window": len(all_sessions_in_window),
            "total_groups_count": len(persona_groups),
            "groups": group_summaries,
            "active_clients": client_summaries,
            "top_tags": [tag for tag, count in tag_counter.most_common(12)],
            "open_action_items": open_action_items[:12],
            "recent_messages_count": len(persona_messages),
            "recent_messages": persona_messages[:10]
        }




