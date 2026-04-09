import sqlite3
import os

db_path = 'paraclete.db'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(notes)")
    columns = cursor.fetchall()
    print("Columns in 'notes' table:")
    for col in columns:
        print(col[1])
    conn.close()
else:
    print(f"Database not found at {db_path}")
