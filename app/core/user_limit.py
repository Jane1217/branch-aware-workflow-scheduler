"""
Active user limit management
Enforces maximum 3 concurrent active users
"""
import asyncio
from typing import Dict, Set, Optional
from datetime import datetime
from collections import deque

from app.config import settings
from app.models.tenant import ActiveUserSlot


class UserLimitManager:
    """
    Manages active user slots with a limit of MAX_ACTIVE_USERS.
    Uses a queue for users waiting for a slot.
    """
    
    def __init__(self):
        self.active_slots: Dict[str, ActiveUserSlot] = {}  # tenant_id -> slot
        self.waiting_queue: deque = deque()  # Queue of tenant_ids waiting
        self.lock = asyncio.Lock()
        self.max_active_users = settings.MAX_ACTIVE_USERS
    
    async def acquire_slot(self, tenant_id: str) -> bool:
        """
        Try to acquire an active user slot.
        Returns True if acquired immediately, False if queued.
        """
        async with self.lock:
            # If already active, return True
            if tenant_id in self.active_slots:
                return True
            
            # If there's space, acquire immediately
            if len(self.active_slots) < self.max_active_users:
                self.active_slots[tenant_id] = ActiveUserSlot(
                    tenant_id=tenant_id,
                    acquired_at=datetime.utcnow()
                )
                return True
            
            # Otherwise, add to waiting queue
            if tenant_id not in self.waiting_queue:
                self.waiting_queue.append(tenant_id)
            return False
    
    async def release_slot(self, tenant_id: str) -> Optional[str]:
        """
        Release an active user slot.
        Returns the next tenant_id from queue if any, None otherwise.
        """
        async with self.lock:
            if tenant_id not in self.active_slots:
                return None
            
            del self.active_slots[tenant_id]
            
            # Activate next user from queue
            if self.waiting_queue:
                next_tenant_id = self.waiting_queue.popleft()
                self.active_slots[next_tenant_id] = ActiveUserSlot(
                    tenant_id=next_tenant_id,
                    acquired_at=datetime.utcnow()
                )
                return next_tenant_id
            
            return None
    
    async def is_active(self, tenant_id: str) -> bool:
        """Check if a tenant has an active slot"""
        async with self.lock:
            return tenant_id in self.active_slots
    
    async def get_active_count(self) -> int:
        """Get current number of active users"""
        async with self.lock:
            return len(self.active_slots)
    
    async def get_queue_position(self, tenant_id: str) -> Optional[int]:
        """Get queue position for a tenant (None if active or not in queue)"""
        async with self.lock:
            if tenant_id in self.active_slots:
                return None
            try:
                return list(self.waiting_queue).index(tenant_id)
            except ValueError:
                return None

