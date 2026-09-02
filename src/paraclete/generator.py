from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional
from collections import defaultdict
import jinja2

from .config import AppConfig
from .graph import OKFGraph

def table_wikilink(slug: str, title: Optional[str] = None) -> str:
    if not slug:
        return "-"
    if not title or slug == title:
        return f"[[{slug}]]"
    return f"[[{slug}\\|{title}]]"

def table_escape(val: Any) -> str:
    if val is None:
        return "-"
    s = str(val)
    # Replace unescaped pipes with escaped pipes for markdown table compatibility
    return s.replace("|", "\\|")

class Generator:
    def __init__(self, config: AppConfig, graph: OKFGraph):
        self.config = config
        self.graph = graph
        templates_dir = self.config.get_path(self.config.paths.templates_dir)
        self.jinja_env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(str(templates_dir)),
            autoescape=False,
            trim_blocks=True,
            lstrip_blocks=True
        )
        self.jinja_env.filters["table_wikilink"] = table_wikilink
        self.jinja_env.filters["table_escape"] = table_escape

    def is_dataview_enabled(self) -> bool:
        """Check if the Dataview community plugin is installed and enabled in the Obsidian vault."""
        plugins_file = self.config.vault_root / ".obsidian" / "community-plugins.json"
        if plugins_file.exists():
            try:
                import json
                plugins = json.loads(plugins_file.read_text(encoding="utf-8"))
                return "dataview" in plugins
            except Exception:
                return False
        return False

    def generate_all(self) -> List[Path]:
        """Deterministically generate all output documents from the OKF graph."""
        output_dir = self.config.get_path(self.config.paths.output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        generated_files = []

        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        has_dataview = self.is_dataview_enabled()

        # 1. Practice Overview Dashboard & Cohort Overviews
        dashboards_dir = output_dir / "dashboards"
        dashboards_dir.mkdir(parents=True, exist_ok=True)

        overview_template = self.jinja_env.get_template("practice_overview.jinja.md")
        overview_content = overview_template.render(
            generated_at=now_str,
            has_dataview=has_dataview,
            persons=self.graph.get_clients(),
            groups=self.graph.get_groups(),
            personas=self.graph.get_personas(),
            reflections=self.graph.get_reflections(),
            sessions=self.graph.get_sessions(),
            references=self.graph.get_references(),
            frameworks=self.graph.get_frameworks(),
        )
        overview_path = dashboards_dir / "practice-overview.md"
        overview_path.write_text(overview_content, encoding="utf-8")
        generated_files.append(overview_path)

        # Live Interactive Dataview Hub (if template exists)
        try:
            live_hub_template = self.jinja_env.get_template("live_practice_hub.jinja.md")
            live_hub_content = live_hub_template.render(
                generated_at=now_str,
                has_dataview=has_dataview,
            )
            live_hub_path = dashboards_dir / "live-practice-hub.md"
            live_hub_path.write_text(live_hub_content, encoding="utf-8")
            generated_files.append(live_hub_path)
        except jinja2.TemplateNotFound:
            pass

        # Cohort / Group Overviews
        group_template = self.jinja_env.get_template("group_overview.jinja.md")
        for group in self.graph.get_groups():
            group_content = group_template.render(
                generated_at=now_str,
                group=group,
            )
            group_path = dashboards_dir / f"{group['slug']}-overview.md"
            group_path.write_text(group_content, encoding="utf-8")
            generated_files.append(group_path)

        # 2. Client Dossiers in dedicated dossiers/ subfolder
        dossiers_dir = output_dir / "dossiers"
        dossiers_dir.mkdir(parents=True, exist_ok=True)

        # Clean up any legacy dossier files lingering in dashboards/
        for old_dossier in dashboards_dir.glob("*-dossier.md"):
            try:
                old_dossier.unlink()
            except Exception:
                pass

        active_clients = self.graph.get_clients()
        client_slugs = {p["slug"] for p in active_clients}

        # Clean up any stale dossiers for non-clients
        for old_file in dossiers_dir.glob("*-dossier.md"):
            slug = old_file.stem[:-8]  # remove '-dossier'
            if slug not in client_slugs:
                try:
                    old_file.unlink()
                except Exception:
                    pass

        client_template = self.jinja_env.get_template("client_dashboard.jinja.md")
        for person in active_clients:
            client_content = client_template.render(
                generated_at=now_str,
                person=person,
                sessions=person.get("sessions", []),
                references=person.get("raw_entity").links_out
            )
            client_path = dossiers_dir / f"{person['slug']}-dossier.md"
            client_path.write_text(client_content, encoding="utf-8")
            generated_files.append(client_path)

        # 3. AI Session Briefs per client
        briefs_dir = output_dir / "briefs"
        briefs_dir.mkdir(parents=True, exist_ok=True)

        # Clean up any stale briefs for non-clients
        for old_file in briefs_dir.glob("*-session-brief.md"):
            slug = old_file.stem[:-14]  # remove '-session-brief'
            if slug not in client_slugs:
                try:
                    old_file.unlink()
                except Exception:
                    pass

        brief_template = self.jinja_env.get_template("session_brief.jinja.md")
        all_active_topics = [t for t in self.graph.get_topics() if t.get("status") == "active"]
        for person in active_clients:
            sessions = person.get("sessions", [])
            person_links = set(person.get("raw_entity").links_out if person.get("raw_entity") else [])
            client_topics = [t for t in all_active_topics if t["title"] in person_links or t["slug"] in person_links]
            if not client_topics:
                client_topics = all_active_topics[:5]
            brief_content = brief_template.render(
                generated_at=now_str,
                person=person,
                previous_sessions=sessions,
                active_topics=client_topics,
                suggested_references=self.graph.get_references()[:5]
            )
            brief_path = briefs_dir / f"{person['slug']}-session-brief.md"
            brief_path.write_text(brief_content, encoding="utf-8")
            generated_files.append(brief_path)


        # 4. Reference Catalog
        library_dir = output_dir / "library"
        library_dir.mkdir(parents=True, exist_ok=True)
        catalog_template = self.jinja_env.get_template("reference_catalog.jinja.md")
        by_type = defaultdict(list)
        for r in self.graph.get_references():
            by_type[r["reference_type"]].append(r)
        
        catalog_content = catalog_template.render(
            generated_at=now_str,
            references_by_type=by_type
        )
        catalog_path = library_dir / "reference-catalog.md"
        catalog_path.write_text(catalog_content, encoding="utf-8")
        generated_files.append(catalog_path)

        return generated_files
