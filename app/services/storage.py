"""
Result storage service
Handles saving and retrieving job results
"""
from pathlib import Path
from typing import Optional, Dict, Any
import json
import aiofiles

from app.config import settings


class StorageService:
    """
    Storage service for job results.
    Handles saving segmentation results, masks, and metadata.
    """
    
    def __init__(self):
        self.result_path = Path(settings.RESULT_STORAGE_PATH)
        self.result_path.mkdir(parents=True, exist_ok=True)
    
    async def save_segmentation_results(
        self,
        job_id: str,
        results: Dict[str, Any],
        format: str = "json"
    ) -> str:
        """Save segmentation results to disk"""
        output_file = self.result_path / f"{job_id}_segmentation.{format}"
        
        if format == "json":
            async with aiofiles.open(output_file, "w") as f:
                await f.write(json.dumps(results, indent=2))
        elif format == "csv":
            # Convert to CSV format
            pass
        elif format == "h5":
            # Save as HDF5
            pass
        
        return str(output_file)
    
    async def save_tissue_mask_results(
        self,
        job_id: str,
        results: Dict[str, Any],
        format: str = "json"
    ) -> str:
        """Save tissue mask results to disk"""
        output_file = self.result_path / f"{job_id}_tissue_mask.{format}"
        
        if format == "json":
            async with aiofiles.open(output_file, "w") as f:
                await f.write(json.dumps(results, indent=2))
        elif format == "tiff":
            # TODO: Save actual mask image if needed
            pass
        
        return str(output_file)
    
    async def load_results(self, job_id: str, job_type: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Load job results"""
        # Try segmentation results first
        result_file = self.result_path / f"{job_id}_segmentation.json"
        if result_file.exists():
            async with aiofiles.open(result_file, "r") as f:
                content = await f.read()
                return json.loads(content)
        
        # Try tissue mask results
        result_file = self.result_path / f"{job_id}_tissue_mask.json"
        if result_file.exists():
            async with aiofiles.open(result_file, "r") as f:
                content = await f.read()
                return json.loads(content)
        
        return None

