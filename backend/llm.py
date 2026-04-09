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
        mmproj_path = os.path.join(os.path.dirname(path), "mmproj-gemma-4.gguf")
        
        if not os.path.exists(path) or os.path.getsize(path) < 1024*1024*1024:
            print(f"DEBUG: Real model weights missing at {path}. (Current file is stub or missing)")
            return
        
        print(f"DEBUG: Loading Gemma 4 26B MoE from {path}...")
        try:
            chat_handler = None
            if os.path.exists(mmproj_path):
                print(f"DEBUG: Found Vision Projector. Initializing Multimodal Handler...")
                try:
                    from llama_cpp.llama_chat_format import Llava16ChatHandler
                    
                    class Gemma4VisionChatHandler(Llava16ChatHandler):
                        CHAT_FORMAT = (
                            "{% for message in messages %}"
                            "{% if message.role == 'system' %}<bos><|turn>system\n{{ message.content }}<turn|>\n{% endif %}"
                            "{% if message.role == 'user' %}"
                            "{% if loop.first %}<bos>{% endif %}"
                            "<|turn>user\n"
                            "{% if message.content is string %}{{ message.content }}{% else %}"
                            "{% for content in message.content %}"
                            "{% if content.type == 'image_url' %}"
                            "{% if content.image_url is string %}{{ content.image_url }}\n{% else %}{{ content.image_url.url }}\n{% endif %}"
                            "{% elif content.type == 'text' %}{{ content.text }}{% endif %}"
                            "{% endfor %}{% endif %}<turn|>\n{% endif %}"
                            "{% if message.role == 'assistant' or message.role == 'model' %}<|turn>model\n{{ message.content }}<turn|>\n{% endif %}"
                            "{% endfor %}"
                            "{% if add_generation_prompt %}<|turn>model\n{% endif %}"
                        )

                    chat_handler = Gemma4VisionChatHandler(clip_model_path=mmproj_path)
                    print("DEBUG: Loaded custom Gemma4VisionChatHandler")
                except Exception as ve:
                    print(f"DEBUG: Could not load vision handler: {ve}")
                    pass
            
            self.model = Llama(
                model_path=path,
                n_ctx=4096,      # Reduced to ensure no paging to RAM on 24GB VRAM
                n_gpu_layers=-1, # Full GPU offload
                verbose=False,    # We know it's working now, turn off noise
                chat_handler=chat_handler,
                n_threads=16
            )
            print(f"DEBUG: Gemma 4 26B MoE loaded successfully.")
        except Exception as e:
            print(f"DEBUG: Failed to load model: {e}")
            self.model = None

    def generate(self, prompt: str, grammar: Optional[str] = None, stream: bool = False, image_path: Optional[str] = None, **kwargs):
        if self.model is None:
            self.load_model()
            if self.model is None:
                return self._mock_generate(prompt)
        
        # If image_path is provided and we have a chat_handler, use chat completions
        if image_path and self.model.chat_handler:
            import base64
            with open(image_path, "rb") as f:
                img_base64 = base64.b64encode(f.read()).decode("utf-8")
            
            # We omit <|think|> to prevent the model from wasting 1000+ tokens on thought reasoning for a simple task
            messages = [
                {"role": "system", "content": "You are an expert data entry assistant. Extract the requested text accurately."},
                {"role": "user", "content": [
                    # Unsloth recommends Image -> Text order for Gemma 4 multimodal
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_base64}"}},
                    {"type": "text", "text": prompt}
                ]}
            ]
            
            response = self.model.create_chat_completion(
                messages=messages,
                stop=["<turn|>", "<|channel|>", "<eos>", "(Note:", "Note:"], # Ensure it stops after thinking/answering and catches trailing hallucinations
                max_tokens=1024,
                **kwargs
            )
            content = response["choices"][0]["message"]["content"]
            # Gemma 4 sometimes emits empty thought channels even when thinking is disabled
            if "<channel|>" in content:
                content = content.split("<channel|>")[-1]
            content = content.replace("<|channel>thought", "").strip()

            print(f"DEBUG: RAW LLM RESPONSE: {content}")
            return {"choices": [{"text": content}]}

        return self.model(
            prompt,
            grammar=grammar,
            stream=stream,
            **kwargs
        )

    def _mock_generate(self, prompt: str):
        # High quality simulation for prototyping
        print(f"DEBUG: Using Mock Generator for prompt: {prompt[:50]}...")
        
        # Simple heuristic response based on template type
        if "clean_note" in prompt or "expert transcription cleaner" in prompt:
            text = "## Session Summary\n- Patient presented with mild anxiety regarding work-life balance.\n- Discussed strategies for boundary setting.\n- Agreed on a follow-up in two weeks.\n\n## Action Items\n- [ ] Send patient the breathing exercise PDF.\n- [ ] Schedule follow-up."
        elif "extract_entities" in prompt or "Extract Tags" in prompt:
            text = json.dumps({
                "tags": [{"key": "Focus", "value": "Anxiety"}, {"key": "Method", "value": "CBT"}],
                "actions": ["Send breathing exercise PDF", "Schedule follow-up"],
                "references": ["Pattern: Boundary Setting", "Resource: Breathing PDF"]
            })
        elif "ocr_capture" in prompt:
            text = "This is a simulated OCR result from the prompt:\n" + prompt.split("IMAGE CONTENT:")[-1].strip()
        else:
            text = "Gemma 4 Mock: Inference successful. (Weight download recommended for real results)."

        return {
            "choices": [{"text": text}],
            "usage": {"total_tokens": len(text.split())}
        }

    def embed(self, text: str):
        if self.model is None:
            self.load_model()
            if self.model is None:
                return None
        return self.model.create_embedding(text)

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
MESSAGE:""",

    "embed_note": "{title} {text}",

    "ocr_capture": """Analyze the provided image content and transcribe any text found.
Use the context of the note to expand on any partially formed thoughts or sentences. Order and compile the text into a coherent note with logical order and formatting.

IMAGE CONTENT:
{text}

TRANSCRIPTION:""",

    "dictation_capture": """Transcribe the following audio content into clear, readable text.
Remove filler words (um, uh, like) but keep the original intent and professional context.

AUDIO CONTENT:
{text}

TRANSCRIPTION:"""
}
