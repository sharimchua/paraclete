import sys
from unittest.mock import MagicMock

# Mock dependencies that might be missing in the environment and are imported via backend.llm
modules_to_mock = [
    "llama_cpp", "fastapi", "fastapi.testclient", "sqlalchemy",
    "sqlalchemy.orm", "sqlalchemy.pool", "requests", "huggingface_hub", "numpy"
]
for module in modules_to_mock:
    if module not in sys.modules:
        sys.modules[module] = MagicMock()

import pytest
from backend.llm.templates import clean_note

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
    text = "Note with {braces} and [brackets] and \"quotes\" and % percent."
    result = clean_note(text)
    assert text in result
    assert "{braces}" in result
    assert "[brackets]" in result
    assert "\"quotes\"" in result
    assert "% percent" in result
