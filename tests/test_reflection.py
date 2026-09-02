"""Unit tests for practitioner reflection pipeline and OKF graph queries."""
import pytest
from pathlib import Path
from paraclete.config import AppConfig, PathConfig
from paraclete.graph import OKFGraph
from paraclete.indexer import Indexer
from paraclete.extractor import Extractor
from paraclete.generator import Generator
from paraclete.parser import MarkdownParser

@pytest.fixture
def mock_vault(tmp_path: Path) -> AppConfig:
    project_root = tmp_path
    vault_root = tmp_path / "vault"
    
    # Create directory structure
    for sub in ("input/reflections", "okf/persons", "okf/groups", "okf/personas", "okf/frameworks", "okf/sessions", "okf/reflections", "output/dashboards", "templates", ".paraclete"):
        (vault_root / sub).mkdir(parents=True, exist_ok=True)

    # Seed mock entities
    (vault_root / "okf/personas/executive-coach.md").write_text(
        "---\ntype: persona\ntitle: Executive Coach\nframework: \"[[Core Leadership]]\"\n---\n# Executive Coach\nLeadership persona.",
        encoding="utf-8"
    )
    (vault_root / "okf/frameworks/core-leadership.md").write_text(
        "---\ntype: practise_framework\ntitle: Core Leadership\nis_core: true\n---\n# Core Leadership\nPrinciples: First-principles thinking.",
        encoding="utf-8"
    )
    (vault_root / "okf/groups/team-alpha.md").write_text(
        "---\ntype: group\ntitle: Team Alpha\npersona: \"[[Executive Coach]]\"\nmembers:\n  - \"[[Jane Doe]]\"\n---\n# Team Alpha\nCohort description.",
        encoding="utf-8"
    )
    (vault_root / "okf/persons/jane-doe.md").write_text(
        "---\ntype: person\ntitle: Jane Doe\ngroups:\n  - \"[[Team Alpha]]\"\npersona: \"[[Executive Coach]]\"\ntags: [client]\n---\n# Jane Doe\nClient notes.",
        encoding="utf-8"
    )
    (vault_root / "okf/sessions/2026-09-01 - Jane Doe - Strategy Review.md").write_text(
        "---\ntype: session_note\ntitle: Strategy Review\ndate: 2026-09-01\nperson: \"[[Jane Doe]]\"\ngroup: \"[[Team Alpha]]\"\npersona: \"[[Executive Coach]]\"\nstage: Published\ntags: [strategy]\n---\n# Strategy Review\nNotes.",
        encoding="utf-8"
    )

    # Copy actual templates from vault/templates
    actual_templates = Path("vault/templates")
    if actual_templates.exists():
        for t_file in actual_templates.glob("*.jinja.md"):
            (vault_root / "templates" / t_file.name).write_text(t_file.read_text(encoding="utf-8"), encoding="utf-8")

    config = AppConfig(
        project_root=project_root,
        vault_root=vault_root,
        paths=PathConfig(
            input_dir="input",
            okf_dir="okf",
            output_dir="output",
            templates_dir="templates",
            state_dir=".paraclete",
            cache_file=".paraclete/cache.json"
        )
    )
    return config

def test_reflection_pipeline(mock_vault: AppConfig):
    config = mock_vault
    okf_dir = config.get_path(config.paths.okf_dir)
    graph = OKFGraph(okf_dir)
    indexer = Indexer(config.get_cache_path(), config.vault_root)
    extractor = Extractor(config, graph, indexer)

    # 1. Test Graph Persona & Reflection Queries
    personas = graph.get_personas()
    assert len(personas) == 1
    assert personas[0]["title"] == "Executive Coach"
    assert personas[0]["framework"] == "Core Leadership"

    # Test Multi-Group Resolution
    groups = [g["title"] for g in graph.get_persona_groups("Executive Coach")]
    assert "Team Alpha" in groups

    # Test Macro Practice Landscape
    landscape = graph.get_persona_landscape("Executive Coach")
    assert landscape["total_sessions_in_window"] >= 1
    assert len(landscape["groups"]) >= 1
    assert len(landscape["active_clients"]) >= 1

    clients = graph.get_persona_clients("Executive Coach")
    assert len(clients) >= 1
    assert clients[0] == "Jane Doe"

    # 2. Test Questionnaire Ingestion via Extractor Fallback
    test_input_dir = config.get_path(config.paths.input_dir) / "reflections"
    sample_q_content = """---
type: reflection_input
title: "Practitioner Reflection: Executive Coach (2026-09-02)"
date: "2026-09-02"
persona: "[[Executive Coach]]"
framework: "[[Core Leadership]]"
previous_reflection: null
reviewed_persons:
  - "[[Jane Doe]]"
tags:
  - reflection
  - supervision
---

# Practitioner Reflection: Executive Coach (2026-09-02)

## 1. Longitudinal Continuity & Goal Follow-Up
- **Your Response**: Baseline reflection complete.

## 2. Client Case Inquiries & Clinical Dilemmas
### [[Jane Doe]]
- **Supervisory Inquiry**: How is the coaching pacing evolving?
- **Your Response**: Good momentum on strategy execution.

## 3. Framework Alignment & Espoused Principles
- **Supervisory Inquiry**: Alignment with first principles?
- **Your Response**: Strong alignment.

## 4. Practitioner State, Boundaries & Energy
- **Energy & Sustainability Rating (1-5)**: 4
- **What felt most energizing?**: Breakthroughs on clarity.

## 5. Focus Areas & Next Cycle Goals
- [ ] Goal 1: Schedule bi-weekly review buffers.
"""
    test_q_path = test_input_dir / "2026-09-02-test-executive-coach-reflection.md"
    test_q_path.write_text(sample_q_content, encoding="utf-8")

    okf_paths = extractor._write_fallback_docs(
        sample_q_content,
        test_q_path,
        fallback_date="2026-09-02",
        rel_input=str(test_q_path.relative_to(config.vault_root)).replace("\\", "/")
    )
    assert len(okf_paths) > 0
    ref_doc = MarkdownParser.parse_file(okf_paths[0])
    assert ref_doc.metadata.get("type") == "reflection"
    assert ref_doc.metadata.get("persona") == "[[Executive Coach]]"

    # 3. Test Generator Output with Reflection Cadence Table
    graph.load()
    generator = Generator(config, graph)
    gen_files = generator.generate_all()
    overview_file = config.get_path(config.paths.output_dir) / "dashboards" / "practice-overview.md"
    assert overview_file.exists()
    overview_text = overview_file.read_text(encoding="utf-8")
    assert "Reflective Practice & Supervision Cadence" in overview_text

