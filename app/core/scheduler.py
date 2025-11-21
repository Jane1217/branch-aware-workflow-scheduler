"""
Branch-aware scheduler
Enforces serial execution within tenant+branch combinations, parallel across different tenant+branch pairs
Ensures complete multi-tenant isolation: different users with same branch name don't interfere
"""
import asyncio
import time
from typing import Dict, Deque, Set, Optional
from collections import defaultdict, deque
from datetime import datetime

from app.config import settings
from app.models.job import Job, JobStatus
from app.core.user_limit import UserLimitManager
from app.core.tenant_manager import TenantManager
from app.utils.metrics import (
    update_queue_depth,
    update_worker_active_jobs,
    record_job_latency,
    increment_jobs_total,
    update_active_users
)


class BranchAwareScheduler:
    """
    Branch-aware scheduler that:
    - Executes jobs serially within the same tenant+branch (FIFO)
    - Executes jobs in parallel across different tenant+branch combinations
    - Respects global MAX_WORKERS limit
    - Integrates with user limit management
    - Ensures complete multi-tenant isolation (different users with same branch name don't interfere)
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
        
        # Branch queues: tenant_id:branch_id -> deque of jobs
        # Using tenant_id:branch_id as key ensures multi-tenant isolation
        # Different users with same branch name won't interfere with each other
        self.branch_queues: Dict[str, Deque[Job]] = defaultdict(deque)
        
        # Currently running jobs: job_id -> Job
        self.running_jobs: Dict[str, Job] = {}
        
        # Cancelled jobs: job_id -> True (jobs cancelled while in queue)
        self.cancelled_jobs: Set[str] = set()
        
        # Branch locks: tenant_id:branch_id -> asyncio.Lock (ensures serial execution per tenant+branch)
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
            
            # Add to branch queue with tenant-aware key
            # Format: "tenant_id:branch" ensures complete multi-tenant isolation
            queue_key = f"{job.tenant_id}:{job.branch}"
            self.branch_queues[queue_key].append(job)
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
                # Silent error handling
                pass
                await asyncio.sleep(1)
    
    async def _process_queues(self):
        """Process jobs from branch queues"""
        # Get tenant-aware queue keys that have running jobs
        # Extract tenant_id:branch from running jobs
        queues_with_running_jobs = {f"{job.tenant_id}:{job.branch}" for job in self.running_jobs.values()}
        
        # Get all tenant-aware queues with pending jobs that don't have running jobs
        queues_with_jobs = [
            queue_key for queue_key, queue in self.branch_queues.items()
            if queue and queue_key not in queues_with_running_jobs
        ]
        
        # Update queue depth metrics
        for queue_key, queue in self.branch_queues.items():
            if queue:
                # Parse tenant_id and branch from queue_key (format: "tenant_id:branch")
                parts = queue_key.split(':', 1)
                if len(parts) == 2:
                    tenant_id, branch = parts
                else:
                    # Fallback for old format (shouldn't happen, but handle gracefully)
                    tenant_id = queue[0].tenant_id if queue else "unknown"
                    branch = queue_key
                update_queue_depth(tenant_id, branch, len(queue))
        
        # Update active workers metric
        update_worker_active_jobs(len(self.running_jobs))
        
        # Update active users metric
        active_count = await self.user_limit_manager.get_active_count()
        update_active_users(active_count)
        
        for queue_key in queues_with_jobs:
            if len(self.running_jobs) >= settings.MAX_WORKERS:
                break  # Reached global limit
            
            queue = self.branch_queues[queue_key]
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
                
                # Update metrics
                # Parse branch from queue_key for metrics
                branch = queue_key.split(':', 1)[1] if ':' in queue_key else job.branch
                update_worker_active_jobs(len(self.running_jobs), job.tenant_id)
                update_queue_depth(job.tenant_id, branch, len(queue))
                
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
        start_time = time.time()
        job_type = job.job_type.value if hasattr(job.job_type, 'value') else str(job.job_type)
        
        # Check if job was cancelled before execution
        if job.job_id in self.cancelled_jobs:
            job.status = JobStatus.CANCELLED
            job.completed_at = datetime.now()
            duration = time.time() - start_time
            # Update metrics
            record_job_latency(job_type, job.branch, job.tenant_id, "CANCELLED", duration)
            increment_jobs_total(job_type, "CANCELLED", job.tenant_id)
            update_worker_active_jobs(len(self.running_jobs) - 1, job.tenant_id)
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
            duration = time.time() - start_time
            
            # Only set as SUCCEEDED if not already FAILED
            if job.status != JobStatus.FAILED:
                job.status = JobStatus.SUCCEEDED
            
            # Update metrics
            status_str = job.status.value if hasattr(job.status, 'value') else str(job.status)
            record_job_latency(job_type, job.branch, job.tenant_id, status_str, duration)
            increment_jobs_total(job_type, status_str, job.tenant_id)
            
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
                update_worker_active_jobs(len(self.running_jobs), job.tenant_id)
                
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
    
    def get_queue_depth(self, branch: Optional[str] = None, tenant_id: Optional[str] = None) -> int:
        """
        Get queue depth for a branch or total
        If both branch and tenant_id are provided, returns depth for that specific tenant+branch
        If only branch is provided, returns total depth across all tenants for that branch
        If neither is provided, returns total depth across all queues
        """
        if branch and tenant_id:
            # Get depth for specific tenant+branch
            queue_key = f"{tenant_id}:{branch}"
            return len(self.branch_queues.get(queue_key, deque()))
        elif branch:
            # Get total depth across all tenants for this branch
            total = 0
            for queue_key, queue in self.branch_queues.items():
                # Check if queue_key ends with the branch name
                if queue_key.endswith(f":{branch}") or queue_key == branch:
                    total += len(queue)
            return total
        else:
            # Return total depth across all queues
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
