"""Unit tests for agentic tool dispatch against OKFGraph."""
import pytest
from pathlib import Path
from paraclete.graph import OKFGraph
from paraclete.tools import build_tool_dispatch, get_tool_schemas
from paraclete.parser import MarkdownParser

@pytest.fixture
def temp_okf_dir(tmp_path: Path) -> Path:
    okf = tmp_path / "okf"
    for sub in ("persons", "groups", "personas", "frameworks", "sessions", "references", "topics", "reflections", "messages"):
        (okf / sub).mkdir(parents=True, exist_ok=True)

    # Seed sample entities
    (okf / "persons" / "Jane Doe.md").write_text(
        "---\ntype: person\ntitle: Jane Doe\ngroups:\n  - \"[[Team Alpha]]\"\npersona: \"[[Executive Coach]]\"\ntags: [client]\n---\n# Jane Doe\nClient notes.",
        encoding="utf-8"
    )
    (okf / "groups" / "Team Alpha.md").write_text(
        "---\ntype: group\ntitle: Team Alpha\npersona: \"[[Executive Coach]]\"\nmembers:\n  - \"[[Jane Doe]]\"\n---\n# Team Alpha\nCohort description.",
        encoding="utf-8"
    )
    (okf / "personas" / "Executive Coach.md").write_text(
        "---\ntype: persona\ntitle: Executive Coach\nframework: \"[[Core Leadership]]\"\n---\n# Executive Coach\nPersona notes.",
        encoding="utf-8"
    )
    (okf / "frameworks" / "Core Leadership.md").write_text(
        "---\ntype: practise_framework\ntitle: Core Leadership\nis_core: true\n---\n# Core Leadership\nFramework principles.",
        encoding="utf-8"
    )
    (okf / "sessions" / "2026-09-01 - Jane Doe - Strategy Review.md").write_text(
        "---\ntype: session_note\ntitle: Strategy Review\ndate: 2026-09-01\nperson: \"[[Jane Doe]]\"\ngroup: \"[[Team Alpha]]\"\npersona: \"[[Executive Coach]]\"\nstage: Published\ntags: [strategy, leadership]\n---\n# Strategy Review\nSession discussion.\n- [ ] Follow up on roadmap",
        encoding="utf-8"
    )
    return okf

def test_tool_schemas():
    schemas = get_tool_schemas()
    tool_names = [s["function"]["name"] for s in schemas]
    assert "search_entities" in tool_names
    assert "get_backlinks" in tool_names
    assert "create_entity" in tool_names
    assert "update_entity" in tool_names
    assert "delete_entity" in tool_names
    assert "get_persona_landscape" in tool_names

def test_tool_dispatch(temp_okf_dir: Path):
    graph = OKFGraph(temp_okf_dir)
    touched = set()
    dispatch = build_tool_dispatch(
        graph,
        temp_okf_dir.resolve(),
        source_input="input/test-smoke.md",
        touched_paths=touched,
    )

    # 1. Test search_entities
    s_res = dispatch["search_entities"]({"query": "Jane", "limit": 5})
    assert s_res["total"] > 0
    assert s_res["results"][0]["title"] == "Jane Doe"

    # 2. Test list_entities
    l_res = dispatch["list_entities"]({"type": "person"})
    assert l_res["total"] == 1
    assert l_res["entities"][0]["title"] == "Jane Doe"

    # 3. Test read_entity
    r_res = dispatch["read_entity"]({"title": "Jane Doe"})
    assert r_res.get("type") == "person"
    assert "Jane Doe" in r_res.get("content", "")

    # 4. Test get_backlinks
    b_res = dispatch["get_backlinks"]({"title": "Jane Doe"})
    assert "backlinks" in b_res
    assert len(b_res["backlinks"]) > 0

    # 5. Test create_entity (graceful existing entity handling)
    c_existing = dispatch["create_entity"]({"type": "person", "title": "Jane Doe"})
    assert c_existing.get("exists") is True or c_existing.get("updated") is True

    # 6. Test create_entity for a new reflection file & verify touched_paths + source_input
    test_title = "_Test Automated Reflection"
    c_new = dispatch["create_entity"]({
        "type": "reflection",
        "title": test_title,
        "frontmatter": {"tags": ["test-reflection"]},
        "body": "## Key Takeaways\nAutomated test reflection body content."
    })
    assert c_new.get("created") is True
    test_file = temp_okf_dir / c_new["path"]
    assert test_file.exists()
    assert test_file.resolve() in touched

    doc = MarkdownParser.parse_file(test_file)
    assert doc.metadata.get("source_input") == "input/test-smoke.md"

    # 7. Test delete_entity on the newly created file
    d_res = dispatch["delete_entity"]({"path": c_new["path"]})
    assert d_res.get("deleted") is True
    assert not test_file.exists()

    # 8. Test get_persona_landscape
    land_res = dispatch["get_persona_landscape"]({"persona": "Executive Coach"})
    assert "groups" in land_res
    assert len(land_res["groups"]) > 0

    # 9. Test path traversal safety
    bad = dispatch["read_entity"]({"path": "../../etc/passwd"})
    assert "error" in bad
