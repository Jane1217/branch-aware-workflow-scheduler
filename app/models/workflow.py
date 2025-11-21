"""
Workflow and DAG models
"""
from typing import List, Dict, Optional, Any
from datetime import datetime
from pydantic import BaseModel, Field
from uuid import UUID, uuid4

from app.models.job import Job, JobCreate, JobStatus


class Workflow(BaseModel):
    """Workflow model representing a DAG of jobs"""
    workflow_id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    tenant_id: str
    jobs: List[Job] = Field(default_factory=list)
    
    # Status tracking
    status: JobStatus = JobStatus.PENDING
    progress: float = 0.0  # Overall workflow progress
    
    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now())
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Metadata
    metadata: Dict[str, Any] = Field(default_factory=dict)


class WorkflowCreate(BaseModel):
    """Workflow creation request model"""
    name: str
    jobs: List[JobCreate]
    metadata: Dict[str, Any] = Field(default_factory=dict)


class WorkflowResponse(BaseModel):
    """Workflow response model"""
    workflow_id: str
    name: str
    status: JobStatus
    progress: float
    job_count: int
    jobs_completed: int
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    jobs: List[Dict[str, Any]]  # Simplified job info


class WorkflowProgress(BaseModel):
    """Workflow progress update model"""
    workflow_id: str
    progress: float
    status: JobStatus
    jobs_completed: int
    jobs_total: int
    active_jobs: List[str]  # List of currently running job IDs

