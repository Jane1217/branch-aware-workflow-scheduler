// Visualization management
import { fetchWorkflows, fetchVisualizationData } from './api.js';
import { escapeHtml } from './utils.js';
import { showNotification } from './ui.js';
import { getUserId } from './utils.js';

let visualizationData = null;

export async function loadVisualizationJobList() {
    const userId = getUserId();
    if (!userId) {
        return;
    }

    try {
        const workflows = await fetchWorkflows();
        const select = document.getElementById('visualizationJobId');
        if (!select) return;
        
        select.innerHTML = '<option value="">-- Select a completed job --</option>';
        
        let foundJobs = 0;
        let succeededJobs = 0;
        
        workflows.forEach((workflow) => {
            if (workflow.jobs && workflow.jobs.length > 0) {
                workflow.jobs.forEach((job) => {
                    let jobStatus = '';
                    if (job.status) {
                        if (typeof job.status === 'object' && job.status.value) {
                            jobStatus = String(job.status.value).toUpperCase();
                        } else {
                            jobStatus = String(job.status).toUpperCase();
                        }
                    }
                    
                    let jobType = '';
                    if (job.job_type) {
                        if (typeof job.job_type === 'object' && job.job_type.value) {
                            jobType = String(job.job_type.value);
                        } else {
                            jobType = String(job.job_type);
                        }
                    }
                    
                if (jobStatus === 'SUCCEEDED') {
                        succeededJobs++;
                }
                
                if (jobStatus === 'SUCCEEDED' && jobType === 'cell_segmentation') {
                        foundJobs++;
                    const option = document.createElement('option');
                    option.value = job.job_id;
                    const jobIdDisplay = job.job_id.includes('_') ? job.job_id.split('_').pop() : job.job_id;
                    const imageName = job.image_path ? job.image_path.split('/').pop() : 'unknown';
                    option.textContent = `${jobIdDisplay} - ${imageName}`;
                    select.appendChild(option);
                }
            });
            }
        });
        
        if (select.options.length === 1) {
            if (succeededJobs > 0) {
                select.innerHTML = `<option value="">Found ${succeededJobs} succeeded job(s), but none are cell_segmentation type</option>`;
            } else {
            select.innerHTML = '<option value="">No completed cell_segmentation jobs found</option>';
            }
        }
    } catch (error) {
        const select = document.getElementById('visualizationJobId');
        if (select) {
            select.innerHTML = `<option value="">Error loading jobs: ${error.message}</option>`;
        }
    }
}

export async function loadVisualization() {
    const jobId = document.getElementById('visualizationJobId')?.value;
    if (!jobId) {
        showNotification('Please select a job', 'warning');
        return;
    }

    const userId = getUserId();
    if (!userId) {
        showNotification('Please enter a User ID', 'error');
        return;
    }

    const container = document.getElementById('visualizationContainer');
    if (!container) return;
    
    container.innerHTML = '<div class="text-center py-12 text-gray-500 dark:text-gray-400">Loading visualization...</div>';

    try {
        const data = await fetchVisualizationData(jobId);
        displayVisualization(data);
    } catch (error) {
        container.innerHTML = `<div class="text-center py-12 text-error-600 dark:text-error-500">Error: ${error.message}</div>`;
    }
}

export function displayVisualization(data) {
    const container = document.getElementById('visualizationContainer');
    if (!container) return;
    
    let html = `
        <div class="mb-6 space-y-2">
            <h3 class="text-lg font-semibold text-gray-800 dark:text-white/90">
                Job: ${escapeHtml(data.job_id.split('_').pop())}
            </h3>
            <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <span class="text-gray-500 dark:text-gray-400">Image:</span>
                    <span class="ml-2 text-gray-800 dark:text-white/90">${escapeHtml(data.image_path.split('/').pop())}</span>
                </div>
                <div>
                    <span class="text-gray-500 dark:text-gray-400">Total Cells:</span>
                    <span class="ml-2 font-semibold text-gray-800 dark:text-white/90">${data.total_cells}</span>
                </div>
                <div>
                    <span class="text-gray-500 dark:text-gray-400">Status:</span>
                    <span class="ml-2 text-gray-800 dark:text-white/90">${data.status}</span>
                </div>
                <div>
                    <span class="text-gray-500 dark:text-gray-400">Progress:</span>
                    <span class="ml-2 text-gray-800 dark:text-white/90">${(data.progress * 100).toFixed(1)}%</span>
                </div>
            </div>
        </div>
    `;

    if (data.cells && data.cells.length > 0) {
        html += `
            <div class="mb-6">
                <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 mb-4">
                    <canvas id="visualizationCanvas" width="800" height="600" class="w-full h-auto rounded-lg"></canvas>
                </div>
                <div class="flex items-center gap-4">
                    <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input 
                            type="checkbox" 
                            id="showCells" 
                            checked 
                            onchange="updateVisualization()"
                            class="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                        >
                        Show Cell Outlines
                    </label>
                    <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input 
                            type="checkbox" 
                            id="showCentroids" 
                            checked 
                            onchange="updateVisualization()"
                            class="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                        >
                        Show Centroids
                    </label>
                </div>
            </div>
            <div class="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800">
                <h4 class="text-base font-semibold text-gray-800 dark:text-white/90 mb-2">Cell Statistics</h4>
                <div class="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                    <p>Total cells detected: <span class="font-semibold text-gray-800 dark:text-white/90">${data.total_cells}</span></p>
                    <p>Tiles processed: <span class="font-semibold text-gray-800 dark:text-white/90">${data.tiles_processed || 0} / ${data.tiles_total || data.tiles_processed || 0}</span></p>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
        
        // Store visualization data globally for canvas rendering
        visualizationData = data;
        window.visualizationData = data; // Also store on window for backward compatibility
        
        // Draw visualization
        setTimeout(() => {
            drawVisualization(data);
        }, 100);
    } else {
        html += `
            <div class="text-center py-12 text-gray-500 dark:text-gray-400">
                <p>No cells detected in this job.</p>
            </div>
        `;
        container.innerHTML = html;
    }
}

export function drawVisualization(data) {
    const canvas = document.getElementById('visualizationCanvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Scale factor to fit cells in canvas
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    data.cells.forEach(cell => {
        if (cell.polygon && cell.polygon.length > 0) {
            cell.polygon.forEach(point => {
                minX = Math.min(minX, point[0]);
                minY = Math.min(minY, point[1]);
                maxX = Math.max(maxX, point[0]);
                maxY = Math.max(maxY, point[1]);
            });
        }
    });
    
    if (minX === Infinity) return; // No valid cells
    
    const scaleX = (canvas.width - 40) / (maxX - minX || 1);
    const scaleY = (canvas.height - 40) / (maxY - minY || 1);
    const scale = Math.min(scaleX, scaleY, 1);
    
    const offsetX = (canvas.width - (maxX - minX) * scale) / 2 - minX * scale;
    const offsetY = (canvas.height - (maxY - minY) * scale) / 2 - minY * scale;
    
    // Draw cells
    data.cells.forEach((cell, index) => {
        if (cell.polygon && cell.polygon.length > 0) {
            ctx.beginPath();
            ctx.strokeStyle = `hsl(${(index * 137.5) % 360}, 70%, 50%)`;
            ctx.fillStyle = `hsla(${(index * 137.5) % 360}, 70%, 50%, 0.2)`;
            ctx.lineWidth = 2;
            
            cell.polygon.forEach((point, i) => {
                const x = point[0] * scale + offsetX;
                const y = point[1] * scale + offsetY;
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            ctx.closePath();
            ctx.fill();
            
            if (document.getElementById('showCells')?.checked) {
                ctx.stroke();
            }
            
            // Draw centroid
            if (cell.centroid && document.getElementById('showCentroids')?.checked) {
                ctx.fillStyle = 'red';
                ctx.beginPath();
                ctx.arc(
                    cell.centroid[0] * scale + offsetX,
                    cell.centroid[1] * scale + offsetY,
                    3, 0, 2 * Math.PI
                );
                ctx.fill();
            }
        }
    });
}

export function updateVisualization() {
    if (visualizationData || window.visualizationData) {
        drawVisualization(visualizationData || window.visualizationData);
    }
}

// Make functions available globally for onclick handlers
window.loadVisualization = loadVisualization;
window.updateVisualization = updateVisualization;
window.loadVisualizationJobList = loadVisualizationJobList;

