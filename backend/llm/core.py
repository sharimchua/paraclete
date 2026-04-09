# backend/llm/core.py
import os
import sys
import json
import base64
from llama_cpp import Llama, LlamaGrammar
from typing import Optional, Dict, Any, List

class LLMManager:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(LLMManager, cls).__new__(cls)
            cls._instance.model = None
            cls._instance.model_path = os.getenv("PARACLETE_MODEL_PATH")
        return cls._instance
    
    def _get_default_model_path(self):
        executable_dir = os.path.dirname(sys.executable)
        potential_path = os.path.join(executable_dir, "models", "gemma-4-moe.gguf")
        return potential_path

    def load_model(self):
        if self.model is not None:
            return
        
        path = self.model_path or self._get_default_model_path()
        mmproj_path = os.path.join(os.path.dirname(path), "mmproj-gemma-4.gguf")
        
        if not os.path.exists(path) or os.path.getsize(path) < 1024*1024*1024:
            print(f"ERROR: Model weights missing or invalid at {path}.")
            return
        
        print(f"DEBUG: Loading Gemma 4 26B MoE from {path}...")
        try:
            chat_handler = None
            if os.path.exists(mmproj_path):
                print(f"DEBUG: Found Vision Projector. Initializing Multimodal Handler...")
                try:
                    from .vision import Gemma4VisionChatHandler
                    chat_handler = Gemma4VisionChatHandler(clip_model_path=mmproj_path)
                except Exception as ve:
                    print(f"DEBUG: Could not load vision handler: {ve}")
            
            self.model = Llama(
                model_path=path,
                n_ctx=4096,      
                n_gpu_layers=-1, 
                embedding=True,  
                verbose=False,    
                chat_handler=chat_handler,
                n_threads=16
            )
            print(f"DEBUG: Gemma 4 26B MoE loaded successfully.")
        except Exception as e:
            print(f"DEBUG: Failed to load model: {e}")
            self.model = None

    def generate(self, prompt: str, grammar: Optional[Any] = None, stream: bool = False, **kwargs):
        """Low-level generation call."""
        if self.model is None:
            self.load_model()
            if self.model is None:
                raise RuntimeError("LLM Model not loaded.")
        
        # Handle grammar if it's a string (convert to LlamaGrammar)
        if grammar and isinstance(grammar, str):
            try:
                grammar = LlamaGrammar.from_string(grammar)
            except Exception as ge:
                print(f"DEBUG: Failed to parse grammar string: {ge}")
                grammar = None

        return self.model(
            prompt,
            grammar=grammar,
            stream=stream,
            **kwargs
        )

    def chat(self, messages: List[Dict[str, str]], **kwargs):
        """Chat completion call."""
        if self.model is None:
            self.load_model()
            if self.model is None:
                raise RuntimeError("LLM Model not loaded.")
        
        return self.model.create_chat_completion(
            messages=messages,
            **kwargs
        )

    def call(self, prompt: str, system: str = "You are a helpful assistant.", image_path: Optional[str] = None, grammar: Optional[Any] = None, **kwargs):
        """
        Standardized high-level execution for Gemma 4.
        Handles vision, chat formatting, stop tokens, and artifact cleanup.
        """
        if self.model is None:
            self.load_model()
            if self.model is None:
                raise RuntimeError("LLM Model not loaded.")

        # Default stop tokens to prevent MoE hallucinations / infinite thought loops
        stop = kwargs.pop("stop", ["<turn|>", "<|channel|>", "<eos>", "(Note:", "Note:"])
        max_tokens = kwargs.pop("max_tokens", 2048)
        
        # Prepare messages
        if image_path:
            import base64
            with open(image_path, "rb") as f:
                img_base64 = base64.b64encode(f.read()).decode("utf-8")
            
            user_content = [
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_base64}"}},
                {"type": "text", "text": prompt}
            ]
        else:
            user_content = prompt

        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content}
        ]

        # Handle grammar
        if grammar and isinstance(grammar, str):
            try:
                grammar = LlamaGrammar.from_string(grammar)
            except Exception as ge:
                print(f"DEBUG: Failed to parse grammar string: {ge}")
                grammar = None

        # Execute
        response = self.model.create_chat_completion(
            messages=messages,
            stop=stop,
            max_tokens=max_tokens,
            grammar=grammar,
            **kwargs
        )
        
        content = response["choices"][0]["message"]["content"]
        
        # --- GEMMA 4 CLEANUP ---
        # Handle cases where model starts with thinking artifact even if suppressed
        if "<channel|>" in content:
            content = content.split("<channel|>")[-1]
        
        content = content.replace("<|channel>thought", "")
        content = content.replace("<|channel|>", "")
        
        # Strip common preambles ( Conversational fluff)
        lines = content.split("\n")
        if lines:
            first_line = lines[0].lower()
            preamble_keywords = ["based on", "here is", "certainly", "the image", "provided", "transcribed", "sure", "transcription:"]
            # If the first line is short and contains preamble keywords, skip it and any following empty lines
            if len(lines[0]) < 120 and any(kw in first_line for kw in preamble_keywords):
                # Look for the first non-empty line after the preamble
                idx = 1
                while idx < len(lines) and not lines[idx].strip():
                    idx += 1
                content = "\n".join(lines[idx:])

        # Clean up duplicated headers if the model repeats the prompt ending
        if content.startswith("#### SESSION FOCUS: #### SESSION FOCUS:"):
            content = content.replace("#### SESSION FOCUS: #### SESSION FOCUS:", "#### SESSION FOCUS:", 1)
        elif content.startswith("SESSION FOCUS: SESSION FOCUS:"):
             content = content.replace("SESSION FOCUS: SESSION FOCUS:", "SESSION FOCUS:", 1)

        # Strip redundant session summaries or intro lines
        redundant_headers = [
            "### Session Summary:",
            "**Session Summary:**",
            "**Session Focal Point**",
            "Session Summary:",
            "Session Focal Point:"
        ]
        for rh in redundant_headers:
            if content.startswith(rh):
                content = content.replace(rh, "", 1).strip()
        
        # Remove empty headers or leftovers
        if content.startswith("###") and len(content.split("\n")[0]) < 30:
             content = "\n".join(content.split("\n")[1:]).strip()

        content = content.strip()
        
        return content

    def embed(self, text: str):
        """Generate embeddings."""
        if self.model is None:
            self.load_model()
            if self.model is None:
                return None
        return self.model.create_embedding(text)

llm_manager = LLMManager()
