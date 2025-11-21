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
            # Custom JSON encoder to handle numpy types and other non-serializable objects
            def json_serializer(obj):
                """Custom JSON serializer for numpy types and other objects"""
                import numpy as np
                if isinstance(obj, (np.integer, np.int64, np.int32)):
                    return int(obj)
                elif isinstance(obj, (np.floating, np.float64, np.float32)):
                    return float(obj)
                elif isinstance(obj, np.ndarray):
                    return obj.tolist()
                raise TypeError(f"Type {type(obj)} not serializable")
            
            async with aiofiles.open(output_file, "w") as f:
                await f.write(json.dumps(results, indent=2, default=json_serializer))
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
            # Custom JSON encoder to handle numpy types and other non-serializable objects
            def json_serializer(obj):
                """Custom JSON serializer for numpy types and other objects"""
                import numpy as np
                if isinstance(obj, (np.integer, np.int64, np.int32)):
                    return int(obj)
                elif isinstance(obj, (np.floating, np.float64, np.float32)):
                    return float(obj)
                elif isinstance(obj, np.ndarray):
                    return obj.tolist()
                raise TypeError(f"Type {type(obj)} not serializable")
            
            async with aiofiles.open(output_file, "w") as f:
                await f.write(json.dumps(results, indent=2, default=json_serializer))
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

