"""
Progress tracking API endpoints and WebSocket support
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Header, HTTPException, Depends, Request
from typing import Optional, Dict, Set
import json

from app.core.workflow_engine import WorkflowEngine
from app.models.workflow import WorkflowProgress


router = APIRouter()

# WebSocket connections: tenant_id -> set of websocket connections
websocket_connections: Dict[str, Set[WebSocket]] = {}


def get_tenant_id(x_user_id: Optional[str] = Header(None, alias="X-User-ID")) -> str:
    """Extract and validate tenant ID from header"""
    if not x_user_id:
        raise HTTPException(status_code=401, detail="X-User-ID header is required")
    return x_user_id


def get_workflow_engine(request: Request) -> WorkflowEngine:
    """Get workflow engine from app state"""
    return request.app.state.workflow_engine


@router.get("/workflow/{workflow_id}", response_model=WorkflowProgress)
async def get_workflow_progress(
    workflow_id: str,
    request: Request,
    tenant_id: str = Depends(get_tenant_id),
    workflow_engine: WorkflowEngine = Depends(get_workflow_engine)
):
    """Get current progress for a workflow"""
    workflow = workflow_engine.get_workflow(workflow_id)
    
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    if workflow.tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    active_jobs = [
        job.job_id for job in workflow.jobs
        if job.status.value == "RUNNING"
    ]
    
    return WorkflowProgress(
        workflow_id=workflow.workflow_id,
        progress=workflow.progress,
        status=workflow.status,
        jobs_completed=sum(1 for j in workflow.jobs if j.status.value in ["SUCCEEDED", "FAILED"]),
        jobs_total=len(workflow.jobs),
        active_jobs=active_jobs
    )


@router.websocket("/ws/{tenant_id}")
async def websocket_progress(websocket: WebSocket, tenant_id: str):
    """WebSocket endpoint for real-time progress updates"""
    await websocket.accept()
    
    # Add connection
    if tenant_id not in websocket_connections:
        websocket_connections[tenant_id] = set()
    websocket_connections[tenant_id].add(websocket)
    
    try:
        while True:
            # Keep connection alive and wait for messages
            data = await websocket.receive_text()
            # Echo back or handle client messages if needed
            await websocket.send_json({"type": "pong", "data": data})
    except WebSocketDisconnect:
        # Remove connection
        websocket_connections[tenant_id].discard(websocket)
        if not websocket_connections[tenant_id]:
            del websocket_connections[tenant_id]


async def broadcast_progress(tenant_id: str, progress_data: dict):
    """Broadcast progress update to all connections for a tenant"""
    if tenant_id in websocket_connections:
        disconnected = set()
        for websocket in websocket_connections[tenant_id]:
            try:
                await websocket.send_json(progress_data)
            except:
                disconnected.add(websocket)
        
        # Remove disconnected connections
        websocket_connections[tenant_id] -= disconnected
        if not websocket_connections[tenant_id]:
            del websocket_connections[tenant_id]

