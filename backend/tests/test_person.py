def test_read_person_not_found(client):
    response = client.get("/persons/9999")
    assert response.status_code == 404
    assert response.json() == {"detail": "Person not found"}
