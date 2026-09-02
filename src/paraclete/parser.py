import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, List
import yaml

@dataclass
class OKFDocument:
    metadata: Dict[str, Any] = field(default_factory=dict)
    content: str = ""
    path: Optional[Path] = None

    @property
    def doc_type(self) -> str:
        return self.metadata.get("type", "unknown")

    @property
    def title(self) -> str:
        return self.metadata.get("title", "")

    def get_links(self) -> list[str]:
        """Extract all [[wikilinks]] from both metadata values and markdown content."""
        links = set()
        
        def find_in_obj(obj):
            if isinstance(obj, str):
                for match in re.findall(r"\[\[(.*?)\]\]", obj):
                    target = match.split("|")[0].strip()
                    if target:
                        links.add(target)
            elif isinstance(obj, list):
                for item in obj:
                    find_in_obj(item)
            elif isinstance(obj, dict):
                for v in obj.values():
                    find_in_obj(v)

        find_in_obj(self.metadata)

        for match in re.findall(r"\[\[(.*?)\]\]", self.content):
            target = match.split("|")[0].strip()
            if target:
                links.add(target)

        return sorted(list(links))

    def dumps(self) -> str:
        """Serialize OKFDocument to YAML frontmatter + markdown string."""
        if not self.metadata:
            return self.content.strip() + "\n"
        
        yaml_str = yaml.dump(
            self.metadata,
            sort_keys=False,
            allow_unicode=True,
            default_flow_style=False
        ).strip()
        
        body = self.content.strip()
        if body:
            return f"---\n{yaml_str}\n---\n\n{body}\n"
        else:
            return f"---\n{yaml_str}\n---\n"


class MarkdownParser:
    FRONTMATTER_REGEX = re.compile(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", re.DOTALL)

    @classmethod
    def clean_markdown_fences(cls, text: str) -> str:
        """Strip reasoning tags (<think>...</think>) and surrounding markdown code blocks (```markdown ... ```)."""
        clean = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
        # Strip opening ```markdown or ``` and closing ``` if it wraps the entire text/chunk
        fence_match = re.match(r"^```(?:markdown|md|ya?ml)?\s*\n(.*?)\n```\s*$", clean, re.DOTALL | re.IGNORECASE)
        if fence_match:
            clean = fence_match.group(1).strip()
        return clean

    @classmethod
    def parse_text(cls, text: str, path: Optional[Path] = None) -> OKFDocument:
        clean_text = cls.clean_markdown_fences(text)
        match = cls.FRONTMATTER_REGEX.match(clean_text)
        if match:
            raw_yaml, body = match.groups()
            try:
                metadata = yaml.safe_load(raw_yaml) or {}
                if not isinstance(metadata, dict):
                    metadata = {}
            except Exception:
                metadata = {}
            
            clean_body = cls.clean_markdown_fences(body.strip())
            return OKFDocument(metadata=metadata, content=clean_body, path=path)
        else:
            return OKFDocument(metadata={}, content=clean_text, path=path)

    @classmethod
    def parse_multi_docs(cls, text: str, path: Optional[Path] = None) -> List[OKFDocument]:
        """Parse text that may contain one or multiple OKF markdown documents."""
        clean_text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
        if not clean_text:
            return []

        # 1. Split by explicit document delimiter
        if "=== DOCUMENT BREAK ===" in clean_text:
            chunks = clean_text.split("=== DOCUMENT BREAK ===")
            docs = []
            for c in chunks:
                cleaned_c = cls.clean_markdown_fences(c.strip())
                if cleaned_c:
                    docs.append(cls.parse_text(cleaned_c, path=path))
            if docs:
                return docs

        # 2. Check if multiple markdown code blocks were generated (e.g. ```markdown ... ```)
        fenced_blocks = re.findall(r"```(?:markdown|md|ya?ml)?\s*\n(.*?)\n```", clean_text, re.DOTALL | re.IGNORECASE)
        if len(fenced_blocks) > 1:
            valid_docs = []
            for block in fenced_blocks:
                doc = cls.parse_text(block.strip(), path=path)
                if doc.metadata and doc.metadata.get("type"):
                    valid_docs.append(doc)
            if len(valid_docs) > 1:
                return valid_docs

        # 3. Split by multiple frontmatter blocks (--- ... ---)
        pattern = re.compile(r"(?:^|\n)(?=---\s*\n[a-zA-Z0-9_-]+:)")
        chunks = pattern.split(cls.clean_markdown_fences(clean_text))
        valid_docs = []
        for c in chunks:
            c_clean = cls.clean_markdown_fences(c.strip())
            if c_clean and c_clean.startswith("---"):
                doc = cls.parse_text(c_clean, path=path)
                if doc.metadata and doc.metadata.get("type"):
                    valid_docs.append(doc)
        
        if len(valid_docs) > 1:
            return valid_docs

        # 4. Default single document
        return [cls.parse_text(clean_text, path=path)]

    @classmethod
    def parse_file(cls, path: Path) -> OKFDocument:
        if not path.exists():
            raise FileNotFoundError(f"File not found: {path}")
        text = path.read_text(encoding="utf-8")
        return cls.parse_text(text, path=path)

    @classmethod
    def write_file(cls, doc: OKFDocument, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(doc.dumps(), encoding="utf-8")
