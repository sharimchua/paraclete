import hashlib
import json
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

@dataclass
class CacheEntry:
    input_path: str
    input_hash: str
    last_processed: str
    okf_path: Optional[str] = None
    last_generated_okf_hash: Optional[str] = None
    okf_paths: List[str] = field(default_factory=list)
    okf_hashes: Dict[str, str] = field(default_factory=dict)

class Indexer:
    def __init__(self, cache_file_path: Path, vault_root: Path):
        self.cache_file = cache_file_path
        self.vault_root = vault_root
        self.entries: Dict[str, CacheEntry] = {}
        self.load()

    @staticmethod
    def compute_file_hash(path: Path) -> str:
        """Compute SHA-256 hash of a file's normalized content."""
        if not path.exists() or path.is_dir():
            return ""
        content = path.read_bytes()
        # Normalize CRLF to LF to avoid OS-dependent hash mismatch
        normalized = content.replace(b"\r\n", b"\n")
        return hashlib.sha256(normalized).hexdigest()

    def load(self) -> None:
        """Load cache from disk."""
        if not self.cache_file.exists():
            self.entries = {}
            return
        
        try:
            with open(self.cache_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                raw_entries = data.get("entries", {})
                loaded = {}
                for k, v in raw_entries.items():
                    if "okf_paths" not in v and v.get("okf_path"):
                        v["okf_paths"] = [v["okf_path"]]
                    if "okf_hashes" not in v and v.get("okf_path") and v.get("last_generated_okf_hash"):
                        v["okf_hashes"] = {v["okf_path"]: v["last_generated_okf_hash"]}
                    loaded[k] = CacheEntry(**v)
                self.entries = loaded
        except Exception:
            self.entries = {}

    def save(self) -> None:
        """Persist cache to disk."""
        self.cache_file.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "version": 1,
            "last_saved": datetime.now(timezone.utc).isoformat(),
            "entries": {k: asdict(v) for k, v in self.entries.items()}
        }
        with open(self.cache_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def scan_inputs(self, input_dir: Path) -> List[Path]:
        """Find all user-managed markdown files in the input directory."""
        if not input_dir.exists():
            return []
        
        files = []
        for p in input_dir.rglob("*.md"):
            if p.is_file() and p.name != "AGENTS.md":
                files.append(p)
        return sorted(files)

    def get_file_status(self, input_path: Path) -> Tuple[str, Optional[CacheEntry]]:
        """
        Returns status of an input file:
        - 'NEW': File is not in cache
        - 'MODIFIED': Input file content changed since last processing
        - 'UNCHANGED': Input file content matches cache
        """
        rel_path = str(input_path.relative_to(self.vault_root)).replace("\\", "/")
        current_hash = self.compute_file_hash(input_path)

        entry = self.entries.get(rel_path)
        if not entry:
            return "NEW", None
        
        if entry.input_hash != current_hash:
            return "MODIFIED", entry
        
        return "UNCHANGED", entry

    def check_okf_conflict(self, entry: CacheEntry) -> bool:
        """
        Returns True if any target OKF file exists and was modified since last generation.
        """
        if not entry:
            return False
        
        paths_to_check = entry.okf_paths if entry.okf_paths else ([entry.okf_path] if entry.okf_path else [])
        for rel_p in paths_to_check:
            okf_full_path = self.vault_root / rel_p
            if not okf_full_path.exists():
                continue
            
            curr_hash = self.compute_file_hash(okf_full_path)
            last_hash = entry.okf_hashes.get(rel_p) or entry.last_generated_okf_hash
            if last_hash and curr_hash != last_hash:
                return True
        
        return False

    def update_entry(self, input_path: Path, okf_paths: Optional[List[Path]] = None) -> None:
        """Record or update a processed entry in the cache with all generated OKF paths."""
        rel_input = str(input_path.relative_to(self.vault_root)).replace("\\", "/")
        input_hash = self.compute_file_hash(input_path)

        rel_paths = []
        hashes = {}
        if okf_paths:
            for p in okf_paths:
                if p and p.exists():
                    rel_p = str(p.relative_to(self.vault_root)).replace("\\", "/")
                    rel_paths.append(rel_p)
                    hashes[rel_p] = self.compute_file_hash(p)

        self.entries[rel_input] = CacheEntry(
            input_path=rel_input,
            input_hash=input_hash,
            last_processed=datetime.now(timezone.utc).isoformat(),
            okf_path=rel_paths[0] if rel_paths else None,
            last_generated_okf_hash=hashes.get(rel_paths[0]) if rel_paths else None,
            okf_paths=rel_paths,
            okf_hashes=hashes
        )
        self.save()
