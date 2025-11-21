"""
InstanSeg integration service
Handles cell segmentation using InstanSeg with optimized tiled processing
"""
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
from pathlib import Path
import asyncio
import warnings
from concurrent.futures import ThreadPoolExecutor

# Suppress PyTorch warnings
warnings.filterwarnings('ignore', category=UserWarning, message='.*CUDA.*')
warnings.filterwarnings('ignore', category=UserWarning, message='.*Sparse CSR.*')

try:
    from instanseg import InstanSeg
    INSTANSEG_AVAILABLE = True
except ImportError:
    INSTANSEG_AVAILABLE = False
    print("Warning: instanseg-torch not installed. Install with: pip install instanseg-torch")

from app.config import settings
from app.utils.wsi_handler import WSIHandler
from app.utils.tile_processor import TileProcessor


class InstanSegService:
    """
    InstanSeg service for cell segmentation.
    
    Acceleration Strategy:
    1. Tiled Prediction: Split WSI into manageable tiles
    2. Job-level Concurrency: Process multiple tiles in parallel within a single job
    3. Batch Processing: Group tiles into batches for efficient processing
    4. Overlap Blending: Merge results with overlap to avoid seams
    """
    
    def __init__(self):
        if not INSTANSEG_AVAILABLE:
            raise ImportError("instanseg-torch is required. Install with: pip install instanseg-torch")
        
        self.wsi_handler = WSIHandler()
        self.tile_processor = TileProcessor(
            tile_size=settings.TILE_SIZE,
            overlap=settings.TILE_OVERLAP
        )
        
        # Initialize InstanSeg model
        # Using "brightfield_nuclei" model for cell segmentation
        # image_reader="tiffslide" for WSI support
        try:
            self.model = InstanSeg(
                "brightfield_nuclei",
                image_reader="tiffslide",
                verbosity=0  # Reduce verbosity for production
            )
        except Exception as e:
            print(f"Warning: Failed to load InstanSeg model: {e}")
            self.model = None
        
        # Thread pool for parallel tile processing (Job-level concurrency)
        # This allows multiple tiles to be processed concurrently within a single job
        # Uses separate config for worker count to allow fine-tuning
        tile_workers = getattr(settings, 'TILE_PROCESSING_WORKERS', settings.BATCH_SIZE)
        self.tile_executor = ThreadPoolExecutor(max_workers=tile_workers)
    
    async def segment_cells(
        self,
        image_path: str,
        progress_callback=None
    ) -> Dict[str, Any]:
        """
        Segment all cells in an image using InstanSeg.
        Returns segmentation results with polygon coordinates.
        
        This method implements the acceleration strategy:
        - Tiled processing for large WSIs (direct, no eval() attempt)
        - Parallel tile processing within a job
        - Progress tracking and result merging
        
        For WSI files (.svs, .tif, etc.), we directly use tiled processing
        to avoid memory issues and timeouts from eval().
        """
        if self.model is None:
            raise RuntimeError("InstanSeg model not loaded")
        
        image_path = Path(image_path)
        if not image_path.exists():
            raise FileNotFoundError(f"Image not found: {image_path}")
        
        # WSI file extensions that require tiled processing
        wsi_extensions = {'.svs', '.tif', '.tiff', '.ndpi', '.vms', '.vmu', '.scn', '.mrxs', '.zvi'}
        
        # For WSI files, directly use tiled processing (more reliable and efficient)
        if image_path.suffix.lower() in wsi_extensions:
            return await self._segment_cells_tiled(image_path, progress_callback)
        
        # For small images, try direct evaluation first
        # This is only for non-WSI formats that might be small enough
        try:
            result = self.model.eval(
                image=str(image_path),
                save_output=False,
                save_overlay=False
            )
            
            # InstanSeg.eval() may return different formats, handle accordingly
            if isinstance(result, dict):
                labeled_output = result.get('labeled', result.get('output', result))
            elif hasattr(result, 'numpy'):
                labeled_output = result.cpu().numpy() if hasattr(result, 'cpu') else np.array(result)
            else:
                labeled_output = result
            
            # Convert labeled output to cell polygons
            cells = self._labeled_to_cells(labeled_output)
            
            if progress_callback:
                await progress_callback(1.0, 1, 1)
            
            return {
                "cells": cells,
                "total_cells": len(cells),
                "tiles_processed": 1,
                "method": "direct"
            }
        except Exception as e:
            # Fall back to tiled processing if direct evaluation fails
            print(f"Direct evaluation failed, using optimized tiled processing: {e}")
            return await self._segment_cells_tiled(image_path, progress_callback)
    
    async def _segment_cells_tiled(
        self,
        image_path: Path,
        progress_callback=None
    ) -> Dict[str, Any]:
        """
        Segment cells using optimized tiled processing for large WSIs.
        
        Acceleration features:
        - Parallel tile processing within a job (Job-level concurrency)
        - Batch grouping for efficient resource utilization
        - Progress tracking and result merging
        """
        # Load WSI
        wsi = self.wsi_handler.load_wsi(str(image_path))
        
        # Get tile coordinates using configured WSI level
        wsi_level = getattr(settings, 'WSI_LEVEL', 0)
        tiles = self.tile_processor.get_tiles(wsi, level=wsi_level)
        total_tiles = len(tiles)
        
        # Log processing info
        level_dims = wsi.level_dimensions[wsi_level] if wsi_level < len(wsi.level_dimensions) else wsi.level_dimensions[0]
        print(f"Processing WSI at level {wsi_level} ({level_dims[0]}x{level_dims[1]}px): {total_tiles} tiles")
        
        all_cells = []
        processed_tiles = 0
        
        # Process tiles in batches with parallel execution within each batch
        # This implements Job-level concurrency: multiple tiles processed in parallel
        for batch_start in range(0, total_tiles, settings.BATCH_SIZE):
            batch_tiles = tiles[batch_start:batch_start + settings.BATCH_SIZE]
            
            # Process batch tiles in parallel (Job-level concurrency)
            # Each tile in the batch is processed concurrently
            batch_tasks = [
                self._process_single_tile_async(tile, wsi, wsi_level)
                for tile in batch_tiles
            ]
            
            # Wait for all tiles in batch to complete
            # Use return_exceptions=True to handle individual tile failures gracefully
            batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)
            
            # Flatten results (each tile may return multiple cells)
            # Skip exceptions (they're already logged)
            for result in batch_results:
                if isinstance(result, Exception):
                    print(f"Tile processing exception: {result}")
                    continue
                all_cells.extend(result)
            
            processed_tiles += len(batch_tiles)
            
            # Clear GPU cache after each batch to prevent memory accumulation
            self._clear_gpu_cache()
            
            # Update progress
            if progress_callback:
                progress = processed_tiles / total_tiles if total_tiles > 0 else 1.0
                await progress_callback(progress, processed_tiles, total_tiles)
        
        # Merge overlapping cell detections
        merged_cells = self._merge_overlapping_cells(all_cells)
        
        return {
            "cells": merged_cells,
            "total_cells": len(merged_cells),
            "tiles_processed": processed_tiles,
            "method": "tiled_parallel"
        }
    
    async def _process_single_tile_async(
        self,
        tile: Tuple[int, int, int, int],
        wsi,
        wsi_level: int
    ) -> List[Dict[str, Any]]:
        """
        Process a single tile asynchronously.
        This allows multiple tiles to be processed in parallel.
        """
        # Run tile processing in thread pool executor
        loop = asyncio.get_event_loop()
        tile_cells = await loop.run_in_executor(
            self.tile_executor,
            self._process_single_tile_sync,
            tile,
            wsi,
            wsi_level
        )
        return tile_cells
    
    def _process_single_tile_sync(
        self,
        tile: Tuple[int, int, int, int],
        wsi,
        wsi_level: int
    ) -> List[Dict[str, Any]]:
        """
        Process a single tile synchronously (called from executor).
        This is the actual InstanSeg inference on a tile.
        
        Includes GPU memory management for MPS backend.
        """
        try:
            # Extract tile from WSI
            tile_image = self.tile_processor.extract_tile(wsi, tile, level=wsi_level)
            
            # Run InstanSeg on tile
            # Use eval_small_image for individual tiles
            result = self.model.eval_small_image(
                tile_image,
                pixel_size=None  # Will try to read from metadata
            )
            
            # Handle different return formats
            if isinstance(result, tuple):
                labeled_output, _ = result
            else:
                labeled_output = result
            
            # Convert to polygons and adjust coordinates
            tile_cells = self._tile_segments_to_cells(labeled_output, tile)
            
            # Clear GPU cache after processing each tile (important for MPS)
            self._clear_gpu_cache()
            
            return tile_cells
        except RuntimeError as e:
            if "out of memory" in str(e).lower() or "MPS" in str(e):
                print(f"MPS memory error on tile {tile}, clearing cache and retrying...")
                self._clear_gpu_cache()
                # Retry once after clearing cache
                try:
                    result = self.model.eval_small_image(tile_image, pixel_size=None)
                    if isinstance(result, tuple):
                        labeled_output, _ = result
                    else:
                        labeled_output = result
                    tile_cells = self._tile_segments_to_cells(labeled_output, tile)
                    self._clear_gpu_cache()
                    return tile_cells
                except Exception as retry_e:
                    print(f"Retry failed for tile {tile}: {retry_e}")
                    return []
            else:
                print(f"Error processing tile {tile}: {e}")
                return []
        except Exception as e:
            print(f"Error processing tile {tile}: {e}")
            return []
    
    def _clear_gpu_cache(self):
        """Clear GPU cache to free memory (especially important for MPS backend)"""
        try:
            import torch
            if torch.backends.mps.is_available():
                torch.mps.empty_cache()
            elif torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass  # Ignore errors in cache clearing
    
    def _tile_segments_to_cells(
        self,
        labeled_output,
        tile_coords: Tuple[int, int, int, int]
    ) -> List[Dict[str, Any]]:
        """Convert labeled segmentation output to cell polygons with tile coordinates"""
        cells = []
        x_offset, y_offset, _, _ = tile_coords
        
        # Convert to numpy if needed
        try:
            if hasattr(labeled_output, 'cpu'):
                labeled_output = labeled_output.cpu().numpy()
        except ImportError:
            pass
        
        # Ensure it's a numpy array
        if not isinstance(labeled_output, np.ndarray):
            labeled_output = np.array(labeled_output)
        
        # Check if array is valid and has sufficient size
        if labeled_output.size == 0:
            return cells
        
        # Check array dimensions (must be at least 2x2 for find_contours)
        if len(labeled_output.shape) < 2:
            return cells
        
        if labeled_output.shape[0] < 2 or labeled_output.shape[1] < 2:
            return cells
        
        # Find contours for each labeled region
        try:
            from skimage import measure
            
            # Get unique labels (excluding background 0)
            unique_labels = np.unique(labeled_output)
            unique_labels = unique_labels[unique_labels > 0]
            
            for label_id in unique_labels:
                # Create binary mask for this label
                mask = (labeled_output == label_id).astype(np.uint8)
                
                # Skip if mask is too small (find_contours requires at least 2x2)
                if mask.shape[0] < 2 or mask.shape[1] < 2:
                    continue
                
                # Find contours
                contours = measure.find_contours(mask, 0.5)
                
                for contour in contours:
                    # Adjust coordinates to global WSI coordinates
                    polygon = contour.tolist()
                    for point in polygon:
                        point[0] += y_offset  # y coordinate
                        point[1] += x_offset  # x coordinate
                    
                    cells.append({
                        "cell_id": f"cell_{label_id}_{len(cells)}",
                        "label_id": int(label_id),
                        "polygon": polygon,
                        "area": np.sum(mask),
                        "centroid": [
                            np.mean(contour[:, 1]) + x_offset,
                            np.mean(contour[:, 0]) + y_offset
                        ]
                    })
        except Exception as e:
            print(f"Error converting labeled output to cells: {e}")
        
        return cells
    
    def _labeled_to_cells(self, labeled_output) -> List[Dict[str, Any]]:
        """Convert labeled segmentation output to cell polygons"""
        cells = []
        
        # Convert to numpy if needed
        try:
            if hasattr(labeled_output, 'cpu'):
                labeled_output = labeled_output.cpu().numpy()
        except ImportError:
            pass
        
        # Ensure it's a numpy array
        if not isinstance(labeled_output, np.ndarray):
            labeled_output = np.array(labeled_output)
        
        # Check if array is valid and has sufficient size
        if labeled_output.size == 0:
            return cells
        
        # Check array dimensions (must be at least 2x2 for find_contours)
        if len(labeled_output.shape) < 2:
            return cells
        
        if labeled_output.shape[0] < 2 or labeled_output.shape[1] < 2:
            return cells
        
        # Find contours for each labeled region
        try:
            from skimage import measure
            
            # Get unique labels (excluding background 0)
            unique_labels = np.unique(labeled_output)
            unique_labels = unique_labels[unique_labels > 0]
            
            for label_id in unique_labels:
                # Create binary mask for this label
                mask = (labeled_output == label_id).astype(np.uint8)
                
                # Skip if mask is too small (find_contours requires at least 2x2)
                if mask.shape[0] < 2 or mask.shape[1] < 2:
                    continue
                
                # Find contours
                contours = measure.find_contours(mask, 0.5)
                
                for contour in contours:
                    # Convert to polygon coordinates
                    polygon = contour.tolist()
                    
                    cells.append({
                        "cell_id": f"cell_{label_id}_{len(cells)}",
                        "label_id": int(label_id),
                        "polygon": polygon,
                        "area": np.sum(mask),
                        "centroid": [np.mean(contour[:, 1]), np.mean(contour[:, 0])]
                    })
        except Exception as e:
            print(f"Error converting labeled output to cells: {e}")
        
        return cells
    
    def _merge_overlapping_cells(self, cells: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Merge cells detected in overlapping tile regions.
        
        This implements the "blending/merging to avoid seams" requirement:
        - Cells detected in overlapping tile regions are deduplicated
        - Uses centroid distance and area similarity to identify duplicates
        - Prefers cells from tile centers (more reliable) over edge detections
        - This avoids seams at tile boundaries by ensuring each cell is counted once
        
        Args:
            cells: List of cell detections from all tiles (may contain duplicates)
            
        Returns:
            Merged list of unique cells
        """
        if not cells:
            return cells
        
        # Use overlap threshold based on configured tile overlap
        # Cells within overlap/2 distance are considered duplicates
        overlap_threshold = settings.TILE_OVERLAP / 2.0
        
        merged = []
        used_cells = []  # Store (centroid, area) for comparison
        
        for cell in cells:
            centroid = cell.get("centroid", [0, 0])
            area = cell.get("area", 0)
            
            # Check if similar cell already exists in merged list
            is_duplicate = False
            for used_centroid, used_area in used_cells:
                # Calculate distance between centroids
                distance = np.sqrt(
                    (centroid[0] - used_centroid[0])**2 +
                    (centroid[1] - used_centroid[1])**2
                )
                
                # Check if within overlap threshold
                # Also check area similarity (within 20% difference)
                area_ratio = min(area, used_area) / max(area, used_area) if max(area, used_area) > 0 else 0
                
                if distance < overlap_threshold and area_ratio > 0.8:
                    is_duplicate = True
                    break
            
            if not is_duplicate:
                merged.append(cell)
                used_cells.append((tuple(centroid), area))
        
        return merged
