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

def clean_session_note(text: str, person_name: str, person_tags: str, references: str, previous_notes: str, existing_tags: str) -> str:
    """Advanced RAG-based session expansion."""
    return f"""You are an expert practitioner assistant. 
Your goal is to transform raw, fragmented session notes into a high-fidelity, comprehensive summary that incorporates relevant professional context.

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
4. Do not include metadata that belongs in separate fields (like tags or dates).

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

def analyze_framework(content: str, persona_name: str, context: str = "") -> str:
    """Analyze content for framework improvements."""
    return f"""You are an expert at analyzing professional practices and styles.
Analyze the following content to identify patterns, idioms, preferred tones, and principles that define the practitioner's style for the persona "{persona_name}".

{context}

### CONTENT TO ANALYZE:
{content}

### INSTRUCTIONS:
Identify specific improvements or adjustments for the Practice Framework.
Return valid JSON in the format:
{{
  "proposals": [
    {{
      "aspect": "Tone & Idioms",
      "action": "Add",
      "value": "Uses specific metaphorical language about 'weaving' ideas together."
    }},
    {{
      "aspect": "Formatting Preferences",
      "action": "Update",
      "value": "Prefer bullet points for action items."
    }}
  ]
}}

JSON:"""

# Note: persona_draft preserved for older calls if necessary, but professional_draft is preferred.
def synthesize_proposals(proposals_text: str) -> str:
    return f"""You are an expert at distilling professional insights. Your task is to take a list of raw proposals for a Practice Framework and merge them into a smaller, unique, and high-impact set.
    
    ### RAW PROPOSALS:
    {proposals_text}
    
    ### INSTRUCTIONS:
    1. Group similar entries by their "aspect" (Tone, Formatting, etc.).
    2. De-duplicate redundant observations.
    3. Combine related minor points into broader, more actionable principles.
    4. Keep the output professional and concise.
    5. Return valid JSON in the and match the format of the input.

    Format:
    {{
      "proposals": [
        {{
          "aspect": "Tone & Idioms",
          "action": "Add",
          "value": "Consolidated observation text..."
        }}
      ]
    }}

    JSON:"""
