"""
Unit tests for the Reference Request Writer Agent.
Tests reference request email generation with mocked LLM responses.
"""

import pytest
from unittest.mock import AsyncMock, patch
from datetime import datetime

from agents.reference_request_writer import ReferenceRequestWriterAgent


# =============================================================================
# FIXTURES
# =============================================================================

MOCK_LLM_RESPONSE = {
    "response": """{
        "subject_line": "Reference Request - Senior Software Engineer at TechCorp",
        "email_body": "Dear Sarah,\\n\\nI hope this finds you well...",
        "talking_points": [
            "Led the migration project to AWS",
            "Reduced deployment time by 40%"
        ],
        "follow_up_timeline": "Follow up in 1 week if no response",
        "tips": ["Send on a Tuesday or Wednesday", "Keep it under 200 words"]
    }""",
    "filtered": False,
}


@pytest.fixture
def mock_gemini_client():
    """Mock Gemini client returning valid reference request JSON."""
    client = AsyncMock()
    client.generate.return_value = MOCK_LLM_RESPONSE
    return client


# =============================================================================
# INITIALIZATION TESTS
# =============================================================================


class TestReferenceRequestWriterInit:
    """Tests for ReferenceRequestWriterAgent initialization."""

    def test_init_starts_with_none_client(self):
        """Agent starts without a Gemini client (lazy-loaded)."""
        agent = ReferenceRequestWriterAgent()
        assert agent.gemini_client is None

    def test_init_starts_with_none_api_key(self):
        """Agent starts with no user API key."""
        agent = ReferenceRequestWriterAgent()
        assert agent._current_user_api_key is None


# =============================================================================
# SUCCESSFUL GENERATION TESTS
# =============================================================================


class TestReferenceRequestGeneration:
    """Tests for successful reference request email generation."""

    @pytest.mark.asyncio
    async def test_generate_success_returns_all_keys(self, mock_gemini_client):
        """Successful generation returns all expected keys."""
        agent = ReferenceRequestWriterAgent()

        with patch(
            "agents.reference_request_writer.get_gemini_client",
            return_value=mock_gemini_client,
        ):
            result = await agent.generate(
                reference_name="Sarah Chen",
                reference_relationship="Former manager",
            )

        assert "subject_line" in result
        assert "email_body" in result
        assert "talking_points" in result
        assert "follow_up_timeline" in result
        assert "tips" in result
        assert "generated_at" in result
        assert "version" in result

    @pytest.mark.asyncio
    async def test_generate_with_all_optional_params(self, mock_gemini_client):
        """Should work with all optional params supplied."""
        agent = ReferenceRequestWriterAgent()

        with patch(
            "agents.reference_request_writer.get_gemini_client",
            return_value=mock_gemini_client,
        ):
            result = await agent.generate(
                reference_name="Bob Smith",
                reference_relationship="Direct supervisor",
                reference_company="StartupCo",
                years_worked_together=3,
                target_job_title="Staff Engineer",
                target_company="BigTech",
                key_accomplishments=["Led migration", "Mentored 3 juniors"],
                time_since_contact="6 months",
                user_name="John Doe",
                user_api_key="byok-key",
            )

        assert isinstance(result, dict)
        assert "email_body" in result

    @pytest.mark.asyncio
    async def test_generate_with_only_required_params(self, mock_gemini_client):
        """Should work with only the two required params."""
        agent = ReferenceRequestWriterAgent()

        with patch(
            "agents.reference_request_writer.get_gemini_client",
            return_value=mock_gemini_client,
        ):
            result = await agent.generate(
                reference_name="Carol",
                reference_relationship="Colleague",
            )

        assert "email_body" in result

    @pytest.mark.asyncio
    async def test_no_user_name_defaults_to_applicant(self):
        """Without user_name, the email should use a non-placeholder fallback."""
        client = AsyncMock()
        client.generate.return_value = {
            "response": '{"email_body": "Dear Carol,\\n\\nBest, the applicant"}',
            "filtered": False,
        }

        agent = ReferenceRequestWriterAgent()

        with patch(
            "agents.reference_request_writer.get_gemini_client", return_value=client
        ):
            result = await agent.generate(
                reference_name="Carol",
                reference_relationship="Colleague",
                # No user_name supplied
            )

        # The LLM prompt should have received "the applicant" — just verify no crash
        assert isinstance(result, dict)

    @pytest.mark.asyncio
    async def test_talking_points_is_list(self, mock_gemini_client):
        """talking_points should always be a list."""
        agent = ReferenceRequestWriterAgent()

        with patch(
            "agents.reference_request_writer.get_gemini_client",
            return_value=mock_gemini_client,
        ):
            result = await agent.generate(
                reference_name="Dana",
                reference_relationship="Peer",
            )

        assert isinstance(result["talking_points"], list)

    @pytest.mark.asyncio
    async def test_tips_is_list(self, mock_gemini_client):
        """tips should always be a list."""
        agent = ReferenceRequestWriterAgent()

        with patch(
            "agents.reference_request_writer.get_gemini_client",
            return_value=mock_gemini_client,
        ):
            result = await agent.generate(
                reference_name="Evan",
                reference_relationship="Skip-level manager",
            )

        assert isinstance(result["tips"], list)

    @pytest.mark.asyncio
    async def test_generated_at_is_iso_timestamp(self, mock_gemini_client):
        """generated_at should be a valid ISO 8601 timestamp."""
        agent = ReferenceRequestWriterAgent()

        with patch(
            "agents.reference_request_writer.get_gemini_client",
            return_value=mock_gemini_client,
        ):
            result = await agent.generate(
                reference_name="Fiona",
                reference_relationship="Mentor",
            )

        datetime.fromisoformat(result["generated_at"].replace("Z", "+00:00"))

    @pytest.mark.asyncio
    async def test_version_is_set(self, mock_gemini_client):
        """version field should be '1.0'."""
        agent = ReferenceRequestWriterAgent()

        with patch(
            "agents.reference_request_writer.get_gemini_client",
            return_value=mock_gemini_client,
        ):
            result = await agent.generate(
                reference_name="George",
                reference_relationship="VP",
            )

        assert result["version"] == "1.0"

    @pytest.mark.asyncio
    async def test_user_api_key_passed_to_llm(self, mock_gemini_client):
        """User API key should reach gemini_client.generate()."""
        agent = ReferenceRequestWriterAgent()

        with patch(
            "agents.reference_request_writer.get_gemini_client",
            return_value=mock_gemini_client,
        ):
            await agent.generate(
                reference_name="Helen",
                reference_relationship="Director",
                user_api_key="my-key",
            )

        call_kwargs = mock_gemini_client.generate.call_args[1]
        assert call_kwargs.get("user_api_key") == "my-key"

    @pytest.mark.asyncio
    async def test_gemini_client_lazy_initialized(self, mock_gemini_client):
        """get_gemini_client() should be called when client is None."""
        agent = ReferenceRequestWriterAgent()

        with patch(
            "agents.reference_request_writer.get_gemini_client",
            return_value=mock_gemini_client,
        ) as mock_getter:
            await agent.generate(
                reference_name="Iris",
                reference_relationship="Colleague",
            )

        mock_getter.assert_called_once()

    @pytest.mark.asyncio
    async def test_subject_line_fallback_uses_job_title(self):
        """Subject line fallback should reference target_job_title when LLM omits it."""
        client = AsyncMock()
        client.generate.return_value = {
            "response": '{"email_body": "Dear Jack,\\n\\nI hope you are well..."}',
            "filtered": False,
        }

        agent = ReferenceRequestWriterAgent()

        with patch(
            "agents.reference_request_writer.get_gemini_client", return_value=client
        ):
            result = await agent.generate(
                reference_name="Jack",
                reference_relationship="Manager",
                target_job_title="Senior Engineer",
            )

        assert "Senior Engineer" in result["subject_line"]


# =============================================================================
# ERROR HANDLING TESTS
# =============================================================================


class TestReferenceRequestErrorHandling:
    """Tests for error handling in ReferenceRequestWriterAgent."""

    @pytest.mark.asyncio
    async def test_filtered_response_returns_fallback(self):
        """Filtered LLM response should return a graceful fallback result, not raise."""
        client = AsyncMock()
        client.generate.return_value = {"response": "Filtered", "filtered": True}

        agent = ReferenceRequestWriterAgent()

        with patch(
            "agents.reference_request_writer.get_gemini_client", return_value=client
        ):
            result = await agent.generate(
                reference_name="Kim",
                reference_relationship="Boss",
            )

        assert "email_body" in result or "subject_line" in result

    @pytest.mark.asyncio
    async def test_invalid_json_returns_fallback(self):
        """Non-JSON LLM response should return a graceful fallback result, not raise."""
        client = AsyncMock()
        client.generate.return_value = {
            "response": "Please write a polite reference request to your manager...",
            "filtered": False,
        }

        agent = ReferenceRequestWriterAgent()

        with patch(
            "agents.reference_request_writer.get_gemini_client", return_value=client
        ):
            result = await agent.generate(
                reference_name="Lee",
                reference_relationship="Peer",
            )

        assert isinstance(result, dict)

    @pytest.mark.asyncio
    async def test_llm_exception_propagated(self):
        """Exception from gemini_client.generate should propagate."""
        client = AsyncMock()
        client.generate.side_effect = RuntimeError("Service down")

        agent = ReferenceRequestWriterAgent()

        with patch(
            "agents.reference_request_writer.get_gemini_client", return_value=client
        ):
            with pytest.raises(Exception):
                await agent.generate(
                    reference_name="Mike",
                    reference_relationship="Director",
                )

    @pytest.mark.asyncio
    async def test_llm_called_exactly_once(self, mock_gemini_client):
        """LLM should be called exactly once per generate() call."""
        agent = ReferenceRequestWriterAgent()

        with patch(
            "agents.reference_request_writer.get_gemini_client",
            return_value=mock_gemini_client,
        ):
            await agent.generate(
                reference_name="Nina",
                reference_relationship="VP",
            )

        assert mock_gemini_client.generate.call_count == 1
