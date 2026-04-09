import asyncio
import threading
import uuid
from typing import Dict, Any, Optional

class BackgroundTaskManager:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(BackgroundTaskManager, cls).__new__(cls)
            cls._instance.jobs = {}
            cls._instance.interrupt_event = threading.Event()
        return cls._instance

    def add_job(self, job_name: str, job_func, *args, **kwargs):
        job_id = str(uuid.uuid4())
        self.jobs[job_id] = {
            "name": job_name,
            "status": "pending",
            "progress": 0,
            "task": asyncio.create_task(self._run_job(job_id, job_func, *args, **kwargs))
        }
        return job_id

    async def _run_job(self, job_id: str, job_func, *args, **kwargs):
        self.jobs[job_id]["status"] = "running"
        try:
            # Pass the interrupt event to the job if requested
            if "interrupt_event" in kwargs:
                 kwargs["interrupt_event"] = self.interrupt_event
            
            await job_func(*args, **kwargs)
            self.jobs[job_id]["status"] = "completed"
            self.jobs[job_id]["progress"] = 100
        except asyncio.CancelledError:
            self.jobs[job_id]["status"] = "cancelled"
        except Exception as e:
            self.jobs[job_id]["status"] = "error"
            self.jobs[job_id]["error"] = str(e)
            print(f"DEBUG: Error in background job {job_id}: {e}")

    def interrupt(self):
        """Signals background jobs to yield hardware resources."""
        self.interrupt_event.set()

    def resume(self):
        """Signals background jobs that hardware resources are available."""
        self.interrupt_event.clear()

    def get_job_status(self, job_id: str):
        return self.jobs.get(job_id)

    def list_jobs(self):
        return [
            {"id": tid, "name": j["name"], "status": j["status"], "progress": j["progress"]}
            for tid, j in self.jobs.items()
        ]

background_manager = BackgroundTaskManager()
