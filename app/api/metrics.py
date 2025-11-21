"""
Metrics API endpoint for dashboard
Provides formatted metrics data for frontend visualization
"""
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from typing import Dict, Any
import re

router = APIRouter()


def parse_prometheus_metrics(metrics_text: str) -> Dict[str, Any]:
    """
    Parse Prometheus metrics text format into structured data
    Returns a dictionary with metric names as keys
    """
    metrics = {}
    lines = metrics_text.split('\n')
    
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        
        # Parse metric line: metric_name{labels} value
        match = re.match(r'^(\w+)(?:\{([^}]+)\})?\s+([\d.]+)', line)
        if match:
            metric_name = match.group(1)
            labels_str = match.group(2) or ''
            value = float(match.group(3))
            
            # Parse labels
            labels = {}
            if labels_str:
                for label_pair in labels_str.split(','):
                    if '=' in label_pair:
                        key, val = label_pair.split('=', 1)
                        labels[key.strip()] = val.strip().strip('"')
            
            if metric_name not in metrics:
                metrics[metric_name] = []
            
            metrics[metric_name].append({
                'value': value,
                'labels': labels
            })
    
    return metrics


@router.get("/dashboard")
async def get_dashboard_metrics(request: Request):
    """
    Get formatted metrics data for dashboard visualization
    Returns metrics needed for the small dashboard:
    - Average job latency per minute
    - Active workers
    - Per-branch queue depth
    """
    try:
        # Get scheduler state from request (with error handling)
        if not hasattr(request.app.state, 'scheduler') or request.app.state.scheduler is None:
            return JSONResponse(
                status_code=503,
                content={'error': 'Scheduler not initialized yet'}
            )
        
        scheduler = request.app.state.scheduler
        
        # Initialize default values from scheduler state directly
        active_workers_global = scheduler.get_running_jobs_count()
        active_workers_by_tenant = {}
        
        # Per-Branch Queue Depth Calculation
        # Formula: Queue Depth(U, B) = count of PENDING jobs where tenant_id=U and branch=B
        # 
        # Key Points:
        # 1. Each (tenant_id, branch) combination is an independent serial execution channel
        # 2. Only PENDING jobs in branch_queues are counted (RUNNING jobs are removed)
        # 3. Jobs from different workflows but same tenant_id:branch are counted together
        # 4. Different users' queues for the same branch name are NOT summed (they're independent)
        #
        # Example:
        # - User A:branch-A has 3 PENDING jobs (from Workflow X, Y, Z) -> depth = 3
        # - User B:branch-A has 5 PENDING jobs (from Workflow M, N) -> depth = 5
        # - These are two independent channels, displayed separately
        queue_depth_by_branch = {}
        try:
            # Access branch_queues attribute directly (it's a public attribute)
            # Queue keys are in format "tenant_id:branch"
            for queue_key, queue in scheduler.branch_queues.items():
                if queue:
                    # Parse tenant_id and branch from queue_key (format: "tenant_id:branch")
                    parts = queue_key.split(':', 1)
                    if len(parts) == 2:
                        tenant_id, branch = parts
                    else:
                        # Fallback for old format (shouldn't happen)
                        tenant_id = queue[0].tenant_id if queue else "unknown"
                        branch = queue_key
                    
                    # All jobs in branch_queues are PENDING by definition
                    # Count = len(queue) for this tenant_id:branch combination
                    # Group by branch, then by tenant_id for frontend display
                    if branch not in queue_depth_by_branch:
                        queue_depth_by_branch[branch] = {}
                    queue_depth_by_branch[branch][tenant_id] = len(queue)
        except Exception:
            # If we can't access branch_queues, leave it empty
            pass
        
        avg_latency = 0.0
        active_users_count = 0
        
        # Calculate average latency from workflow engine (completed jobs in last 60 seconds)
        # Formula: Job Latency = completed_at - created_at (for jobs completed in last 60 seconds)
        try:
            from datetime import datetime, timedelta
            workflow_engine = request.app.state.workflow_engine
            if workflow_engine:
                now = datetime.now()
                cutoff_time = now - timedelta(seconds=60)  # Last 60 seconds
                latencies = []
                
                for workflow in workflow_engine.workflows.values():
                    for job in workflow.jobs:
                        # Check if job is completed (SUCCEEDED or FAILED)
                        job_status = job.status.value if hasattr(job.status, 'value') else str(job.status)
                        if job_status in ['SUCCEEDED', 'FAILED'] and job.created_at and job.completed_at:
                            # Only include jobs completed in the last 60 seconds
                            if job.completed_at >= cutoff_time:
                                # Calculate latency: completed_at - created_at
                                duration = (job.completed_at - job.created_at).total_seconds()
                                if duration > 0:
                                    latencies.append(duration)
                
                if latencies:
                    avg_latency = sum(latencies) / len(latencies)
        except Exception:
            pass
        
        try:
            from app.utils.metrics import get_metrics
            
            # Get raw Prometheus metrics
            metrics_text = get_metrics()
            metrics = parse_prometheus_metrics(metrics_text)
            
            # Extract active workers
            if 'worker_active_jobs' in metrics:
                for item in metrics['worker_active_jobs']:
                    tenant_id = item['labels'].get('tenant_id', 'unknown')
                    if tenant_id == 'global':
                        active_workers_global = int(item['value'])
                    else:
                        active_workers_by_tenant[tenant_id] = int(item['value'])
            
            # Override queue depth from metrics if available (more accurate)
            if 'queue_depth' in metrics:
                queue_depth_by_branch = {}
                for item in metrics['queue_depth']:
                    branch = item['labels'].get('branch_name', 'unknown')
                    tenant_id = item['labels'].get('tenant_id', 'unknown')
                    depth = int(item['value'])
                    if branch not in queue_depth_by_branch:
                        queue_depth_by_branch[branch] = {}
                    queue_depth_by_branch[branch][tenant_id] = depth
            
            # Override latency from Prometheus metrics if available (more accurate)
            latency_sum_key = 'job_latency_seconds_sum'
            latency_count_key = 'job_latency_seconds_count'
            
            if latency_sum_key in metrics and latency_count_key in metrics:
                total_sum = sum(item['value'] for item in metrics[latency_sum_key])
                total_count = sum(item['value'] for item in metrics[latency_count_key])
                if total_count > 0:
                    avg_latency = total_sum / total_count
            
            # Get active users
            if 'active_users' in metrics:
                for item in metrics['active_users']:
                    active_users_count = int(item['value'])
        except Exception as parse_error:
            # If metrics parsing fails, use scheduler state directly
            pass
        
        # Get active users from user_limit_manager if available
        try:
            if hasattr(request.app.state, 'user_limit_manager'):
                active_users_count = await request.app.state.user_limit_manager.get_active_count()
        except Exception:
            pass
        
        return JSONResponse(content={
            'active_workers': {
                'global': active_workers_global,
                'by_tenant': active_workers_by_tenant,
                'max': 10  # MAX_WORKERS
            },
            'queue_depth': {
                'total': scheduler.get_queue_depth(),
                'by_branch': queue_depth_by_branch
            },
            'job_latency': {
                'average_seconds': avg_latency,
                'average_minutes': avg_latency / 60.0
            },
            'active_users': {
                'count': active_users_count,
                'max': 3
            },
            'system_health': {
                'status': 'healthy',
                'running_jobs': scheduler.get_running_jobs_count(),
                'queue_depth': scheduler.get_queue_depth()
            }
        })
    except AttributeError as e:
        # Handle case where app.state is not initialized
        return JSONResponse(
            status_code=503,
            content={'error': f'Service not ready: {str(e)}'}
        )
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        return JSONResponse(
            status_code=500,
            content={
                'error': f'Failed to get metrics: {str(e)}',
                'details': error_details
            }
        )

