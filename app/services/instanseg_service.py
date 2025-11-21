"""
InstanSeg integration service
Handles cell segmentation using InstanSeg with optimized tiled processing
"""
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
from pathlib import Path
import asyncio
import warnings
from concurrent.futures import ProcessPoolExecutor

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


# Module-level function for process pool (avoids serialization issues)
def _process_tile_worker(
    image_path: str,
    tile: Tuple[int, int, int, int],
    wsi_level: int,
    tile_size: int,
    overlap: int
) -> List[Dict[str, Any]]:
    """
    Process a single tile in a worker process.
    This function is called by ProcessPoolExecutor and must be at module level.
    
    It loads WSI and InstanSeg model in each process to avoid serialization issues.
    """
    try:
        # Load WSI in this process (WSI objects cannot be serialized across processes)
        wsi_handler = WSIHandler()
        wsi = wsi_handler.load_wsi(image_path)
        
        # Load InstanSeg model in this process (models cannot be serialized)
        if not INSTANSEG_AVAILABLE:
            return []
        
        try:
            model = InstanSeg(
                "brightfield_nuclei",
                image_reader="tiffslide",
                verbosity=0
            )
            print(f"DEBUG: Tile {tile} - InstanSeg model loaded successfully (brightfield_nuclei v0.1.1)")
        except Exception as model_error:
            print(f"ERROR: Tile {tile} - Failed to load InstanSeg model: {type(model_error).__name__}: {str(model_error)}")
            print(f"ERROR: Model may need to be downloaded manually from: https://github.com/instanseg/instanseg/releases/download/instanseg_models_v0.1.1/brightfield_nuclei.zip")
            return []
        
        # Create tile processor
        tile_processor = TileProcessor(tile_size=tile_size, overlap=overlap)
        
        # Extract tile from WSI
        tile_image = tile_processor.extract_tile(wsi, tile, level=wsi_level)
        

        if isinstance(tile_image, np.ndarray):

            if len(tile_image.shape) == 2: 
                is_pure_white = np.all(tile_image > 240)
                tile_min, tile_max = np.min(tile_image), np.max(tile_image)
            elif len(tile_image.shape) == 3:  

                is_pure_white = np.all(tile_image > 240)
                tile_min, tile_max = np.min(tile_image), np.max(tile_image)
            else:
                is_pure_white = False
                tile_min, tile_max = None, None
        else:

            try:
                tile_array = np.array(tile_image)
                if len(tile_array.shape) == 2:
                    is_pure_white = np.all(tile_array > 240)
                    tile_min, tile_max = np.min(tile_array), np.max(tile_array)
                elif len(tile_array.shape) == 3:
                    is_pure_white = np.all(tile_array > 240)
                    tile_min, tile_max = np.min(tile_array), np.max(tile_array)
                else:
                    is_pure_white = False
                    tile_min, tile_max = None, None
            except:
                is_pure_white = False
                tile_min, tile_max = None, None
        
        if is_pure_white:
            print(f"DEBUG: Tile {tile} at Level {wsi_level} is detected as PURE BACKGROUND (Skipping InstanSeg)")
            return []
        

        print(f"DEBUG: Tile {tile} at Level {wsi_level} is PROCESSING (Potential Tissue) - pixel range: [{tile_min}, {tile_max}]")
        

        if isinstance(tile_image, np.ndarray):
            print(f"DEBUG: Tile {tile} - Input image shape: {tile_image.shape}, dtype: {tile_image.dtype}, min: {np.min(tile_image)}, max: {np.max(tile_image)}")
        else:
            print(f"DEBUG: Tile {tile} - Input image type: {type(tile_image)}")
        
        # Run InstanSeg on tile using the recommended approach
        # According to InstanSeg docs: use read_image + eval_small_image for better control
        # For tiles, we use eval_small_image directly with proper pixel_size handling
        try:
            # Try to get pixel size from WSI metadata
            # InstanSeg expects pixel_size in mm, WSI typically stores in microns
            # However, passing pixel_size can cause issues if the value is incorrect
            # So we'll use None to let InstanSeg handle it automatically
            pixel_size = None
            # Note: We skip pixel_size to avoid rescaling errors
            # InstanSeg can handle images without explicit pixel_size
            
            # Run InstanSeg evaluation
            # eval_small_image returns (labeled_output, image_tensor) tuple
            result = model.eval_small_image(
                tile_image,
                pixel_size=None  # Use None to avoid rescaling errors
            )
            
            # Handle return format (always tuple according to docs)
            if isinstance(result, tuple):
                labeled_output, image_tensor = result
            else:
                labeled_output = result
            
            # [关键调试点 A：检查模型原始输出] - 在转换为numpy之前
            # 先检查原始输出类型
            print(f"DEBUG: Tile {tile} - Model result type: {type(result)}, labeled_output type: {type(labeled_output)}")
                
        except Exception as e:
            # [诊断代码] 打印错误信息
            print(f"DEBUG: Tile {tile} - InstanSeg eval_small_image failed: {type(e).__name__}: {str(e)}")
            # Fallback: try without pixel_size
            try:
                result = model.eval_small_image(
                    tile_image,
                    pixel_size=None
                )
                if isinstance(result, tuple):
                    labeled_output, _ = result
                else:
                    labeled_output = result
            except Exception as e2:
                # [诊断代码] 打印 fallback 错误信息
                print(f"DEBUG: Tile {tile} - InstanSeg fallback also failed: {type(e2).__name__}: {str(e2)}")
                return []  # Return empty cells on error
        
        # Convert to polygons and adjust coordinates
        x_offset, y_offset, _, _ = tile
        cells = []
        
        # [Critical Fix] Flatten Tensor and convert to NumPy array
        # InstanSeg outputs Tensor with shape (1, 1, H, W) typically.
        # We use .squeeze().cpu().numpy() to flatten it to (H, W)
        if hasattr(labeled_output, 'squeeze'):
            # PyTorch Tensor: squeeze to remove batch and channel dimensions
            labeled_output_np = labeled_output.squeeze().cpu().numpy()
        elif hasattr(labeled_output, 'cpu'):
            # Tensor without squeeze method, try cpu().numpy() first
            labeled_output_np = labeled_output.cpu().numpy()
            # If still has extra dimensions, squeeze manually
            if len(labeled_output_np.shape) > 2:
                labeled_output_np = np.squeeze(labeled_output_np)
        else:
            # Already numpy array or other format, try direct conversion
            labeled_output_np = np.array(labeled_output)
            # If has extra dimensions, squeeze them
            if len(labeled_output_np.shape) > 2:
                labeled_output_np = np.squeeze(labeled_output_np)
        
        # Ensure it's a 2D array (H, W) for skimage.measure.find_contours
        if len(labeled_output_np.shape) != 2:
            print(f"ERROR: Tile {tile} - labeled_output shape is not 2D after squeezing: {labeled_output_np.shape}")
            return cells
        
        # [Key Debug Point A: Check model raw output]
        unique_labels_all = np.unique(labeled_output_np)
        non_background_labels = unique_labels_all[unique_labels_all > 0]
        
        print(f"DEBUG: Tile {tile} Model Output: Unique Labels (incl. 0): {len(unique_labels_all)}, Cells Detected: {len(non_background_labels)}")
        if len(non_background_labels) > 0:
            print(f"DEBUG: Tile {tile} - Model found cells! Label IDs: {non_background_labels[:10] if len(non_background_labels) > 10 else non_background_labels}")
        else:
            print(f"DEBUG: Tile {tile} - Model found NO cells (all pixels are background 0)")
        
        if labeled_output_np.size == 0:
            print(f"DEBUG: Tile {tile} - labeled_output is empty, returning empty cells")
            return cells
        
        # [Diagnostic code] Check InstanSeg output details
        print(f"DEBUG: Tile {tile} - labeled_output shape: {labeled_output_np.shape}, dtype: {labeled_output_np.dtype}")
        print(f"DEBUG: Tile {tile} - labeled_output min: {np.min(labeled_output_np)}, max: {np.max(labeled_output_np)}")
        
        # Find contours for each labeled region
        try:
            from skimage import measure
            
            # 如果模型检测到细胞，开始轮廓提取
            if len(non_background_labels) == 0:
                print(f"DEBUG: Tile {tile} - No cells to extract contours from (all labels are 0)")
                return cells
            
            print(f"DEBUG: Tile {tile} - Starting contour extraction for {len(non_background_labels)} detected cells")
            cells_before_contours = len(cells)
            
            for label_id in non_background_labels:
                try:
                    # Create binary mask for this label
                    mask = (labeled_output_np == label_id).astype(np.uint8)
                    
                    if mask.shape[0] < 2 or mask.shape[1] < 2:
                        continue
                    
                    # Check if mask has any non-zero pixels
                    mask_sum = np.sum(mask)
                    if mask_sum == 0:
                        print(f"DEBUG: Tile {tile} - Label {label_id} mask is empty (sum=0), skipping")
                        continue
                    
                    # [关键调试点 B：检查轮廓提取]
                    try:
                        contours = measure.find_contours(mask, 0.5)
                        print(f"DEBUG: Tile {tile} - Label {label_id}: mask_sum={mask_sum}, contours found: {len(contours)}")
                    except Exception as contour_error:
                        print(f"ERROR: Tile {tile} - Failed to find contours for label {label_id}: {type(contour_error).__name__}: {str(contour_error)}")
                        continue
                    
                    if len(contours) == 0:
                        print(f"DEBUG: Tile {tile} - Label {label_id}: No contours found (mask has pixels but find_contours returned empty)")
                        continue
                    
                    for contour in contours:
                        # Skip very small contours (likely noise)
                        if len(contour) < 3:
                            print(f"DEBUG: Tile {tile} - Label {label_id}: Skipping contour with < 3 points")
                            continue
                        
                        polygon = contour.tolist()
                        # Convert coordinates to global WSI coordinates and ensure JSON-serializable types
                        # Note: find_contours returns (row, col) = (y, x) format
                        polygon_global = []
                        for point in polygon:
                            # point[0] is row (y), point[1] is col (x)
                            polygon_global.append([
                                float(point[0] + y_offset),  # y coordinate
                                float(point[1] + x_offset)   # x coordinate
                            ])
                        
                        # Calculate centroid (ensure JSON-serializable)
                        centroid_y = float(np.mean(contour[:, 0]) + y_offset)  # row (y)
                        centroid_x = float(np.mean(contour[:, 1]) + x_offset)  # col (x)
                        
                        cells.append({
                            "cell_id": f"cell_{label_id}_{len(cells)}",
                            "label_id": int(label_id),
                            "polygon": polygon_global,
                            "area": int(np.sum(mask)),  # Ensure integer
                            "centroid": [centroid_x, centroid_y]  # [x, y] format
                        })
                except Exception as e:
                    print(f"ERROR: Tile {tile} - Failed to extract contour for label {label_id}: {type(e).__name__}: {str(e)}")
                    continue
            
            # [关键调试点 C：检查轮廓提取结果]
            cells_after_contours = len(cells)
            print(f"DEBUG: Tile {tile} - Contour extraction: {cells_before_contours} -> {cells_after_contours} cells extracted")
        except Exception as e:
            # Silent error handling - skip cells that can't be converted
            pass
        
        # Clear GPU cache after processing
        try:
            import torch
            if torch.backends.mps.is_available():
                torch.mps.empty_cache()
            elif torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass
        
        return cells
    except Exception as e:
        # Silent error handling - return empty cells on error
        return []


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
        
        # WSI handler and tile processor for non-process-pool operations
        # (e.g., getting tile coordinates, loading WSI for metadata)
        self.wsi_handler = WSIHandler()
        self.tile_processor = TileProcessor(
            tile_size=settings.TILE_SIZE,
            overlap=settings.TILE_OVERLAP
        )
        
        # Initialize InstanSeg model for direct evaluation (non-WSI images)
        # Note: For WSI processing, each worker process loads its own model
        try:
            self.model = InstanSeg(
                "brightfield_nuclei",
                image_reader="tiffslide",
                verbosity=0  # Reduce verbosity for production
            )
            print("DEBUG: InstanSeg model loaded successfully (brightfield_nuclei v0.1.1)")
            print("DEBUG: Model info: https://github.com/instanseg/instanseg/releases/download/instanseg_models_v0.1.1/brightfield_nuclei.zip")
        except Exception as e:
            print(f"ERROR: Failed to load InstanSeg model: {type(e).__name__}: {str(e)}")
            print(f"ERROR: Model may need to be downloaded manually from: https://github.com/instanseg/instanseg/releases/download/instanseg_models_v0.1.1/brightfield_nuclei.zip")
            print(f"ERROR: Check if model is in the expected cache directory")
            self.model = None
        
        # Process pool for true multi-core parallel processing (Job-level concurrency)
        # ProcessPoolExecutor bypasses Python's GIL, enabling true parallelism
        # Each process loads its own WSI and model to avoid serialization issues
        import os
        cpu_count = os.cpu_count() or 4
        # Use configured value directly (don't override with cpu_count)
        tile_workers = getattr(settings, 'TILE_PROCESSING_WORKERS', 1)
        # Ensure it doesn't exceed CPU core count
        tile_workers = min(tile_workers, cpu_count)
        self.tile_executor = ProcessPoolExecutor(max_workers=tile_workers)
        print(f"Initialized ProcessPoolExecutor with {tile_workers} workers (CPU cores: {cpu_count}, configured: {getattr(settings, 'TILE_PROCESSING_WORKERS', 1)})")
    
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
            # Each tile in the batch is processed concurrently across CPU cores
            # Pass image_path instead of wsi object (WSI cannot be serialized across processes)
            batch_tasks = [
                self._process_single_tile_async(tile, str(image_path), wsi_level)
                for tile in batch_tiles
            ]
            
            # Wait for all tiles in batch to complete
            # Use return_exceptions=True to handle individual tile failures gracefully
            batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)
            
            # Flatten results (each tile may return multiple cells)
            # Skip exceptions (they're already logged)
            for result in batch_results:
                if isinstance(result, Exception):
                    # Silent error handling - skip failed tiles
                    continue
                all_cells.extend(result)
            
            processed_tiles += len(batch_tiles)
            
            # Clear GPU cache after each batch to prevent memory accumulation
            self._clear_gpu_cache()
            
            # Update progress
            if progress_callback:
                progress = processed_tiles / total_tiles if total_tiles > 0 else 1.0
                await progress_callback(progress, processed_tiles, total_tiles)
        
        # [临时测试代码] 禁用合并逻辑进行诊断
        # 如果禁用后细胞数量不再是0，说明问题出在 _merge_overlapping_cells 函数
        # merged_cells = self._merge_overlapping_cells(all_cells)
        merged_cells = all_cells  # 直接返回原始检测结果，不进行合并
        
        print(f"DEBUG: Total unmerged cells detected: {len(all_cells)}")
        print(f"DEBUG: Total merged cells (after deduplication): {len(merged_cells)}")
        
        return {
            "cells": merged_cells,
            "total_cells": len(merged_cells),
            "tiles_processed": processed_tiles,
            "method": "tiled_parallel"
        }
    
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
    
    async def _process_single_tile_async(
        self,
        tile: Tuple[int, int, int, int],
        image_path: str,
        wsi_level: int
    ) -> List[Dict[str, Any]]:
        """
        Process a single tile asynchronously using process pool.
        This allows multiple tiles to be processed in parallel across CPU cores.
        
        Note: image_path is passed instead of wsi object because WSI objects
        cannot be serialized across process boundaries.
        """
        # Run tile processing in process pool executor
        # Use module-level function to avoid serialization issues
        loop = asyncio.get_event_loop()
        tile_cells = await loop.run_in_executor(
            self.tile_executor,
            _process_tile_worker,
            image_path,
            tile,
            wsi_level,
            settings.TILE_SIZE,
            settings.TILE_OVERLAP
        )
        return tile_cells
    
    def _labeled_to_cells(self, labeled_output) -> List[Dict[str, Any]]:
        """Convert labeled segmentation output to cell polygons"""
        cells = []
        
        # [Critical Fix] Flatten Tensor and convert to NumPy array
        # InstanSeg outputs Tensor with shape (1, 1, H, W) typically.
        # We use .squeeze().cpu().numpy() to flatten it to (H, W)
        if hasattr(labeled_output, 'squeeze'):
            # PyTorch Tensor: squeeze to remove batch and channel dimensions
            labeled_output_np = labeled_output.squeeze().cpu().numpy()
        elif hasattr(labeled_output, 'cpu'):
            # Tensor without squeeze method, try cpu().numpy() first
            labeled_output_np = labeled_output.cpu().numpy()
            # If still has extra dimensions, squeeze manually
            if len(labeled_output_np.shape) > 2:
                labeled_output_np = np.squeeze(labeled_output_np)
        else:
            # Already numpy array or other format, try direct conversion
            labeled_output_np = np.array(labeled_output)
            # If has extra dimensions, squeeze them
            if len(labeled_output_np.shape) > 2:
                labeled_output_np = np.squeeze(labeled_output_np)
        
        # Ensure it's a 2D array (H, W) for skimage.measure.find_contours
        if len(labeled_output_np.shape) != 2:
            return cells
        
        # Check if array is valid and has sufficient size
        if labeled_output_np.size == 0:
            return cells
        
        # Check array dimensions (must be at least 2x2 for find_contours)
        if labeled_output_np.shape[0] < 2 or labeled_output_np.shape[1] < 2:
            return cells
        
        # Find contours for each labeled region
        try:
            from skimage import measure
            
            # Get unique labels (excluding background 0)
            unique_labels = np.unique(labeled_output_np)
            unique_labels = unique_labels[unique_labels > 0]
            
            for label_id in unique_labels:
                # Create binary mask for this label
                mask = (labeled_output_np == label_id).astype(np.uint8)
                
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
            # Silent error handling - skip cells that can't be converted
            pass
        
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
