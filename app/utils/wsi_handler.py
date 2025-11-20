"""
WSI (Whole Slide Image) handler
Handles loading and basic operations on WSI files
"""
from pathlib import Path
from typing import Tuple, Optional
import numpy as np

try:
    import openslide
    OPENSLIDE_AVAILABLE = True
except (ImportError, ModuleNotFoundError, OSError):
    OPENSLIDE_AVAILABLE = False

# Try tiffslide as fallback
TIFFSLIDE_AVAILABLE = False
try:
    import tiffslide
    TIFFSLIDE_AVAILABLE = True
except ImportError:
    pass

# Only warn if neither is available
if not OPENSLIDE_AVAILABLE and not TIFFSLIDE_AVAILABLE:
    print("Warning: openslide and tiffslide not available. WSI handling will be limited.")


class WSIHandler:
    """
    Handler for Whole Slide Images (WSI).
    Supports Aperio SVS and other formats via OpenSlide.
    """
    
    def __init__(self):
        if not OPENSLIDE_AVAILABLE and not TIFFSLIDE_AVAILABLE:
            raise ImportError(
                "openslide-python or tiffslide is required for WSI handling. "
                "Install with: pip install openslide-python or pip install tiffslide"
            )
    
    def load_wsi(self, image_path: str):
        """Load a WSI file"""
        if not Path(image_path).exists():
            raise FileNotFoundError(f"Image not found: {image_path}")
        
        if OPENSLIDE_AVAILABLE:
            return openslide.OpenSlide(image_path)
        elif TIFFSLIDE_AVAILABLE:
            import tiffslide
            return tiffslide.TiffSlide(image_path)
        else:
            raise ImportError("No WSI library available")
    
    def get_dimensions(self, wsi: 'openslide.OpenSlide', level: int = 0) -> Tuple[int, int]:
        """Get image dimensions at a specific level"""
        return wsi.level_dimensions[level]
    
    def get_level_count(self, wsi: 'openslide.OpenSlide') -> int:
        """Get number of resolution levels"""
        return wsi.level_count
    
    def read_region(
        self,
        wsi: 'openslide.OpenSlide',
        location: Tuple[int, int],
        level: int,
        size: Tuple[int, int]
    ) -> np.ndarray:
        """Read a region from the WSI"""
        region = wsi.read_region(location, level, size)
        # Convert PIL to numpy array
        return np.array(region.convert("RGB"))

