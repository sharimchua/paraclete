# backend/llm/templates.py
# High-fidelity prompt templates for Gemma 4 MoE

def clean_note(text: str) -> str:
    """Basic transcription cleanup."""
    return f"""You are an expert transcription cleaner for practitioners.
Your task is to take a raw, messy transcription or scratchpad note and turn it into a clean, structured session record.
Maintain the clinical or coaching tone. Do not add information that wasn't there, but fix grammar, remove filler words, and group into logical sections.

RAW NOTE:
{text}

CLEANED NOTE:"""

def clean_session_note(text: str, person_name: str, person_tags: str, references: str, previous_notes: str, existing_tags: str, framework_expectations: str = "") -> str:
    """Advanced RAG-based session expansion with framework adherence."""
    framework_section = ""
    if framework_expectations:
        framework_section = f"### Practice Framework Style & Tone Constraints (STRICT ADHERENCE)\n{framework_expectations}\n\n"

    return f"""{framework_section}You are an expert practitioner assistant. 
Your goal is to transform raw, fragmented session notes into a high-fidelity, comprehensive summary that incorporates relevant professional context and adheres to the practitioner's established style.

### Context
Person: {person_name} ({person_tags})

### Professional Knowledge & References
{references}

### Clinical History & Previous Sessions
{previous_notes}

### Workspace Taxonomy (Preferred Labels)
{existing_tags}

### Raw Session Data (Capture)
{text}

### Instructions
1. Expand the raw data into a coherent professional summary.
2. DO NOT include the person's name, the date, or any introductory summary lines.
3. START your response directly with the session's focal points or primary themes.
4. APPLY the established Practice Framework style (tone, idioms, formatting) perfectly.
5. If the framework suggests specific sections (e.g. "Focus Areas", "Next Steps"), use them.

### High-Fidelity Draft:
"""

def extract_entities(text: str, context: str = "") -> str:
    """Entity and Metadata extraction prompt."""
    return f"""Analyze the provided session notes to extract metadata.
{context}

1. Suggested Session Date: Identify any specific dates mentioned in the raw notes (e.g., "7th April", "yesterday", "next Tuesday"). 
   If "today" is mentioned, use today's date context. 
   Return ISO format YYYY-MM-DD.
   
2. Key-Value Tags: Extract categories and values. 
   PRIORITIZE existing categories like "Instrument", "Modality", "Theme", "Focus".
   Format as: "Category: Value".

Return valid JSON in the format:
{{
  "suggestedDate": "YYYY-MM-DD",
  "tags": [
    {{"key": "Instrument", "value": "Guitar"}},
    {{"key": "Theme", "value": "Aural Skills"}}
  ],
  "actions": ["task1"]
}}

SESSION CONTENT:
{text}

JSON:"""

def professional_draft(person_name: str, summary: str, history: str, framework_context: str = "") -> str:
    """Consolidated professional message drafting template with granular framework adherence."""
    framework_section = ""
    if framework_context:
        framework_section = f"### Practice Framework Constraints (STRICT ADHERENCE)\n{framework_context}\n\n"
        
    return f"""{framework_section}### Professional Context
Person: {person_name}
Summary of Today's Session:
{summary}

### Historical Context (Past Sessions)
{history}

### Mission
Draft a warm, professional follow-up message to the person.
1. Refer to specific insights or actions discussed today.
2. Maintain continuity with their historical progress.
3. STRICTLY follow the style, tone, and formatting constraints provided in the Practice Framework section.

### Draft Message (Output ONLY the message):"""

def iterate_professional_draft(current_draft: str, feedback: str, person_name: str, note_context: str = "", history: str = "", highlight_text: str = "", framework_context: str = "") -> str:
    """Surgical refinement of an existing draft with framework persistence."""
    focus_context = ""
    if highlight_text:
        focus_context = f"\n### SPECIFIC FOCUS ON THIS SECTION:\n{highlight_text}\n"
        
    framework_section = ""
    if framework_context:
        framework_section = f"### Practice Framework Style Constraints (STRICT ADHERENCE)\n{framework_context}\n\n"
        
    return f"""{framework_section}You are an expert professional assistant refining a message to {person_name}.

### CONTEXT
{note_context}

### PREVIOUS HISTORY
{history}

### CURRENT DRAFT
{current_draft}

### USER FEEDBACK
{feedback}
{focus_context}

### INSTRUCTIONS
Please provide an updated version of the message that addresses the feedback while maintaining the existing professional tone, context, and framework style.
Provide ONLY the updated message text.

### NEW DRAFT:"""

def embed_note(title: str, text: str) -> str:
    """Text to be embedded for note search."""
    return f"{title} {text}"

def ocr_capture(text: str = "[Vision Analysis Requested]") -> str:
    """OCR transcription and analysis."""
    return f"""Analyze the provided image content and transcribe any text found. Describe any drawings in detail within [square brackets].
Use the context of the note to expand on any partially formed thoughts or sentences.

Mandatory Instruction: Start your response directly with the transcription. Do not include any introductory phrases, greetings, or meta-commentary about the image or the task.

IMAGE CONTENT:
{text}

TRANSCRIPTION:"""

def dictation_capture(filename: str) -> str:
    """Audio cleanup prompt."""
    return f"""Transcribe the following audio content into clear, readable text.
Remove filler words (um, uh, like) but keep the original intent and professional context.

AUDIO CONTENT:
[Audio Input: {filename}]

TRANSCRIPTION:"""

def session_brief(person_name: str, previous_notes: str) -> str:
    """Generate a brief for a new session based on history."""
    return f"""### Context
Person: {person_name}

### Session History & Trends
{previous_notes}

### Goal
Based on the previous sessions' trends, summarise what topics have been covered and identify potential areas to explore in this new session. 
Provide a concise, professional briefing for the practitioner to read before starting the session.

### AI Session Brief:"""

def suggest_title(text: str) -> str:
    """Generate a short, scannable title for a note."""
    return f"""Analyze the following session note and provide a recommended short title (3-6 words) that captures the primary theme or focal point. 
The title should be professional and easy to scan.
Do not include the date or the person's name in the title.

SESSION NOTE:
{text}

RECOMMENDED TITLE:"""

def analyze_framework(content: str, persona_name: str, context: str = "", quantity: int = 5) -> str:
    """Analyze content for thematic framework improvements."""
    return f"""You are a Strategic Practice Architect. 
Your goal is to extract the high-level "Professional DNA" from the content below. 

### CONTEXT: Existing Framework for {persona_name}
{context}

### CONTENT TO ANALYZE:
{content}

### EXTRACTION GOALS:
1. **ABSTRACTION**: Do NOT extract specific one-off phrases or mentions. Instead, identify the *underlying principle* or *thematic style* they represent.
   - TOO SPECIFIC: "Mentioned the 3-step breathing technique."
   - STRATEGIC DNA: "Incorporate somatic anchoring techniques (like breathing or grounding) when discussing stress management."
2. **THEMATIC DIRECTIVES**: Phrase every observation as a broad, imperative instruction for an LLM that aims to maintain this practitioner's signature edge.
3. **DENSITY**: Extract EXACTLY {quantity} unique, high-impact proposals that represent significant or recurring patterns. Avoid cluttering with generic observations, but ensure you reach the target quantity to provide a comprehensive stylistic map.

### CATEGORIES:
- 'Tone': The emotional resonance and authority level.
- 'Phrasing': Signature linguistic markers or structural idioms.
- 'Formatting': Broad architectural choices for information display.
- 'Principles': The core professional tenets and philosophies.

### OUTPUT FORMAT:
Return valid JSON only.

{{
  "proposals": [
    {{
      "aspect": "Phrasing",
      "action": "Add",
      "value": "Use dynamic systems metaphors (e.g., feedback loops, equilibrium, nodes) when describing social or technical dynamics."
    }}
  ]
}}

JSON:"""

# Note: persona_draft preserved for older calls if necessary, but professional_draft is preferred.
def synthesize_proposals(proposals_text: str) -> str:
    return f"""You are an expert at distilling professional practice insights. Your goal is to take a collection of potentially overlapping framework proposals and synthesize them into a lean, non-redundant set of high-impact principles.
    
    ### RAW PROPOSALS:
    {proposals_text}
    
    ### INSTRUCTIONS:
    1. CATEGORIZE: Group by aspect (Tone, Idioms, Formatting, Workflow, Principles).
    2. MERGE: Combine overlapping observations. For example, "Uses metaphors" and "Uses weaving analogies" should be merged into "Uses weave-related metaphors".
    3. DISCARD: Remove generic advice (like "Be professional") unless it has specific practitioner flavor.
    4. ACTION: Ensure every "value" is a specific, actionable rule or idiom.
    5. FORMAT: Return VALID JSON only. Match the input schema exactly.
    
    ### Synthesis Goal:
    Output 3-5 unique, high-fidelity items that truly define this practitioner's specific edge.

    JSON:"""
    
def audit_framework(core_items: str, persona_items: str, person_items: str = "") -> str:
    return f"""You are a professional practice auditor. Your goal is to identify direct contradictions or redundant overlaps in the practitioner's style framework across different hierarchical levels.

### CORE FRAMEWORK (Primary)
{core_items}

### PERSONA OVERRIDES
{persona_items}

### ENTITY-SPECIFIC OVERRIDES
{person_items}

### INSTRUCTIONS
1. CONTRADICTIONS: Find directives that directly oppose each other (e.g., Core says "Use formal tone" but Persona says "Use casual tone").
2. REDUNDANCY: Find identical directives at different levels that should be cleaned up.
3. OUTPUT: Return a list of identified conflicts in JSON.

Format:
{{
  "conflicts": [
    {{
      "aspect": "Tone",
      "severity": "High",
      "description": "Core mandates formal language while Persona uses slang/casual idioms.",
      "recommendation": "Decide on a dominant tone for this context."
    }}
  ]
}}

JSON:"""

def reformat_text(selected_text: str, prompt: str, full_context: str, framework_context: str = "") -> str:
    """Prompt for restructuring a specific section of text."""
    framework_section = ""
    if framework_context:
        framework_section = f"### Practice Framework Constraints (STRICT ADHERENCE)\\n{framework_context}\\n\\n"
        
    return f"""{framework_section}### Instruction
The user wants to restructure a specific part of their text.

### FULL CONTEXT (The entire document/message):
{full_context}

### TARGET SELECTION (The specific part to be updated):
{selected_text}

### USER'S REFORMATTING COMMAND:
"{prompt}"

### INSTRUCTIONS:
1. Provide ONLY the updated version of the TARGET SELECTION.
2. Ensure the new version fits seamlessly into the FULL CONTEXT provided.
3. ADHERE STRICTLY to any professional style and tone constraints from the Practice Framework.
4. If the user asks for a specific format (e.g. bullets, professional tone), follow it precisely.

### RESTRUCTURED TEXT:"""

def extract_references(text: str) -> str:
    return f"""Analyze the provided session note to extract universal professional concepts, techniques, resources or patterns that could be added to a Reference Library.

### INSTRUCTIONS:
1. Identify high-level concepts, techniques, resources, or insights.
2. For each item:
   - TITLE: A short, scannable name for the concept.
   - TYPE: One of [CONCEPT, RESOURCE, TECHNIQUE, PATTERN, TEMPLATE] (All uppercase).
   - BODY: A concise (2-4 sentence) summary of the concept derived from the text.
3. ADHERENCE: Do not extract specific session details (e.g. specific dates or names). Extract the *underlying professional knowledge*.
4. Return VALID JSON array of objects.

### SESSION NOTE:
{text}

### OUTPUT FORMAT:
[
  {{
    "title": "Somatic Anchoring",
    "type": "Technique",
    "body": "A method of grounding the nervous system by focusing on physical sensations of contact with the chair or floor."
  }}
]

JSON:"""

