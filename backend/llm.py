import os
import sys
from llama_cpp import Llama
from typing import Optional, Dict, Any, List
import json

class LLMManager:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(LLMManager, cls).__new__(cls)
            cls._instance.model = None
            cls._instance.model_path = os.getenv("PARACLETE_MODEL_PATH")
        return cls._instance
    
    def _get_default_model_path(self):
        # Fallback logic if env var is missing
        # Usually inside the python_env/models directory
        # We can try to find it relative to sys.executable
        executable_dir = os.path.dirname(sys.executable)
        potential_path = os.path.join(executable_dir, "models", "gemma-4-moe.gguf")
        return potential_path

    def load_model(self):
        if self.model is not None:
            return
        
        path = self.model_path or self._get_default_model_path()
        
        if not os.path.exists(path):
            print(f"DEBUG: Model not found at {path}")
            return
        
        print(f"DEBUG: Loading model from {path}...")
        try:
            # Gemma 2 / 4 MoE might need specific configs
            self.model = Llama(
                model_path=path,
                n_ctx=4096,
                n_gpu_layers=-1, # Offload all to GPU
                verbose=False
            )
            print(f"DEBUG: Model loaded successfully.")
        except Exception as e:
            print(f"DEBUG: Failed to load model: {e}")

    def generate(self, prompt: str, grammar: Optional[str] = None, stream: bool = False, **kwargs):
        if self.model is None:
            self.load_model()
            if self.model is None:
                return {"error": "Model not loaded and could not be found."}
        
        return self.model(
            prompt,
            grammar=grammar,
            stream=stream,
            **kwargs
        )

llm_manager = LLMManager()

# Prompt Templates
TEMPLATES = {
    "clean_note": """You are an expert transcription cleaner for practitioners.
Your task is to take a raw, messy transcription or scratchpad note and turn it into a clean, structured session record.
Maintain the clinical or coaching tone. Do not add information that wasn't there, but fix grammar, remove filler words, and group into logical sections.

RAW NOTE:
{text}

CLEANED NOTE:""",
    
    "extract_entities": """Extract Tags, References, and Action Items from the following note.
Return valid JSON.

NOTE:
{text}

JSON:""",
    
    "draft_message": """Context: {context}
Note summary: {summary}

Draft a follow-up message to the person based on this session. Use a warm, professional, and practice-appropriate tone.
MESSAGE:"""
}
