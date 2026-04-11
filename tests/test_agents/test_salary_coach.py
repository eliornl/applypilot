"""
Unit tests for the Salary Coach Agent.
Tests salary negotiation strategy generation with mocked LLM responses.
"""

import pytest
from unittest.mock import AsyncMock, patch
from datetime import datetime

from agents.salary_coach import SalaryCoachAgent


# =============================================================================
# FIXTURES
# =============================================================================

MOCK_LLM_RESPONSE = {
    "response": """{
        "market_analysis": {
            "market_rate_range": "$170k - $210k",
            "your_offer_assessment": "Below market by 10-15%",
            "negotiation_potential": "HIGH",
            "data_sources": ["Levels.fyi", "industry salary surveys"]
        },
        "strategy_overview": {
            "recommended_approach": "Collaborative negotiation",
            "target_increase": "15%",
            "confidence_level": "HIGH",
            "timing": "Respond within 48 hours"
        },
        "main_script": {
            "opening": "I am very excited about this opportunity...",
            "ask": "Based on my research and 7 years of experience, I was hoping we could discuss...",
            "anchor": "$200,000",
            "close": "I am confident we can reach an agreement that works for both of us."
        },
        "pushback_responses": [
            {
                "pushback": "That is our best offer",
                "response": "I understand, and I appreciate you sharing that..."
            }
        ],
        "alternative_asks": [
            {"ask": "Sign-on bonus", "amount": "$20,000", "reasoning": "Offsets vesting cliff"},
            {"ask": "Additional PTO", "amount": "5 extra days", "reasoning": "Work-life balance"}
        ],
        "email_template": {
            "subject": "Re: Offer for Senior Software Engineer",
            "body": "Dear Hiring Manager,\\n\\nThank you for the offer..."
        },
        "dos_and_donts": {
            "dos": ["Be specific with numbers", "Express enthusiasm"],
            "donts": ["Give a range first", "Mention personal financial needs"]
        },
        "red_flags": [],
        "walk_away_point": "$165,000 total compensation",
        "final_tips": ["Practice your script aloud", "Have competing offers ready if possible"]
    }""",
    "filtered": False,
}


@pytest.fixture
def mock_gemini_client():
    """Mock Gemini client returning valid salary strategy JSON."""
    client = AsyncMock()
    client.generate.return_value = MOCK_LLM_RESPONSE
    return client


# =============================================================================
# INITIALIZATION TESTS
# =============================================================================


class TestSalaryCoachInit:
    """Tests for SalaryCoachAgent initialization."""

    def test_init_starts_with_none_client(self):
        """Agent starts without a Gemini client (lazy-loaded)."""
        agent = SalaryCoachAgent()
        assert agent.gemini_client is None

    def test_init_starts_with_none_api_key(self):
        """Agent starts with no user API key."""
        agent = SalaryCoachAgent()
        assert agent._current_user_api_key is None


# =============================================================================
# SUCCESSFUL GENERATION TESTS
# =============================================================================


class TestSalaryCoachGeneration:
    """Tests for successful salary negotiation strategy generation."""

    @pytest.mark.asyncio
    async def test_generate_strategy_success_returns_all_keys(self, mock_gemini_client):
        """Successful generation returns all expected top-level keys."""
        agent = SalaryCoachAgent()

        with patch("agents.salary_coach.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.generate_strategy(
                job_title="Senior Software Engineer",
                company_name="TechCorp",
                offered_salary="$155,000",
            )

        assert "market_analysis" in result
        assert "strategy_overview" in result
        assert "main_script" in result
        assert "pushback_responses" in result
        assert "alternative_asks" in result
        assert "email_template" in result
        assert "dos_and_donts" in result
        assert "red_flags" in result
        assert "walk_away_point" in result
        assert "final_tips" in result
        assert "job_title" in result
        assert "company_name" in result
        assert "offered_salary" in result
        assert "generated_at" in result
        assert "version" in result

    @pytest.mark.asyncio
    async def test_input_fields_echoed_in_result(self, mock_gemini_client):
        """job_title, company_name and offered_salary should be echoed in result."""
        agent = SalaryCoachAgent()

        with patch("agents.salary_coach.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.generate_strategy(
                job_title="Staff Engineer",
                company_name="BigCo",
                offered_salary="$180k",
            )

        assert result["job_title"] == "Staff Engineer"
        assert result["company_name"] == "BigCo"
        assert result["offered_salary"] == "$180k"

    @pytest.mark.asyncio
    async def test_generate_with_all_optional_params(self, mock_gemini_client):
        """Should work with all optional params supplied."""
        agent = SalaryCoachAgent()

        with patch("agents.salary_coach.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.generate_strategy(
                job_title="Senior Engineer",
                company_name="TechCorp",
                offered_salary="$155k",
                years_experience=7,
                additional_context="I have a competing offer.",
                location="San Francisco, CA",
                company_size="Large (1000+)",
                industry="Technology",
                offered_benefits="Health + 401k",
                current_salary="$140k",
                achievements=["Reduced costs by 30%", "Led team of 5"],
                unique_value=["Domain expertise in ML", "Patent holder"],
                other_offers="Competing offer at $170k",
                urgency="low",
                target_range="$175k - $185k",
                market_info="Levels.fyi shows $180k median",
                priority_areas=["base_salary", "equity"],
                flexibility_areas=["signing_bonus"],
                non_negotiables=["remote_work"],
                style_preference="collaborative",
                user_api_key="byok-key",
            )

        assert isinstance(result, dict)
        assert "main_script" in result

    @pytest.mark.asyncio
    async def test_generate_with_only_required_params(self, mock_gemini_client):
        """Should work with only the three required params."""
        agent = SalaryCoachAgent()

        with patch("agents.salary_coach.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.generate_strategy(
                job_title="Backend Dev",
                company_name="Startup",
                offered_salary="$120k",
            )

        assert "main_script" in result

    @pytest.mark.asyncio
    async def test_pushback_responses_is_list(self, mock_gemini_client):
        """pushback_responses should always be a list."""
        agent = SalaryCoachAgent()

        with patch("agents.salary_coach.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.generate_strategy(
                job_title="Engineer",
                company_name="Corp",
                offered_salary="$100k",
            )

        assert isinstance(result["pushback_responses"], list)

    @pytest.mark.asyncio
    async def test_alternative_asks_is_list(self, mock_gemini_client):
        """alternative_asks should always be a list."""
        agent = SalaryCoachAgent()

        with patch("agents.salary_coach.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.generate_strategy(
                job_title="Engineer",
                company_name="Corp",
                offered_salary="$100k",
            )

        assert isinstance(result["alternative_asks"], list)

    @pytest.mark.asyncio
    async def test_dos_and_donts_has_correct_structure(self, mock_gemini_client):
        """dos_and_donts should contain 'dos' and 'donts' lists."""
        agent = SalaryCoachAgent()

        with patch("agents.salary_coach.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.generate_strategy(
                job_title="Engineer",
                company_name="Corp",
                offered_salary="$100k",
            )

        dos_and_donts = result["dos_and_donts"]
        assert "dos" in dos_and_donts
        assert "donts" in dos_and_donts
        assert isinstance(dos_and_donts["dos"], list)
        assert isinstance(dos_and_donts["donts"], list)

    @pytest.mark.asyncio
    async def test_final_tips_is_list(self, mock_gemini_client):
        """final_tips should always be a list."""
        agent = SalaryCoachAgent()

        with patch("agents.salary_coach.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.generate_strategy(
                job_title="Engineer",
                company_name="Corp",
                offered_salary="$100k",
            )

        assert isinstance(result["final_tips"], list)

    @pytest.mark.asyncio
    async def test_generated_at_is_iso_timestamp(self, mock_gemini_client):
        """generated_at should be a valid ISO 8601 timestamp."""
        agent = SalaryCoachAgent()

        with patch("agents.salary_coach.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.generate_strategy(
                job_title="Engineer",
                company_name="Corp",
                offered_salary="$100k",
            )

        datetime.fromisoformat(result["generated_at"].replace("Z", "+00:00"))

    @pytest.mark.asyncio
    async def test_version_is_set(self, mock_gemini_client):
        """version field should be '1.0'."""
        agent = SalaryCoachAgent()

        with patch("agents.salary_coach.get_gemini_client", return_value=mock_gemini_client):
            result = await agent.generate_strategy(
                job_title="Engineer",
                company_name="Corp",
                offered_salary="$100k",
            )

        assert result["version"] == "1.0"

    @pytest.mark.asyncio
    async def test_user_api_key_passed_to_llm(self, mock_gemini_client):
        """User API key should reach gemini_client.generate()."""
        agent = SalaryCoachAgent()

        with patch("agents.salary_coach.get_gemini_client", return_value=mock_gemini_client):
            await agent.generate_strategy(
                job_title="Engineer",
                company_name="Corp",
                offered_salary="$100k",
                user_api_key="my-byok-key",
            )

        call_kwargs = mock_gemini_client.generate.call_args[1]
        assert call_kwargs.get("user_api_key") == "my-byok-key"

    @pytest.mark.asyncio
    async def test_gemini_client_lazy_initialized(self, mock_gemini_client):
        """get_gemini_client() should be called when client is None."""
        agent = SalaryCoachAgent()

        with patch(
            "agents.salary_coach.get_gemini_client", return_value=mock_gemini_client
        ) as mock_getter:
            await agent.generate_strategy(
                job_title="Engineer",
                company_name="Corp",
                offered_salary="$100k",
            )

        mock_getter.assert_called_once()


# =============================================================================
# ERROR HANDLING TESTS
# =============================================================================


class TestSalaryCoachErrorHandling:
    """Tests for error handling in SalaryCoachAgent."""

    @pytest.mark.asyncio
    async def test_filtered_response_returns_fallback(self):
        """Filtered LLM response should return a graceful fallback result, not raise."""
        client = AsyncMock()
        client.generate.return_value = {"response": "Filtered", "filtered": True}

        agent = SalaryCoachAgent()

        with patch("agents.salary_coach.get_gemini_client", return_value=client):
            result = await agent.generate_strategy(
                job_title="Engineer",
                company_name="Corp",
                offered_salary="$100k",
            )

        assert "main_script" in result or "strategy_overview" in result

    @pytest.mark.asyncio
    async def test_invalid_json_returns_fallback(self):
        """Non-JSON LLM response should return a graceful fallback result, not raise."""
        client = AsyncMock()
        client.generate.return_value = {
            "response": "Ask for 20% more and cite your achievements.",
            "filtered": False,
        }

        agent = SalaryCoachAgent()

        with patch("agents.salary_coach.get_gemini_client", return_value=client):
            result = await agent.generate_strategy(
                job_title="Engineer",
                company_name="Corp",
                offered_salary="$100k",
            )

        assert isinstance(result, dict)

    @pytest.mark.asyncio
    async def test_llm_exception_propagated(self):
        """Exception from gemini_client.generate should propagate."""
        client = AsyncMock()
        client.generate.side_effect = OSError("Connection refused")

        agent = SalaryCoachAgent()

        with patch("agents.salary_coach.get_gemini_client", return_value=client):
            with pytest.raises(Exception):
                await agent.generate_strategy(
                    job_title="Engineer",
                    company_name="Corp",
                    offered_salary="$100k",
                )

    @pytest.mark.asyncio
    async def test_llm_called_exactly_once(self, mock_gemini_client):
        """LLM should be called exactly once per generate_strategy() call."""
        agent = SalaryCoachAgent()

        with patch("agents.salary_coach.get_gemini_client", return_value=mock_gemini_client):
            await agent.generate_strategy(
                job_title="Engineer",
                company_name="Corp",
                offered_salary="$100k",
            )

        assert mock_gemini_client.generate.call_count == 1

    @pytest.mark.asyncio
    async def test_empty_json_object_returns_fallback(self):
        """An empty JSON object from LLM results in a parse-error fallback, not a raise."""
        client = AsyncMock()
        client.generate.return_value = {"response": "{}", "filtered": False}

        agent = SalaryCoachAgent()

        with patch("agents.salary_coach.get_gemini_client", return_value=client):
            result = await agent.generate_strategy(
                job_title="Engineer",
                company_name="Corp",
                offered_salary="$100k",
            )

        assert isinstance(result, dict)
