"""
Integration tests for Career Tools API endpoints.

No running server required — uses ASGITransport + real test DB.
LLM agents are mocked; rate limiting is mocked via package conftest.

Endpoints:
  POST /api/v1/tools/thank-you
  POST /api/v1/tools/rejection-analysis
  POST /api/v1/tools/reference-request
  POST /api/v1/tools/job-comparison
  GET  /api/v1/tools/followup-stages
  POST /api/v1/tools/followup
  POST /api/v1/tools/salary-coach
"""

import pytest
from unittest.mock import AsyncMock, patch

BASE = "/api/v1/tools"

# ---------------------------------------------------------------------------
# Shared agent mock return values
# ---------------------------------------------------------------------------

THANK_YOU_RESULT = {
    "subject_line": "Thank you for the interview",
    "email_body": "Dear Sarah, thank you...",
    "key_points_referenced": ["Python discussion"],
    "tone": "professional",
    "generated_at": "2026-01-01T00:00:00+00:00",
    "version": "1.0",
}

REJECTION_RESULT = {
    "analysis_summary": "Skills mismatch",
    "likely_reasons": ["Missing Kubernetes"],
    "improvement_suggestions": [],
    "positive_signals": [],
    "follow_up_recommended": False,
    "encouragement": "Keep going!",
    "generated_at": "2026-01-01T00:00:00+00:00",
    "version": "1.0",
}

REFERENCE_RESULT = {
    "subject_line": "Reference Request",
    "email_body": "Dear Bob, I hope...",
    "talking_points": ["Led the migration project"],
    "follow_up_timeline": "1 week",
    "tips": ["Keep it short"],
    "generated_at": "2026-01-01T00:00:00+00:00",
    "version": "1.0",
}

JOB_COMPARISON_RESULT = {
    "executive_summary": "Job A is better",
    "recommended_job": "Senior Engineer at TechCorp",
    "recommendation_confidence": "high",
    "recommendation_reasoning": "Better culture fit",
    "jobs_analysis": [],
    "comparison_matrix": {},
    "decision_factors": [],
    "questions_to_ask": [],
    "final_advice": "Take Job A",
    "jobs_compared": 2,
    "generated_at": "2026-01-01T00:00:00+00:00",
    "version": "1.0",
}

FOLLOWUP_RESULT = {
    "subject_line": "Following up",
    "email_body": "Dear Team, following up...",
    "key_elements": ["Enthusiasm"],
    "tone": "professional",
    "timing_advice": "Send on Tuesday",
    "next_steps": "Wait 5 days",
    "alternative_subject": "Re: Application",
    "stage": "after_interview",
    "generated_at": "2026-01-01T00:00:00+00:00",
    "version": "1.0",
}

SALARY_RESULT = {
    "market_analysis": {"market_rate_range": "$170k-$200k", "negotiation_potential": "HIGH",
                        "your_offer_assessment": "Below market", "data_sources": []},
    "strategy_overview": {"recommended_approach": "Collaborative", "target_increase": "15%",
                          "confidence_level": "HIGH", "timing": "48h"},
    "main_script": {"opening": "I am excited...", "ask": "I was hoping...",
                    "anchor": "$200k", "close": "I am confident..."},
    "pushback_responses": [],
    "alternative_asks": [],
    "email_template": {"subject": "Re: Offer", "body": "Dear Mgr..."},
    "dos_and_donts": {"dos": [], "donts": []},
    "red_flags": [],
    "walk_away_point": "$160k",
    "final_tips": [],
    "job_title": "Engineer",
    "company_name": "TechCorp",
    "offered_salary": "$155k",
    "generated_at": "2026-01-01T00:00:00+00:00",
    "version": "1.0",
}


# ---------------------------------------------------------------------------
# Patch helpers
# ---------------------------------------------------------------------------

def _api_key_patches():
    """Context managers that make the server think an API key is available."""
    return [
        patch("api.tools._check_api_key_available", AsyncMock(return_value=True)),
        patch("api.tools._get_user_api_key", AsyncMock(return_value=None)),
        patch("api.tools.get_cached_tool_result", AsyncMock(return_value=None)),
        patch("api.tools.cache_tool_result", AsyncMock(return_value=None)),
    ]


# ---------------------------------------------------------------------------
# Thank You Note
# ---------------------------------------------------------------------------


class TestThankYouNote:
    """POST /api/v1/tools/thank-you"""

    @pytest.mark.asyncio
    async def test_happy_path_returns_200(self, authed_client):
        with patch("api.tools._check_api_key_available", AsyncMock(return_value=True)), \
             patch("api.tools._get_user_api_key", AsyncMock(return_value=None)), \
             patch("api.tools.get_cached_tool_result", AsyncMock(return_value=None)), \
             patch("api.tools.cache_tool_result", AsyncMock(return_value=None)), \
             patch("agents.thank_you_writer.ThankYouWriterAgent.generate",
                   AsyncMock(return_value=THANK_YOU_RESULT)):
            resp = await authed_client.post(
                f"{BASE}/thank-you",
                json={
                    "interviewer_name": "Sarah",
                    "interview_type": "technical",
                    "company_name": "TechCorp",
                    "job_title": "Senior Engineer",
                },
            )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "subject_line" in data
        assert "email_body" in data

    @pytest.mark.asyncio
    async def test_no_auth_returns_401_or_403(self, api_client):
        resp = await api_client.post(
            f"{BASE}/thank-you",
            json={"interviewer_name": "X", "interview_type": "phone",
                  "company_name": "Co", "job_title": "Dev"},
        )
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_missing_company_and_job_title_returns_400(self, authed_client):
        with patch("api.tools._check_api_key_available", AsyncMock(return_value=True)), \
             patch("api.tools._get_user_api_key", AsyncMock(return_value=None)):
            resp = await authed_client.post(
                f"{BASE}/thank-you",
                json={"interviewer_name": "Sarah", "interview_type": "technical"},
            )
        assert resp.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_rate_limited_returns_429(self, authed_client):
        from utils.cache import RateLimitResult
        blocked = RateLimitResult(allowed=False, limit=10, remaining=0, reset_seconds=3600)
        with patch("api.tools.check_rate_limit_with_headers", AsyncMock(return_value=blocked)):
            resp = await authed_client.post(
                f"{BASE}/thank-you",
                json={"interviewer_name": "X", "interview_type": "phone",
                      "company_name": "Co", "job_title": "Dev"},
            )
        assert resp.status_code == 429

    @pytest.mark.asyncio
    async def test_no_api_key_returns_400_or_422(self, authed_client):
        with patch("api.tools._check_api_key_available", AsyncMock(return_value=False)):
            resp = await authed_client.post(
                f"{BASE}/thank-you",
                json={"interviewer_name": "X", "interview_type": "phone",
                      "company_name": "Co", "job_title": "Dev"},
            )
        # validation_error() returns 422 Unprocessable Entity
        assert resp.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_cache_hit_skips_agent(self, authed_client):
        """When a cached result exists, the agent should not be called."""
        with patch("api.tools._check_api_key_available", AsyncMock(return_value=True)), \
             patch("api.tools._get_user_api_key", AsyncMock(return_value=None)), \
             patch("api.tools.get_cached_tool_result",
                   AsyncMock(return_value=THANK_YOU_RESULT)) as mock_cache, \
             patch("agents.thank_you_writer.ThankYouWriterAgent.generate",
                   AsyncMock(return_value=THANK_YOU_RESULT)) as mock_agent:
            resp = await authed_client.post(
                f"{BASE}/thank-you",
                json={"interviewer_name": "X", "interview_type": "phone",
                      "company_name": "Co", "job_title": "Dev"},
            )
        assert resp.status_code == 200
        mock_agent.assert_not_called()


# ---------------------------------------------------------------------------
# Rejection Analysis
# ---------------------------------------------------------------------------


class TestRejectionAnalysis:
    """POST /api/v1/tools/rejection-analysis"""

    @pytest.mark.asyncio
    async def test_happy_path_returns_200(self, authed_client):
        with patch("api.tools._check_api_key_available", AsyncMock(return_value=True)), \
             patch("api.tools._get_user_api_key", AsyncMock(return_value=None)), \
             patch("api.tools.get_cached_tool_result", AsyncMock(return_value=None)), \
             patch("api.tools.cache_tool_result", AsyncMock(return_value=None)), \
             patch("agents.rejection_analyzer.RejectionAnalyzerAgent.analyze",
                   AsyncMock(return_value=REJECTION_RESULT)):
            resp = await authed_client.post(
                f"{BASE}/rejection-analysis",
                json={"rejection_email": "Dear John, we regret to inform you..."},
            )
        assert resp.status_code == 200
        assert "analysis_summary" in resp.json()

    @pytest.mark.asyncio
    async def test_no_auth_returns_401_or_403(self, api_client):
        resp = await api_client.post(
            f"{BASE}/rejection-analysis",
            json={"rejection_email": "We regret..."},
        )
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_missing_rejection_email_returns_422(self, authed_client):
        with patch("api.tools._check_api_key_available", AsyncMock(return_value=True)), \
             patch("api.tools._get_user_api_key", AsyncMock(return_value=None)):
            resp = await authed_client.post(
                f"{BASE}/rejection-analysis",
                json={"job_title": "Engineer"},  # missing rejection_email
            )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_rate_limited_returns_429(self, authed_client):
        from utils.cache import RateLimitResult
        blocked = RateLimitResult(allowed=False, limit=10, remaining=0, reset_seconds=3600)
        with patch("api.tools.check_rate_limit_with_headers", AsyncMock(return_value=blocked)):
            resp = await authed_client.post(
                f"{BASE}/rejection-analysis",
                json={"rejection_email": "We regret..."},
            )
        assert resp.status_code == 429


# ---------------------------------------------------------------------------
# Reference Request
# ---------------------------------------------------------------------------


class TestReferenceRequest:
    """POST /api/v1/tools/reference-request"""

    @pytest.mark.asyncio
    async def test_happy_path_returns_200(self, authed_client):
        with patch("api.tools._check_api_key_available", AsyncMock(return_value=True)), \
             patch("api.tools._get_user_api_key", AsyncMock(return_value=None)), \
             patch("api.tools.get_cached_tool_result", AsyncMock(return_value=None)), \
             patch("api.tools.cache_tool_result", AsyncMock(return_value=None)), \
             patch("agents.reference_request_writer.ReferenceRequestWriterAgent.generate",
                   AsyncMock(return_value=REFERENCE_RESULT)):
            resp = await authed_client.post(
                f"{BASE}/reference-request",
                json={"reference_name": "Bob Smith", "reference_relationship": "Manager"},
            )
        assert resp.status_code == 200
        assert "email_body" in resp.json()

    @pytest.mark.asyncio
    async def test_no_auth_returns_401_or_403(self, api_client):
        resp = await api_client.post(
            f"{BASE}/reference-request",
            json={"reference_name": "Bob", "reference_relationship": "Manager"},
        )
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_missing_fields_returns_422(self, authed_client):
        with patch("api.tools._check_api_key_available", AsyncMock(return_value=True)), \
             patch("api.tools._get_user_api_key", AsyncMock(return_value=None)):
            resp = await authed_client.post(
                f"{BASE}/reference-request",
                json={"reference_name": "Bob"},  # missing reference_relationship
            )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_rate_limited_returns_429(self, authed_client):
        from utils.cache import RateLimitResult
        blocked = RateLimitResult(allowed=False, limit=10, remaining=0, reset_seconds=3600)
        with patch("api.tools.check_rate_limit_with_headers", AsyncMock(return_value=blocked)):
            resp = await authed_client.post(
                f"{BASE}/reference-request",
                json={"reference_name": "Bob", "reference_relationship": "Mgr"},
            )
        assert resp.status_code == 429


# ---------------------------------------------------------------------------
# Job Comparison
# ---------------------------------------------------------------------------


class TestJobComparison:
    """POST /api/v1/tools/job-comparison"""

    _TWO_JOBS = [
        {"title": "Senior Engineer", "company": "TechCorp", "salary": "$180k"},
        {"title": "Staff Engineer", "company": "StartupCo", "salary": "$160k"},
    ]

    @pytest.mark.asyncio
    async def test_happy_path_two_jobs_returns_200(self, authed_client):
        with patch("api.tools._check_api_key_available", AsyncMock(return_value=True)), \
             patch("api.tools._get_user_api_key", AsyncMock(return_value=None)), \
             patch("api.tools.get_cached_tool_result", AsyncMock(return_value=None)), \
             patch("api.tools.cache_tool_result", AsyncMock(return_value=None)), \
             patch("agents.job_comparison.JobComparisonAgent.compare",
                   AsyncMock(return_value=JOB_COMPARISON_RESULT)):
            resp = await authed_client.post(
                f"{BASE}/job-comparison", json={"jobs": self._TWO_JOBS}
            )
        assert resp.status_code == 200
        assert "recommended_job" in resp.json()

    @pytest.mark.asyncio
    async def test_one_job_returns_400_or_422(self, authed_client):
        with patch("api.tools._check_api_key_available", AsyncMock(return_value=True)), \
             patch("api.tools._get_user_api_key", AsyncMock(return_value=None)):
            resp = await authed_client.post(
                f"{BASE}/job-comparison",
                json={"jobs": [{"title": "Engineer", "company": "Co"}]},
            )
        assert resp.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_no_auth_returns_401_or_403(self, api_client):
        resp = await api_client.post(
            f"{BASE}/job-comparison", json={"jobs": self._TWO_JOBS}
        )
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_rate_limited_returns_429(self, authed_client):
        from utils.cache import RateLimitResult
        blocked = RateLimitResult(allowed=False, limit=10, remaining=0, reset_seconds=3600)
        with patch("api.tools.check_rate_limit_with_headers", AsyncMock(return_value=blocked)):
            resp = await authed_client.post(
                f"{BASE}/job-comparison", json={"jobs": self._TWO_JOBS}
            )
        assert resp.status_code == 429


# ---------------------------------------------------------------------------
# Follow-up stages (GET — no auth required)
# ---------------------------------------------------------------------------


class TestFollowUpStages:
    """GET /api/v1/tools/followup-stages"""

    @pytest.mark.asyncio
    async def test_no_auth_returns_401_or_403(self, api_client):
        """Endpoint requires auth."""
        resp = await api_client.get(f"{BASE}/followup-stages")
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_returns_200_with_stages(self, authed_client):
        resp = await authed_client.get(f"{BASE}/followup-stages")
        assert resp.status_code == 200
        data = resp.json()
        stages_key = "stages" if "stages" in data else list(data.keys())[0]
        assert len(data[stages_key]) == 7


# ---------------------------------------------------------------------------
# Follow-up Generator
# ---------------------------------------------------------------------------


class TestFollowUpGenerator:
    """POST /api/v1/tools/followup"""

    @pytest.mark.asyncio
    async def test_happy_path_returns_200(self, authed_client):
        with patch("api.tools._check_api_key_available", AsyncMock(return_value=True)), \
             patch("api.tools._get_user_api_key", AsyncMock(return_value=None)), \
             patch("api.tools.get_cached_tool_result", AsyncMock(return_value=None)), \
             patch("api.tools.cache_tool_result", AsyncMock(return_value=None)), \
             patch("agents.followup_generator.FollowUpGeneratorAgent.generate",
                   AsyncMock(return_value=FOLLOWUP_RESULT)):
            resp = await authed_client.post(
                f"{BASE}/followup",
                json={
                    "stage": "after_interview",
                    "company_name": "TechCorp",
                    "job_title": "Engineer",
                },
            )
        assert resp.status_code == 200
        assert "email_body" in resp.json()

    @pytest.mark.asyncio
    async def test_no_auth_returns_401_or_403(self, api_client):
        resp = await api_client.post(
            f"{BASE}/followup",
            json={"stage": "after_interview", "company_name": "Co", "job_title": "Dev"},
        )
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_invalid_stage_returns_400_or_422(self, authed_client):
        with patch("api.tools._check_api_key_available", AsyncMock(return_value=True)), \
             patch("api.tools._get_user_api_key", AsyncMock(return_value=None)):
            resp = await authed_client.post(
                f"{BASE}/followup",
                json={"stage": "INVALID_STAGE", "company_name": "Co", "job_title": "Dev"},
            )
        assert resp.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_rate_limited_returns_429(self, authed_client):
        from utils.cache import RateLimitResult
        blocked = RateLimitResult(allowed=False, limit=10, remaining=0, reset_seconds=3600)
        with patch("api.tools.check_rate_limit_with_headers", AsyncMock(return_value=blocked)):
            resp = await authed_client.post(
                f"{BASE}/followup",
                json={"stage": "after_interview", "company_name": "Co", "job_title": "Dev"},
            )
        assert resp.status_code == 429


# ---------------------------------------------------------------------------
# Salary Coach
# ---------------------------------------------------------------------------


class TestSalaryCoach:
    """POST /api/v1/tools/salary-coach"""

    @pytest.mark.asyncio
    async def test_happy_path_returns_200(self, authed_client):
        with patch("api.tools._check_api_key_available", AsyncMock(return_value=True)), \
             patch("api.tools._get_user_api_key", AsyncMock(return_value=None)), \
             patch("api.tools.get_cached_tool_result", AsyncMock(return_value=None)), \
             patch("api.tools.cache_tool_result", AsyncMock(return_value=None)), \
             patch("agents.salary_coach.SalaryCoachAgent.generate_strategy",
                   AsyncMock(return_value=SALARY_RESULT)):
            resp = await authed_client.post(
                f"{BASE}/salary-coach",
                json={
                    "job_title": "Senior Engineer",
                    "company_name": "TechCorp",
                    "offered_salary": "$155,000",
                },
            )
        assert resp.status_code == 200
        assert "main_script" in resp.json()

    @pytest.mark.asyncio
    async def test_no_auth_returns_401_or_403(self, api_client):
        resp = await api_client.post(
            f"{BASE}/salary-coach",
            json={"job_title": "Dev", "company_name": "Co", "offered_salary": "$100k"},
        )
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_missing_offered_salary_returns_422(self, authed_client):
        with patch("api.tools._check_api_key_available", AsyncMock(return_value=True)), \
             patch("api.tools._get_user_api_key", AsyncMock(return_value=None)):
            resp = await authed_client.post(
                f"{BASE}/salary-coach",
                json={"job_title": "Dev", "company_name": "Co"},
            )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_rate_limited_returns_429(self, authed_client):
        from utils.cache import RateLimitResult
        blocked = RateLimitResult(allowed=False, limit=10, remaining=0, reset_seconds=3600)
        with patch("api.tools.check_rate_limit_with_headers", AsyncMock(return_value=blocked)):
            resp = await authed_client.post(
                f"{BASE}/salary-coach",
                json={"job_title": "Dev", "company_name": "Co", "offered_salary": "$100k"},
            )
        assert resp.status_code == 429

    @pytest.mark.asyncio
    async def test_no_api_key_returns_400_or_422(self, authed_client):
        with patch("api.tools._check_api_key_available", AsyncMock(return_value=False)):
            resp = await authed_client.post(
                f"{BASE}/salary-coach",
                json={"job_title": "Dev", "company_name": "Co", "offered_salary": "$100k"},
            )
        assert resp.status_code in (400, 422)
