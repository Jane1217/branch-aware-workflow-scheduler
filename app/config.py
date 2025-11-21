"""
Application configuration management
"""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings"""
    
    # API Settings
    API_TITLE: str = "Workflow Scheduler API"
    API_VERSION: str = "1.0.0"
    API_DESCRIPTION: str = "Branch-Aware, Multi-Tenant Workflow Scheduler"
    
    # Server Settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = False
    
    # Scheduler Settings
    MAX_WORKERS: int = 10  # Global concurrency limit
    MAX_ACTIVE_USERS: int = 3  # Maximum concurrent active users
    
    # Redis Settings (optional, for distributed queue)
    REDIS_HOST: Optional[str] = None
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    
    # Storage Settings
    RESULT_STORAGE_PATH: str = "./results"
    UPLOAD_STORAGE_PATH: str = "./uploads"
    
    # InstanSeg Settings - Optimized for acceleration
    # Note: These values balance performance with system responsiveness
    # Adjust based on your system's CPU/GPU capabilities
    TILE_SIZE: int = 512  # Tile size in pixels (smaller = more tiles but faster per-tile)
    TILE_OVERLAP: int = 64  # Overlap between tiles to avoid seams (pixels)
    BATCH_SIZE: int = 2  # Number of tiles processed in parallel per batch (1 = sequential batches)
    WSI_LEVEL: int = 0  # WSI pyramid level (0=highest res, 1=faster with good quality, 2=fastest)
    
    # Concurrency Settings
    # Reduced to 1 for better responsiveness on single-user systems
    # Increase if you have powerful multi-core CPU and want maximum speed
    TILE_PROCESSING_WORKERS: int = 1  # Process pool size (1 = sequential processing)
    
    # WebSocket Settings
    WS_HEARTBEAT_INTERVAL: int = 30
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

