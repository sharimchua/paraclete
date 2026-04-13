# backend/llm/workflows.py
import json
import asyncio
from .core import llm_manager
from . import templates


async def run_ocr(image_paths: list[str]) -> str:
    """Extract and compile text from one or more images sequentially to ensure full coverage."""
    full_text = []
    try:
        # Use template for instructions
        prompt = templates.ocr_capture()
        
        for idx, path in enumerate(image_paths):
            print(f"DEBUG: Processing OCR for image {idx+1}/{len(image_paths)}: {path}")
            result = await asyncio.to_thread(
                llm_manager.call,
                prompt=prompt,
                system="You are an expert data entry assistant for transcribing hand-written notes. Extract the requested text and any drawings or diagrams accurately, using the context of the image when needed.",
                image_paths=[path], # Pass as single-item list
                max_tokens=2048
            )
            if result and not result.startswith("OCR Extraction Error"):
                full_text.append(result)
        
        return "\n\n".join(full_text)

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
        existing_tags=context.get("existing_tags", "None"),
        framework_expectations=context.get("framework_expectations", "")
    )
    
    # call() returns the cleaned string directly
    result = await asyncio.to_thread(
        llm_manager.call,
        prompt=prompt,
        system="You are an expert practitioner assistant.",
        max_tokens=2000
    )

    
    # Prepend the starting header that helps the user identify the focus
    return "#### SESSION FOCUS: " + result

async def run_entity_extraction(text: str, context: str = "", grammar: str = None) -> dict:
    """Extract structured data (tags, actions) from a note."""
    prompt = templates.extract_entities(text=text, context=context)
    
    result = await asyncio.to_thread(
        llm_manager.call,
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
    prompt = templates.professional_draft(
        person_name=context.get("person_name", "Friend"),
        summary=context.get("summary", ""),
        history=context.get("history", "No prior history."),
        framework_context=context.get("framework_context", "")
    )
    
    return await asyncio.to_thread(
        llm_manager.call,
        prompt=prompt,
        system="Draft a warm, professional follow-up message.",
        max_tokens=1024
    )


async def run_persona_draft(note_content: str, persona_name: str, persona_bio: str, references: str) -> str:
    """Draft a follow-up message using a specific professional persona."""
    prompt = templates.persona_draft(
        note_content=note_content,
        persona_name=persona_name,
        persona_bio=persona_bio,
        references=references
    )
    
    return await asyncio.to_thread(
        llm_manager.call,
        prompt=prompt,
        system=f"You are writing a follow-up message as {persona_name}. Style: {persona_bio[:200]}...",
        max_tokens=1500
    )


async def run_dictation(audio_filename: str) -> str:
    """Clean up dictation text."""
    prompt = templates.dictation_capture(filename=audio_filename)
    return await asyncio.to_thread(
        llm_manager.call,
        prompt=prompt,
        system="Transcribe and clean up audio content.",
        max_tokens=1024
    )


async def run_session_brief(person_name: str, previous_notes: str) -> str:
    """Generate a session briefing based on history."""
    prompt = templates.session_brief(person_name=person_name, previous_notes=previous_notes)
    
    return await asyncio.to_thread(
        llm_manager.call,
        prompt=prompt,
        system="You are an expert practice assistant providing a pre-session briefing.",
        max_tokens=1024
    )


async def run_suggest_title(text: str) -> str:
    """Generate a short theme-based title for a note."""
    prompt = templates.suggest_title(text=text)
    
    return await asyncio.to_thread(
        llm_manager.call,
        prompt=prompt,
        system="You are an expert practitioner assistant.",
        max_tokens=100
    )

async def run_reformat(selected_text: str, user_prompt: str, full_context: str, framework_context: str = "") -> str:
    """Restructure a specific part of text based on user command."""
    prompt = templates.reformat_text(
        selected_text=selected_text,
        prompt=user_prompt,
        full_context=full_context,
        framework_context=framework_context
    )
    
    return await asyncio.to_thread(
        llm_manager.call,
        prompt=prompt,
        system="You are an expert professional editor. Restructure the provided text accurately as requested.",
        max_tokens=1500
    )


async def run_reference_extraction(text: str) -> list[dict]:
    """Extract universal concepts/techniques from a note as potential references."""
    import re
    grammar = r'''
    root   ::= "[" space ( object ( "," space object )* )? "]"
    object ::= "{" space ( pair ( "," space pair )* )? "}"
    pair   ::= string ":" space value
    string ::= "\"" ( [^"] | "\\" ["\\/bfnrt] | "\\u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] )* "\""
    value  ::= string | number | object | array | "true" | "false" | "null"
    array  ::= "[" space ( value ( "," space value )* )? "]"
    number ::= "-"? ([0-9]+ | [0-9]+ "." [0-9]+)
    space  ::= [ \t\n\r]*
    '''
    
    prompt = templates.extract_references(text)
    
    result = await asyncio.to_thread(
        llm_manager.call,
        prompt=prompt,
        system="You are a data extraction engine. Your ONLY output is an array of JSON objects. DO NOT include ANY other text, conversational preamble, or markdown code blocks (```). Start directly with '['.",
        grammar=grammar,
        max_tokens=2000
    )
    
    try:
        # Robustly extract JSON if there's any wrapping text
        json_str = result.strip()
        print(f"FORENSIC: Extraction result length: {len(json_str)}")
        
        # 1. Try to find the JSON array directly
        match = re.search(r'(\[[\s\S]*?\])', json_str, re.DOTALL)
        if match:
            print("FORENSIC: Found potential array via regex Match 1")
            try:
                data = json.loads(match.group(1))
                if isinstance(data, list):
                    print(f"FORENSIC: Successfully parsed array via Match 1. Count: {len(data)}")
                    return data
            except Exception as e:
                print(f"FORENSIC: Match 1 parse failed: {e}")
        
        # 2. Try to find anything that looks like a JSON array by looking for balanced brackets
        if "[" in json_str and "]" in json_str:
            print("FORENSIC: Attempting bracket matching fallback")
            try:
                start = json_str.find("[")
                end = json_str.rfind("]") + 1
                data = json.loads(json_str[start:end])
                if isinstance(data, list):
                    print(f"FORENSIC: Successfully parsed array via bracket matching. Count: {len(data)}")
                    return data
            except Exception as e:
                print(f"FORENSIC: Bracket matching parse failed: {e}")
            
        # 3. Fallback: try to find individual objects and build an array
        print("FORENSIC: Attempting individual object extraction fallback")
        obj_matches = re.findall(r'(\{\s*"title"\s*:[\s\S]*?\})', json_str)
        if obj_matches:
            print(f"FORENSIC: Found {len(obj_matches)} potential objects via regex")
            found_objs = []
            for om in obj_matches:
                try:
                    obj = json.loads(om)
                    if "title" in obj:
                        found_objs.append(obj)
                except:
                    continue
            if found_objs:
                print(f"FORENSIC: Successfully assembled {len(found_objs)} objects")
                return found_objs

        print(f"FORENSIC ERROR: No valid JSON structures found in model output.")
        print(f"FORENSIC RAW: {json_str[:500]}...")
        return []
    except Exception as e:
        print(f"DEBUG: Failed to parse reference extraction JSON: {e}")
        print(f"DEBUG: Raw result was: {result[:2000]}")
        return []


