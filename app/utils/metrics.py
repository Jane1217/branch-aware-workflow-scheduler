"""
Prometheus metrics for observability
Exposes metrics for HTTP requests, job scheduling, and system health
"""
from prometheus_client import Counter, Gauge, Histogram, generate_latest
import time
from typing import Optional

# Prometheus content type
CONTENT_TYPE_LATEST = 'text/plain; version=0.0.4; charset=utf-8'

# HTTP Metrics
http_requests_total = Counter(
    'http_requests_total',
    'Total number of HTTP requests',
    ['method', 'endpoint', 'status_code']
)

http_request_duration_seconds = Histogram(
    'http_request_duration_seconds',
    'HTTP request duration in seconds',
    ['method', 'endpoint'],
    buckets=[0.01, 0.05, 0.1, 0.5, 1.0, 2.5, 5.0, 10.0]
)

http_errors_total = Counter(
    'http_errors_total',
    'Total number of HTTP errors (5xx)',
    ['method', 'endpoint']
)

# Business/Scheduler Metrics
queue_depth = Gauge(
    'queue_depth',
    'Number of jobs waiting in queue',
    ['tenant_id', 'branch_name']
)

worker_active_jobs = Gauge(
    'worker_active_jobs',
    'Number of currently running jobs',
    ['tenant_id']
)

job_latency_seconds = Histogram(
    'job_latency_seconds',
    'Job execution latency in seconds',
    ['job_type', 'branch', 'tenant_id', 'status'],
    buckets=[1.0, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0, 600.0]
)

jobs_total = Counter(
    'jobs_total',
    'Total number of jobs processed',
    ['job_type', 'status', 'tenant_id']
)

active_users = Gauge(
    'active_users',
    'Number of currently active users',
)

workflow_progress = Gauge(
    'workflow_progress',
    'Workflow completion progress (0.0 to 1.0)',
    ['workflow_id', 'tenant_id']
)


def get_metrics():
    """Get Prometheus metrics in text format"""
    return generate_latest()


def record_http_request(method: str, endpoint: str, status_code: int, duration: float):
    """Record HTTP request metrics"""
    http_requests_total.labels(method=method, endpoint=endpoint, status_code=status_code).inc()
    http_request_duration_seconds.labels(method=method, endpoint=endpoint).observe(duration)
    
    if status_code >= 500:
        http_errors_total.labels(method=method, endpoint=endpoint).inc()


def update_queue_depth(tenant_id: str, branch_name: str, depth: int):
    """Update queue depth metric"""
    queue_depth.labels(tenant_id=tenant_id, branch_name=branch_name).set(depth)


def update_worker_active_jobs(count: int, tenant_id: Optional[str] = None):
    """Update active jobs metric"""
    if tenant_id:
        worker_active_jobs.labels(tenant_id=tenant_id).set(count)
    # Also update global count (without tenant label)
    # Note: Prometheus doesn't support unlabeled metrics with labeled ones easily,
    # so we'll use a special tenant_id="global" for overall count
    worker_active_jobs.labels(tenant_id="global").set(count)


def record_job_latency(job_type: str, branch: str, tenant_id: str, status: str, duration: float):
    """Record job execution latency"""
    job_latency_seconds.labels(
        job_type=job_type,
        branch=branch,
        tenant_id=tenant_id,
        status=status
    ).observe(duration)


def increment_jobs_total(job_type: str, status: str, tenant_id: str):
    """Increment job counter"""
    jobs_total.labels(job_type=job_type, status=status, tenant_id=tenant_id).inc()


def update_active_users(count: int):
    """Update active users count"""
    active_users.set(count)


def update_workflow_progress(workflow_id: str, tenant_id: str, progress: float):
    """Update workflow progress metric"""
    workflow_progress.labels(workflow_id=workflow_id, tenant_id=tenant_id).set(progress)

