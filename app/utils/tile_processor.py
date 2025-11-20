"""
Tile-based image processor
Handles dividing large images into tiles with overlap
"""
from typing import List, Tuple
import numpy as np


class TileProcessor:
    """
    Tile processor for dividing large images into overlapping tiles.
    Handles overlap blending to avoid seams.
    """
    
    def __init__(self, tile_size: int = 512, overlap: int = 64):
        self.tile_size = tile_size
        self.overlap = overlap
        self.step_size = tile_size - overlap
    
    def get_tiles(self, wsi, level: int = 0) -> List[Tuple[int, int, int, int]]:
        """
        Get list of tile coordinates (x, y, width, height).
        Returns list of (x, y, w, h) tuples.
        
        Args:
            wsi: Whole slide image object
            level: Pyramid level (0=highest resolution, higher=lower resolution but faster)
        """
        # Ensure level exists
        if level >= len(wsi.level_dimensions):
            level = len(wsi.level_dimensions) - 1
        
        dimensions = wsi.level_dimensions[level]
        width, height = dimensions
        
        tiles = []
        y = 0
        while y < height:
            x = 0
            while x < width:
                # Calculate actual tile size (may be smaller at edges)
                w = min(self.tile_size, width - x)
                h = min(self.tile_size, height - y)
                tiles.append((x, y, w, h))
                x += self.step_size
            y += self.step_size
        
        return tiles
    
    def extract_tile(
        self,
        wsi,
        tile_coords: Tuple[int, int, int, int],
        level: int = 0
    ) -> np.ndarray:
        """Extract a tile from WSI at given coordinates"""
        # Ensure level exists
        if level >= len(wsi.level_dimensions):
            level = len(wsi.level_dimensions) - 1
        
        x, y, w, h = tile_coords
        region = wsi.read_region((x, y), level, (w, h))
        return np.array(region.convert("RGB"))
    
    def blend_overlapping_regions(
        self,
        tiles: List[np.ndarray],
        tile_coords: List[Tuple[int, int, int, int]],
        image_shape: Tuple[int, int]
    ) -> np.ndarray:
        """
        Blend overlapping tile regions to create seamless result.
        Uses weighted blending in overlap regions.
        """
        result = np.zeros((image_shape[1], image_shape[0], 3), dtype=np.float32)
        weight_map = np.zeros((image_shape[1], image_shape[0]), dtype=np.float32)
        
        for tile, (x, y, w, h) in zip(tiles, tile_coords):
            # Create weight mask (higher weight in center, lower at edges)
            weight = self._create_weight_mask(w, h)
            
            # Add weighted tile to result
            result[y:y+h, x:x+w] += tile * weight[:, :, np.newaxis]
            weight_map[y:y+h, x:x+w] += weight
        
        # Normalize by weight map
        weight_map = np.maximum(weight_map, 1e-6)  # Avoid division by zero
        result /= weight_map[:, :, np.newaxis]
        
        return result.astype(np.uint8)
    
    def _create_weight_mask(self, width: int, height: int) -> np.ndarray:
        """Create a weight mask for blending (higher in center)"""
        y, x = np.ogrid[:height, :width]
        center_x, center_y = width / 2, height / 2
        
        # Distance from center
        dist_x = np.abs(x - center_x)
        dist_y = np.abs(y - center_y)
        
        # Create weights (1.0 in center, decreasing towards edges)
        max_dist = max(center_x, center_y)
        weight = 1.0 - np.minimum(
            np.sqrt(dist_x**2 + dist_y**2) / max_dist,
            1.0
        )
        
        return weight

