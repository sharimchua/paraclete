# Paraclete Knowledge Base & Engine

This repository combines a Python-based **Knowledge Engine (`paraclete`)** with an **Obsidian-compatible Knowledge Base Vault** governed by the **Open Knowledge Format (OKF v0.2)** and the **DOX (Hierarchical Agent Guidance)** architecture.

## System Boundaries & Directory Layout

```
.
├── src/paraclete/   # Engine CLI, graph analyzer, extractor, and output compiler.
├── config.example.yaml # Example engine configuration.
└── vault/           # [OBSIDIAN VAULT] Pure Obsidian-compatible workspace:
    ├── .paraclete/  # [LOCAL-ONLY] Engine state and dual-hash cache for this vault (ignored by git).
    ├── input/       # [USER-ONLY] Free-form raw notes, transcripts, audio dictations.
    ├── okf/         # [AGENT-MANAGED] Canonical Open Knowledge Format entities (YAML frontmatter + Markdown).
    ├── output/      # [COMPILED VIEWS] Deterministic template-driven dashboards and session briefs.
    ├── templates/   # Jinja2 markdown templates for compiling output/ from okf/.
    └── .obsidian/   # Obsidian workspace settings, core and community plugin configurations.
```

### Core Rules for Agents & AI Tools
1. **Never edit `input/`**: Files in `vault/input/` are user-owned source artifacts. Agents must only read from `input/` to extract knowledge into `okf/`.
2. **Strict Schema Integrity in `okf/`**: Every file in `vault/okf/` must include valid YAML frontmatter compliant with OKF v0.2 (must have `type`, `title`, and appropriate relational wikilinks).
3. **Wikilink Syntax**: Use standard Obsidian wikilinks `[[Entity Title]]` for all internal cross-references.
4. **Never manually edit `output/`**: Files in `vault/output/` are generated deterministically by `paraclete generate`.
5. **Conflict Awareness**: If an `okf/` entity was modified directly in Obsidian and new raw input arrives, trigger a 3-way merge rather than blindly overwriting manual notes.

## Sub-directory Directives
- See `vault/input/AGENTS.md` for parsing raw transcripts and dictations.
- See `vault/okf/AGENTS.md` for OKF schemas, taxonomy, and frontmatter definitions.
- See `vault/output/AGENTS.md` for output compilation rules.