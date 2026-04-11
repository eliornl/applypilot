"""
Unit tests for the Rejection Analyzer Agent.
Tests rejection email analysis with mocked LLM responses.
"""

import pytest
from unittest.mock import AsyncMock, patch
from datetime import datetime

from agents.rejection_analyzer import RejectionAnalyzerAgent


# =============================================================================
# FIXTURES
# =============================================================================

MOCK_LLM_RESPONSE = {
    "response": """{
        "analysis_summary": "The rejection appears to be due to a skills mismatch.",
        "likely_reasons": [
            "Missing Kubernetes experience", "Competing candidate had more leadership"
        ],
        "improvement_suggestions": [
            {"area": "Technical skills", "suggestion": "Get Kubernetes certified",
             "timeline": "2-3 months", "priority": "HIGH"},
            {"area": "Leadership", "suggestion": "Seek team-lead opportunities",
             "timeline": "6 months", "priority": "MEDIUM"}
        ],
        "positive_signals": ["You made it to the final round", "Personalised rejection email"],
        "follow_up_recommended": true,
        "follow_up_subject": "Thank you for the opportunity",
        "follow_up_body": "Dear Hiring Manager, Thank you for your time...",
        "encouragement": "Every rejection is a step closer to the right opportunity."
    }""",
    "filtered": False,
}

SAMPLE_REJECTION_EMAIL = """
Dear John,

Thank you for your interest in the Senior Software Engineer position at TechCorp.
After careful consideration, we have decided to move forward with another candidate
whose experience more closely matches our current needs.

We appreciate the time you invested in our interview process and wish you success.

Best regards,
Hiring Team
"""


@pytest.fixture
def mock_gemini_client():
    """Mock Gemini client returning valid rejection analysis JSON."""
    client = AsyncMock()
    client.generate.return_value = MOCK_LLM_RESPONSE
    return client


# =============================================================================
# INITIALIZATION TESTS
# =============================================================================


class TestRejectionAnalyzerInit:
    """Tests for RejectionAnalyzerAgent initialization."""

    def test_init_starts_with_none_client(self):
        """Agent starts without a Gemini client (lazy-loaded)."""
        agent = RejectionAnalyzerAgent()
        assert agent.gemini_client is None

    def test_init_starts_with_none_api_key(self):
        """Agent starts with no user API key."""
        agent = RejectionAnalyzerAgent()
        assert agent._current_user_api_key is None


# =============================================================================
# SUCCESSFUL ANALYSIS TESTS
# =============================================================================


class TestRejectionAnalyzerAnalysis:
    """Tests for successful rejection email analysis."""

    @pytest.mark.asyncio
    async def test_analyze_success_returns_all_keys(self, mock_gemini_client):
        """Successful analysis should return all expected keys."""
        agent = RejectionAnalyzerAgent()

        with patch("agents.rejection_analyzer.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.analyze(rejection_email=SAMPLE_REJECTION_EMAIL)

        assert "analysis_summary" in result
        assert "likely_reasons" in result
        assert "improvement_suggestions" in result
        assert "positive_signals" in result
        assert "follow_up_recommended" in result
        assert "encouragement" in result
        assert "generated_at" in result
        assert "version" in result

    @pytest.mark.asyncio
    async def test_analyze_with_all_optional_params(self, mock_gemini_client):
        """Should work when all optional params are provided."""
        agent = RejectionAnalyzerAgent()

        with patch("agents.rejection_analyzer.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.analyze(
                rejection_email=SAMPLE_REJECTION_EMAIL,
                job_title="Senior Software Engineer",
                company_name="TechCorp",
                interview_stage="final_round",
                user_api_key="byok-key",
            )

        assert isinstance(result, dict)
        assert "analysis_summary" in result

    @pytest.mark.asyncio
    async def test_analyze_with_only_required_param(self, mock_gemini_client):
        """Should work with only the rejection_email required param."""
        agent = RejectionAnalyzerAgent()

        with patch("agents.rejection_analyzer.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.analyze(rejection_email=SAMPLE_REJECTION_EMAIL)

        assert isinstance(result, dict)

    @pytest.mark.asyncio
    async def test_likely_reasons_is_list(self, mock_gemini_client):
        """likely_reasons should always be a list."""
        agent = RejectionAnalyzerAgent()

        with patch("agents.rejection_analyzer.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.analyze(rejection_email=SAMPLE_REJECTION_EMAIL)

        assert isinstance(result["likely_reasons"], list)

    @pytest.mark.asyncio
    async def test_improvement_suggestions_is_list(self, mock_gemini_client):
        """improvement_suggestions should always be a list."""
        agent = RejectionAnalyzerAgent()

        with patch("agents.rejection_analyzer.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.analyze(rejection_email=SAMPLE_REJECTION_EMAIL)

        assert isinstance(result["improvement_suggestions"], list)

    @pytest.mark.asyncio
    async def test_follow_up_recommended_is_bool(self, mock_gemini_client):
        """follow_up_recommended should be a boolean."""
        agent = RejectionAnalyzerAgent()

        with patch("agents.rejection_analyzer.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.analyze(rejection_email=SAMPLE_REJECTION_EMAIL)

        assert isinstance(result["follow_up_recommended"], bool)

    @pytest.mark.asyncio
    async def test_follow_up_fields_present_when_recommended(self, mock_gemini_client):
        """When follow_up_recommended is True, subject and body should be present."""
        agent = RejectionAnalyzerAgent()

        with patch("agents.rejection_analyzer.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.analyze(rejection_email=SAMPLE_REJECTION_EMAIL)

        if result["follow_up_recommended"]:
            assert "follow_up_subject" in result
            assert "follow_up_body" in result

    @pytest.mark.asyncio
    async def test_generated_at_is_iso_timestamp(self, mock_gemini_client):
        """generated_at should be a valid ISO 8601 timestamp."""
        agent = RejectionAnalyzerAgent()

        with patch("agents.rejection_analyzer.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.analyze(rejection_email=SAMPLE_REJECTION_EMAIL)

        datetime.fromisoformat(result["generated_at"].replace("Z", "+00:00"))

    @pytest.mark.asyncio
    async def test_version_is_set(self, mock_gemini_client):
        """version field should be present."""
        agent = RejectionAnalyzerAgent()

        with patch("agents.rejection_analyzer.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.analyze(rejection_email=SAMPLE_REJECTION_EMAIL)

        assert result["version"] == "1.0"

    @pytest.mark.asyncio
    async def test_user_api_key_passed_to_llm(self, mock_gemini_client):
        """User API key should reach gemini_client.generate()."""
        agent = RejectionAnalyzerAgent()

        with patch("agents.rejection_analyzer.get_gemini_client", return_value=mock_gemini_client):
            await agent.analyze(
                rejection_email=SAMPLE_REJECTION_EMAIL,
                user_api_key="my-byok-key",
            )

        call_kwargs = mock_gemini_client.generate.call_args[1]
        assert call_kwargs.get("user_api_key") == "my-byok-key"

    @pytest.mark.asyncio
    async def test_gemini_client_lazy_initialized(self, mock_gemini_client):
        """get_gemini_client() should be called when client is None."""
        agent = RejectionAnalyzerAgent()

        with patch(
            "agents.rejection_analyzer.get_gemini_client", return_value=mock_gemini_client
        ) as mock_getter:
            await agent.analyze(rejection_email=SAMPLE_REJECTION_EMAIL)

        mock_getter.assert_called_once()

    @pytest.mark.asyncio
    async def test_encouragement_has_fallback(self):
        """encouragement should have a non-empty fallback string even when LLM omits it."""
        client = AsyncMock()
        client.generate.return_value = {
            "response": '{"analysis_summary": "Mismatch", "likely_reasons": []}',
            "filtered": False,
        }

        agent = RejectionAnalyzerAgent()

        with patch("agents.rejection_analyzer.get_gemini_client", return_value=client):
            result = await agent.analyze(rejection_email=SAMPLE_REJECTION_EMAIL)

        assert result["encouragement"]  # Must be a non-empty string


# =============================================================================
# ERROR HANDLING TESTS
# =============================================================================


class TestRejectionAnalyzerErrorHandling:
    """Tests for error handling in RejectionAnalyzerAgent."""

    @pytest.mark.asyncio
    async def test_filtered_response_returns_fallback(self):
        """Filtered LLM response should return a graceful fallback result, not raise."""
        client = AsyncMock()
        client.generate.return_value = {"response": "Filtered", "filtered": True}

        agent = RejectionAnalyzerAgent()

        with patch("agents.rejection_analyzer.get_gemini_client", return_value=client):
            result = await agent.analyze(rejection_email=SAMPLE_REJECTION_EMAIL)

        assert "analysis_summary" in result or "encouragement" in result

    @pytest.mark.asyncio
    async def test_invalid_json_returns_fallback(self):
        """Non-JSON LLM response should return a graceful fallback result, not raise."""
        client = AsyncMock()
        client.generate.return_value = {
            "response": "Your rejection was because you lacked experience.",
            "filtered": False,
        }

        agent = RejectionAnalyzerAgent()

        with patch("agents.rejection_analyzer.get_gemini_client", return_value=client):
            result = await agent.analyze(rejection_email=SAMPLE_REJECTION_EMAIL)

        assert isinstance(result, dict)

    @pytest.mark.asyncio
    async def test_llm_exception_propagated(self):
        """Exception from gemini_client.generate should propagate."""
        client = AsyncMock()
        client.generate.side_effect = TimeoutError("LLM timed out")

        agent = RejectionAnalyzerAgent()

        with patch("agents.rejection_analyzer.get_gemini_client", return_value=client):
            with pytest.raises(Exception):
                await agent.analyze(rejection_email=SAMPLE_REJECTION_EMAIL)

    @pytest.mark.asyncio
    async def test_llm_called_exactly_once(self, mock_gemini_client):
        """LLM should be called exactly once per analyze() call."""
        agent = RejectionAnalyzerAgent()

        with patch("agents.rejection_analyzer.get_gemini_client", return_value=mock_gemini_client):
            await agent.analyze(rejection_email=SAMPLE_REJECTION_EMAIL)

        assert mock_gemini_client.generate.call_count == 1
