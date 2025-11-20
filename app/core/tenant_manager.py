"""
Multi-tenant isolation management
Ensures each user only sees and manages their own workflows
"""
from typing import Dict, Set
from app.models.tenant import Tenant


class TenantManager:
    """
    Manages tenant isolation and tenant-specific data
    """
    
    def __init__(self):
        self.tenants: Dict[str, Tenant] = {}
    
    def get_tenant(self, tenant_id: str) -> Tenant:
        """Get or create a tenant"""
        if tenant_id not in self.tenants:
            self.tenants[tenant_id] = Tenant(tenant_id=tenant_id)
        return self.tenants[tenant_id]
    
    def add_workflow(self, tenant_id: str, workflow_id: str):
        """Add a workflow to a tenant"""
        tenant = self.get_tenant(tenant_id)
        tenant.active_workflows.add(workflow_id)
        tenant.is_active = True
    
    def remove_workflow(self, tenant_id: str, workflow_id: str):
        """Remove a workflow from a tenant"""
        if tenant_id in self.tenants:
            tenant = self.tenants[tenant_id]
            tenant.active_workflows.discard(workflow_id)
            if not tenant.active_workflows and not tenant.active_jobs:
                tenant.is_active = False
    
    def add_job(self, tenant_id: str, job_id: str):
        """Add a job to a tenant"""
        tenant = self.get_tenant(tenant_id)
        tenant.active_jobs.add(job_id)
        tenant.is_active = True
    
    def remove_job(self, tenant_id: str, job_id: str):
        """Remove a job from a tenant"""
        if tenant_id in self.tenants:
            tenant = self.tenants[tenant_id]
            tenant.active_jobs.discard(job_id)
            if not tenant.active_workflows and not tenant.active_jobs:
                tenant.is_active = False
    
    def get_tenant_workflows(self, tenant_id: str) -> Set[str]:
        """Get all workflow IDs for a tenant"""
        tenant = self.get_tenant(tenant_id)
        return tenant.active_workflows.copy()
    
    def get_tenant_jobs(self, tenant_id: str) -> Set[str]:
        """Get all job IDs for a tenant"""
        tenant = self.get_tenant(tenant_id)
        return tenant.active_jobs.copy()

