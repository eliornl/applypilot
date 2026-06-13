"""
Post-process Gemini CV HTML before LibreOffice / HTML→ODT export.

Fixes common model mistakes: duplicate bullet paragraphs, header order,
section naming, and combined role headings.
"""

from __future__ import annotations

import html
import re

from bs4 import BeautifulSoup, Tag

_ROLE_SPLIT_RE = re.compile(r"^(.+?)\s[—–-]\s(.+)$")
_DEGREE_HINT_RE = re.compile(
    r"\b(bachelor|master|doctor|ph\.?d|mba|llb|ba|bs|b\.s|m\.s|associate|diploma|certificate)\b",
    re.IGNORECASE,
)

_SECTION_RENAMES = {
    "work experience": "RELEVANT EXPERIENCE",
    "skills": "CORE TECHNOLOGIES",
}
_SKIP_SECTION_HEADINGS = {"professional summary"}


def _collapse_text(text: str) -> str:
    decoded = text or ""
    prev = None
    while prev != decoded:
        prev = decoded
        decoded = html.unescape(decoded)
    return " ".join(decoded.split())


def _element_text(element: Tag) -> str:
    return _collapse_text(element.get_text())


def _unwrap_paragraphs_inside_list_items(soup: BeautifulSoup) -> None:
    """
    Hoist ``<p>`` text into parent ``<li>`` elements.

    Gemini often emits ``<li><p>bullet</p></li>``; LibreOffice renders both the
    list item and the nested paragraph as separate blocks (duplicate bullets).
    """
    for li in list(soup.find_all("li")):
        for paragraph in list(li.find_all("p", recursive=False)):
            paragraph.unwrap()


def _remove_duplicate_bullet_paragraphs(soup: BeautifulSoup) -> None:
    """Drop ``<p>`` blocks that repeat a preceding ``<li>`` (LibreOffice shows both)."""
    li_texts = {_element_text(li) for li in soup.find_all("li") if _element_text(li)}
    if not li_texts:
        return

    for list_tag in soup.find_all(["ul", "ol"]):
        list_items = {
            _element_text(li) for li in list_tag.find_all("li", recursive=False)
        }
        sibling = list_tag.find_next_sibling()
        while isinstance(sibling, Tag) and sibling.name == "p":
            para_text = _element_text(sibling)
            if para_text in list_items:
                next_sib = sibling.find_next_sibling()
                sibling.decompose()
                sibling = next_sib
                continue
            break

        sibling = list_tag.find_previous_sibling()
        while isinstance(sibling, Tag) and sibling.name == "p":
            para_text = _element_text(sibling)
            if para_text in list_items:
                next_sib = sibling.find_previous_sibling()
                sibling.decompose()
                sibling = next_sib
                continue
            break

        for paragraph in list(list_tag.find_all("p", recursive=False)):
            if paragraph.find_parent(["ul", "ol"]) is not list_tag:
                continue
            para_text = _element_text(paragraph)
            if para_text in list_items:
                paragraph.decompose()

    for paragraph in list(soup.find_all("p")):
        if paragraph.find_parent("li") is not None:
            continue
        para_text = _element_text(paragraph)
        if para_text in li_texts:
            prev_li = paragraph.find_previous("li")
            if prev_li is not None and _element_text(prev_li) == para_text:
                paragraph.decompose()


def _convert_lists_to_bullet_paragraphs_for_libreoffice(soup: BeautifulSoup) -> None:
    """
    LibreOffice writerweb8 import duplicates each ``<li>`` as list-item + ``<p>``.

    Replace ``<ul>``/``<ol>`` with styled ``<p>• …</p>`` lines so ODT has one block
    per bullet (matches the DOCX export path).
    """
    bullet_style = "font-size:11px;line-height:1.5;color:#222;margin:2px 0"

    for list_tag in list(soup.find_all(["ul", "ol"])):
        anchor: Tag = list_tag
        for li in list_tag.find_all("li", recursive=False):
            text = _element_text(li)
            if not text:
                continue
            if text.startswith("• ") or text.startswith("· ") or text.startswith("- "):
                bullet_text = text
            else:
                bullet_text = f"• {text}"
            paragraph = soup.new_tag("p")
            paragraph["style"] = bullet_style
            paragraph.string = bullet_text
            anchor.insert_after(paragraph)
            anchor = paragraph
        list_tag.decompose()


def _normalize_section_headings(soup: BeautifulSoup) -> None:
    for heading in list(soup.find_all(["h2", "h3"])):
        label = _collapse_text(heading.get_text()).lower()
        if heading.name == "h2":
            if label in _SKIP_SECTION_HEADINGS:
                heading.decompose()
                continue
            renamed = _SECTION_RENAMES.get(label)
            if renamed:
                heading.clear()
                heading.append(renamed)


def _split_combined_role_headings(soup: BeautifulSoup) -> None:
    """Turn ``<h3>Company — Title</h3>`` into title + company lines (résumé convention)."""
    for heading in list(soup.find_all("h3")):
        match = _ROLE_SPLIT_RE.match(_element_text(heading))
        if not match:
            continue
        left = _collapse_text(match.group(1))
        right = _collapse_text(match.group(2))

        in_education = False
        for prev in heading.find_all_previous(["h2"]):
            section = _collapse_text(prev.get_text()).lower()
            if section in _SKIP_SECTION_HEADINGS:
                continue
            if "education" in section:
                in_education = True
            break

        if in_education:
            if _DEGREE_HINT_RE.search(left):
                degree, institution = left, right
            elif _DEGREE_HINT_RE.search(right):
                degree, institution = right, left
            else:
                degree, institution = left, right
            institution_p = soup.new_tag("p")
            institution_p["style"] = (
                "font-size:12px;font-weight:bold;color:#111;margin:10px 0 1px 0"
            )
            institution_p.string = institution
            degree_p = soup.new_tag("p")
            degree_p["style"] = (
                "font-size:12px;font-weight:bold;color:#111;margin:0 0 4px 0"
            )
            degree_p.string = degree
            heading.replace_with(institution_p)
            institution_p.insert_after(degree_p)
        else:
            heading.clear()
            heading.string = right
            company_p = soup.new_tag("p")
            company_p["style"] = (
                "font-size:12px;font-weight:bold;color:#111;margin:0 0 4px 0"
            )
            company_p.string = left
            heading.insert_after(company_p)


def _reorder_header_contact_before_title(body: Tag) -> None:
    """Ensure contact ``<p>`` appears before professional title ``<p>`` after ``<h1>``."""
    name_heading = body.find("h1")
    if not name_heading:
        return

    candidates: list[Tag] = []
    sibling = name_heading.find_next_sibling()
    while isinstance(sibling, Tag) and sibling.name == "p":
        candidates.append(sibling)
        sibling = sibling.find_next_sibling()
        if len(candidates) >= 2:
            break

    if len(candidates) < 2:
        return

    first, second = candidates[0], candidates[1]
    first_is_contact = "@" in _element_text(first)
    second_is_contact = "@" in _element_text(second)
    if not first_is_contact and second_is_contact:
        contact, title = second, first
        for node in candidates:
            node.extract()
        anchor: Tag = name_heading
        for node in (contact, title):
            anchor.insert_after(node)
            anchor = node


def normalize_cv_export_html(html_content: str) -> str:
    """
    Clean Gemini CV HTML for document conversion.

    Args:
        html_content: Raw HTML document from the LLM

    Returns:
        Normalized HTML string
    """
    soup = BeautifulSoup(html_content or "", "html.parser")
    body = soup.find("body") or soup

    _unwrap_paragraphs_inside_list_items(soup)
    _remove_duplicate_bullet_paragraphs(soup)
    _normalize_section_headings(soup)
    _split_combined_role_headings(soup)
    _reorder_header_contact_before_title(body)
    _convert_lists_to_bullet_paragraphs_for_libreoffice(soup)

    if soup.find("html"):
        return str(soup)
    return str(body)
