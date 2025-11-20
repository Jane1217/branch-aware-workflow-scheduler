"""
Rate limiting middleware for high QPS scenarios
Uses asyncio.Semaphore for API rate limiting
"""
import asyncio
from typing import Callable
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.config import settings


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Rate limiting middleware using asyncio.Semaphore.
    Limits concurrent requests per tenant to prevent overload.
    """
    
    def __init__(self, app, max_concurrent_requests: int = 100):
        super().__init__(app)
        # Global semaphore for all requests
        self.global_semaphore = asyncio.Semaphore(max_concurrent_requests)
        
        # Per-tenant semaphores for additional protection
        self.tenant_semaphores: dict[str, asyncio.Semaphore] = {}
        self.tenant_lock = asyncio.Lock()
        self.max_per_tenant = 20  # Max concurrent requests per tenant
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip rate limiting for health check and docs
        if request.url.path in ["/health", "/docs", "/redoc", "/openapi.json", "/"]:
            return await call_next(request)
        
        # Get tenant ID from header
        tenant_id = request.headers.get("X-User-ID", "anonymous")
        
        # Acquire global semaphore
        async with self.global_semaphore:
            # Get or create tenant-specific semaphore
            async with self.tenant_lock:
                if tenant_id not in self.tenant_semaphores:
                    self.tenant_semaphores[tenant_id] = asyncio.Semaphore(self.max_per_tenant)
                tenant_semaphore = self.tenant_semaphores[tenant_id]
            
            # Acquire tenant semaphore
            async with tenant_semaphore:
                try:
                    response = await call_next(request)
                    return response
                except Exception as e:
                    raise HTTPException(
                        status_code=503,
                        detail=f"Rate limit error: {str(e)}"
                    )

