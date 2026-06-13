"""Tests for utils.cv_html_normalize."""

from utils.cv_html_normalize import normalize_cv_export_html

SAMPLE_HTML_WITH_DUPES = """<!DOCTYPE html><html><body>
<h1 style="font-size:24px">Jane Smith</h1>
<p style="font-size:13px">Senior Engineer</p>
<p style="font-size:11px;color:#666">jane@example.com | Toronto</p>
<h2 style="text-transform:uppercase">Professional Summary</h2>
<p>Summary paragraph here.</p>
<h2>Work Experience</h2>
<h3>Cakewalk — Founding Engineer</h3>
<ul><li>Led Python migration</li></ul>
<p>Led Python migration</p>
</body></html>
"""

SAMPLE_HTML_LI_P = """<!DOCTYPE html><html><body>
<ul>
<li><p>Led Python migration</p></li>
<li><p>Built API layer</p></li>
</ul>
</body></html>
"""

SAMPLE_HTML_P_INSIDE_UL = """<!DOCTYPE html><html><body>
<ul>
<li>Led Python migration</li>
<p>Led Python migration</p>
<li>Built API layer</li>
<p>Built API layer</p>
</ul>
</body></html>
"""


class TestNormalizeCvExportHtml:
    def test_removes_duplicate_bullet_paragraphs(self):
        out = normalize_cv_export_html(SAMPLE_HTML_WITH_DUPES)
        assert out.count("Led Python migration") == 1

    def test_unwraps_paragraph_inside_list_item(self):
        out = normalize_cv_export_html(SAMPLE_HTML_LI_P)
        assert out.count("Led Python migration") == 1
        assert out.count("Built API layer") == 1
        assert "<li><p>" not in out
        assert "• Led Python migration" in out

    def test_removes_paragraph_siblings_inside_list(self):
        out = normalize_cv_export_html(SAMPLE_HTML_P_INSIDE_UL)
        assert out.count("Led Python migration") == 1
        assert out.count("Built API layer") == 1

    def test_converts_lists_to_bullet_paragraphs_for_libreoffice(self):
        out = normalize_cv_export_html(SAMPLE_HTML_LI_P)
        assert "<ul>" not in out
        assert "<ol>" not in out
        assert "• Led Python migration" in out
        assert "• Built API layer" in out

    def test_removes_professional_summary_heading(self):
        out = normalize_cv_export_html(SAMPLE_HTML_WITH_DUPES)
        assert "Professional Summary" not in out
        assert "Summary paragraph here." in out

    def test_renames_work_experience_section(self):
        out = normalize_cv_export_html(SAMPLE_HTML_WITH_DUPES)
        assert "RELEVANT EXPERIENCE" in out
        assert "Work Experience" not in out

    def test_splits_combined_role_heading(self):
        out = normalize_cv_export_html(SAMPLE_HTML_WITH_DUPES)
        assert "Founding Engineer" in out
        assert "Cakewalk" in out
        assert "Cakewalk — Founding Engineer" not in out

    def test_reorders_contact_before_title(self):
        out = normalize_cv_export_html(SAMPLE_HTML_WITH_DUPES)
        contact_pos = out.find("jane@example.com")
        title_pos = out.find("Senior Engineer")
        assert contact_pos != -1 and title_pos != -1
        assert contact_pos < title_pos
