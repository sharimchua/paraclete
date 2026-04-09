import sqlite3

db_path = 'paraclete.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    print("Adding 'session_brief' to 'notes' table...")
    cursor.execute("ALTER TABLE notes ADD COLUMN session_brief TEXT")
    conn.commit()
    print("Successfully added 'session_brief' column.")
except sqlite3.OperationalError as e:
    if "duplicate column name" in str(e):
        print("Column 'session_brief' already exists.")
    else:
        print(f"Error adding column: {e}")

conn.close()
