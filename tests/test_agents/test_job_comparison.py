"""
Unit tests for the Job Comparison Agent.
Tests job comparison analysis with mocked LLM responses.
Includes explicit validation for job count boundaries (2–3).
"""

import pytest
from unittest.mock import AsyncMock, patch
from datetime import datetime

from agents.job_comparison import JobComparisonAgent


# =============================================================================
# FIXTURES
# =============================================================================

MOCK_LLM_RESPONSE = {
    "response": """{
        "executive_summary": "Job A offers better growth while Job B pays more.",
        "recommended_job": "Senior Software Engineer at TechCorp",
        "recommendation_confidence": "high",
        "recommendation_reasoning": "Aligns best with long-term career goals.",
        "jobs_analysis": [
            {
                "job_title": "Senior Software Engineer",
                "company": "TechCorp",
                "overall_score": 85,
                "pros": ["Strong engineering culture", "Competitive salary"],
                "cons": ["Long commute"],
                "growth_potential": "HIGH",
                "culture_fit": "HIGH",
                "compensation_assessment": "Competitive"
            },
            {
                "job_title": "Staff Engineer",
                "company": "StartupCo",
                "overall_score": 72,
                "pros": ["Equity upside", "Remote friendly"],
                "cons": ["Early stage risk"],
                "growth_potential": "VERY HIGH",
                "culture_fit": "MEDIUM",
                "compensation_assessment": "Below market base"
            }
        ],
        "comparison_matrix": {
            "salary": {"TechCorp": "HIGH", "StartupCo": "MEDIUM"},
            "growth": {"TechCorp": "MEDIUM", "StartupCo": "HIGH"}
        },
        "decision_factors": [
            {"factor": "Compensation", "weight": "HIGH",
             "winner": "TechCorp", "reasoning": "Higher base salary"}
        ],
        "questions_to_ask": [
            {"company": "TechCorp", "question": "What does the promotion path look like?"}
        ],
        "final_advice": "Take TechCorp unless equity is a priority."
    }""",
    "filtered": False,
}

JOB_A = {
    "job_title": "Senior Software Engineer",
    "company": "TechCorp",
    "salary": "$180k",
    "location": "San Francisco",
}

JOB_B = {
    "job_title": "Staff Engineer",
    "company": "StartupCo",
    "salary": "$160k + equity",
    "location": "Remote",
}

JOB_C = {
    "job_title": "Principal Engineer",
    "company": "MegaCorp",
    "salary": "$200k",
    "location": "New York",
}

USER_CONTEXT = {
    "career_goals": "Move into leadership within 3 years",
    "priorities": ["compensation", "growth"],
    "years_experience": 7,
}


@pytest.fixture
def mock_gemini_client():
    """Mock Gemini client returning valid comparison JSON."""
    client = AsyncMock()
    client.generate.return_value = MOCK_LLM_RESPONSE
    return client


# =============================================================================
# INITIALIZATION TESTS
# =============================================================================


class TestJobComparisonInit:
    """Tests for JobComparisonAgent initialization."""

    def test_init_starts_with_none_client(self):
        """Agent starts without a Gemini client (lazy-loaded)."""
        agent = JobComparisonAgent()
        assert agent.gemini_client is None

    def test_init_starts_with_none_api_key(self):
        """Agent starts with no user API key."""
        agent = JobComparisonAgent()
        assert agent._current_user_api_key is None


# =============================================================================
# INPUT VALIDATION TESTS
# =============================================================================


class TestJobComparisonValidation:
    """Tests for input validation — job count boundaries."""

    @pytest.mark.asyncio
    async def test_one_job_raises_value_error(self):
        """Comparing fewer than 2 jobs must raise ValueError."""
        agent = JobComparisonAgent()

        with pytest.raises(ValueError, match="[Aa]t least 2"):
            await agent.compare(jobs=[JOB_A])

    @pytest.mark.asyncio
    async def test_zero_jobs_raises_value_error(self):
        """Empty jobs list must raise ValueError."""
        agent = JobComparisonAgent()

        with pytest.raises(ValueError, match="[Aa]t least 2"):
            await agent.compare(jobs=[])

    @pytest.mark.asyncio
    async def test_four_jobs_raises_value_error(self):
        """More than 3 jobs must raise ValueError."""
        agent = JobComparisonAgent()
        four_jobs = [JOB_A, JOB_B, JOB_C, {"job_title": "Extra", "company": "Extra"}]

        with pytest.raises(ValueError, match="[Mm]aximum 3"):
            await agent.compare(jobs=four_jobs)

    @pytest.mark.asyncio
    async def test_exactly_two_jobs_accepted(self, mock_gemini_client):
        """Exactly 2 jobs should be accepted and processed."""
        agent = JobComparisonAgent()

        with patch("agents.job_comparison.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.compare(jobs=[JOB_A, JOB_B])

        assert "recommended_job" in result

    @pytest.mark.asyncio
    async def test_exactly_three_jobs_accepted(self, mock_gemini_client):
        """Exactly 3 jobs should be accepted and processed."""
        agent = JobComparisonAgent()

        with patch("agents.job_comparison.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.compare(jobs=[JOB_A, JOB_B, JOB_C])

        assert "recommended_job" in result


# =============================================================================
# SUCCESSFUL COMPARISON TESTS
# =============================================================================


class TestJobComparisonGeneration:
    """Tests for successful job comparison generation."""

    @pytest.mark.asyncio
    async def test_compare_success_returns_all_keys(self, mock_gemini_client):
        """Successful comparison should return all expected keys."""
        agent = JobComparisonAgent()

        with patch("agents.job_comparison.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.compare(jobs=[JOB_A, JOB_B])

        assert "executive_summary" in result
        assert "recommended_job" in result
        assert "recommendation_confidence" in result
        assert "recommendation_reasoning" in result
        assert "jobs_analysis" in result
        assert "comparison_matrix" in result
        assert "decision_factors" in result
        assert "questions_to_ask" in result
        assert "final_advice" in result
        assert "jobs_compared" in result
        assert "generated_at" in result
        assert "version" in result

    @pytest.mark.asyncio
    async def test_jobs_compared_matches_input_count(self, mock_gemini_client):
        """jobs_compared should reflect the number of jobs submitted."""
        agent = JobComparisonAgent()

        with patch("agents.job_comparison.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.compare(jobs=[JOB_A, JOB_B, JOB_C])

        assert result["jobs_compared"] == 3

    @pytest.mark.asyncio
    async def test_compare_with_user_context(self, mock_gemini_client):
        """Should work with optional user_context supplied."""
        agent = JobComparisonAgent()

        with patch("agents.job_comparison.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.compare(
                jobs=[JOB_A, JOB_B],
                user_context=USER_CONTEXT,
            )

        assert isinstance(result, dict)

    @pytest.mark.asyncio
    async def test_compare_without_user_context(self, mock_gemini_client):
        """Should work when user_context is omitted."""
        agent = JobComparisonAgent()

        with patch("agents.job_comparison.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.compare(jobs=[JOB_A, JOB_B])

        assert isinstance(result, dict)

    @pytest.mark.asyncio
    async def test_generated_at_is_iso_timestamp(self, mock_gemini_client):
        """generated_at should be a valid ISO 8601 timestamp."""
        agent = JobComparisonAgent()

        with patch("agents.job_comparison.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.compare(jobs=[JOB_A, JOB_B])

        datetime.fromisoformat(result["generated_at"].replace("Z", "+00:00"))

    @pytest.mark.asyncio
    async def test_version_is_set(self, mock_gemini_client):
        """version field should be '1.0'."""
        agent = JobComparisonAgent()

        with patch("agents.job_comparison.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.compare(jobs=[JOB_A, JOB_B])

        assert result["version"] == "1.0"

    @pytest.mark.asyncio
    async def test_jobs_analysis_is_list(self, mock_gemini_client):
        """jobs_analysis should be a list."""
        agent = JobComparisonAgent()

        with patch("agents.job_comparison.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.compare(jobs=[JOB_A, JOB_B])

        assert isinstance(result["jobs_analysis"], list)

    @pytest.mark.asyncio
    async def test_user_api_key_passed_to_llm(self, mock_gemini_client):
        """User API key should reach gemini_client.generate()."""
        agent = JobComparisonAgent()

        with patch("agents.job_comparison.get_gemini_client", return_value=mock_gemini_client):
            await agent.compare(jobs=[JOB_A, JOB_B], user_api_key="byok-key")

        call_kwargs = mock_gemini_client.generate.call_args[1]
        assert call_kwargs.get("user_api_key") == "byok-key"

    @pytest.mark.asyncio
    async def test_gemini_client_lazy_initialized(self, mock_gemini_client):
        """get_gemini_client() should be called when client is None."""
        agent = JobComparisonAgent()

        with patch(
            "agents.job_comparison.get_gemini_client", return_value=mock_gemini_client
        ) as mock_getter:
            await agent.compare(jobs=[JOB_A, JOB_B])

        mock_getter.assert_called_once()


# =============================================================================
# ERROR HANDLING TESTS
# =============================================================================


class TestJobComparisonErrorHandling:
    """Tests for error handling in JobComparisonAgent."""

    @pytest.mark.asyncio
    async def test_filtered_response_returns_fallback(self):
        """Filtered LLM response should return a graceful fallback result, not raise."""
        client = AsyncMock()
        client.generate.return_value = {"response": "Filtered", "filtered": True}

        agent = JobComparisonAgent()

        with patch("agents.job_comparison.get_gemini_client", return_value=client):
            result = await agent.compare(jobs=[JOB_A, JOB_B])

        assert "recommended_job" in result or "jobs_compared" in result

    @pytest.mark.asyncio
    async def test_invalid_json_returns_fallback(self):
        """Non-JSON LLM response should return a graceful fallback result, not raise."""
        client = AsyncMock()
        client.generate.return_value = {
            "response": "Job A is better because it pays more.",
            "filtered": False,
        }

        agent = JobComparisonAgent()

        with patch("agents.job_comparison.get_gemini_client", return_value=client):
            result = await agent.compare(jobs=[JOB_A, JOB_B])

        assert isinstance(result, dict)

    @pytest.mark.asyncio
    async def test_llm_exception_propagated(self):
        """Exception from gemini_client.generate should propagate."""
        client = AsyncMock()
        client.generate.side_effect = RuntimeError("API quota exceeded")

        agent = JobComparisonAgent()

        with patch("agents.job_comparison.get_gemini_client", return_value=client):
            with pytest.raises(Exception):
                await agent.compare(jobs=[JOB_A, JOB_B])

    @pytest.mark.asyncio
    async def test_llm_called_exactly_once(self, mock_gemini_client):
        """LLM should be called exactly once per compare() call."""
        agent = JobComparisonAgent()

        with patch("agents.job_comparison.get_gemini_client", return_value=mock_gemini_client):
            await agent.compare(jobs=[JOB_A, JOB_B])

        assert mock_gemini_client.generate.call_count == 1
