"""
Detect duplicate job applications by normalized job title + company name.
"""

from __future__ import annotations

import uuid
from typing import Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import JobApplication, WorkflowSession


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


def _effective_title_company(
    application: JobApplication,
    workflow_session: Optional[WorkflowSession],
) -> Tuple[Optional[str], Optional[str]]:
    """
    Match ``api.applications._format_application_response`` fallbacks: prefer
    ``job_applications`` columns, then ``workflow_sessions.job_analysis``.
    """
    analysis = (workflow_session.job_analysis or {}) if workflow_session else {}
    title = application.job_title or analysis.get("job_title")
    company = application.company_name or analysis.get("company_name")
    if not isinstance(title, str):
        title = None
    if not isinstance(company, str):
        company = None
    return title, company


async def find_conflicting_job_application(
    db: AsyncSession,
    user_id: uuid.UUID,
    session_id: str,
    job_title: Optional[str],
    company_name: Optional[str],
) -> Optional[JobApplication]:
    """
    Return another non-deleted application for the same user with the same normalized
    title and company, if one exists (excluding ``session_id``).

    Uses the same effective title/company as the dashboard (``job_applications`` first,
    then ``job_analysis`` on the linked workflow session) so rows that only have
    structured analyzer output in JSON still dedupe correctly.
    """
    key = normalize_title_company_key(job_title, company_name)
    if key is None:
        return None
    nt, nc = key

    stmt = (
        select(JobApplication, WorkflowSession)
        .join(WorkflowSession, WorkflowSession.session_id == JobApplication.session_id)
        .where(
            JobApplication.user_id == user_id,
            JobApplication.deleted_at.is_(None),
            JobApplication.session_id != session_id,
        )
    )
    result = await db.execute(stmt)
    for app, ws in result.all():
        eff_title, eff_company = _effective_title_company(app, ws)
        other = normalize_title_company_key(eff_title, eff_company)
        if other == (nt, nc):
            return app
    return None
