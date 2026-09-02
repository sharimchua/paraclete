# Paraclete

> **Paraclete** is a lightweight, local-first practice OS for 1-1 service providers — coaches, tutors, mentors, and consultants. It structures your entire practice as an **Open Knowledge Format (OKF v0.2)** knowledge base natively compatible with **Obsidian** and offline on-device mobile LLMs (**Noema**).

---

## 🌟 Architecture: Input → OKF → Output

Paraclete operates on a clean 3-tier boundary:

```
.
├── src/paraclete/   # Engine CLI, graph analyzer, extractor, and output compiler.
├── config.yaml      # Paraclete engine configuration (or config.example.yaml).
└── vault/           # [OBSIDIAN VAULT] Pure Obsidian-compatible workspace:
    ├── .paraclete/  # [LOCAL-ONLY] Engine state and SHA-256 cache for this vault.
    ├── input/       # [USER-MANAGED] Free-form raw captures, session transcripts, voice dictations.
    ├── okf/         # [AGENT-MANAGED] Canonical Open Knowledge Format entities (YAML + Markdown + [[wikilinks]]).
    ├── output/      # [TEMPLATE-DRIVEN] Deterministically generated practice dashboards, dossiers, and briefs.
    ├── templates/   # Jinja2 markdown templates for generating output views.
    └── .obsidian/   # Obsidian workspace settings, core and community plugin configurations.
```

### 1. `input/` (User Only)
Users only create and edit files here. Drop raw session dictations, audio transcripts, or scratch notes into `input/sessions/` or `input/dictations/`.

### 2. `okf/` (Canonical Open Knowledge Format)
Maintained by the Paraclete engine and governed by hierarchical **DOX** guidelines (`AGENTS.md`). Stores canonical entities:
- `okf/persons/`: Client profiles and developmental trajectories.
- `okf/groups/`: Cohorts, teams, and group memberships.
- `okf/personas/`: Practitioner working modes.
- `okf/frameworks/`: Tone, phrasing, formatting, and principles.
- `okf/sessions/`: Structured session records with stages (`Prepare` → `Capture` → `Clean` → `Published` → `Archived`).
- `okf/references/`: Mental models, concepts, resources, and techniques.
- `okf/messages/`: Communication drafts and sent logs.

### 3. `output/` (Deterministic Compiled Views)
Generated in milliseconds using Jinja2 templates without burning LLM tokens:
- `output/dashboards/practice-overview.md`: High-level practice roster, stats, and recent sessions.
- `output/dossiers/{client}-dossier.md`: Client synthesis, historical notes, and outstanding actions.
- `output/briefs/{client}-session-brief.md`: AI preparation briefs for upcoming sessions.
- `output/library/reference-catalog.md`: Intellectual capital reference taxonomy.

---

## ⚡ Deterministic Engine & Conflict Resolution

- **Delta Detection**: Compares `SHA-256` content hashes of files in `input/` against `vault/.paraclete/cache.json`. Unchanged inputs skip LLM calls.
- **Dual-Hash Conflict Detection**: If an OKF note was manually refined in Obsidian and its raw input is updated, the engine detects the conflict and supports 3-way LLM reconciliation (`--strategy merge`) to preserve practitioner notes.
- **Zero-Token Output Rendering**: Dashboards, digests, and rosters are compiled deterministically via Jinja2.

---

## 🔮 Obsidian Integration

Paraclete is a valid **Obsidian Vault** out of the box:
- Full **Graph View**, **Backlinks**, and **Canvas** compatibility.
- Uses native YAML properties frontmatter and `[[wikilinks]]`.

### Recommended Obsidian Community Plugins:
- **Dataview / DataviewJS**: For interactive table queries across sessions and actions.
- **Tasks**: For managing markdown checklists (`- [ ]`) across notes.
- **Omnisearch**: For ultra-fast fuzzy and semantic search across the vault.

---

## 📱 Mobile & Offline Local AI (Noema on iOS)

Because all files are standard, modular Markdown with structured YAML frontmatter:
1. Sync your vault via iCloud Drive or Obsidian Sync.
2. In **Noema** (or any local offline LLM app on iOS), load the vault directory.
3. Query client histories, session insights, and frameworks completely offline on your iPhone.

---

## 🚀 CLI Quickstart

You can run the CLI immediately **without any `pip install`** using any of the following:

### Option 1: Direct Wrapper (Zero-Install)
In PowerShell:
```powershell
.\paraclete status
.\paraclete process
.\paraclete generate
.\paraclete lint
```

In Command Prompt:
```cmd
paraclete.cmd status
```

### Option 2: Python Script (Zero-Install)
```bash
python run.py status
python run.py process
python run.py generate
python run.py lint
```

### Option 3: Optional Editable Install
If you prefer having the global `paraclete` executable in your active Python environment:
```bash
pip install -e .
paraclete status
```

---

## ⚙️ Configuration (`config.yaml`)

```yaml
paths:
  vault_dir: "vault"

llm:
  endpoint: "http://localhost:11434/v1" # Local Ollama / LM Studio / OpenAI endpoint
  api_key: "ollama"
  model: "gemma2:9b"
  temperature: 0.2

processing:
  conflict_strategy: "warn" # warn | overwrite | merge | skip
  auto_generate_output: true
  extraction_mode: "agentic"
```

---

## 📜 Licence

MIT Licence.
