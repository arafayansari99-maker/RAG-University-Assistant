import os
from contextlib import contextmanager
from typing import Iterator

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

DATABASE_URL = os.getenv("DATABASE_URL")
_pool: ConnectionPool | None = None

if DATABASE_URL:
    _pool = ConnectionPool(
        conninfo=DATABASE_URL,
        min_size=1,
        max_size=int(os.getenv("DB_POOL_MAX", "5")),
        kwargs={"row_factory": dict_row, "autocommit": True},
        open=False,
    )


def open_pool() -> None:
    if _pool is not None:
        _pool.open(wait=True)


def close_pool() -> None:
    if _pool is not None:
        _pool.close()


@contextmanager
def connection() -> Iterator[Connection]:
    if _pool is None:
        raise RuntimeError("DATABASE_URL is required for the FastAPI service")
    with _pool.connection() as conn:
        yield conn


def database_ready() -> bool:
    return _pool is not None
