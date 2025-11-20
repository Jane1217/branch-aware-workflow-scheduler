"""
Tissue mask generation service
Generates binary masks identifying tissue regions in WSI images
Uses the same optimized tiled processing architecture as cell segmentation
"""
from typing import Dict, Any, List, Tuple
import numpy as np
from pathlib import Path
import asyncio
from concurrent.futures import ThreadPoolExecutor

from app.config import settings
from app.utils.wsi_handler import WSIHandler
from app.utils.tile_processor import TileProcessor


class TissueMaskService:
    """
    Tissue mask generation service.
    
    Uses the same acceleration strategy as InstanSeg:
    1. Tiled Processing: Split WSI into manageable tiles
    2. Job-level Concurrency: Process multiple tiles in parallel
    3. Batch Processing: Group tiles into batches
    4. Result Merging: Combine tile masks with overlap handling
    """
    
    def __init__(self):
        self.wsi_handler = WSIHandler()
        self.tile_processor = TileProcessor(
            tile_size=settings.TILE_SIZE,
            overlap=settings.TILE_OVERLAP
        )
        
        # Thread pool for parallel tile processing (Job-level concurrency)
        tile_workers = getattr(settings, 'TILE_PROCESSING_WORKERS', settings.BATCH_SIZE)
        self.tile_executor = ThreadPoolExecutor(max_workers=tile_workers)
    
    async def generate_tissue_mask(
        self,
        image_path: str,
        progress_callback=None
    ) -> Dict[str, Any]:
        """
        Generate tissue mask for a WSI image.
        
        Returns:
            Dictionary containing mask metadata and statistics
        """
        image_path = Path(image_path)
        if not image_path.exists():
            raise FileNotFoundError(f"Image not found: {image_path}")
        
        # Load WSI
        wsi = self.wsi_handler.load_wsi(str(image_path))
        
        # Get tile coordinates using configured WSI level
        wsi_level = getattr(settings, 'WSI_LEVEL', 1)
        tiles = self.tile_processor.get_tiles(wsi, level=wsi_level)
        total_tiles = len(tiles)
        
        # Log processing info
        level_dims = wsi.level_dimensions[wsi_level] if wsi_level < len(wsi.level_dimensions) else wsi.level_dimensions[0]
        print(f"Generating tissue mask at level {wsi_level} ({level_dims[0]}x{level_dims[1]}px): {total_tiles} tiles")
        
        # Process tiles in batches with parallel execution
        all_mask_regions = []
        processed_tiles = 0
        
        for batch_start in range(0, total_tiles, settings.BATCH_SIZE):
            batch_tiles = tiles[batch_start:batch_start + settings.BATCH_SIZE]
            
            # Process batch tiles in parallel (Job-level concurrency)
            batch_tasks = [
                self._process_single_tile_mask_async(tile, wsi, wsi_level)
                for tile in batch_tiles
            ]
            
            # Wait for all tiles in batch to complete
            batch_results = await asyncio.gather(*batch_tasks)
            
            # Collect mask regions from all tiles
            for mask_regions in batch_results:
                all_mask_regions.extend(mask_regions)
            
            processed_tiles += len(batch_tiles)
            
            # Update progress
            if progress_callback:
                progress = processed_tiles / total_tiles if total_tiles > 0 else 1.0
                await progress_callback(progress, processed_tiles, total_tiles)
        
        # Calculate statistics
        total_tissue_pixels = sum(region.get('pixel_count', 0) for region in all_mask_regions)
        total_pixels = level_dims[0] * level_dims[1]
        tissue_percentage = (total_tissue_pixels / total_pixels * 100) if total_pixels > 0 else 0
        
        return {
            "mask_regions": all_mask_regions,
            "total_regions": len(all_mask_regions),
            "tissue_pixels": total_tissue_pixels,
            "total_pixels": total_pixels,
            "tissue_percentage": tissue_percentage,
            "tiles_processed": processed_tiles,
            "method": "tiled_parallel",
            "wsi_level": wsi_level,
            "image_dimensions": level_dims
        }
    
    async def _process_single_tile_mask_async(
        self,
        tile: Tuple[int, int, int, int],
        wsi,
        wsi_level: int
    ) -> List[Dict[str, Any]]:
        """
        Process a single tile to generate tissue mask asynchronously.
        This allows multiple tiles to be processed in parallel.
        """
        loop = asyncio.get_event_loop()
        mask_regions = await loop.run_in_executor(
            self.tile_executor,
            self._process_single_tile_mask_sync,
            tile,
            wsi,
            wsi_level
        )
        return mask_regions
    
    def _process_single_tile_mask_sync(
        self,
        tile: Tuple[int, int, int, int],
        wsi,
        wsi_level: int
    ) -> List[Dict[str, Any]]:
        """
        Process a single tile to generate tissue mask synchronously.
        Uses color-based segmentation to identify tissue regions.
        """
        try:
            # Extract tile from WSI
            tile_image = self.tile_processor.extract_tile(wsi, tile, level=wsi_level)
            
            # Generate tissue mask for this tile
            mask = self._generate_tile_mask(tile_image)
            
            # Find connected components (tissue regions) in the mask
            mask_regions = self._find_mask_regions(mask, tile)
            
            return mask_regions
        except Exception as e:
            print(f"Error processing tile {tile} for tissue mask: {e}")
            return []
    
    def _generate_tile_mask(self, tile_image: np.ndarray) -> np.ndarray:
        """
        Generate binary tissue mask from a tile image.
        
        Uses color-based segmentation:
        - Converts RGB to HSV color space
        - Identifies tissue regions (typically pink/purple) vs background (white)
        - Applies morphological operations to clean the mask
        """
        try:
            from skimage import color, morphology
            
            # Convert RGB to HSV for better color-based segmentation
            hsv_image = color.rgb2hsv(tile_image)
            
            # Extract channels
            hue = hsv_image[:, :, 0]
            saturation = hsv_image[:, :, 1]
            value = hsv_image[:, :, 2]
            
            # Tissue detection criteria:
            # 1. Not too bright (value < 0.9) - excludes white background
            # 2. Has color saturation (saturation > 0.1) - excludes grayscale
            # 3. Hue in tissue range (pink/purple: 0.8-1.0 or 0.0-0.2)
            
            # Create tissue mask
            tissue_mask = (
                (value < 0.9) &  # Not too bright
                (saturation > 0.1) &  # Has color
                (
                    ((hue >= 0.8) & (hue <= 1.0)) |  # Pink/purple range
                    ((hue >= 0.0) & (hue <= 0.2))  # Red/pink range
                )
            ).astype(np.uint8)
            
            # Alternative: Use LAB color space for better tissue detection
            # This is more robust for H&E stained images
            try:
                lab_image = color.rgb2lab(tile_image)
                # Tissue typically has lower L (lightness) and specific a, b values
                l_channel = lab_image[:, :, 0] / 100.0  # Normalize to 0-1
                
                # Combine with HSV-based mask
                tissue_mask = (
                    tissue_mask | 
                    ((l_channel < 0.85) & (saturation > 0.15))
                ).astype(np.uint8)
            except:
                pass  # Fall back to HSV-only if LAB conversion fails
            
            # Morphological operations to clean the mask
            # Remove small noise
            tissue_mask = morphology.binary_opening(tissue_mask, morphology.disk(3))
            # Fill small holes
            tissue_mask = morphology.binary_closing(tissue_mask, morphology.disk(5))
            
            return tissue_mask
            
        except ImportError:
            # Fallback: Simple threshold-based approach if skimage not available
            # Convert to grayscale
            gray = np.mean(tile_image, axis=2).astype(np.uint8)
            # Simple threshold: tissue is darker than background
            tissue_mask = (gray < 240).astype(np.uint8)
            return tissue_mask
    
    def _find_mask_regions(
        self,
        mask: np.ndarray,
        tile_coords: Tuple[int, int, int, int]
    ) -> List[Dict[str, Any]]:
        """
        Find connected tissue regions in the mask and return their properties.
        """
        try:
            from skimage import measure
            
            x_offset, y_offset, _, _ = tile_coords
            
            # Find connected components
            labeled_mask = measure.label(mask)
            regions = measure.regionprops(labeled_mask)
            
            mask_regions = []
            for i, region in enumerate(regions):
                # Skip very small regions (likely noise)
                if region.area < 100:  # Minimum 100 pixels
                    continue
                
                # Get bounding box in global coordinates
                min_row, min_col, max_row, max_col = region.bbox
                
                mask_regions.append({
                    "region_id": f"tissue_{i}",
                    "bbox": [
                        min_col + x_offset,  # x_min
                        min_row + y_offset,  # y_min
                        max_col + x_offset,  # x_max
                        max_row + y_offset   # y_max
                    ],
                    "area": region.area,
                    "centroid": [
                        region.centroid[1] + x_offset,  # x
                        region.centroid[0] + y_offset   # y
                    ],
                    "pixel_count": region.area
                })
            
            return mask_regions
            
        except ImportError:
            # Fallback: Simple approach without skimage
            # Just return overall mask statistics
            tissue_pixels = np.sum(mask)
            if tissue_pixels > 0:
                x_offset, y_offset, w, h = tile_coords
                return [{
                    "region_id": "tissue_0",
                    "bbox": [x_offset, y_offset, x_offset + w, y_offset + h],
                    "area": tissue_pixels,
                    "centroid": [x_offset + w/2, y_offset + h/2],
                    "pixel_count": int(tissue_pixels)
                }]
            return []

