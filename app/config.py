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
    TILE_SIZE: int = 2048  # Tile size in pixels (larger = fewer tiles, faster processing)
    TILE_OVERLAP: int = 128  # Overlap between tiles to avoid seams (pixels)
    BATCH_SIZE: int = 8  # Number of tiles processed in parallel within a job (Job-level concurrency)
    WSI_LEVEL: int = 1  # WSI pyramid level (0=highest res, 1=faster with good quality, 2=fastest)
    
    # Concurrency Settings
    TILE_PROCESSING_WORKERS: int = 8  # Thread pool size for parallel tile processing within a job
    
    # WebSocket Settings
    WS_HEARTBEAT_INTERVAL: int = 30
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

