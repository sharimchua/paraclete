from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Any, Optional
import os
import yaml

@dataclass
class LLMConfig:
    endpoint: str = "http://localhost:11434/v1"
    api_key: str = "ollama"
    model: str = "gemma2:9b"
    temperature: float = 0.2
    timeout_seconds: int = 60
    max_context_tokens: int = 8192
    max_history_sessions: int = 8
    compact_chars_per_session: int = 1200
    reasoning_effort: Optional[str] = None       # e.g., "none", "low", "medium", "high"
    max_reasoning_tokens: Optional[int] = None   # Token budget for thinking/reasoning (e.g. 0, 1024, 4096)
    max_tokens: Optional[int] = None             # Max generation/completion tokens
    extra_body: Optional[Dict[str, Any]] = None  # Custom pass-through parameters for proxy/backends


@dataclass
class PathConfig:
    input_dir: str = "input"
    okf_dir: str = "okf"
    output_dir: str = "output"
    templates_dir: str = "templates"
    state_dir: str = ".paraclete"
    cache_file: str = ".paraclete/cache.json"

@dataclass
class ProcessingConfig:
    conflict_strategy: str = "warn" # warn | overwrite | merge | skip
    auto_generate_output: bool = True
    extraction_mode: str = "agentic" # agentic (tool-calling loop) | legacy (single-shot markdown)
    tool_max_rounds: int = 25        # Max LLM round-trips in the agentic tool loop

@dataclass
class AppConfig:
    project_root: Path = field(default_factory=lambda: Path.cwd())
    vault_root: Path = field(default_factory=lambda: Path.cwd())
    paths: PathConfig = field(default_factory=PathConfig)
    llm: LLMConfig = field(default_factory=LLMConfig)
    processing: ProcessingConfig = field(default_factory=ProcessingConfig)

    @classmethod
    def load(cls, root_dir: Optional[Path] = None, config_override: Optional[Path] = None) -> "AppConfig":
        cwd = Path.cwd()
        
        # 1. Determine Project Root & Vault Root
        if root_dir:
            project_root = root_dir.resolve()
        else:
            project_root = cwd.resolve()

        if (project_root / "vault" / "okf").exists() or (project_root / "vault" / ".obsidian").exists():
            vault_root = project_root / "vault"
        elif (project_root / "okf").exists():
            vault_root = project_root
        else:
            vault_root = project_root / "vault" if (project_root / "vault").exists() else project_root

        # 2. Locate configuration file
        candidate_configs = [
            config_override,
            Path(os.environ.get("PARACLETE_CONFIG", "")) if os.environ.get("PARACLETE_CONFIG") else None,
            project_root / "config.yaml",
            vault_root / ".paraclete" / "config.yaml",
            project_root / ".paraclete" / "config.yaml",
            vault_root / "config.yaml",
            Path.home() / ".paraclete" / "config.yaml"
        ]

        config_file = None
        for candidate in candidate_configs:
            if candidate and candidate.exists() and candidate.is_file():
                config_file = candidate
                break

        data = {}
        if config_file:
            try:
                with open(config_file, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f) or {}
            except Exception:
                data = {}

        llm_data = data.get("llm", {})
        paths_data = data.get("paths", {})
        proc_data = data.get("processing", {})

        # Custom vault root if specified in config
        if "vault_dir" in paths_data:
            vault_root = (project_root / paths_data["vault_dir"]).resolve()

        state_dir_name = paths_data.get("state_dir", ".paraclete")
        cache_file_rel = paths_data.get("cache_file", f"{state_dir_name}/cache.json")

        # Reasoning & token limits
        reasoning_effort_raw = os.getenv("PARACLETE_LLM_REASONING_EFFORT")
        if reasoning_effort_raw is None:
            reasoning_effort_raw = llm_data.get("reasoning_effort")

        reasoning_effort: Optional[str] = None
        if reasoning_effort_raw is not None:
            if isinstance(reasoning_effort_raw, bool):
                reasoning_effort = "on" if reasoning_effort_raw else "off"
            else:
                reasoning_effort = str(reasoning_effort_raw).strip()


        max_reasoning_env = os.getenv("PARACLETE_LLM_MAX_REASONING_TOKENS")
        if max_reasoning_env is not None and max_reasoning_env.strip() != "":
            max_reasoning_tokens = int(max_reasoning_env)
        elif "max_reasoning_tokens" in llm_data and llm_data["max_reasoning_tokens"] is not None:
            max_reasoning_tokens = int(llm_data["max_reasoning_tokens"])
        elif "reasoning_budget" in llm_data and llm_data["reasoning_budget"] is not None:
            max_reasoning_tokens = int(llm_data["reasoning_budget"])
        else:
            max_reasoning_tokens = None

        max_tokens_env = os.getenv("PARACLETE_LLM_MAX_TOKENS")
        if max_tokens_env is not None and max_tokens_env.strip() != "":
            max_tokens = int(max_tokens_env)
        elif "max_tokens" in llm_data and llm_data["max_tokens"] is not None:
            max_tokens = int(llm_data["max_tokens"])
        elif "max_completion_tokens" in llm_data and llm_data["max_completion_tokens"] is not None:
            max_tokens = int(llm_data["max_completion_tokens"])
        else:
            max_tokens = None

        extra_body = llm_data.get("extra_body")

        return cls(
            project_root=project_root,
            vault_root=vault_root,
            paths=PathConfig(
                input_dir=paths_data.get("input_dir", "input"),
                okf_dir=paths_data.get("okf_dir", "okf"),
                output_dir=paths_data.get("output_dir", "output"),
                templates_dir=paths_data.get("templates_dir", "templates"),
                state_dir=state_dir_name,
                cache_file=cache_file_rel,
            ),
            llm=LLMConfig(
                endpoint=os.getenv("PARACLETE_LLM_ENDPOINT", llm_data.get("endpoint", "http://localhost:11434/v1")),
                api_key=os.getenv("PARACLETE_LLM_API_KEY", llm_data.get("api_key", "ollama")),
                model=os.getenv("PARACLETE_LLM_MODEL", llm_data.get("model", "gemma2:9b")),
                temperature=float(llm_data.get("temperature", 0.2)),
                timeout_seconds=int(llm_data.get("timeout_seconds", 60)),
                max_context_tokens=int(llm_data.get("max_context_tokens", 8192)),
                max_history_sessions=int(llm_data.get("max_history_sessions", 8)),
                compact_chars_per_session=int(llm_data.get("compact_chars_per_session", 1200)),
                reasoning_effort=str(reasoning_effort) if reasoning_effort is not None else None,
                max_reasoning_tokens=max_reasoning_tokens,
                max_tokens=max_tokens,
                extra_body=extra_body if isinstance(extra_body, dict) else None,
            ),
            processing=ProcessingConfig(
                conflict_strategy=proc_data.get("conflict_strategy", "warn"),
                auto_generate_output=bool(proc_data.get("auto_generate_output", True)),
                extraction_mode=str(proc_data.get("extraction_mode", "legacy")).strip().lower(),
                tool_max_rounds=int(proc_data.get("tool_max_rounds", 15)),
            )
        )

    def get_path(self, rel_path: str) -> Path:
        """Resolve path relative to vault root."""
        return self.vault_root / rel_path

    def get_cache_path(self) -> Path:
        """Resolve path to the engine cache file in the vault state directory."""
        vault_cache = self.vault_root / self.paths.cache_file
        if not vault_cache.exists() and (self.project_root / self.paths.cache_file).exists():
            return self.project_root / self.paths.cache_file
        return vault_cache
