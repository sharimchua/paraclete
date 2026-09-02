# Obsidian Vault Root

This folder is the root of the **Paraclete Obsidian Knowledge Base Vault**.

## Directory Layout & Rules

```
vault/
├── .paraclete/  # [LOCAL-ONLY] Engine state and dual-hash cache for this vault (ignored by git).
├── input/       # [USER-ONLY] Free-form raw notes, transcripts, audio dictations.
├── okf/         # [AGENT-MANAGED] Canonical Open Knowledge Format entities (YAML frontmatter + Markdown).
├── output/      # [COMPILED VIEWS] Deterministic template-driven dashboards and session briefs.
├── templates/   # Jinja2 markdown templates for compiling output/ from okf/.
└── .obsidian/   # Obsidian workspace settings, core and community plugin configurations.
```

### Directives
1. **Purity of Vault**: Only Obsidian notes, templates, plugin configurations, and local vault cache/state (`.paraclete/`) live in this directory.
2. **Schema Compliance**: All files in `okf/` must follow OKF v0.2 frontmatter schemas.
3. **Template Compilation**: Do not manually edit `output/`; generate it using `paraclete generate`.