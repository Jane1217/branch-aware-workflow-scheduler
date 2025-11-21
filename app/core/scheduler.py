"""
Branch-aware scheduler
Enforces serial execution within branches, parallel across branches
"""
import asyncio
from typing import Dict, Deque, Set, Optional
from collections import defaultdict, deque
from datetime import datetime

from app.config import settings
from app.models.job import Job, JobStatus
from app.core.user_limit import UserLimitManager
from app.core.tenant_manager import TenantManager


class BranchAwareScheduler:
    """
    Branch-aware scheduler that:
    - Executes jobs serially within the same branch (FIFO)
    - Executes jobs in parallel across different branches
    - Respects global MAX_WORKERS limit
    - Integrates with user limit management
    """
    
    def __init__(
        self,
        user_limit_manager: UserLimitManager,
        tenant_manager: TenantManager,
        workflow_engine=None
    ):
        self.user_limit_manager = user_limit_manager
        self.tenant_manager = tenant_manager
        self.workflow_engine = workflow_engine  # Reference to workflow engine for status updates
        
        # Branch queues: branch_id -> deque of jobs
        self.branch_queues: Dict[str, Deque[Job]] = defaultdict(deque)
        
        # Currently running jobs: job_id -> Job
        self.running_jobs: Dict[str, Job] = {}
        
        # Cancelled jobs: job_id -> True (jobs cancelled while in queue)
        self.cancelled_jobs: Set[str] = set()
        
        # Branch locks: branch_id -> asyncio.Lock (ensures serial execution per branch)
        self.branch_locks: Dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
        
        # Global worker semaphore (limits total concurrent jobs)
        self.worker_semaphore = asyncio.Semaphore(settings.MAX_WORKERS)
        
        # Job dependencies tracking: job_id -> set of dependency job_ids
        self.job_dependencies: Dict[str, Set[str]] = {}
        
        # Completed jobs: job_id -> True (for dependency checking)
        self.completed_jobs: Set[str] = set()
        
        # Job executors: job_id -> execute_callback function
        self.job_executors: Dict[str, callable] = {}
        
        self.lock = asyncio.Lock()
        self._scheduler_task: Optional[asyncio.Task] = None
    
    async def start(self):
        """Start the scheduler background task"""
        if self._scheduler_task is None or self._scheduler_task.done():
            self._scheduler_task = asyncio.create_task(self._scheduler_loop())
    
    async def stop(self):
        """Stop the scheduler"""
        if self._scheduler_task and not self._scheduler_task.done():
            self._scheduler_task.cancel()
            try:
                await self._scheduler_task
            except asyncio.CancelledError:
                pass
    
    async def submit_job(self, job: Job, execute_callback) -> bool:
        """
        Submit a job to the scheduler.
        execute_callback: async function(job: Job) -> None
        Returns True if submitted, False if rejected
        """
        async with self.lock:
            # Check if user has active slot
            has_slot = await self.user_limit_manager.is_active(job.tenant_id)
            if not has_slot:
                # Try to acquire slot
                acquired = await self.user_limit_manager.acquire_slot(job.tenant_id)
                if not acquired:
                    # User is queued, job will be queued too
                    pass
            
            # Add job dependencies
            if job.depends_on:
                self.job_dependencies[job.job_id] = set(job.depends_on)
            
            # Store executor callback
            self.job_executors[job.job_id] = execute_callback
            
            # Add to branch queue
            self.branch_queues[job.branch].append(job)
            self.tenant_manager.add_job(job.tenant_id, job.job_id)
            
            # Start scheduler if not running
            await self.start()
            
            return True
    
    async def _scheduler_loop(self):
        """Main scheduler loop that processes jobs"""
        while True:
            try:
                await self._process_queues()
                await asyncio.sleep(0.1)  # Small delay to prevent busy waiting
            except asyncio.CancelledError:
                break
            except Exception as e:
                # Log error and continue
                print(f"Scheduler error: {e}")
                await asyncio.sleep(1)
    
    async def _process_queues(self):
        """Process jobs from branch queues"""
        # Get branches that have running jobs
        branches_with_running_jobs = {job.branch for job in self.running_jobs.values()}
        
        # Get all branches with pending jobs that don't have running jobs
        branches_with_jobs = [
            branch for branch, queue in self.branch_queues.items()
            if queue and branch not in branches_with_running_jobs
        ]
        
        for branch in branches_with_jobs:
            if len(self.running_jobs) >= settings.MAX_WORKERS:
                break  # Reached global limit
            
            queue = self.branch_queues[branch]
            if not queue:
                continue
            
            # Get next job from branch queue
            job = queue[0]
            
            # Check if job was cancelled
            if job.job_id in self.cancelled_jobs:
                # Remove cancelled job from queue
                queue.popleft()
                self.cancelled_jobs.discard(job.job_id)
                self.job_executors.pop(job.job_id, None)
                self.job_dependencies.pop(job.job_id, None)
                self.tenant_manager.remove_job(job.tenant_id, job.job_id)
                job.status = JobStatus.CANCELLED
                job.completed_at = datetime.now()
                continue
            
            # Check if user has active slot (CRITICAL: enforce 3-user limit)
            has_slot = await self.user_limit_manager.is_active(job.tenant_id)
            if not has_slot:
                continue  # User doesn't have active slot, skip this job
            
            # Check dependencies
            if not self._check_dependencies(job.job_id):
                continue  # Dependencies not met, skip for now
            
            # Try to acquire worker slot
            if not self.worker_semaphore.locked() or self.worker_semaphore._value > 0:
                # Acquire worker slot
                await self.worker_semaphore.acquire()
                
                # Remove from queue
                queue.popleft()
                
                # Add to running jobs
                self.running_jobs[job.job_id] = job
                job.status = JobStatus.RUNNING
                job.started_at = datetime.now()
                
                # Notify workflow engine about job status change
                await self._notify_workflow_engine(job)
                
                # Execute job in background
                asyncio.create_task(self._execute_job(job))
    
    def _check_dependencies(self, job_id: str) -> bool:
        """
        Check if all dependencies for a job are completed.
        
        A dependency is considered satisfied only if:
        1. The dependency job is in completed_jobs (SUCCEEDED or FAILED)
        
        If a dependency is still running or pending, the job must wait.
        Note: Dependencies use globally unique job_ids (workflow_id_job_id format).
        """
        if job_id not in self.job_dependencies:
            return True  # No dependencies
        
        deps = self.job_dependencies[job_id]
        
        # Check if all dependencies are completed
        for dep_id in deps:
            # If dependency is still running, job must wait
            if dep_id in self.running_jobs:
                return False  # Dependency is still running
            
            # If dependency is cancelled, treat as not completed (job should not run)
            if dep_id in self.cancelled_jobs:
                return False  # Dependency was cancelled
            
            # If dependency is not completed, job must wait
            if dep_id not in self.completed_jobs:
                return False  # Dependency not completed
        
        # All dependencies are completed
        return True
    
    async def cancel_job(self, job_id: str, tenant_id: str) -> bool:
        """
        Cancel a job that is still in the queue (before execution starts).
        Returns True if job was cancelled, False if job not found or already running.
        """
        async with self.lock:
            # Check if job is running
            if job_id in self.running_jobs:
                return False  # Cannot cancel running job
            
            # Check if job is in any queue
            for queue in self.branch_queues.values():
                for job in queue:
                    if job.job_id == job_id and job.tenant_id == tenant_id:
                        # Mark as cancelled
                        self.cancelled_jobs.add(job_id)
                        job.status = JobStatus.CANCELLED
                        job.completed_at = datetime.now()
                        return True
            
            # Check if job is already completed or cancelled
            if job_id in self.completed_jobs or job_id in self.cancelled_jobs:
                return False  # Already completed or cancelled
            
            return False  # Job not found
    
    async def _execute_job(self, job: Job):
        """Execute a job and handle completion"""
        # Check if job was cancelled before execution
        if job.job_id in self.cancelled_jobs:
            job.status = JobStatus.CANCELLED
            job.completed_at = datetime.now()
            self.worker_semaphore.release()
            async with self.lock:
                self.running_jobs.pop(job.job_id, None)
                self.cancelled_jobs.discard(job.job_id)
                self.completed_jobs.add(job.job_id)
                self.job_executors.pop(job.job_id, None)
                self.job_dependencies.pop(job.job_id, None)
                self.tenant_manager.remove_job(job.tenant_id, job.job_id)
            return
        
        try:
            # Get executor callback for this job
            executor = self.job_executors.get(job.job_id)
            if executor:
                await executor(job)
            else:
                job.status = JobStatus.FAILED
                job.error_message = "No executor found for job"
        except Exception as e:
            job.status = JobStatus.FAILED
            job.error_message = str(e)
        finally:
            # Mark as completed
            job.completed_at = datetime.now()
            
            # Only set as SUCCEEDED if not already FAILED
            if job.status != JobStatus.FAILED:
                job.status = JobStatus.SUCCEEDED
            
            # Notify workflow engine about job completion
            await self._notify_workflow_engine(job)
            
            # Release worker slot
            self.worker_semaphore.release()
            
            # Remove from running jobs
            async with self.lock:
                self.running_jobs.pop(job.job_id, None)
                self.completed_jobs.add(job.job_id)
                self.job_executors.pop(job.job_id, None)
                self.job_dependencies.pop(job.job_id, None)
                self.tenant_manager.remove_job(job.tenant_id, job.job_id)
                
                # Check if tenant has no more jobs/workflows
                tenant_jobs = self.tenant_manager.get_tenant_jobs(job.tenant_id)
                tenant_workflows = self.tenant_manager.get_tenant_workflows(job.tenant_id)
                if not tenant_jobs and not tenant_workflows:
                    # Release slot and activate next user from queue
                    next_tenant_id = await self.user_limit_manager.release_slot(job.tenant_id)
                    if next_tenant_id:
                        # Notify workflow engine that a new user got a slot
                        # This will be handled by workflow engine checking slot status
                        pass
    
    def get_queue_depth(self, branch: Optional[str] = None) -> int:
        """Get queue depth for a branch or total"""
        if branch:
            return len(self.branch_queues.get(branch, deque()))
        return sum(len(queue) for queue in self.branch_queues.values())
    
    def get_running_jobs_count(self) -> int:
        """Get number of currently running jobs"""
        return len(self.running_jobs)
    
    async def _notify_workflow_engine(self, job: Job):
        """Notify workflow engine about job status changes"""
        try:
            if self.workflow_engine:
                # Find workflow containing this job and update its progress
                for workflow in self.workflow_engine.workflows.values():
                    if any(j.job_id == job.job_id for j in workflow.jobs):
                        await self.workflow_engine._update_workflow_progress(workflow.workflow_id)
                        break
        except Exception as e:
            # Don't fail if notification fails
            pass
