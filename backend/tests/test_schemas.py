import pytest
from pydantic import ValidationError
from backend.schemas import FullExport, Person, Group, Note, NoteStage, Tag


def test_full_export_schema_validation():
    # Valid export data
    valid_data = {
        "persons": [{"id": 1, "name": "Alice"}],
        "groups": [{"id": 1, "name": "Team A"}],
        "tags": [{"id": 1, "value": "Test", "key": "Category"}],
        "notes": [
            {
                "id": 1,
                "title": "Test Note",
                "date": "2024-01-01",
                "stage": NoteStage.PREPARE,
            }
        ],
        "references": [],
        "personas": [],
        "practise_frameworks": [],
        "actions": [],
        "messages": [],
    }
    export = FullExport(**valid_data)
    assert len(export.persons) == 1
    assert export.persons[0].name == "Alice"
    assert export.notes[0].stage == NoteStage.PREPARE


def test_schema_invalid_data():
    with pytest.raises(ValidationError):
        # Missing required field 'name'
        Person(**{"id": 1})

    with pytest.raises(ValidationError):
        # Invalid stage
        Note(
            **{
                "id": 1,
                "title": "Test Note",
                "date": "2024-01-01",
                "stage": "INVALID_STAGE",
            }
        )


def test_schema_optional_fields():
    person = Person(**{"id": 1, "name": "Bob"})
    assert person.contact_method is None
    assert person.tags == []

    person_with_tags = Person(
        **{
            "id": 1,
            "name": "Bob",
            "tags": [{"id": 1, "value": "Developer", "key": "Role"}],
        }
    )
    assert len(person_with_tags.tags) == 1
    assert person_with_tags.tags[0].value == "Developer"
