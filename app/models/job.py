"""
Job models and state management
"""
from enum import Enum
from typing import Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
from uuid import UUID, uuid4


class JobStatus(str, Enum):
    """Job execution status"""
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class JobType(str, Enum):
    """Job type enumeration"""
    CELL_SEGMENTATION = "cell_segmentation"
    TISSUE_MASK = "tissue_mask"


class Job(BaseModel):
    """Job model"""
    job_id: str = Field(default_factory=lambda: str(uuid4()))
    job_type: JobType
    image_path: str
    branch: str
    tenant_id: str
    status: JobStatus = JobStatus.PENDING
    depends_on: list[str] = Field(default_factory=list)
    
    # Progress tracking
    progress: float = 0.0  # 0.0 to 1.0
    tiles_processed: int = 0
    tiles_total: int = 0
    
    # Metadata
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Results
    result_path: Optional[str] = None
    error_message: Optional[str] = None


class JobCreate(BaseModel):
    """Job creation request model"""
    job_id: Optional[str] = None
    job_type: JobType
    image_path: str
    branch: str
    depends_on: list[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class JobUpdate(BaseModel):
    """Job update model"""
    status: Optional[JobStatus] = None
    progress: Optional[float] = None
    tiles_processed: Optional[int] = None
    tiles_total: Optional[int] = None
    result_path: Optional[str] = None
    error_message: Optional[str] = None


class JobResponse(BaseModel):
    """Job response model"""
    job_id: str
    job_type: JobType
    status: JobStatus
    branch: str
    progress: float
    tiles_processed: int
    tiles_total: int
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    result_path: Optional[str]
    error_message: Optional[str]

