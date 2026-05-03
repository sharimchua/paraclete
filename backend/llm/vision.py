# backend/llm/vision.py
from llama_cpp.llama_chat_format import Llava16ChatHandler


class Gemma4VisionChatHandler(Llava16ChatHandler):
    # CHAT_FORMAT specifically tuned for Gemma 4 26B MoE multimodal instructions
    # This captures the learned best practices for role definitions and message boundaries
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

    def __init__(self, clip_model_path: str, verbose: bool = False):
        super().__init__(clip_model_path=clip_model_path, verbose=verbose)
