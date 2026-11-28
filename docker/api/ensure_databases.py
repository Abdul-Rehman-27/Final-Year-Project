"""Wait for PostgreSQL and create the project and Medical Assistant databases if missing.

The Postgres container creates both on first start (docker/postgres/init). This is a safety
net for a data volume that already existed before the second database was introduced.
"""
import os
import sys
import time

import psycopg2
from psycopg2 import sql
from sqlalchemy.engine import make_url

URL_VARS = ("DATABASE_URL", "MEDICAL_ASSISTANT_DATABASE_URL")


def connect_maintenance(url, attempts=60):
    last = None
    for _ in range(attempts):
        try:
            conn = psycopg2.connect(host=url.host, port=url.port or 5432, user=url.username,
                                    password=url.password, dbname="postgres", connect_timeout=5)
            conn.autocommit = True
            return conn
        except psycopg2.OperationalError as exc:
            last = exc
            time.sleep(2)
    sys.exit(f"PostgreSQL is not reachable: {last}")


def main():
    for var in URL_VARS:
        value = os.environ.get(var, "")
        if not value.startswith("postgresql"):
            continue
        url = make_url(value)
        conn = connect_maintenance(url)
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (url.database,))
                if cur.fetchone():
                    print(f"database ok     : {url.database}")
                else:
                    cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(url.database)))
                    print(f"database created: {url.database}")
        finally:
            conn.close()


if __name__ == "__main__":
    main()
