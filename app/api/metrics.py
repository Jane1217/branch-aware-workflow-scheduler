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
        from app.utils.metrics import get_metrics
        
        # Get raw Prometheus metrics
        metrics_text = get_metrics()
        metrics = parse_prometheus_metrics(metrics_text)
        
        # Get scheduler state from request (with error handling)
        if not hasattr(request.app.state, 'scheduler') or request.app.state.scheduler is None:
            return JSONResponse(
                status_code=503,
                content={'error': 'Scheduler not initialized yet'}
            )
        
        scheduler = request.app.state.scheduler
        user_limit_manager = request.app.state.user_limit_manager
        
        # Extract active workers
        active_workers_global = 0
        active_workers_by_tenant = {}
        if 'worker_active_jobs' in metrics:
            for item in metrics['worker_active_jobs']:
                tenant_id = item['labels'].get('tenant_id', 'unknown')
                if tenant_id == 'global':
                    active_workers_global = int(item['value'])
                else:
                    active_workers_by_tenant[tenant_id] = int(item['value'])
        
        # Extract queue depth by branch
        queue_depth_by_branch = {}
        if 'queue_depth' in metrics:
            for item in metrics['queue_depth']:
                branch = item['labels'].get('branch_name', 'unknown')
                tenant_id = item['labels'].get('tenant_id', 'unknown')
                depth = int(item['value'])
                if branch not in queue_depth_by_branch:
                    queue_depth_by_branch[branch] = {}
                queue_depth_by_branch[branch][tenant_id] = depth
        
        # Calculate average job latency
        # Note: Prometheus Histogram stores _sum and _count, we calculate average from them
        avg_latency = 0.0
        latency_sum_key = 'job_latency_seconds_sum'
        latency_count_key = 'job_latency_seconds_count'
        
        if latency_sum_key in metrics and latency_count_key in metrics:
            total_sum = sum(item['value'] for item in metrics[latency_sum_key])
            total_count = sum(item['value'] for item in metrics[latency_count_key])
            if total_count > 0:
                avg_latency = total_sum / total_count
        
        # Get active users
        active_users_count = 0
        if 'active_users' in metrics:
            for item in metrics['active_users']:
                active_users_count = int(item['value'])
        
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

