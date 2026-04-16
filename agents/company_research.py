"""
Company Research Agent for ApplyPilot.
Uses Gemini LLM for comprehensive company research - no external web search needed.
Provides strategic insights for job applicants.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional
from workflows.state_schema import WorkflowState, CompanyResearchResult
from utils.llm_parsing import parse_json_from_llm_response
from utils.cache import (
    get_cached_company_research,
    cache_company_research,
    acquire_compute_lock,
    release_compute_lock,
    _get_company_research_cache_key,
)

logger: logging.Logger = logging.getLogger(__name__)

# LLM settings
LLM_TEMPERATURE: float = 0.3  # Factual but not too rigid
LLM_MAX_TOKENS: int = 16000  # Aligned with unified agent output cap

# =============================================================================
# PROMPTS
# =============================================================================

SYSTEM_CONTEXT: str = """You are an elite company research analyst specializing in helping job seekers prepare for applications and interviews.

## YOUR EXPERTISE:

**Company Intelligence:**
- You have deep knowledge of major companies across all industries
- You understand corporate structures, cultures, and hiring practices
- You know what information matters most for job applicants
- You can identify company values and culture from public information

**Interview Preparation:**
- You know typical interview processes for different company types
- You understand what hiring managers look for at different companies
- You can predict common interview questions based on company culture
- You know insider tips that help candidates stand out

**Strategic Analysis:**
- You understand competitive landscapes and market positioning
- You can identify company strengths and challenges
- You know how to frame company knowledge in interviews
- You understand what cultural fit means at different organizations

## YOUR PRINCIPLES:
- Provide ACCURATE information based on your knowledge
- Be SPECIFIC with details - avoid vague generalizations
- Focus on what's USEFUL for job applicants
- If you're uncertain about something, say so clearly
- Provide ACTIONABLE insights, not just facts
- Think about what would help someone ACE their interview"""

COMPANY_RESEARCH_PROMPT: str = """Research this company comprehensively for a job applicant.

COMPANY NAME: {company_name}

Provide detailed, accurate information about this company. If you're not certain about specific details, indicate that clearly. Focus on information that would help a job applicant prepare for their application and interview.

Respond with ONLY valid JSON in this exact structure:

{{
    "company_overview": {{
        "company_size": "<employee count range, e.g., '10,000-50,000 employees' or 'Unknown'>",
        "industry": "<primary industry and sub-sector>",
        "headquarters": "<city, state/country>",
        "founded_year": <year as number or null if unknown>,
        "website": "<official website URL or 'Unknown'>",
        "mission_vision": "<company's stated mission or vision, be specific>",
        "key_products_services": ["<main product/service 1>", "<product 2>", "<product 3> — do NOT repeat items here that appear in growth_opportunities"],
        "business_model": "<brief description of how they make money>",
        "notable_facts": ["<interesting fact 1>", "<fact 2>"]
    }},

    "culture_and_values": {{
        "core_values": [
            "<ValueName>: <1-sentence description of how this company actually lives this value in practice>",
            "<ValueName>: <description>",
            "<ValueName>: <description>"
        ],
        "work_environment": "<description of what it's like to work there>",
        "employee_benefits": ["<notable benefit 1>", "<benefit 2>", "<benefit 3>"],
        "diversity_inclusion": "<their approach to D&I>",
        "remote_work_policy": "<current remote/hybrid/office policy>",
        "employee_satisfaction": "<If an employee review site rating is known, start with it (e.g. '4.2/5'). Otherwise write: 'Insufficient public data — in your interview, ask about work-life balance, team autonomy, and growth opportunities.' Be direct and actionable, never just hedge.>",
        "culture_keywords": ["<keyword that describes culture>", "<keyword 2>"]
    }},

    "interview_intelligence": {{
        "typical_process": ["<step 1, e.g., 'Phone screen with recruiter'>", "<step 2>", "<step 3>"],
        "timeline": "<typical hiring timeline>",
        "interview_format": "<virtual/in-person/hybrid, panel vs 1:1>",
        "assessment_methods": ["<e.g., 'Technical coding interview'>", "<'Behavioral questions'>"],
        "common_questions": [
            "<likely interview question 1>",
            "<likely interview question 2>",
            "<likely interview question 3>"
        ],
        "tips_for_success": [
            "<specific tip for this company>",
            "<another tip>",
            "<third tip>"
        ],
        "what_they_look_for": ["<trait 1>", "<trait 2>", "<trait 3>"]
    }},

    "leadership_info": [
        {{
            "name": "<CEO or key leader name>",
            "title": "<their title>",
            "background": "<brief background>",
            "tenure": "<how long in role>"
        }}
    ],

    "competitive_landscape": {{
        "competitors": ["<competitor 1>", "<competitor 2>", "<competitor 3>"],
        "market_position": "<their position in the market - leader, challenger, etc.>",
        "competitive_advantages": ["<advantage 1>", "<advantage 2>"],
        "market_challenges": ["<challenge they face>", "<another challenge>"],
        "growth_opportunities": ["<growth area 1 — must be distinct from key_products_services items>", "<growth area 2>"],
        "recent_developments": "<Key recent news — funding rounds, product launches, leadership changes, partnerships, controversies. If uncertain about recency say so. This helps candidates impress interviewers with current knowledge.>"
    }},

    "application_insights": {{
        "what_to_emphasize": [
            "<specific skill, trait, or experience candidates MUST highlight — tie it to this company's priorities>",
            "<second thing to emphasize>",
            "<third>",
            "<fourth>",
            "<fifth — aim for 4-6 specific, actionable items>"
        ],
        "culture_fit_signals": [
            "<concrete behavior or statement that demonstrates you fit their culture>",
            "<another signal>"
        ],
        "red_flags_to_watch": [
            "<behavior, mindset, or signal that would DISQUALIFY a candidate at this company — something you must avoid showing in your application or interviews>"
        ],
        "talking_points_for_interview": [
            "<something impressive to mention about the company>",
            "<another talking point>"
        ],
        "questions_to_ask_them": [
            "<smart question to ask the interviewer>",
            "<another good question>"
        ]
    }},

    "confidence_assessment": {{
        "overall_confidence": "<HIGH | MEDIUM | LOW - how confident you are in this information>",
        "uncertain_areas": ["<area where info might be outdated or uncertain>"],
        "recommendation": "<brief recommendation for the job applicant>"
    }}
}}

Be thorough, specific, and focus on information that will help someone succeed in their job application. If the company is not well-known, provide what you can and clearly indicate uncertainty."""


class CompanyResearchAgent:
    """
    Agent for conducting comprehensive company research using Gemini LLM.

    Provides strategic insights for job applicants including company culture,
    interview preparation tips, competitive landscape, and application advice.
    Results are cached in Redis for performance optimization.
    """

    def __init__(self, gemini_client: Any, redis_client: Any = None) -> None:
        """
        Initialize the company research agent.

        Args:
            gemini_client: Gemini client for AI-powered research
            redis_client: Deprecated — caching now uses shared utils/cache.py helpers.
                          Accepted for backward compatibility but ignored.
        """
        if gemini_client is None:
            raise TypeError("gemini_client cannot be None")

        self.gemini_client: Any = gemini_client
        logger.info("Company Research Agent initialized (Gemini-powered)")

    async def process(self, state: WorkflowState) -> WorkflowState:
        """
        Research company information based on job posting data.

        Args:
            state: Current workflow state with job analysis results

        Returns:
            Updated workflow state with company research results

        Raises:
            ValueError: If job analysis or company name is missing
            Exception: If research processing fails
        """
        logger.info("Starting company research process")

        # Store user API key for use in LLM calls (BYOK mode)
        self._current_user_api_key = state.get("user_api_key")

        try:
            # Validate prerequisites
            job_analysis: Optional[Dict[str, Any]] = state.get("job_analysis")
            if job_analysis is None:
                raise ValueError("Job analysis is required for company research")

            company_name: Optional[str] = job_analysis.get("company_name")
            if not company_name:
                raise ValueError("Company name not found in job analysis")

            # Check cache first
            cached_result: Optional[Dict[str, Any]] = await get_cached_company_research(company_name)
            if cached_result:
                logger.info(f"Using cached research for {company_name}")
                state["company_research"] = cached_result
            else:
                # Stampede protection: only one coroutine should compute at a time.
                # Other concurrent misses for the same company will wait and retry.
                cache_key = _get_company_research_cache_key(company_name)
                lock_claimed = await acquire_compute_lock(cache_key)

                if not lock_claimed:
                    # Another task is already computing — wait briefly and retry cache
                    import asyncio as _asyncio
                    logger.info(f"Compute lock busy for {company_name}, waiting for cache population")
                    for _ in range(6):  # up to ~3 seconds
                        await _asyncio.sleep(0.5)
                        cached_result = await get_cached_company_research(company_name)
                        if cached_result:
                            state["company_research"] = cached_result
                            return state
                    # Timeout waiting — fall through and compute anyway
                    logger.warning(f"Compute lock wait timed out for {company_name}, computing independently")

                try:
                    # Perform fresh research with Gemini
                    research_result: CompanyResearchResult = (
                        await self._research_company_with_llm(company_name)
                    )
                    result_dict = research_result.to_dict()
                    await cache_company_research(company_name, result_dict)
                    state["company_research"] = result_dict
                finally:
                    if lock_claimed:
                        await release_compute_lock(cache_key)

            return state

        except asyncio.TimeoutError:
            logger.error("Company research timed out", exc_info=True)
            raise
        except Exception as e:
            logger.error(f"Company research failed: {e}", exc_info=True)
            raise

    async def _research_company_with_llm(
        self, company_name: str
    ) -> CompanyResearchResult:
        """
        Research company using Gemini LLM.

        Args:
            company_name: Name of the company to research

        Returns:
            Comprehensive company research results
        """
        logger.info(f"Researching company with Gemini: {company_name}")
        start_time: datetime = datetime.now(timezone.utc)

        try:
            # Build the prompt
            prompt = COMPANY_RESEARCH_PROMPT.format(company_name=company_name)

            # Call Gemini
            response = await self.gemini_client.generate(
                prompt=prompt,
                system=SYSTEM_CONTEXT,
                temperature=LLM_TEMPERATURE,
                max_tokens=LLM_MAX_TOKENS,
                user_api_key=self._current_user_api_key,
            )

            # Handle filtered response
            if response.get("filtered"):
                logger.warning("Response was filtered by safety settings")
                return self._create_fallback_result(company_name, start_time)

            # Parse the response
            response_text = response.get("response", "")
            research_data = parse_json_from_llm_response(response_text)

            if not research_data:
                logger.warning("Failed to parse LLM response, using fallback")
                return self._create_fallback_result(company_name, start_time)

            # Convert to CompanyResearchResult
            result = self._map_to_result(research_data)
            result.processing_time = (
                datetime.now(timezone.utc) - start_time
            ).total_seconds()

            logger.info(
                f"Company research completed for {company_name} "
                f"in {result.processing_time:.2f}s"
            )
            return result

        except Exception as e:
            logger.error(f"Error researching company {company_name}: {e}", exc_info=True)
            return self._create_fallback_result(company_name, start_time)

    def _map_to_result(self, data: Dict[str, Any]) -> CompanyResearchResult:
        """
        Map LLM response data to CompanyResearchResult schema.

        Args:
            data: Parsed JSON data from LLM

        Returns:
            CompanyResearchResult with mapped data
        """
        result = CompanyResearchResult()

        # Map company overview
        overview = data.get("company_overview", {})
        result.company_size = overview.get("company_size")
        result.industry = overview.get("industry")
        result.headquarters = overview.get("headquarters")
        result.founded_year = overview.get("founded_year")
        result.website = overview.get("website")
        result.mission_vision = overview.get("mission_vision")
        result.key_products = overview.get("key_products_services", [])

        # Map culture and values
        culture = data.get("culture_and_values", {})
        result.core_values = culture.get("core_values", [])
        result.work_environment = culture.get("work_environment")
        result.employee_benefits = culture.get("employee_benefits", [])
        result.diversity_inclusion = culture.get("diversity_inclusion")
        result.remote_work_policy = culture.get("remote_work_policy")
        result.employee_satisfaction = culture.get("employee_satisfaction")

        # Map interview intelligence
        interview = data.get("interview_intelligence", {})
        result.typical_interview_process = interview.get("typical_process", [])
        result.hiring_timeline = interview.get("timeline")
        result.interview_format = interview.get("interview_format")
        result.assessment_methods = interview.get("assessment_methods", [])
        # hiring_volume is not directly provided by LLM - leave as None

        # Map leadership info
        result.leadership_info = data.get("leadership_info", [])

        # Map competitive landscape
        competitive = data.get("competitive_landscape", {})
        result.competitors = competitive.get("competitors", [])
        result.market_position = competitive.get("market_position")
        result.competitive_advantages = competitive.get("competitive_advantages", [])
        result.market_challenges = competitive.get("market_challenges", [])
        result.growth_opportunities = competitive.get("growth_opportunities", [])
        result.recent_developments = competitive.get("recent_developments")

        # Map application insights (helpful for job seekers)
        result.application_insights = data.get("application_insights", {})

        # Map confidence assessment
        result.confidence_assessment = data.get("confidence_assessment", {})

        # Record when this research was generated
        result.research_date = datetime.now(timezone.utc).strftime("%b %Y")

        return result

    def _create_fallback_result(
        self, company_name: str, start_time: datetime
    ) -> CompanyResearchResult:
        """
        Create a minimal fallback result when research fails.

        Args:
            company_name: Name of the company
            start_time: When research started

        Returns:
            Minimal CompanyResearchResult with error indication
        """
        result = CompanyResearchResult()
        result.processing_time = (
            datetime.now(timezone.utc) - start_time
        ).total_seconds()
        result.mission_vision = f"Unable to complete research for {company_name}. Please research manually."
        return result

