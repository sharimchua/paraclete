import sys
from unittest.mock import MagicMock

# Mock dependencies that might be missing in the environment and are imported via backend.llm
modules_to_mock = [
    "llama_cpp",
    "fastapi",
    "fastapi.testclient",
    "sqlalchemy",
    "sqlalchemy.orm",
    "sqlalchemy.pool",
    "requests",
    "huggingface_hub",
    "numpy",
]
for module in modules_to_mock:
    if module not in sys.modules:
        sys.modules[module] = MagicMock()

import pytest
from backend.llm.templates import (
    clean_note,
    clean_session_note,
    extract_entities,
    professional_draft,
    iterate_professional_draft,
    embed_note,
    ocr_capture,
    dictation_capture,
    session_brief,
    suggest_title,
    analyze_framework,
    synthesize_proposals,
    audit_framework,
    reformat_text,
    extract_references,
    topic_summary,
)


def test_clean_note_simple():
    """Test clean_note with a simple string."""
    text = "A simple transcription."
    result = clean_note(text)
    assert "RAW NOTE:" in result
    assert "CLEANED NOTE:" in result
    assert text in result
    assert "expert transcription cleaner" in result


def test_clean_note_multiline():
    """Test clean_note with a multiline string to ensure formatting is preserved."""
    text = "First line.\nSecond line with some    spaces.\nThird line."
    result = clean_note(text)
    assert text in result
    assert "First line." in result
    assert "Second line with some    spaces." in result
    assert "Third line." in result


def test_clean_note_empty():
    """Test clean_note with an empty string."""
    text = ""
    result = clean_note(text)
    # The template structure around {text} is:
    # RAW NOTE:
    # {text}
    #
    # CLEANED NOTE:
    assert "RAW NOTE:\n\n\nCLEANED NOTE:" in result


def test_clean_note_special_characters():
    """Test clean_note with special characters that might be found in notes."""
    text = 'Note with {braces} and [brackets] and "quotes" and % percent.'
    result = clean_note(text)
    assert text in result
    assert "{braces}" in result
    assert "[brackets]" in result
    assert '"quotes"' in result
    assert "% percent" in result


def test_clean_session_note():
    result = clean_session_note(
        text="txt",
        person_name="person",
        person_tags="pt",
        references="ref",
        previous_notes="pn",
        existing_tags="et",
        framework_expectations="fe",
        practitioner_name="pr_n",
        practitioner_preferred_name="pr_pn",
        practitioner_bio="pr_b",
    )
    assert "txt" in result
    assert "person" in result
    assert "pt" in result
    assert "ref" in result
    assert "pn" in result
    assert "et" in result
    assert "fe" in result
    assert "pr_n" in result
    assert "pr_pn" in result
    assert "pr_b" in result


def test_extract_entities():
    result = extract_entities(text="abc", context="def")
    assert "abc" in result
    assert "def" in result


def test_professional_draft():
    result = professional_draft(
        person_name="p",
        summary="s",
        history="h",
        framework_context="fc",
        practitioner_name="pn",
        practitioner_preferred_name="ppn",
        practitioner_bio="pb",
    )
    assert "p" in result
    assert "s" in result
    assert "h" in result
    assert "fc" in result
    assert "pn" in result
    assert "ppn" in result
    assert "pb" in result


def test_iterate_professional_draft():
    result = iterate_professional_draft(
        current_draft="cd",
        feedback="fb",
        person_name="pn",
        note_context="nc",
        history="h",
        highlight_text="ht",
        framework_context="fc",
    )
    assert "cd" in result
    assert "fb" in result
    assert "pn" in result
    assert "nc" in result
    assert "h" in result
    assert "ht" in result
    assert "fc" in result


def test_embed_note():
    result = embed_note(title="A", text="B")
    assert "A B" in result


def test_ocr_capture():
    result = ocr_capture(text="img")
    assert "img" in result


def test_dictation_capture():
    result = dictation_capture(filename="file.mp3")
    assert "file.mp3" in result


def test_session_brief():
    result = session_brief(
        person_name="pn",
        previous_notes="pn2",
        active_topics="at",
        recent_reflections="rr",
    )
    assert "pn" in result
    assert "pn2" in result
    assert "at" in result
    assert "rr" in result


def test_suggest_title():
    result = suggest_title(text="txt")
    assert "txt" in result


def test_analyze_framework():
    result = analyze_framework(
        content="c", persona_name="pn", context="ctx", quantity=5
    )
    assert "c" in result
    assert "pn" in result
    assert "ctx" in result
    assert "5" in result


def test_synthesize_proposals():
    result = synthesize_proposals(proposals_text="pt")
    assert "pt" in result


def test_audit_framework():
    result = audit_framework(core_items="ci", persona_items="pi", person_items="p_i")
    assert "ci" in result
    assert "pi" in result
    assert "p_i" in result


def test_reformat_text():
    result = reformat_text(
        selected_text="st", prompt="p", full_context="fc", framework_context="fwc"
    )
    assert "st" in result
    assert "p" in result
    assert "fc" in result
    assert "fwc" in result


def test_extract_references():
    result = extract_references(text="txt")
    assert "txt" in result


def test_topic_summary():
    result = topic_summary(topic_title="tt", topic_content="tc")
    assert "tt" in result
    assert "tc" in result


def test_clean_note_explicit_happy_path():
    """Explicitly tests the happy path for clean_note to ensure the core prompt and input text are formatted correctly."""
    input_text = "This is a messy raw transcription with um, some filler words."
    result = clean_note(text=input_text)
    assert input_text in result
    assert "You are an expert transcription cleaner" in result
    assert "RAW NOTE:" in result
    assert "CLEANED NOTE:" in result
