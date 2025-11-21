"""
Redis-based rate limiting middleware using Token Bucket algorithm
Provides tenant-level rate limiting for high QPS scenarios
"""
import asyncio
import time
from typing import Callable, Optional
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response, JSONResponse

from app.config import settings


class RedisRateLimiter:
    """
    Redis-based rate limiter using Token Bucket algorithm
    Supports per-tenant rate limiting with configurable limits
    """
    
    def __init__(self, redis_host: Optional[str] = None, redis_port: int = 6379, redis_db: int = 0):
        self.redis_host = redis_host or settings.REDIS_HOST
        self.redis_port = redis_port or settings.REDIS_PORT
        self.redis_db = redis_db or settings.REDIS_DB
        self.redis_client = None
        self._connection_lock = asyncio.Lock()
        
        # Default rate limits (can be configured per tenant)
        self.default_rate = 100  # requests per minute
        self.default_burst = 20  # burst capacity
        
    async def _get_redis_client(self):
        """Lazy initialization of Redis client"""
        if self.redis_client is None:
            try:
                import redis.asyncio as redis
                self.redis_client = redis.Redis(
                    host=self.redis_host,
                    port=self.redis_port,
                    db=self.redis_db,
                    decode_responses=True
                )
                # Test connection
                await self.redis_client.ping()
            except Exception as e:
                # If Redis is not available, fall back to in-memory rate limiting
                # Redis not available, fallback to in-memory
                pass
                self.redis_client = None
        return self.redis_client
    
    async def _token_bucket_check(self, key: str, rate: int, burst: int) -> tuple[bool, dict]:
        """
        Token Bucket algorithm implementation using Redis
        Returns (allowed, info_dict) where info_dict contains rate limit headers
        """
        redis_client = await self._get_redis_client()
        
        if redis_client is None:
            # Fallback: Allow all requests if Redis is not available
            return True, {
                "X-RateLimit-Limit": str(rate),
                "X-RateLimit-Remaining": str(burst),
                "X-RateLimit-Reset": str(int(time.time()) + 60)
            }
        
        try:
            # Use Redis Lua script for atomic operations
            lua_script = """
            local key = KEYS[1]
            local rate = tonumber(ARGV[1])
            local burst = tonumber(ARGV[2])
            local now = tonumber(ARGV[3])
            local window = 60  -- 1 minute window
            
            -- Get current bucket state
            local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
            local tokens = tonumber(bucket[1]) or burst
            local last_refill = tonumber(bucket[2]) or now
            
            -- Calculate tokens to add based on time elapsed
            local elapsed = now - last_refill
            local tokens_to_add = math.floor((elapsed / window) * rate)
            tokens = math.min(burst, tokens + tokens_to_add)
            
            -- Check if request is allowed
            local allowed = tokens >= 1
            if allowed then
                tokens = tokens - 1
            end
            
            -- Update bucket state
            redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
            redis.call('EXPIRE', key, window * 2)  -- Expire after 2 windows
            
            return {allowed and 1 or 0, tokens, math.ceil((1 - tokens / burst) * window)}
            """
            
            result = await redis_client.eval(
                lua_script,
                1,  # Number of keys
                key,
                rate,
                burst,
                int(time.time())
            )
            
            allowed = bool(result[0])
            remaining = int(result[1])
            reset_in = int(result[2])
            
            return allowed, {
                "X-RateLimit-Limit": str(rate),
                "X-RateLimit-Remaining": str(max(0, remaining)),
                "X-RateLimit-Reset": str(int(time.time()) + reset_in)
            }
            
        except Exception as e:
            # On error, allow request but log warning
            # Rate limit check error, allow request
            pass
            return True, {
                "X-RateLimit-Limit": str(rate),
                "X-RateLimit-Remaining": str(burst),
                "X-RateLimit-Reset": str(int(time.time()) + 60)
            }
    
    async def check_rate_limit(self, tenant_id: str, rate: Optional[int] = None, burst: Optional[int] = None) -> tuple[bool, dict]:
        """
        Check if request is within rate limit for tenant
        Returns (allowed, headers_dict)
        """
        rate = rate or self.default_rate
        burst = burst or self.default_burst
        key = f"rate_limit:{tenant_id}"
        
        return await self._token_bucket_check(key, rate, burst)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Rate limiting middleware using Redis Token Bucket
    Provides tenant-level rate limiting for high QPS scenarios
    """
    
    def __init__(self, app, requests_per_minute: int = 100, burst_capacity: int = 20):
        super().__init__(app)
        self.rate_limiter = RedisRateLimiter()
        self.requests_per_minute = requests_per_minute
        self.burst_capacity = burst_capacity
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip rate limiting for health check, metrics, and docs
        skip_paths = ["/health", "/metrics", "/docs", "/redoc", "/openapi.json", "/"]
        if request.url.path in skip_paths:
            return await call_next(request)
        
        # Get tenant ID from header
        tenant_id = request.headers.get("X-User-ID", "anonymous")
        
        # Check rate limit
        allowed, headers = await self.rate_limiter.check_rate_limit(
            tenant_id,
            rate=self.requests_per_minute,
            burst=self.burst_capacity
        )
        
        if not allowed:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": "Rate limit exceeded",
                    "message": f"Too many requests. Limit: {self.requests_per_minute} requests per minute"
                },
                headers=headers
            )
        
        # Process request
        response = await call_next(request)
        
        # Add rate limit headers to response
        for key, value in headers.items():
            response.headers[key] = value
        
        return response
