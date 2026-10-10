"""Backend tests run against a throwaway local SQLite file, never the real database.

connection.py reads DATABASE_URL at import and load_dotenv() does not override variables that are
already set, so blanking it here keeps a developer's .env (Tiger Data) out of the tests.
"""

import os
import tempfile

os.environ["DATABASE_URL"] = ""
os.environ["SQLITE_PATH"] = os.path.join(tempfile.mkdtemp(prefix="cribby-tests-"), "test.db")

from backend.db.migrate import run_migrations  # noqa: E402

run_migrations()
