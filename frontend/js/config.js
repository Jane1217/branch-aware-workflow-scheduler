// Configuration and constants
export const API_BASE = 'http://localhost:8000/api';

export const AVAILABLE_IMAGES = [
    { 
        name: 'sample-001-small.svs', 
        path: 'Aperio SVS/CMU-1-Small-Region.svs', 
        description: '⚠️ Small region - May have few/no cells (2MB) - Good for quick testing',
        recommended: false
    },
    { 
        name: 'sample-001.svs', 
        path: 'Aperio SVS/CMU-1.svs', 
        description: '✅ RECOMMENDED: Full slide with good cell density (169MB) - Best for Cell Segmentation',
        recommended: true
    },
    { 
        name: 'sample-002.svs', 
        path: 'Aperio SVS/CMU-2.svs', 
        description: '✅ RECOMMENDED: Large full slide (373MB) - Excellent for Cell Segmentation',
        recommended: true
    },
    { 
        name: 'sample-003.svs', 
        path: 'Aperio SVS/CMU-3.svs', 
        description: '✅ RECOMMENDED: Medium full slide (242MB) - Good for Cell Segmentation',
        recommended: true
    },
    { 
        name: 'sample-004-jp2k.svs', 
        path: 'Aperio SVS/CMU-1-JP2K-33005.svs', 
        description: 'Full slide JPEG2000 format (126MB) - Good for Cell Segmentation',
        recommended: true
    },
    { 
        name: 'sample-005-jp2k.svs', 
        path: 'Aperio SVS/JP2K-33003-1.svs', 
        description: 'JPEG2000 format (63MB) - Medium size',
        recommended: false
    },
    { 
        name: 'sample-006-jp2k.svs', 
        path: 'Aperio SVS/JP2K-33003-2.svs', 
        description: 'JPEG2000 format (289MB) - Large size',
        recommended: false
    }
];

