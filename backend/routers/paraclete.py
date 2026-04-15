from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import json
import asyncio
import re
from sqlalchemy import or_

try:
    from .. import models, schemas, llm
    from ..database import get_db
    from ..services.framework_resolver import resolve_framework_items
    from ..websockets_manager import ws_manager
except ImportError:
    import models, schemas, llm
    from database import get_db
    from services.framework_resolver import resolve_framework_items
    from websockets_manager import ws_manager

router = APIRouter(prefix="/paraclete", tags=["paraclete"])

# --- STREAM FILTERING ---

class ChatStreamFilter:
    """Handles partial tokens and filters out multiple model internal tags/thoughts."""
    def __init__(self):
        self.buffer = ""
        self.skipping = False
        self.active_end_tag = None
        # List of (start_tag, end_tag) pairs to filter out
        self.tags = [
            ("<|channel>thought", "<channel|>"),
            ("<|thought>", "</thought>"),
            ("<|tool_call>", "<tool_call|>"),
            ("<|tool_response>", "<tool_response|>"),
            ("<tool_call>", "</tool_call>"),
            ("<thought>", "</thought>")
        ]

    def process(self, token: str):
        self.buffer += token
        output = ""
        
        while True:
            if not self.skipping:
                # Look for ANY start tag
                found_start = False
                for start_tag, end_tag in self.tags:
                    start_idx = self.buffer.find(start_tag)
                    if start_idx != -1:
                        # Yield everything before start tag
                        output += self.buffer[:start_idx]
                        self.skipping = True
                        self.active_end_tag = end_tag
                        # Remove start tag from buffer
                        self.buffer = self.buffer[start_idx + len(start_tag):]
                        found_start = True
                        break
                
                if found_start:
                    continue
                else:
                    # No start tag found. 
                    # Only withhold the part at the end that could be a prefix of ANY start tag.
                    max_potential = 0
                    for start_tag, _ in self.tags:
                        for i in range(min(len(self.buffer), len(start_tag) - 1), 0, -1):
                            if start_tag.startswith(self.buffer[-i:]):
                                max_potential = max(max_potential, i)
                                break
                    
                    if max_potential == 0:
                        output += self.buffer
                        self.buffer = ""
                    else:
                        yield_len = len(self.buffer) - max_potential
                        if yield_len > 0:
                            output += self.buffer[:yield_len]
                            self.buffer = self.buffer[yield_len:]
                    break
            else:
                # We are skipping. Look for active end tag.
                if not self.active_end_tag:
                    self.skipping = False
                    continue

                end_idx = self.buffer.find(self.active_end_tag)
                if end_idx != -1:
                    self.skipping = False
                    # Remove everything up to and including end tag
                    self.buffer = self.buffer[end_idx + len(self.active_end_tag):]
                    self.active_end_tag = None
                    continue
                else:
                    # Still skipping. 
                    # Only withhold the part at the end that could be an end tag prefix.
                    potential_end = -1
                    for i in range(min(len(self.buffer), len(self.active_end_tag) - 1), 0, -1):
                        if self.active_end_tag.startswith(self.buffer[-i:]):
                            potential_end = i
                            break
                    
                    if potential_end == -1:
                        self.buffer = ""
                    else:
                        self.buffer = self.buffer[-potential_end:]
                    break
        return output

    def flush(self):
        if not self.skipping:
            res = self.buffer
            self.buffer = ""
            return res
        return ""

# --- TOOL REGISTRY ---

class ToolRegistry:
    def __init__(self):
        self.tools = {}

    def register(self, name, description, parameters):
        def decorator(func):
            self.tools[name] = {
                "func": func,
                "description": description,
                "parameters": parameters
            }
            return func
        return decorator

    def get_metadata(self) -> str:
        metadata = []
        for name, info in self.tools.items():
            metadata.append(f"- {name}: {info['description']}. Params: {info['parameters']}")
        return "\n".join(metadata)

    async def call(self, name, args, db):
        if name not in self.tools:
            return f"Error: Tool {name} not found."
        try:
            func = self.tools[name]["func"]
            if asyncio.iscoroutinefunction(func):
                return await func(db, **args)
            else:
                return func(db, **args)
        except Exception as e:
            return f"Error executing tool {name}: {str(e)}"

tool_registry = ToolRegistry()

@tool_registry.register(
    "search_people",
    "Search for people in the practice by name.",
    {"query": "string"}
)
async def search_people(db: Session, query: str):
    people = db.query(models.Person).filter(models.Person.name.ilike(f"%{query}%")).limit(10).all()
    if not people: return "No people found."
    return "\n".join([f"ID: {p.id}, Name: {p.name}, Contact: {p.contact_method}" for p in people])

@tool_registry.register(
    "get_person_details",
    "Get detailed info and recent notes for a specific person.",
    {"person_id": "integer"}
)
async def get_person_details(db: Session, person_id: int):
    person = db.query(models.Person).filter(models.Person.id == person_id).first()
    if not person: return "Person not found."
    notes = db.query(models.Note).filter(models.Note.person_id == person.id).order_by(models.Note.date.desc()).limit(5).all()
    note_summary = "\n".join([f"- {n.date}: {n.title}" for n in notes])
    tags = ", ".join([f"{t.key}: {t.value}" for t in person.tags])
    return f"Name: {person.name}\nContact: {person.contact_method}\nTags: {tags}\nRecent Sessions:\n{note_summary}\n\nTo see note content, ask for a specific note by title or ID."

@tool_registry.register(
    "search_groups",
    "Search for groups in the practice.",
    {"query": "string"}
)
async def search_groups(db: Session, query: str):
    groups = db.query(models.Group).filter(models.Group.name.ilike(f"%{query}%")).limit(10).all()
    if not groups: return "No groups found."
    return "\n".join([f"ID: {g.id}, Name: {g.name}, Description: {g.description}" for g in groups])

@tool_registry.register(
    "search_notes",
    "Search for session notes by keyword or title.",
    {"query": "string"}
)
async def search_notes(db: Session, query: str):
    notes = db.query(models.Note).filter(
        or_(
            models.Note.title.ilike(f"%{query}%"),
            models.Note.cleaned_text.ilike(f"%{query}%")
        )
    ).order_by(models.Note.date.desc()).limit(5).all()
    if not notes: return "No notes matching that query found."
    return "\n".join([f"ID: {n.id}, Date: {n.date}, Title: {n.title}" for n in notes])

@tool_registry.register(
    "get_note_content",
    "Read the full cleaned text of a specific note.",
    {"note_id": "integer"}
)
async def get_note_content(db: Session, note_id: int):
    note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if not note: return "Note not found."
    return f"TITLE: {note.title}\nDATE: {note.date}\nCONTENT:\n{note.cleaned_text or note.raw_capture}"

@tool_registry.register(
    "get_framework_context",
    "Get the resolved practice framework (Tone, Phrasing, etc) for a specific entity or persona.",
    {"person_id": "integer", "group_id": "integer", "persona_id": "integer"}
)
async def get_framework_context(db: Session, person_id: int = None, group_id: int = None, persona_id: int = None):
    return resolve_framework_items(db, person_id=person_id, group_id=group_id, persona_id=persona_id)

# --- CHAT ENDPOINT ---

class ChatRequest(BaseModel):
    messages: List[Dict[str, str]]
    context: Optional[Dict[str, Any]] = None

@router.post("/chat")
async def paraclete_chat(
    request: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """
    Paraclete Interactive Chat with Tool Calling and Context Awareness.
    """
    user_messages = request.get("messages", [])
    
    # Base Workspace Context
    person_count = db.query(models.Person).count()
    group_count = db.query(models.Group).count()
    note_count = db.query(models.Note).count()
    
    system_prompt = f"""You are Paraclete, an intelligent AI companion for professional practitioners.
Your goal is to assist with note-taking, framework extraction, message drafting, and workspace management.

WORKSPACE SUMMARY:
- People: {person_count}
- Groups: {group_count}
- Notes: {note_count}

INSTRUCTIONS:
- You are professional, insightful, and concise.
- ALWAYS use the tools provided to retrieve information about specific people, groups, or notes. Do not guess.
- Format tool calls as: [TOOL: tool_name(arg="value")] on a single line.
- You can call multiple tools if needed.
- When you have enough information, reply to the user directly.
- Avoid conversational fluff.

AVAILABLE TOOLS:
{tool_registry.get_metadata()}
"""

    messages = [{"role": "system", "content": system_prompt}] + user_messages

    # Calculate current context size
    full_prompt_text = "\n".join([m["content"] for m in messages])
    try:
        tokens = llm.llm_manager.model.tokenize(full_prompt_text.encode("utf-8"))
        token_count = len(tokens)
    except:
        token_count = len(full_prompt_text) // 4
    
    await ws_manager.broadcast({"event": "llm_start", "data": {"type": "chat", "prompt": "Paraclete is thinking..."}})

    async def generate_chat():
        nonlocal messages
        current_messages = list(messages)
        yielded_anything = False
        
        # Reasoning Loop (Max 5 iterations for tool calling)
        for i in range(5):
            # Generate response (non-streaming for tool discovery)
            response = await asyncio.to_thread(
                llm.llm_manager.model.create_chat_completion,
                messages=current_messages,
                max_tokens=1024,
                stop=["<turn|>", "<|channel|>", "<eos>"]
            )
            
            content = response["choices"][0]["message"]["content"]
            
            # Look for tool calls: [TOOL: name(args)] OR native formats
            tool_calls = re.findall(r'\[TOOL:\s*(\w+)\((.*?)\)\]', content)
            # Support native <|tool_call|>call:name(...) format too
            native_calls = re.findall(r'<\|tool_call\>call:(\w+)\((.*?)\)\<tool_call\|>', content)
            tool_calls += native_calls
            
            if tool_calls:
                # Filter thought channel for internal logging
                display_content = content
                if "<|channel>thought" in display_content:
                    display_content = display_content.split("<channel|>")[-1].strip()
                
                await ws_manager.broadcast({"event": "llm_match", "data": f"Tool Call Detected: {tool_calls}"})
                
                current_messages.append({"role": "assistant", "content": content})
                tool_results = []
                for tool_name, args_str in tool_calls:
                    # Simple arg parsing (very basic)
                    args = {}
                    if args_str:
                        # Extract key-value pairs like name="val" or id=123
                        # Handle both single and double quotes, and integers
                        pairs = re.findall(r'(\w+)\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|(\d+))', args_str)
                        for k, v_double, v_single, v_int in pairs:
                            val = v_double or v_single or v_int
                            args[k] = int(val) if v_int else val
                    
                    result = await tool_registry.call(tool_name, args, db)
                    tool_results.append(f"RESULT of {tool_name}: {result}")
                
                tool_output = "\n\n".join(tool_results)
                await ws_manager.broadcast({"event": "llm_no_match", "data": f"Tool Results: {tool_output[:200]}..."})
                current_messages.append({"role": "user", "content": tool_output})
                continue
            else:
                # Final Pass: Stream the completion
                response_iter = await asyncio.to_thread(
                    llm.llm_manager.model.create_chat_completion,
                    messages=current_messages,
                    stream=True,
                    max_tokens=1024,
                    stop=["<turn|>", "<eos>"]
                )
                
                stream_filter = ChatStreamFilter()
                for chunk in response_iter:
                    delta = chunk["choices"][0].get("delta", {})
                    if "content" in delta:
                        token = delta["content"]
                        filtered = stream_filter.process(token)
                        if filtered:
                            yield filtered
                            yielded_anything = True
                
                final_flush = stream_filter.flush()
                if final_flush:
                    yield final_flush
                    yielded_anything = True
                break
        
        if not yielded_anything:
            yield "I've analyzed the practice context but couldn't formulate a specific answer. Could you try asking in a different way?"
            
        await ws_manager.broadcast({"event": "llm_finish", "data": {"type": "chat"}})

    return StreamingResponse(
        generate_chat(), 
        media_type="text/plain",
        headers={"X-Context-Usage": str(token_count)}
    )

class ReformatRequest(BaseModel):
    selected_text: str
    full_context: str
    prompt: str
    person_id: Optional[int] = None
    group_id: Optional[int] = None

@router.post("/reformat")
async def paraclete_reformat(
    request: ReformatRequest,
    db: Session = Depends(get_db)
):
    """
    Restructure a specific section of text using AI and framework context.
    """
    from ..services.framework_resolver import resolve_framework_items
    from ..websockets_manager import ws_manager

    # Resolve framework context
    framework_context = resolve_framework_items(db, person_id=request.person_id, group_id=request.group_id)

    await ws_manager.broadcast({"event": "llm_start", "data": {"type": "reformat", "prompt": "Restructuring Text..."}})
    try:
        result = await llm.workflows.run_reformat(
            selected_text=request.selected_text,
            user_prompt=request.prompt,
            full_context=request.full_context,
            framework_context=framework_context
        )
        await ws_manager.broadcast({"event": "llm_finish", "data": {"type": "reformat", "result": result}})
        return {"result": result}
    except Exception as e:
        await ws_manager.broadcast({"event": "llm_error", "data": str(e)})
        raise HTTPException(status_code=500, detail=str(e))

