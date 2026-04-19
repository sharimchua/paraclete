import pytest

@pytest.fixture(autouse=True)
def clean_db(client):
    data = {
        "persons": [],
        "groups": [],
        "tags": [],
        "notes": [],
        "references": [],
        "personas": [],
        "practise_frameworks": [],
        "actions": [],
        "messages": []
    }
    client.post("/import/", json=data)

def test_export_empty(client):
    response = client.get("/export/")
    assert response.status_code == 200
    data = response.json()
    assert data["persons"] == []
    assert data["groups"] == []
    assert data["notes"] == []

def test_import_basic(client):
    data = {
        "persons": [
            {
                "id": 1,
                "name": "Alice",
                "tags": [],
                "groups": [],
            }
        ],
        "groups": [],
        "tags": [],
        "notes": [],
        "references": [],
        "personas": [],
        "practise_frameworks": [],
        "actions": [],
        "messages": []
    }
    response = client.post("/import/", json=data)
    assert response.status_code == 200

    response = client.get("/persons/")
    assert response.status_code == 200
    persons = response.json()
    assert len(persons) == 1
    assert persons[0]["name"] == "Alice"

def test_import_complex(client):
    data = {
        "persons": [
            {
                "id": 1,
                "name": "Alice",
                "tags": [],
                "groups": [],
            }
        ],
        "groups": [
            {
                "id": 1,
                "name": "Team A",
                "members": [{"id": 1, "name": "Alice", "tags": [], "groups": []}],
                "tags": []
            }
        ],
        "tags": [
            {"id": 1, "value": "Developer", "key": "Role"}
        ],
        "notes": [
            {
                "id": 1,
                "title": "Meeting Note",
                "date": "2024-01-01",
                "stage": "Prepare",
                "person_id": 1,
                "group_id": 1,
                "tags": [],
                "actions": [],
                "messages": []
            }
        ],
        "references": [],
        "personas": [],
        "practise_frameworks": [],
        "actions": [],
        "messages": []
    }
    response = client.post("/import/", json=data)
    assert response.status_code == 200

    response = client.get("/groups/")
    groups = response.json()
    assert len(groups) == 1

    response = client.get("/groups/1")
    group = response.json()
    assert len(group["members"]) == 1
    assert group["members"][0]["name"] == "Alice"

def test_export_import_full_cycle(client):
    client.post("/persons/", json={"name": "Bob"})

    export_response = client.get("/export/")
    assert export_response.status_code == 200
    export_data = export_response.json()

    assert len(export_data["persons"]) >= 1
    assert any(p["name"] == "Bob" for p in export_data["persons"])

    new_data = dict(export_data)
    new_data["persons"].append({"id": 999, "name": "Charlie", "tags": [], "groups": []})

    import_response = client.post("/import/", json=new_data)
    assert import_response.status_code == 200

    get_response = client.get("/persons/")
    persons = get_response.json()
    assert any(p["name"] == "Bob" for p in persons)
    assert any(p["name"] == "Charlie" for p in persons)
