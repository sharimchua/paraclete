# backend/llm/core.py
import os
import sys
import json
import base64
import threading
import asyncio
from llama_cpp import Llama, LlamaGrammar

from typing import Optional, Dict, Any, List
from .downloader import model_downloader

class LLMManager:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(LLMManager, cls).__new__(cls)
            cls._instance.model = None
            cls._instance.model_path = os.getenv("PARACLETE_MODEL_PATH")
            cls._instance.active_config = {}
            cls._instance.settings = {} # User-defined settings from DB
            cls._instance.lock = threading.Lock()
            cls._instance.interrupt_event = threading.Event()
            cls._instance.on_status_change = None
        return cls._instance

    
    def update_config(self, settings: Dict[str, str]):
        """Updates the internal settings registry from the database."""
        self.settings = settings
        print(f"DEBUG: LLM Manager settings updated: {len(settings)} keys.")

    def _get_default_model_path(self, model_type="analysis"):
        executable_dir = os.path.dirname(sys.executable)
        if model_type == "chat":
            return os.path.join(executable_dir, "models", "gemma-e4b.gguf")
        return os.path.join(executable_dir, "models", "gemma-4-moe.gguf")

    def load_model(self, model_path: Optional[str] = None, n_ctx: int = 8192, use_case: str = "analysis"):
        """
        Loads the specified model. If another model is already loaded, 
        it will be replaced to save VRAM.
        """
        with self.lock:
            # Check if already loaded with same config
            if self.model is not None and self.active_config.get("path") == model_path and self.active_config.get("n_ctx") == n_ctx:
                return
            
            # Use default if path not provided
            path = model_path or self.model_path or self._get_default_model_path(use_case)
            
            if not os.path.exists(path) or os.path.getsize(path) < 100 * 1024 * 1024:
                print(f"ERROR: Model weights missing or invalid at {path}.")
                return
            
            # Unload previous model explicitly if it exists
            if self.model is not None:
                print(f"DEBUG: Unloading previous model to free VRAM...")
                del self.model
                self.model = None
                import gc
                gc.collect()
            
            print(f"DEBUG: Loading model from {path} (n_ctx={n_ctx}, use_case={use_case})...")
            try:
                # Vision project check (only for MoE usually)
                mmproj_path = os.path.join(os.path.dirname(path), "mmproj-gemma-4.gguf")
                chat_handler = None
                if "moe" in path.lower() and os.path.exists(mmproj_path):
                    print(f"DEBUG: Found Vision Projector. Initializing Multimodal Handler...")
                    try:
                        from .vision import Gemma4VisionChatHandler
                        chat_handler = Gemma4VisionChatHandler(clip_model_path=mmproj_path)
                    except Exception as ve:
                        print(f"DEBUG: Could not load vision handler: {ve}")
                
                self.model = Llama(
                    model_path=path,
                    n_ctx=n_ctx,      
                    n_gpu_layers=-1, 
                    embedding=True,  
                    verbose=False,    
                    chat_handler=chat_handler,
                    n_threads=16
                )
                self.active_config = {"path": path, "n_ctx": n_ctx, "use_case": use_case}
                print(f"DEBUG: Model loaded successfully.")
                if self.on_status_change:
                    self.on_status_change()
            except Exception as e:
                print(f"DEBUG: Failed to load model: {e}")
                self.model = None


    def ensure_model(self, use_case="analysis"):
        """Ensures the correct model for the given use case is loaded."""
        path_key = f"llm_{use_case}_model"
        ctx_key = f"llm_{use_case}_ctx"
        
        # Determine path
        filename = self.settings.get(path_key) or (
            "gemma-e4b.gguf" if use_case == "chat" else "gemma-4-moe.gguf"
        )
        
        if os.path.isabs(filename):
            path = filename
            actual_filename = os.path.basename(filename)
        else:
            executable_dir = os.path.dirname(sys.executable)
            path = os.path.join(executable_dir, "models", filename)
            actual_filename = filename

        # Trigger download if missing
        if not os.path.exists(path):
            print(f"DEBUG: Required model {actual_filename} missing. Triggering download...")
            # Note: In a real scenario, we'd want to notify the UI via WS here too,
            # but for now we'll do a blocking sync download in a thread to ensure it's ready.
            success = model_downloader.download_if_missing_sync(actual_filename, path)
            if not success:
                raise RuntimeError(f"Missing model file and download failed: {path}")

        # Determine context size
        default_ctx = 32768 if use_case == "chat" else 8192
        try:
            n_ctx = int(self.settings.get(ctx_key) or default_ctx)
        except:
            n_ctx = default_ctx
        
        self.load_model(model_path=path, n_ctx=n_ctx, use_case=use_case)

    def get_status(self):
        """Returns the current status of the LLM Manager."""
        return {
            "is_ready": self.model is not None,
            "active_use_case": self.active_config.get("use_case", "none"),
            "model_path": self.active_config.get("path", "none"),
            "n_ctx": self.active_config.get("n_ctx", 0),
            "model_name": os.path.basename(self.active_config.get("path", "")) if self.active_config.get("path") else "None"
        }

    async def agenerate(self, *args, **kwargs):
        """Asynchronous low-level generation call."""
        return await asyncio.to_thread(self.generate, *args, **kwargs)

    def generate(self, prompt: str, grammar: Optional[Any] = None, stream: bool = False, use_case="analysis", **kwargs):
        """Low-level generation call."""
        self.ensure_model(use_case)
        if self.model is None:
            raise RuntimeError("LLM Model not loaded.")
        
        # Handle grammar if it's a string (convert to LlamaGrammar)
        if grammar and isinstance(grammar, str):
            try:
                grammar = LlamaGrammar.from_string(grammar)
            except Exception as ge:
                print(f"DEBUG: Failed to parse grammar string: {ge}")
                grammar = None

        with self.lock:
            return self.model(
                prompt,
                grammar=grammar,
                stream=stream,
                **kwargs
            )

    def _process_messages(self, messages: List[Dict[str, Any]]):
        """Merges system messages into the user role for compatibility with models like Gemma."""
        new_messages = []
        system_content = ""
        
        for msg in messages:
            if msg["role"] == "system":
                system_content += str(msg["content"])
            elif msg["role"] == "user":
                if system_content:
                    if isinstance(msg["content"], list):
                        # Handle multimodal content list
                        for part in msg["content"]:
                            if part.get("type") == "text":
                                part["text"] = f"{system_content}\n\n{part['text']}"
                                break
                        else:
                            msg["content"].insert(0, {"type": "text", "text": system_content})
                    else:
                        msg["content"] = f"{system_content}\n\n{msg['content']}"
                    system_content = "" 
                new_messages.append(msg)
            else:
                new_messages.append(msg)
        
        if system_content and not new_messages:
            new_messages.append({"role": "user", "content": system_content})
            
        return new_messages

    async def achat(self, *args, **kwargs):
        """Asynchronous chat completion call."""
        return await asyncio.to_thread(self.chat, *args, **kwargs)

    def chat(self, messages: List[Dict[str, Any]], use_case="analysis", **kwargs):
        """Chat completion call."""
        self.ensure_model(use_case)
        if self.model is None:
            raise RuntimeError("LLM Model not loaded.")
        
        messages = self._process_messages(messages)
        
        return self.model.create_chat_completion(
            messages=messages,
            **kwargs
        )

    async def acall(self, *args, **kwargs):
        """Asynchronous high-level execution call."""
        return await asyncio.to_thread(self.call, *args, **kwargs)

    def call(self, prompt: str, system: str = "You are a helpful assistant.", image_paths: Optional[List[str]] = None, grammar: Optional[Any] = None, use_case="analysis", **kwargs):
        """
        Standardized high-level execution for Gemma 4.
        Handles vision, chat formatting, stop tokens, and artifact cleanup.
        """
        self.ensure_model(use_case)
        if self.model is None:
            raise RuntimeError("LLM Model not loaded.")

        # Default stop tokens to prevent MoE hallucinations / infinite thought loops
        stop = kwargs.pop("stop", ["<turn|>", "<|channel|>", "<eos>", "(Note:", "Note:"])
        max_tokens = kwargs.pop("max_tokens", 2048)
        
        # Prepare messages
        if image_paths:
            user_content = []
            for img_path in image_paths:
                with open(img_path, "rb") as f:
                    img_base64 = base64.b64encode(f.read()).decode("utf-8")
                user_content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_base64}"}})
            
            user_content.append({"type": "text", "text": prompt})
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

        processed_messages = self._process_messages(messages)

        # Execute with thread safety
        with self.lock:
            response = self.model.create_chat_completion(
                messages=processed_messages,
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

    async def aembed(self, *args, **kwargs):
        """Asynchronous embedding generation call."""
        return await asyncio.to_thread(self.embed, *args, **kwargs)

    def embed(self, text: str, use_case="analysis"):
        """Generate embeddings."""
        self.ensure_model(use_case)
        if self.model is None:
            return None
        with self.lock:
            return self.model.create_embedding(text)

    def tokenize(self, text: bytes, use_case="analysis"):
        """Tokenize text using the appropriate model."""
        self.ensure_model(use_case)
        if self.model is None:
            return []
        return self.model.tokenize(text)

    def is_loaded(self) -> bool:
        """Check if model is currently in memory."""
        return self.model is not None


llm_manager = LLMManager()
