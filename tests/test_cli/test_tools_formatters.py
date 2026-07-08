"""Tests for cli.formatters.tools."""

from __future__ import annotations

from cli.formatters.tools import (
    format_email_result,
    format_job_comparison,
    format_reference_request,
    format_rejection_analysis,
    format_salary_coach,
    format_tool_result,
)


def test_format_email_result_subject_and_body() -> None:
    text = format_email_result({"subject_line": "Thanks", "email_body": "Dear Jane,"})
    assert "**Subject:** Thanks" in text
    assert "Dear Jane" in text


def test_format_rejection_analysis_with_followup() -> None:
    text = format_rejection_analysis(
        {
            "analysis_summary": "Polite rejection",
            "likely_reasons": ["Experience gap"],
            "improvement_suggestions": ["Highlight metrics"],
            "follow_up_recommended": True,
            "follow_up_template": "Hi recruiter,",
        }
    )
    assert "Polite rejection" in text
    assert "Experience gap" in text
    assert "Follow-up template" in text


def test_format_job_comparison_jobs() -> None:
    text = format_job_comparison(
        {
            "recommended_job": "Job A",
            "executive_summary": "Better culture fit",
            "jobs_analysis": [{"title": "Eng", "company": "Acme", "overall_score": 88}],
            "final_advice": "Accept A",
        }
    )
    assert "Job A" in text
    assert "Acme" in text
    assert "Accept A" in text


def test_format_salary_coach_sections() -> None:
    text = format_salary_coach(
        {
            "job_title": "Engineer",
            "company_name": "Acme",
            "offered_salary": "$150k",
            "strategy_overview": {"recommended_approach": "Collaborative"},
            "main_script": {"counter_offer": "I was hoping for $165k"},
            "email_template": {"subject": "Offer", "body": "Thank you for the offer."},
            "walk_away_point": "$140k",
        }
    )
    assert "Collaborative" in text
    assert "$165k" in text
    assert "Walk-away" in text


def test_format_reference_request_includes_tips() -> None:
    text = format_reference_request(
        {"subject_line": "Reference", "email_body": "Dear Alex,", "tips": ["Give context"]}
    )
    assert "Reference" in text
    assert "Give context" in text


def test_format_tool_result_unknown_returns_none() -> None:
    assert format_tool_result("unknown-tool", {}) is None
