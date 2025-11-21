"""
FastAPI application entry point
"""
import warnings

# Suppress PyTorch warnings
warnings.filterwarnings('ignore', category=UserWarning, message='.*CUDA.*')
warnings.filterwarnings('ignore', category=UserWarning, message='.*Sparse CSR.*')

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from app.config import settings
from app.core.scheduler import BranchAwareScheduler
from app.core.user_limit import UserLimitManager
from app.core.tenant_manager import TenantManager
from app.core.workflow_engine import WorkflowEngine
from app.api import workflows, jobs, progress
from app.services.image_processor import ImageProcessor
from app.models.job import JobType
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.metrics_middleware import MetricsMiddleware
from app.utils.metrics import get_metrics, CONTENT_TYPE_LATEST


# Global instances (will be initialized in lifespan)
scheduler: BranchAwareScheduler = None
workflow_engine: WorkflowEngine = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    global scheduler, workflow_engine
    
    user_limit_manager = UserLimitManager()
    tenant_manager = TenantManager()
    workflow_engine = WorkflowEngine(None)  # Will be set after scheduler creation
    scheduler = BranchAwareScheduler(user_limit_manager, tenant_manager, workflow_engine)
    workflow_engine.scheduler = scheduler  # Set scheduler reference
    
    # Initialize image processor
    image_processor = ImageProcessor()
    
    # Register job executors
    async def cell_segmentation_executor(job):
        """Executor for cell segmentation jobs"""
        async def progress_callback(progress: float, tiles_processed: int, tiles_total: int):
            # Update job progress in workflow engine
            await workflow_engine.update_job_progress(
                job.job_id,
                progress,
                tiles_processed,
                tiles_total
            )
            
            # Broadcast via WebSocket
            from app.api.progress import broadcast_progress
            await broadcast_progress(job.tenant_id, {
                "type": "job_progress",
                "job_id": job.job_id,
                "progress": progress,
                "tiles_processed": tiles_processed,
                "tiles_total": tiles_total,
                "workflow_id": None  # Will be set by workflow engine if needed
            })
        
        await image_processor.process_job(job, progress_callback)
    
    async def tissue_mask_executor(job):
        """Executor for tissue mask generation jobs"""
        async def progress_callback(progress: float, tiles_processed: int, tiles_total: int):
            # Update job progress in workflow engine
            await workflow_engine.update_job_progress(
                job.job_id,
                progress,
                tiles_processed,
                tiles_total
            )
            
            # Broadcast via WebSocket
            from app.api.progress import broadcast_progress
            await broadcast_progress(job.tenant_id, {
                "type": "job_progress",
                "job_id": job.job_id,
                "progress": progress,
                "tiles_processed": tiles_processed,
                "tiles_total": tiles_total,
                "workflow_id": None
            })
        
        await image_processor.process_job(job, progress_callback)
    
    # Register executors with workflow engine
    workflow_engine.register_job_executor(JobType.CELL_SEGMENTATION.value, cell_segmentation_executor)
    workflow_engine.register_job_executor(JobType.TISSUE_MASK.value, tissue_mask_executor)
    
    # Make available to API routes
    app.state.scheduler = scheduler
    app.state.workflow_engine = workflow_engine
    app.state.user_limit_manager = user_limit_manager
    app.state.tenant_manager = tenant_manager
    app.state.image_processor = image_processor
    
    await scheduler.start()
    
    yield
    
    # Shutdown
    await scheduler.stop()


# Create FastAPI app
app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    description=settings.API_DESCRIPTION,
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify allowed origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Metrics middleware (must be added before rate limiting)
app.add_middleware(MetricsMiddleware)

# Rate limiting middleware
app.add_middleware(RateLimitMiddleware, requests_per_minute=100, burst_capacity=20)

# Include API routers
app.include_router(workflows.router, prefix="/api/workflows", tags=["workflows"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])
app.include_router(progress.router, prefix="/api/progress", tags=["progress"])

# Visualization API
from app.api import visualization
app.include_router(visualization.router, prefix="/api/visualization", tags=["visualization"])

# Mount static files for frontend
try:
    app.mount("/static", StaticFiles(directory="frontend"), name="static")
except Exception:
    # Frontend directory might not exist in some environments
    pass

# Serve frontend index.html at root
@app.get("/index.html")
async def frontend_index():
    """Serve frontend index page"""
    from fastapi.responses import FileResponse
    import os
    index_path = os.path.join("frontend", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Frontend not found"}


@app.get("/")
async def root():
    """Root endpoint - serve frontend or API info"""
    from fastapi.responses import FileResponse, JSONResponse
    import os
    
    # Try to serve frontend index.html
    index_path = os.path.join("frontend", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    
    # Fallback to API info
    return JSONResponse({
        "message": "Workflow Scheduler API",
        "version": settings.API_VERSION,
        "docs": "/docs",
        "frontend": "/static/index.html"
    })


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "active_users": await app.state.user_limit_manager.get_active_count(),
        "running_jobs": app.state.scheduler.get_running_jobs_count(),
        "queue_depth": app.state.scheduler.get_queue_depth()
    }


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint"""
    from fastapi.responses import Response
    return Response(content=get_metrics(), media_type=CONTENT_TYPE_LATEST)

