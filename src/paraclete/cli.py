import argparse
import re
import sys
from pathlib import Path
from typing import List

from .config import AppConfig
from .indexer import Indexer
from .graph import OKFGraph
from .generator import Generator
from .extractor import Extractor
from .migrator import Migrator

def cmd_status(args, config: AppConfig):
    print("=== Paraclete System Status ===")
    print(f"Vault Root: {config.vault_root.resolve()}")
    
    indexer = Indexer(config.get_cache_path(), config.vault_root)
    input_files = indexer.scan_inputs(config.get_path(config.paths.input_dir))
    
    new_count = 0
    modified_count = 0
    unchanged_count = 0
    conflict_count = 0

    for f in input_files:
        status, entry = indexer.get_file_status(f)
        if status == "NEW":
            new_count += 1
        elif status == "MODIFIED":
            modified_count += 1
            if entry and indexer.check_okf_conflict(entry):
                conflict_count += 1
        else:
            unchanged_count += 1

    print("\n--- Input Files ---")
    print(f"Total Inputs: {len(input_files)}")
    print(f"  - New / Unindexed: {new_count}")
    print(f"  - Modified Inputs: {modified_count}")
    print(f"  - Unchanged (Cached): {unchanged_count}")
    if conflict_count > 0:
        print(f"  - WARNING: {conflict_count} Manual Modification Conflicts in OKF!")

    graph = OKFGraph(config.get_path(config.paths.okf_dir))
    print("\n--- Canonical Knowledge (OKF) ---")
    for doc_type, entities in sorted(graph.by_type.items()):
        print(f"  - {doc_type}: {len(entities)} files")

    print("\nSystem ready.")

def cmd_generate(args, config: AppConfig):
    print("Generating output dashboards and briefs from OKF...")
    graph = OKFGraph(config.get_path(config.paths.okf_dir))
    gen = Generator(config, graph)
    files = gen.generate_all()
    print(f"Successfully generated {len(files)} files in '{config.paths.output_dir}'.")
    for f in files:
        rel = f.relative_to(config.vault_root)
        print(f"  -> {rel}")

def cmd_process(args, config: AppConfig):
    strategy = args.strategy or config.processing.conflict_strategy
    mode = getattr(args, "mode", None) or config.processing.extraction_mode
    if mode not in ("legacy", "agentic"):
        print(f"ERROR: unknown extraction mode '{mode}' (expected 'legacy' or 'agentic').")
        sys.exit(1)
    # Allow CLI override of the configured mode without editing config files.
    config.processing.extraction_mode = mode

    print(f"Processing inputs (mode: {mode}, conflict strategy: '{strategy}')...")

    indexer = Indexer(config.get_cache_path(), config.vault_root)
    input_files = indexer.scan_inputs(config.get_path(config.paths.input_dir))

    graph = OKFGraph(config.get_path(config.paths.okf_dir))
    extractor = Extractor(config, graph, indexer)

    processed_count = 0
    skipped_count = 0

    for f in input_files:
        status, entry = indexer.get_file_status(f)
        if status in ("NEW", "MODIFIED"):
            rel = f.relative_to(config.vault_root)
            print(f"[{status}] Processing {rel}...")
            try:
                okf_paths = extractor.extract(f, strategy=strategy)
                for okf_path in okf_paths:
                    print(f"       -> Extracted to {okf_path.relative_to(config.vault_root)}")
                processed_count += len(okf_paths)
            except Exception as e:
                print(f"       -> ERROR: {e}")
        else:
            skipped_count += 1

    print(f"\nCompleted: {processed_count} processed, {skipped_count} skipped (unchanged).")

    if config.processing.auto_generate_output and processed_count > 0:
        print("\nAuto-compiling output dashboards...")
        cmd_generate(args, config)

def cmd_synthesize(args, config: AppConfig):
    graph = OKFGraph(config.get_path(config.paths.okf_dir))
    indexer = Indexer(config.get_cache_path(), config.vault_root)
    extractor = Extractor(config, graph, indexer)

    target_persons = []
    if getattr(args, "all", False):
        target_persons = [p["title"] for p in graph.get_clients() if p.get("recent_session_count", 0) > 0]
    elif getattr(args, "person", None):
        target_persons = [args.person]
    else:
        print("Please specify a person name (e.g. paraclete synthesize 'Jane Doe') or use --all.")
        return

    max_recent = getattr(args, "recent", None)
    print(f"Synthesizing practitioner dossiers for {len(target_persons)} client(s)...")
    for name in target_persons:
        print(f"\n[Synthesizing] {name}...")
        try:
            extractor.synthesize_person_profile(name, max_recent=max_recent)
        except Exception as e:
            print(f"ERROR synthesizing {name}: {e}")

    print("\nUpdating compiled views and dashboards...")
    cmd_generate(args, config)

def cmd_reflect(args, config: AppConfig):
    graph = OKFGraph(config.get_path(config.paths.okf_dir))
    indexer = Indexer(config.get_cache_path(), config.vault_root)
    extractor = Extractor(config, graph, indexer)

    persona = getattr(args, "persona", None)
    personas = graph.get_personas()

    if not persona:
        if not personas:
            print("No personas found in vault/okf/personas/. Please create a persona first.")
            return
        print("=== Kick off Guided Reflective Practice ===")
        print("Available Personas:")
        for idx, p in enumerate(personas, start=1):
            last_date = p.get("last_reflection_date") or "None"
            days = f"({p['days_since_reflection']} days ago)" if p.get("days_since_reflection") is not None else ""
            print(f"  [{idx}] {p['title']} - Last reflection: {last_date} {days}")
        
        try:
            choice = input(f"\nSelect a persona [1-{len(personas)}] (default: 1): ").strip()
            if not choice:
                idx = 0
            else:
                idx = int(choice) - 1
            if 0 <= idx < len(personas):
                persona = personas[idx]["title"]
            else:
                print("Invalid selection.")
                return
        except (ValueError, KeyboardInterrupt, EOFError):
            print("\nAborted.")
            return

    print(f"\nGenerating Socratic reflection questionnaire for persona '{persona}'...")
    try:
        target_path = extractor.generate_reflection_questionnaire(
            persona_name=persona,
            since=getattr(args, "since", None),
            focus=getattr(args, "focus", None),
        )
        rel = target_path.relative_to(config.vault_root)
        print(f"\nSuccessfully created guided reflection questionnaire:")
        print(f"  -> {rel}")
        print("\nNext steps:")
        print("  1. Open this file in Obsidian (under vault/input/reflections/).")
        print("  2. Fill in your thoughts, case responses, and self-assessments.")
        print("  3. Run `paraclete process` to ingest the reflection, generate supervisory feedback, and update dashboards.")
    except Exception as e:
        print(f"ERROR generating reflection questionnaire: {e}")

def cmd_migrate(args, config: AppConfig):
    if args.db:
        db_file = Path(args.db)
    elif (config.vault_root / "paraclete.db").exists():
        db_file = config.vault_root / "paraclete.db"
    else:
        db_file = config.vault_root.parent / "paraclete.db"

    print(f"Migrating SQLite database from: {db_file}")
    
    migrator = Migrator(db_file, config.vault_root)
    stats = migrator.migrate()
    
    print("\n--- Migration Complete ---")
    for entity, count in stats.items():
        print(f"  - {entity.capitalize()}: {count} records exported")

    print("\nCompiling output dashboards...")
    cmd_generate(args, config)

def cmd_lint(args, config: AppConfig):
    print("Linting OKF Knowledge Base...")
    graph = OKFGraph(config.get_path(config.paths.okf_dir))

    broken_links = []
    missing_titles = []
    duplicate_sessions = {}
    orphan_entities = []
    stub_references = []
    missing_backlinks = []

    # Check broken links and missing titles
    for slug, entity in graph.entities.items():
        if not entity.title:
            missing_titles.append(slug)
        for link in entity.links_out:
            target = graph.find_by_title(link)
            if not target:
                broken_links.append((entity.slug, link))

    # Check for duplicate session notes
    sessions_by_key = {}
    for entity in graph.by_type.get("session_note", []):
        date = str(entity.metadata.get("date") or "")
        person = str(entity.metadata.get("person") or "")
        source_input = str(entity.metadata.get("source_input") or "")
        
        if date and person and person != "None":
            key = (date, person)
            if key not in sessions_by_key:
                sessions_by_key[key] = []
            sessions_by_key[key].append(entity)

    for key, entities in sessions_by_key.items():
        if len(entities) > 1:
            duplicate_sessions[key] = entities

    # Check orphan entities (no inbound or outbound links) and stub references.
    for slug, entity in graph.entities.items():
        has_links = bool(entity.links_out) or bool(entity.links_in)
        if not has_links:
            orphan_entities.append(slug)
        if entity.doc_type == "reference":
            body_len = len((entity.content or "").strip())
            if body_len < 100:
                stub_references.append(slug)

    # Check person -> session backlinks (concern #3): every session note that names a
    # person should be linked from that person's entity.
    for slug, entity in graph.entities.items():
        if entity.doc_type != "session_note":
            continue
        person = str(entity.metadata.get("person") or "").strip()
        if not person:
            continue
        clean_person = re.sub(r"\[\[(.*?)\]\]", r"\1", person).strip()
        person_entity = graph.find_by_title(clean_person)
        if person_entity and entity.title not in (person_entity.links_out or []):
            missing_backlinks.append((entity.slug, clean_person))

    print(f"Scanned {len(graph.entities)} OKF entities.")
    if missing_titles:
        print(f"WARNING: {len(missing_titles)} entities are missing titles: {missing_titles}")
    if broken_links:
        print(f"WARNING: {len(broken_links)} unresolvable wikilinks found:")
        for src, tgt in broken_links[:10]:
            print(f"  - In '{src}': [[{tgt}]]")
        if len(broken_links) > 10:
            print(f"  ... and {len(broken_links) - 10} more.")

    if duplicate_sessions:
        print(f"\nWARNING: {len(duplicate_sessions)} duplicate session note group(s) detected:")
        for (d, person), entities in duplicate_sessions.items():
            print(f"  - Date: {d} | Person: {person}")
            for e in entities:
                src = e.metadata.get("source_input")
                print(f"      * {e.slug}.md (source_input: {src})")

    if orphan_entities:
        print(f"\nWARNING: {len(orphan_entities)} orphan entity(ies) with no inbound or outbound links:")
        for slug in orphan_entities[:10]:
            print(f"  - {slug}")
        if len(orphan_entities) > 10:
            print(f"  ... and {len(orphan_entities) - 10} more.")

    if stub_references:
        print(f"\nWARNING: {len(stub_references)} reference(s) with thin or empty body content:")
        for slug in stub_references[:10]:
            print(f"  - {slug}")
        if len(stub_references) > 10:
            print(f"  ... and {len(stub_references) - 10} more.")

    if missing_backlinks:
        print(f"\nWARNING: {len(missing_backlinks)} session note(s) missing a backlink from their person entity:")
        for sess_slug, person in missing_backlinks[:10]:
            print(f"  - Session '{sess_slug}' -> Person '{person}'")
        if len(missing_backlinks) > 10:
            print(f"  ... and {len(missing_backlinks) - 10} more.")

    if getattr(args, "fix", False):
            print("\n[--fix] Resolving duplicate session notes...")
            for (d, person), entities in duplicate_sessions.items():
                # Prefer entity with active source_input, or newest file
                with_source = [e for e in entities if e.metadata.get("source_input")]
                if with_source:
                    primary = with_source[-1]
                else:
                    primary = entities[-1]

                for e in entities:
                    if e != primary and e.doc.path and e.doc.path.exists():
                        e.doc.path.unlink()
                        print(f"  -> Removed duplicate: {e.doc.path.name} (kept: {primary.doc.path.name})")

            # Re-load graph after deduplication
            graph = OKFGraph(config.get_path(config.paths.okf_dir))
            print("Deduplication complete. OKF Knowledge Base re-indexed.")
    
    if (
        not missing_titles
        and not broken_links
        and not duplicate_sessions
        and not orphan_entities
        and not stub_references
        and not missing_backlinks
    ):
        print("Knowledge base integrity check passed! 0 errors, 0 duplicates.")

def cmd_reset(args, config: AppConfig):
    okf_dir = config.get_path(config.paths.okf_dir)
    output_dir = config.get_path(config.paths.output_dir)
    cache_file = config.get_cache_path()
    scope = getattr(args, "scope", "generated")
    dry_run = getattr(args, "dry_run", False)
    force = getattr(args, "force", False)

    files_to_remove = []

    if scope in ("generated", "cache"):
        if cache_file.exists():
            files_to_remove.append(cache_file)

    if scope in ("generated", "output"):
        if output_dir.exists():
            for p in output_dir.rglob("*.md"):
                if p.is_file() and p.name != "AGENTS.md":
                    files_to_remove.append(p)

    if scope == "generated":
        # Safe generated OKF folders: sessions, messages
        for subfolder in ("sessions", "messages"):
            target_sub = okf_dir / subfolder
            if target_sub.exists():
                for p in target_sub.glob("*.md"):
                    if p.is_file() and p.name != "AGENTS.md":
                        files_to_remove.append(p)

    print(f"=== Paraclete Vault Reset (scope: {scope}) ===")
    print(f"Identified {len(files_to_remove)} generated file(s) to remove.")
    print("Protected assets (NEVER modified): vault/input/*, vault/okf/frameworks/, vault/okf/personas/, vault/okf/groups/, vault/okf/references/, vault/okf/persons/, **/AGENTS.md")

    if not files_to_remove:
        print("Nothing to reset.")
        return

    if dry_run:
        print("\n[DRY RUN] The following files would be deleted:")
        for f in files_to_remove:
            try:
                rel = f.relative_to(config.vault_root)
                print(f"  - {rel}")
            except Exception:
                print(f"  - {f}")
        return

    if not force:
        confirm = input(f"Are you sure you want to permanently delete these {len(files_to_remove)} file(s)? [y/N]: ").strip().lower()
        if confirm != "y":
            print("Reset cancelled.")
            return

    deleted_count = 0
    for f in files_to_remove:
        try:
            if f.exists():
                f.unlink()
                deleted_count += 1
        except Exception as e:
            print(f"Error removing {f}: {e}")

    print(f"Reset complete. {deleted_count} file(s) removed.")

def main():
    parser = argparse.ArgumentParser(description="Paraclete CLI: Lightweight OKF practice OS engine")
    subparsers = parser.add_subparsers(dest="command", help="Available subcommands")

    # Status
    subparsers.add_parser("status", help="Show system status and unindexed file counts")

    # Process
    proc_parser = subparsers.add_parser("process", help="Process raw notes in input/ and extract to okf/")
    proc_parser.add_argument("--strategy", choices=["warn", "overwrite", "merge", "skip"], default="warn", help="Conflict resolution strategy")
    proc_parser.add_argument("--mode", choices=["legacy", "agentic"], default=None, help="Extraction mode (overrides config)")
    proc_parser.add_argument("--file", type=str, default=None, help="Process a single specific file in input/")
    proc_parser.add_argument("--no-generate", action="store_true", help="Skip automatic output generation")

    # Synthesize
    syn_parser = subparsers.add_parser("synthesize", help="Synthesize longitudinal client profile narrative and update OKF person entity")
    syn_parser.add_argument("person", nargs="?", type=str, help="Name of client to synthesize")
    syn_parser.add_argument("--all", action="store_true", help="Synthesize profiles for all clients with recorded sessions")
    syn_parser.add_argument("--recent", type=int, default=None, help="Number of recent sessions to include in detailed context (default: 8)")

    # Reflect
    ref_parser = subparsers.add_parser("reflect", help="Kick off a guided practitioner reflection questionnaire for a persona")
    ref_parser.add_argument("persona", nargs="?", type=str, help="Name of persona to reflect on (e.g. 'Executive Coach', 'Technical Mentor')")
    ref_parser.add_argument("--since", type=str, default=None, help="Filter session context since date (YYYY-MM-DD)")
    ref_parser.add_argument("--focus", type=str, default=None, help="Optional specific theme or focus area")

    # Generate
    subparsers.add_parser("generate", help="Compile output views from OKF")

    # Migrate
    mig_parser = subparsers.add_parser("migrate", help="Migrate SQLite paraclete.db to OKF Markdown")
    mig_parser.add_argument("--db", type=str, default="paraclete.db", help="Path to paraclete.db")

    # Lint
    lint_parser = subparsers.add_parser("lint", help="Verify wikilinks, schema compliance, and deduplicate")
    lint_parser.add_argument("--fix", action="store_true", help="Automatically resolve and clean up duplicate session notes")

    # Reset
    reset_parser = subparsers.add_parser("reset", help="Safely clean generated OKF folders (sessions, messages), cache, and compiled views")
    reset_parser.add_argument("--scope", choices=["generated", "output", "cache"], default="generated", help="Scope of reset: 'generated' (sessions + messages + cache + output), 'output' (only output views), 'cache' (only cache file)")
    reset_parser.add_argument("--dry-run", action="store_true", help="Preview files to be deleted without removing them")
    reset_parser.add_argument("-f", "--force", action="store_true", help="Bypass confirmation prompt")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)

    config = AppConfig.load()

    if args.command == "status":
        cmd_status(args, config)
    elif args.command == "process":
        cmd_process(args, config)
    elif args.command == "synthesize":
        cmd_synthesize(args, config)
    elif args.command == "reflect":
        cmd_reflect(args, config)
    elif args.command == "generate":
        cmd_generate(args, config)
    elif args.command == "migrate":
        cmd_migrate(args, config)
    elif args.command == "lint":
        cmd_lint(args, config)
    elif args.command == "reset":
        cmd_reset(args, config)

if __name__ == "__main__":
    main()
