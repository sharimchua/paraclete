import asyncio
import threading
import uuid
from typing import Dict, Any, Optional, List
from datetime import datetime

class BackgroundTaskManager:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(BackgroundTaskManager, cls).__new__(cls)
            cls._instance.jobs = {}
            cls._instance.queue = asyncio.Queue()
            cls._instance.worker_task = None
            cls._instance.interrupt_event = threading.Event()
        return cls._instance

    def start_worker(self):
        if self.worker_task is None or self.worker_task.done():
            self.worker_task = asyncio.create_task(self._worker_loop())

    async def _worker_loop(self):
        print("DEBUG: Background Worker Loop Started.")
        while True:
            job_id, job_func, args, kwargs = await self.queue.get()
            
            # Check if we should wait due to interrupt
            while self.interrupt_event.is_set():
                print(f"DEBUG: Background worker paused due to interrupt. Job {job_id} waiting...")
                await asyncio.sleep(0.5)

            self.jobs[job_id]["status"] = "running"
            print(f"DEBUG: Starting background job: {self.jobs[job_id]['name']} ({job_id})")
            
            try:
                # Pass the interrupt event if requested
                if "interrupt_event" in kwargs:
                     kwargs["interrupt_event"] = self.interrupt_event
                
                await job_func(*args, **kwargs)
                self.jobs[job_id]["status"] = "completed"
                self.jobs[job_id]["progress"] = 100
                print(f"DEBUG: Completed background job: {job_id}")
            except asyncio.CancelledError:
                self.jobs[job_id]["status"] = "cancelled"
                print(f"DEBUG: Cancelled background job: {job_id}")
            except Exception as e:
                self.jobs[job_id]["status"] = "error"
                self.jobs[job_id]["error"] = str(e)
                print(f"DEBUG: Error in background job {job_id}: {e}")
            finally:
                self.queue.task_done()

    def add_job(self, job_name: str, job_func, *args, **kwargs):
        job_id = str(uuid.uuid4())
        self.jobs[job_id] = {
            "name": job_name,
            "status": "pending",
            "progress": 0,
            "created_at": datetime.utcnow().isoformat()
        }
        self.queue.put_nowait((job_id, job_func, args, kwargs))
        self.start_worker()
        return job_id

    def interrupt(self):
        """Signals background jobs to yield hardware resources."""
        self.interrupt_event.set()

    def resume(self):
        """Signals background jobs that hardware resources are available."""
        self.interrupt_event.clear()

    def get_job_status(self, job_id: str):
        return self.jobs.get(job_id)

    def list_jobs(self):
        # Sort by created_at desc
        sorted_jobs = sorted(
            self.jobs.items(), 
            key=lambda x: x[1].get("created_at", ""), 
            reverse=True
        )
        return [
            {
                "id": tid, 
                "name": j["name"], 
                "status": j["status"], 
                "progress": j["progress"],
                "created_at": j.get("created_at"),
                "error": j.get("error")
            }
            for tid, j in sorted_jobs
        ]

background_manager = BackgroundTaskManager()
