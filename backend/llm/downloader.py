import os
import requests
import asyncio
from typing import Callable, Optional


class ModelDownloader:
    def __init__(self, model_urls: dict):
        self.model_urls = model_urls
        self.download_progress = {}  # model_name -> percentage

    async def download_if_missing(
        self,
        model_name: str,
        target_path: str,
        progress_callback: Optional[Callable[[str, int], None]] = None,
    ):
        """
        Downloads a model file if it doesn't exist (Async).
        """
        if (
            os.path.exists(target_path)
            and os.path.getsize(target_path) > 100 * 1024 * 1024
        ):
            return True
        return await asyncio.to_thread(
            self.download_if_missing_sync, model_name, target_path, progress_callback
        )

    def download_if_missing_sync(
        self,
        model_name: str,
        target_path: str,
        progress_callback: Optional[Callable[[str, int], None]] = None,
    ):
        """
        Downloads a model file if it doesn't exist (Sync).
        """
        if (
            os.path.exists(target_path)
            and os.path.getsize(target_path) > 100 * 1024 * 1024
        ):
            return True

        if model_name not in self.model_urls:
            print(f"ERROR: No URL configured for model {model_name}")
            return False

        url = self.model_urls[model_name]
        os.makedirs(os.path.dirname(target_path), exist_ok=True)

        print(f"DEBUG: Starting download for {model_name} from {url}")

        try:
            return self._sync_download(model_name, url, target_path, progress_callback)
        except Exception as e:
            print(f"ERROR: Download failed: {e}")
            if os.path.exists(target_path):
                os.remove(target_path)
            return False

    def _sync_download(
        self,
        model_name: str,
        url: str,
        target_path: str,
        progress_callback: Optional[Callable[[str, int], None]],
    ):
        response = requests.get(url, stream=True)
        response.raise_for_status()

        total_size = int(response.headers.get("content-length", 0))
        downloaded_size = 0

        last_progress = -1

        with open(target_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=1024 * 1024):  # 1MB chunks
                if chunk:
                    f.write(chunk)
                    downloaded_size += len(chunk)

                    if total_size > 0:
                        progress = int((downloaded_size / total_size) * 100)
                        if progress != last_progress:
                            self.download_progress[model_name] = progress
                            last_progress = progress
                            if progress_callback:
                                progress_callback(model_name, progress)

        return True


# Default URLs for Gemma 4 models
# Note: These are simulated URLs based on standard HF patterns for the requested models
DEFAULT_URLS = {
    "gemma-e4b.gguf": "https://huggingface.co/bartowski/gemma-2-9b-it-GGUF/resolve/main/gemma-2-9b-it-Q4_K_M.gguf",
    "gemma-4-moe.gguf": "https://huggingface.co/bartowski/gemma-2-27b-it-GGUF/resolve/main/gemma-2-27b-it-Q4_K_M.gguf",
}

model_downloader = ModelDownloader(DEFAULT_URLS)
