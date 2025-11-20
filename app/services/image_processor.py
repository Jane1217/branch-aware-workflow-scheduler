"""
Image processing service
Handles tile-based processing of large images with optimized concurrency
"""
from typing import Optional
from pathlib import Path
import asyncio

from app.config import settings
from app.models.job import Job, JobType, JobStatus
from app.services.instanseg_service import InstanSegService
from app.services.storage import StorageService
from app.utils.wsi_handler import WSIHandler
from app.utils.tile_processor import TileProcessor


class ImageProcessor:
    """
    Image processing service that handles:
    - Large image (WSI) loading
    - Tile-based processing with job-level concurrency
    - Result aggregation and storage
    """
    
    def __init__(self):
        self.wsi_handler = WSIHandler()
        self.tile_processor = TileProcessor(
            tile_size=settings.TILE_SIZE,
            overlap=settings.TILE_OVERLAP
        )
        self.instanseg_service = InstanSegService()
        self.storage_service = StorageService()
    
    async def process_job(self, job: Job, progress_callback=None):
        """
        Process a job based on its type.
        
        Args:
            job: Job to process
            progress_callback: async function(progress: float, tiles_processed: int, tiles_total: int)
        """
        if job.job_type == JobType.CELL_SEGMENTATION:
            await self._process_cell_segmentation(job, progress_callback)
        elif job.job_type == JobType.TISSUE_MASK:
            await self._process_tissue_mask(job, progress_callback)
        else:
            raise ValueError(f"Unknown job type: {job.job_type}")
    
    async def _process_cell_segmentation(self, job: Job, progress_callback=None):
        """Process cell segmentation job using InstanSeg with optimized tiled processing"""
        try:
            # Create progress callback wrapper
            async def progress_wrapper(progress: float, tiles_processed: int, tiles_total: int):
                if progress_callback:
                    await progress_callback(progress, tiles_processed, tiles_total)
            
            # Run segmentation with optimized parallel tile processing
            results = await self.instanseg_service.segment_cells(
                job.image_path,
                progress_callback=progress_wrapper
            )
            
            # Save results
            result_path = await self.storage_service.save_segmentation_results(
                job.job_id,
                results,
                format="json"
            )
            
            job.result_path = result_path
            job.metadata.update({
                "total_cells": results.get("total_cells", 0),
                "method": results.get("method", "unknown"),
                "tiles_processed": results.get("tiles_processed", 0)
            })
            
        except Exception as e:
            job.status = JobStatus.FAILED
            job.error_message = str(e)
            raise
    
    async def _process_tissue_mask(self, job: Job, progress_callback=None):
        """Process tissue mask generation job"""
        # Placeholder for tissue mask processing
        # This can be implemented similarly with tiled processing
        try:
            # TODO: Implement tissue mask generation
            job.status = JobStatus.FAILED
            job.error_message = "Tissue mask generation not yet implemented"
        except Exception as e:
            job.status = JobStatus.FAILED
            job.error_message = str(e)
            raise
