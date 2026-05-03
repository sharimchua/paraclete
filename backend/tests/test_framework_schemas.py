import pytest
from pydantic import ValidationError
from backend.schemas import (
    PractiseFramework,
    PractiseFrameworkItem,
    Persona,
    FrameworkProposal,
    FrameworkProposalStatus,
)


def test_framework_creation():
    data = {
        "id": 1,
        "name": "My Framework",
        "is_core": True,
        "items": [{"id": 1, "aspect": "tone", "value": "professional"}],
    }
    framework = PractiseFramework(**data)
    assert framework.name == "My Framework"
    assert framework.is_core is True
    assert len(framework.items) == 1
    assert framework.items[0].aspect == "tone"


def test_persona_framework_link():
    framework_data = {"id": 1, "name": "My Framework", "is_core": True, "items": []}
    persona_data = {"id": 1, "name": "Consultant", "framework": framework_data}
    persona = Persona(**persona_data)
    assert persona.name == "Consultant"
    assert persona.framework is not None
    assert persona.framework.name == "My Framework"


def test_framework_proposal():
    data = {
        "id": 1,
        "source_type": "note",
        "source_id": 1,
        "aspect": "formatting",
        "action": "add",
        "value": "Use bullet points",
        "status": FrameworkProposalStatus.PENDING,
        "is_core": False,
    }
    proposal = FrameworkProposal(**data)
    assert proposal.status == FrameworkProposalStatus.PENDING
    assert proposal.action == "add"
