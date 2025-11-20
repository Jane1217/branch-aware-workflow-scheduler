"""
Job management API endpoints
"""
from fastapi import APIRouter, Header, HTTPException, Depends, Request
from typing import Optional

from app.models.job import JobResponse
from app.core.scheduler import BranchAwareScheduler
from app.core.workflow_engine import WorkflowEngine


router = APIRouter()


def get_tenant_id(x_user_id: Optional[str] = Header(None, alias="X-User-ID")) -> str:
    """Extract and validate tenant ID from header"""
    if not x_user_id:
        raise HTTPException(status_code=401, detail="X-User-ID header is required")
    return x_user_id


def get_scheduler(request: Request) -> BranchAwareScheduler:
    """Get scheduler from app state"""
    return request.app.state.scheduler


def get_workflow_engine(request: Request) -> WorkflowEngine:
    """Get workflow engine from app state"""
    return request.app.state.workflow_engine


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: str,
    request: Request,
    tenant_id: str = Depends(get_tenant_id),
    workflow_engine: WorkflowEngine = Depends(get_workflow_engine)
):
    """Get a specific job"""
    # Find job in workflows
    workflows = workflow_engine.get_workflows_by_tenant(tenant_id)
    
    for workflow in workflows:
        for job in workflow.jobs:
            if job.job_id == job_id:
                return JobResponse(
                    job_id=job.job_id,
                    job_type=job.job_type,
                    status=job.status,
                    branch=job.branch,
                    progress=job.progress,
                    tiles_processed=job.tiles_processed,
                    tiles_total=job.tiles_total,
                    created_at=job.created_at,
                    started_at=job.started_at,
                    completed_at=job.completed_at,
                    result_path=job.result_path,
                    error_message=job.error_message
                )
    
    raise HTTPException(status_code=404, detail="Job not found")


@router.get("/{job_id}/results")
async def get_job_results(
    job_id: str,
    request: Request,
    tenant_id: str = Depends(get_tenant_id),
    workflow_engine: WorkflowEngine = Depends(get_workflow_engine)
):
    """Get job results (segmentation data, etc.)"""
    # Find job in workflows
    workflows = workflow_engine.get_workflows_by_tenant(tenant_id)
    
    for workflow in workflows:
        for job in workflow.jobs:
            if job.job_id == job_id:
                if not job.result_path:
                    raise HTTPException(
                        status_code=404,
                        detail="Job results not available yet"
                    )
                
                # Load results from storage
                from app.services.storage import StorageService
                storage = StorageService()
                results = await storage.load_results(job_id)
                
                if results is None:
                    raise HTTPException(
                        status_code=404,
                        detail="Job results file not found"
                    )
                
                return {
                    "job_id": job_id,
                    "result_path": job.result_path,
                    "results": results,
                    "metadata": job.metadata
                }
    
    raise HTTPException(status_code=404, detail="Job not found")



