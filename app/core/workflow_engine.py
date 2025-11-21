"""
Workflow execution engine
Handles DAG execution and job orchestration
"""
from typing import Dict, List, Callable, Optional
from datetime import datetime

from app.models.workflow import Workflow
from app.models.job import Job, JobStatus
from app.core.scheduler import BranchAwareScheduler


class WorkflowEngine:
    """
    Workflow execution engine that:
    - Manages workflow lifecycle
    - Coordinates job execution through scheduler
    - Tracks workflow progress
    - Handles job execution callbacks
    """
    
    def __init__(self, scheduler: BranchAwareScheduler):
        self.scheduler = scheduler
        self.workflows: Dict[str, Workflow] = {}
        self.job_executors: Dict[str, Callable] = {}  # job_type -> executor function
    
    def register_job_executor(self, job_type: str, executor: Callable):
        """Register an executor function for a job type"""
        self.job_executors[job_type] = executor
    
    async def create_workflow(self, workflow: Workflow) -> Workflow:
        """Create and initialize a workflow"""
        self.workflows[workflow.workflow_id] = workflow
        workflow.status = JobStatus.PENDING
        
        # Check if user has active slot
        from app.core.user_limit import UserLimitManager
        # Get user_limit_manager from scheduler
        user_limit_manager = self.scheduler.user_limit_manager
        has_slot = await user_limit_manager.is_active(workflow.tenant_id)
        
        # Submit all jobs to scheduler
        for job in workflow.jobs:
            await self.scheduler.submit_job(
                job,
                execute_callback=self._create_job_executor(job)
            )
        
        # Only set workflow to RUNNING if user has active slot
        # Otherwise, keep it PENDING until user gets a slot
        if has_slot:
            workflow.status = JobStatus.RUNNING
            workflow.started_at = datetime.now()
        else:
            # User is queued, workflow stays PENDING
            workflow.status = JobStatus.PENDING
        
        return workflow
    
    def _create_job_executor(self, job: Job) -> Callable:
        """Create an executor callback for a job"""
        async def executor(job: Job):
            if job.job_type in self.job_executors:
                executor_func = self.job_executors[job.job_type]
                await executor_func(job)
            else:
                job.status = JobStatus.FAILED
                job.error_message = f"Unknown job type: {job.job_type}"
        
        return executor
    
    async def update_job_progress(
        self,
        job_id: str,
        progress: float,
        tiles_processed: Optional[int] = None,
        tiles_total: Optional[int] = None
    ):
        """Update job progress and propagate to workflow"""
        from datetime import datetime
        
        # Find job in workflows
        workflow_id = None
        tenant_id = None
        
        for workflow in self.workflows.values():
            for job in workflow.jobs:
                if job.job_id == job_id:
                    job.progress = progress
                    if tiles_processed is not None:
                        job.tiles_processed = tiles_processed
                    if tiles_total is not None:
                        job.tiles_total = tiles_total
                    
                    # Track time for ETA calculation (only if job is not completed)
                    if job.status not in [JobStatus.SUCCEEDED, JobStatus.FAILED]:
                        now = datetime.now()
                        if job.first_progress_time is None and progress > 0:
                            job.first_progress_time = now
                        if progress > 0:
                            job.last_progress_time = now
                    
                    workflow_id = workflow.workflow_id
                    tenant_id = workflow.tenant_id
                    
                    # Update workflow progress
                    await self._update_workflow_progress(workflow.workflow_id)
                    break
        
        # Broadcast workflow progress update via WebSocket
        if workflow_id and tenant_id:
            try:
                from app.api.progress import broadcast_progress
                workflow = self.workflows.get(workflow_id)
                if workflow:
                    await broadcast_progress(tenant_id, {
                        "type": "workflow_progress",
                        "workflow_id": workflow_id,
                        "progress": workflow.progress,
                        "status": workflow.status.value,
                        "jobs_completed": sum(1 for j in workflow.jobs if j.status.value in ["SUCCEEDED", "FAILED"]),
                        "jobs_total": len(workflow.jobs)
                    })
            except Exception as e:
                # Don't fail if WebSocket broadcast fails
                print(f"Error broadcasting progress: {e}")
    
    async def _update_workflow_progress(self, workflow_id: str):
        """Update overall workflow progress"""
        if workflow_id not in self.workflows:
            return
        
        workflow = self.workflows[workflow_id]
        if not workflow.jobs:
            return
        
        # Check if workflow should transition from PENDING to RUNNING
        # (when user gets an active slot)
        if workflow.status == JobStatus.PENDING:
            user_limit_manager = self.scheduler.user_limit_manager
            has_slot = await user_limit_manager.is_active(workflow.tenant_id)
            if has_slot:
                workflow.status = JobStatus.RUNNING
                if not workflow.started_at:
                    workflow.started_at = datetime.now()
        
        # Calculate progress as average of all jobs
        total_progress = sum(job.progress for job in workflow.jobs)
        workflow.progress = total_progress / len(workflow.jobs)
        
        # Check if all jobs are completed
        all_completed = all(
            job.status in [JobStatus.SUCCEEDED, JobStatus.FAILED]
            for job in workflow.jobs
        )
        
        if all_completed and workflow.status != JobStatus.SUCCEEDED and workflow.status != JobStatus.FAILED:
            # Check if any job failed
            if any(job.status == JobStatus.FAILED for job in workflow.jobs):
                workflow.status = JobStatus.FAILED
            else:
                workflow.status = JobStatus.SUCCEEDED
            workflow.completed_at = datetime.now()
    
    def get_workflow(self, workflow_id: str) -> Optional[Workflow]:
        """Get a workflow by ID"""
        return self.workflows.get(workflow_id)
    
    def get_workflows_by_tenant(self, tenant_id: str) -> List[Workflow]:
        """Get all workflows for a tenant"""
        return [
            workflow for workflow in self.workflows.values()
            if workflow.tenant_id == tenant_id
        ]

