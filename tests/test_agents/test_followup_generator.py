"""
Unit tests for the Follow-up Generator Agent.
Tests follow-up email generation for all 7 job application stages.
"""

import pytest
from unittest.mock import AsyncMock, patch
from datetime import datetime

from agents.followup_generator import FollowUpGeneratorAgent, FOLLOWUP_STAGES


# =============================================================================
# FIXTURES
# =============================================================================

MOCK_LLM_RESPONSE = {
    "response": """{
        "subject_line": "Following up - Senior Software Engineer application",
        "email_body": "Dear Hiring Manager,\\n\\nI wanted to follow up on my application...",
        "key_elements": ["Reiterate enthusiasm", "Mention specific project discussed"],
        "tone": "professional and enthusiastic",
        "timing_advice": "Send on Tuesday or Wednesday morning",
        "next_steps": "Wait 5-7 business days before following up again",
        "alternative_subject": "Re: Senior Software Engineer - Application Follow-up"
    }""",
    "filtered": False,
}


@pytest.fixture
def mock_gemini_client():
    """Mock Gemini client returning valid follow-up JSON."""
    client = AsyncMock()
    client.generate.return_value = MOCK_LLM_RESPONSE
    return client


# =============================================================================
# INITIALIZATION TESTS
# =============================================================================


class TestFollowUpGeneratorInit:
    """Tests for FollowUpGeneratorAgent initialization."""

    def test_init_starts_with_none_client(self):
        """Agent starts without a Gemini client (lazy-loaded)."""
        agent = FollowUpGeneratorAgent()
        assert agent.gemini_client is None

    def test_init_starts_with_none_api_key(self):
        """Agent starts with no user API key."""
        agent = FollowUpGeneratorAgent()
        assert agent._current_user_api_key is None

    def test_followup_stages_constant_has_seven_entries(self):
        """FOLLOWUP_STAGES should contain exactly 7 entries."""
        assert len(FOLLOWUP_STAGES) == 7

    def test_followup_stages_contains_expected_values(self):
        """FOLLOWUP_STAGES should contain all expected stage names."""
        expected = {
            "after_application", "after_phone_screen", "after_interview",
            "after_final_round", "no_response", "after_rejection", "after_offer",
        }
        assert set(FOLLOWUP_STAGES) == expected


# =============================================================================
# INPUT VALIDATION TESTS
# =============================================================================


class TestFollowUpGeneratorValidation:
    """Tests for input validation — stage name must be valid."""

    @pytest.mark.asyncio
    async def test_invalid_stage_raises_value_error(self):
        """Invalid stage name must raise ValueError."""
        agent = FollowUpGeneratorAgent()

        with pytest.raises(ValueError, match="[Ii]nvalid stage"):
            await agent.generate(
                stage="before_application",  # Not a valid stage
                company_name="TechCorp",
                job_title="Engineer",
            )

    @pytest.mark.asyncio
    async def test_empty_stage_raises_value_error(self):
        """Empty stage string must raise ValueError."""
        agent = FollowUpGeneratorAgent()

        with pytest.raises(ValueError):
            await agent.generate(stage="", company_name="Corp", job_title="Dev")

    @pytest.mark.asyncio
    async def test_stage_name_case_sensitive(self):
        """Stage names are case-sensitive; 'After_Application' is not valid."""
        agent = FollowUpGeneratorAgent()

        with pytest.raises(ValueError):
            await agent.generate(
                stage="After_Application",
                company_name="Corp",
                job_title="Dev",
            )


# =============================================================================
# ALL STAGES ACCEPTED TESTS
# =============================================================================


class TestFollowUpGeneratorAllStages:
    """Tests that all 7 valid stages are accepted."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize("stage", FOLLOWUP_STAGES)
    async def test_all_valid_stages_accepted(self, stage, mock_gemini_client):
        """Each of the 7 valid stages should complete without error."""
        agent = FollowUpGeneratorAgent()

        with patch("agents.followup_generator.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.generate(
                stage=stage,
                company_name="TechCorp",
                job_title="Software Engineer",
            )

        assert "email_body" in result
        assert result["stage"] == stage


# =============================================================================
# SUCCESSFUL GENERATION TESTS
# =============================================================================


class TestFollowUpGeneratorGeneration:
    """Tests for successful follow-up email generation."""

    @pytest.mark.asyncio
    async def test_generate_success_returns_all_keys(self, mock_gemini_client):
        """Successful generation returns all expected keys."""
        agent = FollowUpGeneratorAgent()

        with patch("agents.followup_generator.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.generate(
                stage="after_interview",
                company_name="TechCorp",
                job_title="Senior Software Engineer",
            )

        assert "subject_line" in result
        assert "email_body" in result
        assert "key_elements" in result
        assert "tone" in result
        assert "timing_advice" in result
        assert "next_steps" in result
        assert "alternative_subject" in result
        assert "stage" in result
        assert "generated_at" in result
        assert "version" in result

    @pytest.mark.asyncio
    async def test_stage_echoed_in_result(self, mock_gemini_client):
        """The stage passed in should be echoed in the result."""
        agent = FollowUpGeneratorAgent()

        with patch("agents.followup_generator.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.generate(
                stage="no_response",
                company_name="Corp",
                job_title="Dev",
            )

        assert result["stage"] == "no_response"

    @pytest.mark.asyncio
    async def test_generate_with_all_optional_params(self, mock_gemini_client):
        """Should work with all optional params supplied."""
        agent = FollowUpGeneratorAgent()

        with patch("agents.followup_generator.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.generate(
                stage="after_phone_screen",
                company_name="TechCorp",
                job_title="Engineer",
                contact_name="Alice",
                contact_role="Recruiter",
                days_since_contact=7,
                previous_interactions="Had a 30-minute screening call",
                key_points=["Discussed remote work", "Mentioned team growth"],
                user_name="John Doe",
                user_api_key="byok-key",
            )

        assert isinstance(result, dict)
        assert "email_body" in result

    @pytest.mark.asyncio
    async def test_generate_with_only_required_params(self, mock_gemini_client):
        """Should work with only the three required params."""
        agent = FollowUpGeneratorAgent()

        with patch("agents.followup_generator.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.generate(
                stage="after_application",
                company_name="Startup",
                job_title="Backend Dev",
            )

        assert "email_body" in result

    @pytest.mark.asyncio
    async def test_key_elements_is_list(self, mock_gemini_client):
        """key_elements should always be a list."""
        agent = FollowUpGeneratorAgent()

        with patch("agents.followup_generator.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.generate(
                stage="after_final_round",
                company_name="Corp",
                job_title="Dev",
            )

        assert isinstance(result["key_elements"], list)

    @pytest.mark.asyncio
    async def test_generated_at_is_iso_timestamp(self, mock_gemini_client):
        """generated_at should be a valid ISO 8601 timestamp."""
        agent = FollowUpGeneratorAgent()

        with patch("agents.followup_generator.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.generate(
                stage="after_rejection",
                company_name="Corp",
                job_title="Dev",
            )

        datetime.fromisoformat(result["generated_at"].replace("Z", "+00:00"))

    @pytest.mark.asyncio
    async def test_version_is_set(self, mock_gemini_client):
        """version field should be '1.0'."""
        agent = FollowUpGeneratorAgent()

        with patch("agents.followup_generator.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.generate(
                stage="after_offer",
                company_name="Corp",
                job_title="Dev",
            )

        assert result["version"] == "1.0"

    @pytest.mark.asyncio
    async def test_user_api_key_passed_to_llm(self, mock_gemini_client):
        """User API key should reach gemini_client.generate()."""
        agent = FollowUpGeneratorAgent()

        with patch("agents.followup_generator.get_gemini_client", return_value=mock_gemini_client):
            await agent.generate(
                stage="after_interview",
                company_name="Corp",
                job_title="Dev",
                user_api_key="my-key",
            )

        call_kwargs = mock_gemini_client.generate.call_args[1]
        assert call_kwargs.get("user_api_key") == "my-key"

    @pytest.mark.asyncio
    async def test_gemini_client_lazy_initialized(self, mock_gemini_client):
        """get_gemini_client() should be called when client is None."""
        agent = FollowUpGeneratorAgent()

        with patch(
            "agents.followup_generator.get_gemini_client", return_value=mock_gemini_client
        ) as mock_getter:
            await agent.generate(
                stage="after_interview",
                company_name="Corp",
                job_title="Dev",
            )

        mock_getter.assert_called_once()

    @pytest.mark.asyncio
    async def test_subject_fallback_contains_job_title(self):
        """Subject fallback should reference the job title when LLM omits it."""
        client = AsyncMock()
        client.generate.return_value = {
            "response": '{"email_body": "Dear Team,\\n\\nFollowing up..."}',
            "filtered": False,
        }

        agent = FollowUpGeneratorAgent()

        with patch("agents.followup_generator.get_gemini_client", return_value=client):
            result = await agent.generate(
                stage="no_response",
                company_name="Acme",
                job_title="Product Designer",
            )

        assert "Product Designer" in result["subject_line"]


# =============================================================================
# ERROR HANDLING TESTS
# =============================================================================


class TestFollowUpGeneratorErrorHandling:
    """Tests for error handling in FollowUpGeneratorAgent."""

    @pytest.mark.asyncio
    async def test_filtered_response_returns_fallback(self):
        """Filtered LLM response should return a graceful fallback result, not raise."""
        client = AsyncMock()
        client.generate.return_value = {"response": "Filtered", "filtered": True}

        agent = FollowUpGeneratorAgent()

        with patch("agents.followup_generator.get_gemini_client", return_value=client):
            result = await agent.generate(
                stage="after_interview",
                company_name="Corp",
                job_title="Dev",
            )

        assert "email_body" in result or "subject_line" in result

    @pytest.mark.asyncio
    async def test_invalid_json_returns_fallback(self):
        """Non-JSON LLM response should return a graceful fallback result, not raise."""
        client = AsyncMock()
        client.generate.return_value = {
            "response": "Send an email saying you are still interested.",
            "filtered": False,
        }

        agent = FollowUpGeneratorAgent()

        with patch("agents.followup_generator.get_gemini_client", return_value=client):
            result = await agent.generate(
                stage="after_application",
                company_name="Corp",
                job_title="Dev",
            )

        assert isinstance(result, dict)

    @pytest.mark.asyncio
    async def test_llm_exception_propagated(self):
        """Exception from gemini_client.generate should propagate."""
        client = AsyncMock()
        client.generate.side_effect = RuntimeError("Network error")

        agent = FollowUpGeneratorAgent()

        with patch("agents.followup_generator.get_gemini_client", return_value=client):
            with pytest.raises(Exception):
                await agent.generate(
                    stage="after_interview",
                    company_name="Corp",
                    job_title="Dev",
                )

    @pytest.mark.asyncio
    async def test_llm_called_exactly_once(self, mock_gemini_client):
        """LLM should be called exactly once per generate() call."""
        agent = FollowUpGeneratorAgent()

        with patch("agents.followup_generator.get_gemini_client", return_value=mock_gemini_client):
            await agent.generate(
                stage="after_interview",
                company_name="Corp",
                job_title="Dev",
            )

        assert mock_gemini_client.generate.call_count == 1
