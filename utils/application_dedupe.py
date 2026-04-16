"""
Deduplicate job application rows when the same role+company appears more than once
(e.g. extension submit + dashboard paste with slightly different raw text).
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, Tuple

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import JobApplication

logger = logging.getLogger(__name__)


def normalize_title_company_key(
    title: Optional[str], company: Optional[str]
) -> Optional[Tuple[str, str]]:
    """Comparable (title, company) pair, or None if either side is empty."""
    if not title or not company:
        return None
    t = " ".join(title.strip().lower().split())
    c = " ".join(company.strip().lower().split())
    if not t or not c:
        return None
    return (t, c)


async def soft_delete_older_duplicates_for_same_job(
    db: AsyncSession,
    user_id: uuid.UUID,
    job_title: Optional[str],
    company_name: Optional[str],
    keep_session_id: str,
) -> int:
    """
    Soft-delete older duplicate applications for the same normalized (title, company).

    Keeps the row for ``keep_session_id`` (the workflow that just received analyzer
    output). Removes strictly *older* ``created_at`` rows so the latest submission
    remains (extension vs paste).

    Returns:
        Number of rows soft-deleted.
    """
    key = normalize_title_company_key(job_title, company_name)
    if key is None:
        return 0

    nt, nc = key

    res_cur = await db.execute(
        select(JobApplication).where(
            JobApplication.user_id == user_id,
            JobApplication.deleted_at.is_(None),
            JobApplication.session_id == keep_session_id,
        )
    )
    current = res_cur.scalar_one_or_none()
    if not current or not current.created_at:
        return 0

    res_others = await db.execute(
        select(JobApplication).where(
            JobApplication.user_id == user_id,
            JobApplication.deleted_at.is_(None),
            JobApplication.session_id != keep_session_id,
            func.lower(func.btrim(JobApplication.job_title)) == nt,
            func.lower(func.btrim(JobApplication.company_name)) == nc,
        )
    )
    others = res_others.scalars().all()

    now = datetime.now(timezone.utc)
    deleted = 0
    for row in others:
        if row.created_at and row.created_at < current.created_at:
            await db.execute(
                update(JobApplication)
                .where(JobApplication.id == row.id)
                .values(deleted_at=now, updated_at=now)
            )
            deleted += 1

    if deleted:
        logger.info(
            "Soft-deleted %s older duplicate job application(s) for user %s "
            "(kept session_id=%s)",
            deleted,
            user_id,
            keep_session_id,
        )

    return deleted
