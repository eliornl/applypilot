"""
Alembic environment configuration for async PostgreSQL migrations.
Supports both online (connected) and offline (SQL script) migration modes.
"""

import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Import your models' Base and all models for autogenerate support
from models.database import Base

# Import settings to get database URL
from config.settings import get_database_settings

# =============================================================================
# ALEMBIC CONFIG
# =============================================================================

# Alembic Config object - provides access to .ini file values
config = context.config

# Set up Python logging from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Metadata for 'autogenerate' support - this tells Alembic what tables exist
target_metadata = Base.metadata


def get_url() -> str:
    """
    Get the database URL from settings.
    Uses sync driver for migrations (psycopg2 instead of asyncpg).
    """
    db_settings = get_database_settings()
    return db_settings.sync_database_url


def run_migrations_offline() -> None:
    """
    Run migrations in 'offline' mode.
    
    This configures the context with just a URL and not an Engine,
    though an Engine is acceptable here as well. By skipping the Engine
    creation we don't even need a DBAPI to be available.
    
    Calls to context.execute() here emit the given string to the script output.
    """
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # Compare types for column type changes
        compare_type=True,
        # Compare server defaults
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """Run migrations with a database connection."""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        # Compare types for column type changes
        compare_type=True,
        # Compare server defaults  
        compare_server_default=True,
        # Include schemas
        include_schemas=True,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """
    Run migrations in async mode using asyncpg.
    Creates an async engine and runs migrations within a connection.
    """
    # Get database settings and create engine config
    db_settings = get_database_settings()
    
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = db_settings.async_database_url
    
    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """
    Run migrations in 'online' mode.
    Creates an async connection and runs migrations.
    """
    asyncio.run(run_async_migrations())


# Determine which mode to run based on context
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

