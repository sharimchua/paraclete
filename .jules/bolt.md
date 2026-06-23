## 2026-04-26 - Optimize get_trends memory usage
**Learning:** The `get_trends` backend endpoint has a recognized architectural bottleneck. It utilizes `joinedload` to eagerly load all notes and their relationships into memory for Python-side aggregation, which scales poorly as the number of notes increases (O(N) memory allocation and processing time).
**Action:** Move the trend aggregation logic to the database level using SQLAlchemy. Fetch only the data we need (e.g. counting tags grouped by month) instead of loading all objects.
