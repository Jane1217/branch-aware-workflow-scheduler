"""
Workflow management API endpoints
"""
from fastapi import APIRouter, Header, HTTPException, Depends, Request
from typing import Optional
from datetime import datetime

from app.models.workflow import Workflow, WorkflowCreate, WorkflowResponse
from app.models.job import JobCreate, Job
from app.core.workflow_engine import WorkflowEngine
from app.core.scheduler import BranchAwareScheduler


def _calculate_elapsed_time(job: Job) -> Optional[float]:
    """Calculate elapsed time in seconds"""
    if job.first_progress_time:
        return (datetime.now() - job.first_progress_time).total_seconds()
    return None


def _calculate_eta(job: Job) -> Optional[float]:
    """Calculate estimated time remaining in seconds"""
    if job.first_progress_time and job.progress > 0 and job.progress < 1.0:
        elapsed = (datetime.now() - job.first_progress_time).total_seconds()
        return (elapsed / job.progress) * (1.0 - job.progress)
    return None


router = APIRouter()


def get_tenant_id(x_user_id: Optional[str] = Header(None, alias="X-User-ID")) -> str:
    """Extract and validate tenant ID from header"""
    if not x_user_id:
        raise HTTPException(status_code=401, detail="X-User-ID header is required")
    return x_user_id


def get_workflow_engine(request: Request) -> WorkflowEngine:
    """Get workflow engine from app state"""
    return request.app.state.workflow_engine


def get_scheduler(request: Request) -> BranchAwareScheduler:
    """Get scheduler from app state"""
    return request.app.state.scheduler


@router.post("", response_model=WorkflowResponse)
async def create_workflow(
    workflow_data: WorkflowCreate,
    request: Request,
    tenant_id: str = Depends(get_tenant_id),
    workflow_engine: WorkflowEngine = Depends(get_workflow_engine)
):
    """Create a new workflow"""
    # Convert JobCreate to Job
    jobs = []
    for job_create in workflow_data.jobs:
        job = Job(
            job_id=job_create.job_id or None,
            job_type=job_create.job_type,
            image_path=job_create.image_path,
            branch=job_create.branch,
            tenant_id=tenant_id,
            depends_on=job_create.depends_on,
            metadata=job_create.metadata
        )
        jobs.append(job)
    
    # Create workflow
    workflow = Workflow(
        name=workflow_data.name,
        tenant_id=tenant_id,
        jobs=jobs,
        metadata=workflow_data.metadata
    )
    
    # Submit to engine
    workflow = await workflow_engine.create_workflow(workflow)
    
    # Convert to response
    return WorkflowResponse(
        workflow_id=workflow.workflow_id,
        name=workflow.name,
        status=workflow.status,
        progress=workflow.progress,
        job_count=len(workflow.jobs),
        jobs_completed=sum(1 for j in workflow.jobs if j.status.value in ["SUCCEEDED", "FAILED"]),
        created_at=workflow.created_at,
        started_at=workflow.started_at,
        completed_at=workflow.completed_at,
        jobs=[{
            "job_id": j.job_id,
            "job_type": j.job_type.value,
            "status": j.status.value,
            "progress": j.progress,
            "branch": j.branch,
            "tiles_processed": j.tiles_processed,
            "tiles_total": j.tiles_total,
            "error_message": j.error_message
        } for j in workflow.jobs]
    )


@router.get("", response_model=list[WorkflowResponse])
async def list_workflows(
    request: Request,
    tenant_id: str = Depends(get_tenant_id),
    workflow_engine: WorkflowEngine = Depends(get_workflow_engine)
):
    """List all workflows for the current tenant"""
    workflows = workflow_engine.get_workflows_by_tenant(tenant_id)
    
    return [
        WorkflowResponse(
            workflow_id=w.workflow_id,
            name=w.name,
            status=w.status,
            progress=w.progress,
            job_count=len(w.jobs),
            jobs_completed=sum(1 for j in w.jobs if j.status.value in ["SUCCEEDED", "FAILED", "CANCELLED"]),
            created_at=w.created_at,
            started_at=w.started_at,
            completed_at=w.completed_at,
            jobs=[{
                "job_id": j.job_id,
                "job_type": j.job_type.value,
                "status": j.status.value,
                "progress": j.progress,
                "branch": j.branch,
                "tiles_processed": j.tiles_processed,
                "tiles_total": j.tiles_total,
                "error_message": j.error_message,
                "elapsed_time_seconds": _calculate_elapsed_time(j),
                "estimated_remaining_seconds": _calculate_eta(j)
            } for j in w.jobs]
        )
        for w in workflows
    ]


@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(
    workflow_id: str,
    request: Request,
    tenant_id: str = Depends(get_tenant_id),
    workflow_engine: WorkflowEngine = Depends(get_workflow_engine)
):
    """Get a specific workflow"""
    workflow = workflow_engine.get_workflow(workflow_id)
    
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    if workflow.tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return WorkflowResponse(
        workflow_id=workflow.workflow_id,
        name=workflow.name,
        status=workflow.status,
        progress=workflow.progress,
        job_count=len(workflow.jobs),
        jobs_completed=sum(1 for j in workflow.jobs if j.status.value in ["SUCCEEDED", "FAILED"]),
        created_at=workflow.created_at,
        started_at=workflow.started_at,
        completed_at=workflow.completed_at,
        jobs=[{
            "job_id": j.job_id,
            "job_type": j.job_type.value,
            "status": j.status.value,
            "progress": j.progress,
            "branch": j.branch,
            "tiles_processed": j.tiles_processed,
            "tiles_total": j.tiles_total,
            "error_message": j.error_message,
            "elapsed_time_seconds": _calculate_elapsed_time(j),
            "estimated_remaining_seconds": _calculate_eta(j)
        } for j in workflow.jobs]
    )

