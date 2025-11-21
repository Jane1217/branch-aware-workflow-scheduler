"""
HTTP metrics middleware for Prometheus
Tracks request count, latency, and error rates
"""
import time
from typing import Callable
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.utils.metrics import record_http_request


class MetricsMiddleware(BaseHTTPMiddleware):
    """
    Middleware to collect HTTP metrics for Prometheus
    Tracks request count, duration, and error rates
    """
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip metrics collection for metrics endpoint itself
        if request.url.path == "/metrics":
            return await call_next(request)
        
        # Record start time
        start_time = time.time()
        
        # Process request
        response = await call_next(request)
        
        # Calculate duration
        duration = time.time() - start_time
        
        # Extract endpoint (simplified path)
        endpoint = request.url.path
        # Normalize endpoint (remove IDs, etc.)
        if "/api/workflows/" in endpoint and len(endpoint.split("/")) > 3:
            endpoint = "/api/workflows/{id}"
        elif "/api/jobs/" in endpoint and len(endpoint.split("/")) > 3:
            endpoint = "/api/jobs/{id}"
        
        # Record metrics
        method = request.method
        status_code = response.status_code
        
        record_http_request(method, endpoint, status_code, duration)
        
        return response

