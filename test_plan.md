1. **Add `selectinload` to `get_topics` query in `backend/routers/topics.py`**
   - I will use `replace_with_git_merge_diff` to modify `backend/routers/topics.py`.
   - I will add `selectinload` to the `sqlalchemy.orm` import.
   - I will modify `db.query(models.Topic)` in `get_topics` to `db.query(models.Topic).options(selectinload(models.Topic.notes), selectinload(models.Topic.messages), selectinload(models.Topic.reflections))`. This prevents N+1 queries when `enrich_topic` accesses these collections.
2. **Verify file changes**
   - I will use `read_file` to read `backend/routers/topics.py` and verify that the changes were applied correctly.
3. **Run backend tests**
   - I will install required test dependencies using `run_in_bash_session` (`python3 -m pip install -r backend/requirements.txt pytest httpx pytest-asyncio`).
   - I will run the test suite using `run_in_bash_session` (`PYTHONPATH=$(pwd) python3 -m pytest backend/tests/`).
4. **Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.**
5. **Submit PR**
   - I will use the `submit` tool to create a PR with title `⚡ Bolt: Resolve N+1 query in get_topics endpoint` and a description containing What, Why, Impact, and Measurement.
