import json
import re
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional, Callable
from .config import LLMConfig

class ToolCallError(RuntimeError):
    """Raised when the tool-calling loop fails (max rounds exceeded, repeated errors, etc.)."""
    pass

class LLMClient:
    def __init__(self, config: LLMConfig):
        self.config = config

    def chat_completion(
        self,
        messages: List[Dict[str, str]],
        temperature: Optional[float] = None,
        json_mode: bool = False
    ) -> str:
        """Call OpenAI-compatible or local LLM chat completions endpoint."""
        temp = temperature if temperature is not None else self.config.temperature
        
        endpoint = self.config.endpoint.rstrip("/")
        if not endpoint.endswith("/chat/completions") and not endpoint.endswith("/api/chat"):
            url = f"{endpoint}/chat/completions"
        else:
            url = endpoint

        payload: Dict[str, Any] = {
            "model": self.config.model,
            "messages": messages,
            "temperature": temp,
            "stream": False,
        }

        options: Dict[str, Any] = {}
        if getattr(self.config, "max_context_tokens", None):
            options["num_ctx"] = self.config.max_context_tokens

        # Generation/completion token limit
        if getattr(self.config, "max_tokens", None) is not None:
            payload["max_tokens"] = self.config.max_tokens
            payload["max_completion_tokens"] = self.config.max_tokens
            options["num_predict"] = self.config.max_tokens

        # Reasoning effort (LM Studio, OpenAI o1/o3, LiteLLM, vLLM, OpenRouter)
        if getattr(self.config, "reasoning_effort", None) is not None:
            effort = str(self.config.reasoning_effort).strip()
            payload["reasoning_effort"] = effort
            options["reasoning_effort"] = effort
            if effort.lower() in ("off", "none", "false", "0"):
                options["thinking"] = False
            elif effort.lower() in ("on", "true", "1"):
                options["thinking"] = True

        # Max reasoning / thinking token budget (Claude 3.7, OpenRouter, Gemini proxy, Ollama)
        if getattr(self.config, "max_reasoning_tokens", None) is not None:
            budget = self.config.max_reasoning_tokens
            payload["max_reasoning_tokens"] = budget
            if budget > 0:
                payload["thinking"] = {"type": "enabled", "budget_tokens": budget}
                payload["reasoning"] = {"max_tokens": budget}
                options["thinking"] = True
            else:
                payload["thinking"] = {"type": "disabled"}
                payload["reasoning"] = {"max_tokens": 0}
                options["thinking"] = False

        if options:
            payload["options"] = options

        # Custom pass-through payload overrides
        if getattr(self.config, "extra_body", None) and isinstance(self.config.extra_body, dict):
            payload.update(self.config.extra_body)

        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        data_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data_bytes, method="POST")
        req.add_header("Content-Type", "application/json")
        if self.config.api_key:
            req.add_header("Authorization", f"Bearer {self.config.api_key}")

        try:
            with urllib.request.urlopen(req, timeout=self.config.timeout_seconds) as response:
                raw_body = response.read().decode("utf-8")
                resp_data = json.loads(raw_body)
                
                # Check for error in payload
                if "error" in resp_data:
                    err_msg = resp_data["error"]
                    if isinstance(err_msg, dict):
                        err_msg = err_msg.get("message", str(err_msg))
                    raise RuntimeError(f"LLM API returned error: {err_msg}")

                # 1. Standard OpenAI format: choices[0].message.content
                choices = resp_data.get("choices", [])
                if choices and isinstance(choices, list) and len(choices) > 0:
                    choice = choices[0]
                    if "message" in choice and isinstance(choice["message"], dict):
                        content = choice["message"].get("content")
                        if content is not None and str(content).strip():
                            return str(content).strip()
                        # Fallback for models outputting purely in reasoning_content
                        reasoning = choice["message"].get("reasoning_content") or choice["message"].get("reasoning")
                        if reasoning is not None and str(reasoning).strip():
                            return str(reasoning).strip()
                    elif "text" in choice:
                        content = choice.get("text")
                        if content is not None and str(content).strip():
                            return str(content).strip()

                # 2. Ollama /api/chat response: message.content
                if "message" in resp_data and isinstance(resp_data["message"], dict):
                    content = resp_data["message"].get("content")
                    if content is not None and str(content).strip():
                        return str(content).strip()

                # 3. Ollama /api/generate response: response
                if "response" in resp_data:
                    content = resp_data.get("response")
                    if content is not None and str(content).strip():
                        return str(content).strip()

                raise RuntimeError(
                    f"LLM endpoint at {url} returned HTTP 200, but no message content was found.\n"
                    f"Payload received: {resp_data}"
                )
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"LLM API HTTP Error ({e.code}): {err_body}") from e
        except urllib.error.URLError as e:
            raise RuntimeError(f"Could not connect to LLM at {url}: {e.reason}") from e
        except json.JSONDecodeError as e:
            raise RuntimeError(f"LLM returned invalid non-JSON response from {url}: {e}") from e

    def _build_payload(
        self,
        messages: List[Dict[str, Any]],
        temperature: Optional[float] = None,
        tools: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Build the request payload shared by chat_completion and the tool loop."""
        temp = temperature if temperature is not None else self.config.temperature

        payload: Dict[str, Any] = {
            "model": self.config.model,
            "messages": messages,
            "temperature": temp,
            "stream": False,
        }

        options: Dict[str, Any] = {}
        if getattr(self.config, "max_context_tokens", None):
            options["num_ctx"] = self.config.max_context_tokens

        # Generation/completion token limit
        if getattr(self.config, "max_tokens", None) is not None:
            payload["max_tokens"] = self.config.max_tokens
            payload["max_completion_tokens"] = self.config.max_tokens
            options["num_predict"] = self.config.max_tokens

        # Reasoning effort (LM Studio, OpenAI o1/o3, LiteLLM, vLLM, OpenRouter)
        if getattr(self.config, "reasoning_effort", None) is not None:
            effort = str(self.config.reasoning_effort).strip()
            payload["reasoning_effort"] = effort
            options["reasoning_effort"] = effort
            if effort.lower() in ("off", "none", "false", "0"):
                options["thinking"] = False
            elif effort.lower() in ("on", "true", "1"):
                options["thinking"] = True

        # Max reasoning / thinking token budget (Claude 3.7, OpenRouter, Gemini proxy, Ollama)
        if getattr(self.config, "max_reasoning_tokens", None) is not None:
            budget = self.config.max_reasoning_tokens
            payload["max_reasoning_tokens"] = budget
            if budget > 0:
                payload["thinking"] = {"type": "enabled", "budget_tokens": budget}
                payload["reasoning"] = {"max_tokens": budget}
                options["thinking"] = True
            else:
                payload["thinking"] = {"type": "disabled"}
                payload["reasoning"] = {"max_tokens": 0}
                options["thinking"] = False

        if options:
            payload["options"] = options

        # Custom pass-through payload overrides
        if getattr(self.config, "extra_body", None) and isinstance(self.config.extra_body, dict):
            payload.update(self.config.extra_body)

        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        return payload

    def _post_chat(self, url: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """POST a chat-completions payload and return the parsed JSON response."""
        data_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data_bytes, method="POST")
        req.add_header("Content-Type", "application/json")
        if self.config.api_key:
            req.add_header("Authorization", f"Bearer {self.config.api_key}")

        try:
            with urllib.request.urlopen(req, timeout=self.config.timeout_seconds) as response:
                raw_body = response.read().decode("utf-8")
                return json.loads(raw_body)
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"LLM API HTTP Error ({e.code}): {err_body}") from e
        except urllib.error.URLError as e:
            raise RuntimeError(f"Could not connect to LLM at {url}: {e.reason}") from e
        except json.JSONDecodeError as e:
            raise RuntimeError(f"LLM returned invalid non-JSON response from {url}: {e}") from e

    def _resolve_url(self) -> str:
        endpoint = self.config.endpoint.rstrip("/")
        if not endpoint.endswith("/chat/completions") and not endpoint.endswith("/api/chat"):
            return f"{endpoint}/chat/completions"
        return endpoint

    @staticmethod
    def _extract_content(resp_data: Dict[str, Any]) -> str:
        """Extract text content from a chat-completions response (all known formats)."""
        # Check for error in payload
        if "error" in resp_data:
            err_msg = resp_data["error"]
            if isinstance(err_msg, dict):
                err_msg = err_msg.get("message", str(err_msg))
            raise RuntimeError(f"LLM API returned error: {err_msg}")

        # 1. Standard OpenAI format: choices[0].message.content
        choices = resp_data.get("choices", [])
        if choices and isinstance(choices, list) and len(choices) > 0:
            choice = choices[0]
            if "message" in choice and isinstance(choice["message"], dict):
                content = choice["message"].get("content")
                if content is not None and str(content).strip():
                    return str(content).strip()
                # Fallback for models outputting purely in reasoning_content
                reasoning = choice["message"].get("reasoning_content") or choice["message"].get("reasoning")
                if reasoning is not None and str(reasoning).strip():
                    return str(reasoning).strip()
            elif "text" in choice:
                content = choice.get("text")
                if content is not None and str(content).strip():
                    return str(content).strip()

        # 2. Ollama /api/chat response: message.content
        if "message" in resp_data and isinstance(resp_data["message"], dict):
            content = resp_data["message"].get("content")
            if content is not None and str(content).strip():
                return str(content).strip()

        # 3. Ollama /api/generate response: response
        if "response" in resp_data:
            content = resp_data.get("response")
            if content is not None and str(content).strip():
                return str(content).strip()

        raise RuntimeError(
            f"LLM endpoint returned HTTP 200, but no message content was found.\n"
            f"Payload received: {resp_data}"
        )

    def chat_completion(
        self,
        messages: List[Dict[str, str]],
        temperature: Optional[float] = None,
        json_mode: bool = False
    ) -> str:
        """Call OpenAI-compatible or local LLM chat completions endpoint."""
        payload = self._build_payload(messages, temperature=temperature)
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        resp_data = self._post_chat(self._resolve_url(), payload)
        return self._extract_content(resp_data)

    def chat_completion_with_tools(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
        tool_dispatch: Dict[str, Callable],
        max_rounds: int = 15,
        temperature: Optional[float] = None,
    ) -> str:
        """Run an OpenAI-compatible tool-calling loop.

        Sends *messages* + *tools* to the LLM. If the response contains
        ``tool_calls``, each is dispatched through *tool_dispatch* (a mapping of
        tool name -> callable accepting ``(arguments, **kwargs)``), and the result
        is appended as a ``role: "tool"`` message before re-querying. The loop ends
        when the model returns a final text response with no tool calls, or when
        *max_rounds* is exceeded.

        Returns the final assistant text content.

        If the endpoint rejects tool calling (HTTP error mentioning tools/functions),
        falls back to a plain chat completion without tools so agentic mode degrades
        gracefully on endpoints that do not support function calling.
        """
        url = self._resolve_url()
        seen_errors: Dict[str, int] = {}  # track repeated identical errors per call id

        for round_num in range(1, max_rounds + 1):
            print(f"       -> [AGENTIC] Tool-calling round {round_num}/{max_rounds}...")
            payload = self._build_payload(messages, temperature=temperature, tools=tools)
            try:
                resp_data = self._post_chat(url, payload)
            except RuntimeError as exc:
                text = str(exc).lower()
                if round_num == 1 and ("tool" in text or "function" in text):
                    # Endpoint does not support tool calling; degrade to plain completion.
                    print("       -> [WARN] LLM endpoint rejected tools; falling back to plain chat completion.")
                    return self.chat_completion(messages, temperature=temperature)
                raise

            choices = resp_data.get("choices", [])
            if not choices or not isinstance(choices, list):
                # Ollama /api/chat format
                msg = resp_data.get("message")
                if isinstance(msg, dict):
                    content = msg.get("content")
                    tool_calls = msg.get("tool_calls")
                else:
                    raise RuntimeError(f"No choices or message in response (round {round_num}).")
            else:
                choice = choices[0]
                msg = choice.get("message", {})
                content = msg.get("content")
                if content is None or not str(content).strip():
                    reasoning = msg.get("reasoning_content") or msg.get("reasoning")
                    if reasoning is not None and str(reasoning).strip():
                        content = str(reasoning).strip()
                tool_calls = msg.get("tool_calls")

            # No tool calls -> final answer
            if not tool_calls or not isinstance(tool_calls, list) or len(tool_calls) == 0:
                if content is None or not str(content).strip():
                    raise ToolCallError(
                        f"Model returned empty final response at round {round_num}."
                    )
                return str(content).strip()

            def _serialize_args(raw: Any) -> str:
                if isinstance(raw, str):
                    return raw
                if isinstance(raw, dict):
                    return json.dumps(raw, ensure_ascii=False)
                return "{}"

            # Append the assistant message (with tool_calls) to history
            messages.append({
                "role": "assistant",
                "content": content or "",
                "tool_calls": [
                    {
                        "id": tc.get("id", f"call_{round_num}_{i}"),
                        "type": "function",
                        "function": {
                            "name": tc["function"]["name"],
                            "arguments": _serialize_args(tc["function"].get("arguments", "{}")),
                        },
                    }
                    for i, tc in enumerate(tool_calls)
                ],
            })

            # Execute each tool call and append results
            for i, tc in enumerate(tool_calls):
                fn_name = tc["function"]["name"]
                raw_args = tc["function"].get("arguments", "{}")
                if isinstance(raw_args, str):
                    try:
                        args_dict = json.loads(raw_args) if raw_args.strip() else {}
                    except json.JSONDecodeError:
                        args_dict = {"_raw": raw_args}
                elif isinstance(raw_args, dict):
                    args_dict = raw_args
                else:
                    args_dict = {}

                call_id = tc.get("id", f"call_{round_num}_{i}")
                print(f"       -> [TOOL] {fn_name}({json.dumps(args_dict, ensure_ascii=False)[:200]})")
                fn = tool_dispatch.get(fn_name)
                if fn is None:
                    result: Any = {"error": f"Unknown tool '{fn_name}'."}
                else:
                    try:
                        # Dispatch callables are pre-bound (see tools.build_tool_dispatch);
                        # they accept a single arguments dict.
                        result = fn(args_dict)
                    except Exception as exc:
                        result = {"error": f"Tool '{fn_name}' raised: {exc}"}

                # Detect repeated identical errors to avoid infinite loops
                err_key = f"{fn_name}:{json.dumps(result, sort_keys=True, default=str)[:200]}"
                if isinstance(result, dict) and "error" in result:
                    seen_errors[err_key] = seen_errors.get(err_key, 0) + 1
                    if seen_errors[err_key] >= 3:
                        messages.append({
                            "role": "tool",
                            "tool_call_id": call_id,
                            "content": json.dumps(
                                {"error": f"Repeated failure of '{fn_name}'. Stop retrying and produce your final summary."},
                                default=str,
                            ),
                        })
                        continue

                messages.append({
                    "role": "tool",
                    "tool_call_id": call_id,
                    "content": json.dumps(result, ensure_ascii=False, default=str),
                })

        # If max_rounds was reached with active tool execution, query the model one final time without tools for summary
        if len(messages) > 0 and messages[-1].get("role") == "tool":
            print(f"       -> [AGENTIC] Reached max rounds ({max_rounds}); soliciting final summary...")
            messages.append({
                "role": "user",
                "content": "All tool actions for this session are complete. Please produce your concise final summary now.",
            })
            try:
                final_payload = self._build_payload(messages, temperature=temperature, tools=None)
                resp_data = self._post_chat(url, final_payload)
                return self._extract_content(resp_data)
            except Exception as exc:
                print(f"       -> [WARN] Final summary completion failed: {exc}")
                return f"Extraction tool actions completed successfully across {max_rounds} rounds."

        raise ToolCallError(
            f"Tool-calling loop exceeded {max_rounds} rounds without a final response."
        )

    def extract_json(self, prompt: str, system_prompt: str = "You are a structured knowledge extractor. Respond only with valid JSON.") -> Dict[str, Any]:
        """Convenience method to query the LLM and get parsed JSON."""
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ]
        raw = self.chat_completion(messages, json_mode=True)
        # Strip reasoning thinking tags (<think>...</think>) if present
        clean = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
        if clean.startswith("```json"):
            clean = clean[7:]
        if clean.startswith("```"):
            clean = clean[3:]
        if clean.endswith("```"):
            clean = clean[:-3]
        clean = clean.strip()
        try:
            return json.loads(clean)
        except json.JSONDecodeError:
            # Fallback: find outer json object or array
            match = re.search(r"(\{.*\}|\[.*\])", clean, re.DOTALL)
            if match:
                return json.loads(match.group(1).strip())
            raise

