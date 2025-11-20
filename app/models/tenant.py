"""
Tenant and user management models
"""
from typing import Set, Optional
from datetime import datetime
from pydantic import BaseModel


class Tenant(BaseModel):
    """Tenant (user) model"""
    tenant_id: str
    is_active: bool = False
    active_workflows: Set[str] = set()  # Set of workflow IDs
    active_jobs: Set[str] = set()  # Set of job IDs
    last_activity: Optional[datetime] = None


class ActiveUserSlot(BaseModel):
    """Active user slot tracking"""
    tenant_id: str
    acquired_at: datetime
    workflow_count: int = 0
    job_count: int = 0

