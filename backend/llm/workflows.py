# backend/llm/workflows.py
import json
from .core import llm_manager
from . import templates

async def run_ocr(image_path: str) -> str:
    """Extract and compile text from an image."""
    try:
        # Use template for instructions
        prompt = templates.ocr_capture()
        
        # Standardized call handles image base64, prompt ordering, stop tokens, and gemma cleanup
        return llm_manager.call(
            prompt=prompt,
            system="You are an expert data entry assistant for transcribing hand-written notes. Extract the requested text and any drawings or diagrams accurately, using the context of the image when needed.",
            image_path=image_path,
            max_tokens=1024
        )
    except Exception as e:
        print(f"DEBUG: OCR Workflow failed: {e}")
        return f"OCR Extraction Error: {str(e)}"

async def run_note_cleanse(text: str, context: dict) -> str:
    """Transform raw notes into a high-fidelity draft using RAG context."""
    prompt = templates.clean_session_note(
        text=text,
        person_name=context.get("person_name", "General"),
        person_tags=context.get("person_tags", "None"),
        references=context.get("references", "No relevant references found."),
        previous_notes=context.get("previous_notes", "No previous session history."),
        existing_tags=context.get("existing_tags", "None")
    )
    
    # call() returns the cleaned string directly
    result = llm_manager.call(
        prompt=prompt,
        system="You are an expert practitioner assistant.",
        max_tokens=2000
    )
    
    # Prepend the starting header that helps the user identify the focus
    return "#### SESSION FOCUS: " + result

async def run_entity_extraction(text: str, context: str = "", grammar: str = None) -> dict:
    """Extract structured data (tags, actions) from a note."""
    prompt = templates.extract_entities(text=text, context=context)
    
    result = llm_manager.call(
        prompt=prompt,
        system="Extract Tag, References, and Action Items as JSON.",
        grammar=grammar,
        max_tokens=1000
    )
    
    try:
        return json.loads(result)
    except Exception as e:
        print(f"DEBUG: Failed to parse entity JSON: {e}")
        return {"tags": [], "actions": [], "references": []}

async def run_draft_message(context: dict) -> str:
    """Draft a follow-up message based on session summary and history."""
    prompt = templates.draft_message(
        person_name=context.get("person_name", "Friend"),
        summary=context.get("summary", ""),
        history=context.get("history", "No prior history.")
    )
    
    return llm_manager.call(
        prompt=prompt,
        system="Draft a warm, professional follow-up message.",
        max_tokens=1024
    )

async def run_dictation(audio_filename: str) -> str:
    """Clean up dictation text."""
    prompt = templates.dictation_capture(filename=audio_filename)
    return llm_manager.call(
        prompt=prompt,
        system="Transcribe and clean up audio content.",
        max_tokens=1024
    )
