"""Tests for utils.cv_docx_export — markdown CV to DOCX."""

import io
import zipfile

import pytest

from utils.cv_docx_export import markdown_cv_to_docx_bytes

SAMPLE_CV = """# Elior Nataf Lackritz
**Founding Engineer**
eliornataflackritz@gmail.com | Hoboken, NJ, United States

## Professional Summary
Senior Software Engineer specializing in backend architecture.

## Work Experience
Cakewalk — Founding Engineer
*2025-07–Present*
Building an automated benefits platform from the ground up.
▪ Architecting production-ready AWS infrastructure using Terraform
▪ Leading backend development in TypeScript, Node.js, and Python

## Skills
Languages & Frameworks: Python • TypeScript • FastAPI • Django
Infrastructure & DevOps: AWS • Terraform • Docker • Kubernetes
"""


class TestMarkdownCvToDocxBytes:
    def test_returns_valid_docx_zip(self):
        data = markdown_cv_to_docx_bytes(SAMPLE_CV)
        assert data[:2] == b"PK"
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            assert "word/document.xml" in zf.namelist()
            xml = zf.read("word/document.xml").decode("utf-8")
        assert "Elior Nataf Lackritz" in xml
        assert "Architecting production-ready AWS" in xml

    def test_sections_renamed_like_source_resume(self):
        data = markdown_cv_to_docx_bytes(SAMPLE_CV)
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            xml = zf.read("word/document.xml").decode("utf-8")
        assert "Relevant Experience" in xml
        assert "Core Technologies" in xml
        assert "Professional Summary" not in xml

    def test_header_order_contact_before_title(self):
        data = markdown_cv_to_docx_bytes(SAMPLE_CV)
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            xml = zf.read("word/document.xml").decode("utf-8")
        contact_pos = xml.find("eliornataflackritz@gmail.com")
        title_pos = xml.find("Founding Engineer")
        assert contact_pos != -1 and title_pos != -1
        assert contact_pos < title_pos

    def test_skills_use_middle_dot_separators(self):
        data = markdown_cv_to_docx_bytes(SAMPLE_CV)
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            xml = zf.read("word/document.xml").decode("utf-8")
        assert "Python • TypeScript" in xml

    def test_role_split_into_title_and_company(self):
        data = markdown_cv_to_docx_bytes(SAMPLE_CV)
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            xml = zf.read("word/document.xml").decode("utf-8")
        assert "Founding Engineer" in xml
        assert "Cakewalk" in xml

    @pytest.mark.asyncio
    async def test_export_without_libreoffice_returns_docx(self):
        from unittest.mock import patch

        from api.cv_optimizer import _export_optimized_cv_file

        with patch("api.cv_optimizer._resolve_soffice_path", return_value=None):
            data, media_type, filename = await _export_optimized_cv_file(
                SAMPLE_CV, user_api_key=None
            )

        assert filename == "optimized-cv.docx"
        assert "wordprocessingml" in media_type
        assert data[:2] == b"PK"
