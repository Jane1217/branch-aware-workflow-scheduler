"""
Visualization API endpoints for displaying segmentation results
Provides endpoints for viewing WSI images with cell segmentation overlays
"""
from fastapi import APIRouter, Header, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse, JSONResponse
from typing import Optional
import os
import json

from app.core.workflow_engine import WorkflowEngine
from app.services.storage import StorageService

router = APIRouter()


def get_tenant_id(x_user_id: Optional[str] = Header(None, alias="X-User-ID")) -> str:
    """Extract and validate tenant ID from header"""
    if not x_user_id:
        raise HTTPException(status_code=401, detail="X-User-ID header is required")
    return x_user_id


def get_workflow_engine(request: Request) -> WorkflowEngine:
    """Get workflow engine from app state"""
    return request.app.state.workflow_engine


@router.get("/{job_id}/visualization")
async def get_visualization_data(
    job_id: str,
    request: Request,
    tenant_id: str = Depends(get_tenant_id),
    workflow_engine: WorkflowEngine = Depends(get_workflow_engine)
):
    """
    Get visualization data for a job
    Returns cell segmentation data formatted for frontend visualization
    """
    # Find job in workflows
    workflows = workflow_engine.get_workflows_by_tenant(tenant_id)
    
    for workflow in workflows:
        for job in workflow.jobs:
            if job.job_id == job_id:
                if job.status.value not in ["SUCCEEDED", "RUNNING"]:
                    raise HTTPException(
                        status_code=400,
                        detail="Job must be SUCCEEDED or RUNNING to view visualization"
                    )
                
                # Load results from storage
                storage = StorageService()
                results = await storage.load_results(job_id, job.job_type.value)
                
                if results is None:
                    raise HTTPException(
                        status_code=404,
                        detail="Job results not found"
                    )
                
                # Format visualization data
                visualization_data = {
                    "job_id": job_id,
                    "job_type": job.job_type.value,
                    "image_path": job.image_path,
                    "status": job.status.value,
                    "progress": job.progress,
                    "cells": results.get("cells", []) if isinstance(results, dict) else [],
                    "total_cells": results.get("total_cells", 0) if isinstance(results, dict) else 0,
                    "tiles_processed": results.get("tiles_processed", 0) if isinstance(results, dict) else 0,
                    "tiles_total": results.get("tiles_total", 0) if isinstance(results, dict) else 0,
                }
                
                return JSONResponse(content=visualization_data)
    
    raise HTTPException(status_code=404, detail="Job not found")


@router.get("/{job_id}/visualization/tiles")
async def get_visualization_tiles(
    job_id: str,
    request: Request,
    level: int = 0,
    x: Optional[int] = None,
    y: Optional[int] = None,
    width: Optional[int] = None,
    height: Optional[int] = None,
    tenant_id: str = Depends(get_tenant_id),
    workflow_engine: WorkflowEngine = Depends(get_workflow_engine)
):
    """
    Get visualization tile data for a specific region
    Returns cell polygons within the specified region for overlay rendering
    """
    # Find job in workflows
    workflows = workflow_engine.get_workflows_by_tenant(tenant_id)
    
    for workflow in workflows:
        for job in workflow.jobs:
            if job.job_id == job_id:
                # Load results
                storage = StorageService()
                results = await storage.load_results(job_id, job.job_type.value)
                
                if results is None:
                    raise HTTPException(
                        status_code=404,
                        detail="Job results not found"
                    )
                
                cells = results.get("cells", []) if isinstance(results, dict) else []
                
                # Filter cells within the specified region
                filtered_cells = []
                if x is not None and y is not None and width is not None and height is not None:
                    for cell in cells:
                        centroid = cell.get("centroid", [0, 0])
                        if len(centroid) >= 2:
                            cx, cy = centroid[0], centroid[1]
                            if x <= cx <= x + width and y <= cy <= y + height:
                                filtered_cells.append(cell)
                else:
                    filtered_cells = cells
                
                return JSONResponse(content={
                    "job_id": job_id,
                    "level": level,
                    "region": {"x": x, "y": y, "width": width, "height": height} if all(v is not None for v in [x, y, width, height]) else None,
                    "cells": filtered_cells,
                    "total_cells_in_region": len(filtered_cells)
                })
    
    raise HTTPException(status_code=404, detail="Job not found")

