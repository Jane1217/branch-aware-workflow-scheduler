// API base URL
const API_BASE = 'http://localhost:8000/api';
let userId = 'user-1';
let wsConnection = null;
let autoRefreshInterval = null;

// Available images (will be loaded from server)
const AVAILABLE_IMAGES = [
    { 
        name: 'CMU-1-Small-Region.svs', 
        path: 'Aperio SVS/CMU-1-Small-Region.svs', 
        description: '⚠️ Small region - May have few/no cells (2MB) - Good for quick testing',
        recommended: false
    },
    { 
        name: 'CMU-1.svs', 
        path: 'Aperio SVS/CMU-1.svs', 
        description: '✅ RECOMMENDED: Full slide with good cell density (169MB) - Best for Cell Segmentation',
        recommended: true
    },
    { 
        name: 'CMU-2.svs', 
        path: 'Aperio SVS/CMU-2.svs', 
        description: '✅ RECOMMENDED: Large full slide (373MB) - Excellent for Cell Segmentation',
        recommended: true
    },
    { 
        name: 'CMU-3.svs', 
        path: 'Aperio SVS/CMU-3.svs', 
        description: '✅ RECOMMENDED: Medium full slide (242MB) - Good for Cell Segmentation',
        recommended: true
    },
    { 
        name: 'CMU-1-JP2K-33005.svs', 
        path: 'Aperio SVS/CMU-1-JP2K-33005.svs', 
        description: 'Full slide JPEG2000 format (126MB) - Good for Cell Segmentation',
        recommended: true
    },
    { 
        name: 'JP2K-33003-1.svs', 
        path: 'Aperio SVS/JP2K-33003-1.svs', 
        description: 'JPEG2000 format (63MB) - Medium size',
        recommended: false
    },
    { 
        name: 'JP2K-33003-2.svs', 
        path: 'Aperio SVS/JP2K-33003-2.svs', 
        description: 'JPEG2000 format (289MB) - Large size',
        recommended: false
    }
];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('workflowForm').addEventListener('submit', handleSubmitWorkflow);
    document.getElementById('autoRefresh').addEventListener('change', toggleAutoRefresh);
    
    // Load initial data
    loadWorkflows();
    updateAvailableImages();
    
    // Start auto-refresh if enabled
    if (document.getElementById('autoRefresh').checked) {
        startAutoRefresh();
    }
    
    // Don't auto-connect WebSocket - user must click Connect button
});

function showTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    // Show selected tab
    document.getElementById(tabName + 'Tab').classList.add('active');
    event.target.classList.add('active');
    
    // Load data if needed
    if (tabName === 'workflows') {
        loadWorkflows();
    }
}

function toggleAutoRefresh() {
    if (document.getElementById('autoRefresh').checked) {
        startAutoRefresh();
    } else {
        stopAutoRefresh();
    }
}

function startAutoRefresh() {
    if (autoRefreshInterval) return;
    
    // Use longer interval when WebSocket is connected (WebSocket provides real-time updates)
    // Use shorter interval as fallback when WebSocket is disconnected
    const refreshInterval = (wsConnection && wsConnection.readyState === WebSocket.OPEN) 
        ? 3000  // 3 seconds when WebSocket is active (WebSocket handles real-time updates)
        : 2000;  // 2 seconds when WebSocket is disconnected (fallback polling)
    
    autoRefreshInterval = setInterval(() => {
        if (document.getElementById('workflowsTab').classList.contains('active')) {
            loadWorkflows();
        }
    }, refreshInterval);
    
    // Re-adjust interval if WebSocket connection status changes
    const checkInterval = setInterval(() => {
        const newInterval = (wsConnection && wsConnection.readyState === WebSocket.OPEN) ? 3000 : 2000;
        if (autoRefreshInterval) {
            stopAutoRefresh();
            startAutoRefresh(); // Restart with new interval
        }
    }, 8000); // Check every 8 seconds
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

function connectWebSocket() {
    userId = document.getElementById('userId').value;
    if (!userId) {
        showNotification('Please enter a User ID first', 'warning');
        return;
    }

    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.close();
    }

    const wsUrl = `ws://localhost:8000/api/progress/ws/${userId}`;
    wsConnection = new WebSocket(wsUrl);

    wsConnection.onopen = () => {
        console.log('WebSocket connected');
        document.getElementById('wsStatus').textContent = '🟢';
        document.getElementById('connectBtn').classList.add('connected');
        showNotification('Connected to real-time updates', 'success');
    };

    wsConnection.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'job_progress' || data.type === 'workflow_progress') {
            // Immediately refresh workflows to show updated progress (no delay)
            loadWorkflows();
            
            // Show notification for significant progress updates
            if (data.progress >= 1.0) {
                showNotification(`Workflow completed!`, 'success');
            } else if (data.progress > 0 && data.progress < 1.0) {
                // Show progress updates for running jobs (optional, can be removed if too noisy)
                // Only show every 10% to avoid spam
                if (Math.floor(data.progress * 10) % 1 === 0) {
                    // Silent update, just refresh UI
                }
            }
        } else if (data.type === 'pong') {
            // Keep-alive response
        }
    };

    wsConnection.onerror = (error) => {
        console.error('WebSocket error:', error);
        document.getElementById('wsStatus').textContent = '🔴';
        document.getElementById('connectBtn').classList.remove('connected');
    };

    wsConnection.onclose = () => {
        console.log('WebSocket disconnected');
        document.getElementById('wsStatus').textContent = '🔌';
        document.getElementById('connectBtn').classList.remove('connected');
    };
}

function updateAvailableImages() {
    const list = document.getElementById('availableImages');
    if (!list) return;
    
    list.innerHTML = AVAILABLE_IMAGES.map(img => 
        `<li><strong>${img.name}</strong> - ${img.description}</li>`
    ).join('');
}

function addJob() {
    const jobsList = document.getElementById('jobsList');
    const noJobsMessage = document.getElementById('noJobsMessage');
    const jobIndex = jobsList.children.length;
    
    // Hide "no jobs" message
    if (noJobsMessage) noJobsMessage.style.display = 'none';
    
    const jobDiv = document.createElement('div');
    jobDiv.className = 'job-item';
    jobDiv.innerHTML = `
        <div class="job-header">
            <h4>Job ${jobIndex + 1}</h4>
            <button type="button" class="btn-icon danger" onclick="this.closest('.job-item').remove(); checkJobsList()" title="Remove this job">
                ✕
            </button>
        </div>
        
        <div class="form-row">
            <div class="form-group">
                <label>
                    Job ID <span class="help-icon" title="Leave empty for auto-generated ID">ℹ️</span>
                </label>
                <input type="text" name="job_id_${jobIndex}" placeholder="Auto: job-${jobIndex + 1}">
            </div>
            
            <div class="form-group">
                <label>
                    Job Type <span class="required">*</span>
                    <span class="help-icon" title="Cell Segmentation: Detects cells. Tissue Mask: Creates tissue region mask">ℹ️</span>
                </label>
                <select name="job_type_${jobIndex}" required>
                    <option value="">-- Select Type --</option>
                    <option value="cell_segmentation">Cell Segmentation</option>
                    <option value="tissue_mask">Tissue Mask</option>
                </select>
            </div>
        </div>
        
        <div class="form-group">
            <label>
                Image File <span class="required">*</span>
                <span class="help-icon" title="Select an image file to process">ℹ️</span>
            </label>
            <select name="image_path_${jobIndex}" class="image-selector" required>
                <option value="">-- Select Image --</option>
                ${AVAILABLE_IMAGES.map(img => 
                    `<option value="${img.path}" ${img.recommended ? 'data-recommended="true"' : ''}>${img.name} - ${img.description}</option>`
                ).join('')}
            </select>
            <small class="help-text">Or enter custom path: <input type="text" name="image_path_custom_${jobIndex}" placeholder="Custom path..." style="width: 200px; margin-top: 5px;"></small>
        </div>
        
        <div class="form-row">
            <div class="form-group">
                <label>
                    Branch <span class="required">*</span>
                    <span class="help-icon" title="Jobs in same branch run sequentially. Different branches run in parallel.">ℹ️</span>
                </label>
                <input type="text" name="branch_${jobIndex}" placeholder="e.g., branch-1" required>
            </div>
            
            <div class="form-group">
                <label>
                    Depends On
                    <span class="help-icon" title="Comma-separated job IDs that must complete first (e.g., job-1,job-2)">ℹ️</span>
                </label>
                <input type="text" name="depends_on_${jobIndex}" placeholder="job-1, job-2 (optional)">
            </div>
        </div>
    `;
    
    jobsList.appendChild(jobDiv);
    
    // Handle custom image path
    const customInput = jobDiv.querySelector(`input[name="image_path_custom_${jobIndex}"]`);
    const selectInput = jobDiv.querySelector(`select[name="image_path_${jobIndex}"]`);
    customInput.addEventListener('input', (e) => {
        if (e.target.value) {
            selectInput.value = e.target.value;
        }
    });
}

function checkJobsList() {
    const jobsList = document.getElementById('jobsList');
    const noJobsMessage = document.getElementById('noJobsMessage');
    if (jobsList.children.length === 0 && noJobsMessage) {
        noJobsMessage.style.display = 'block';
    }
}

function resetForm() {
    if (confirm('Are you sure you want to reset the form? All entered data will be lost.')) {
        document.getElementById('workflowForm').reset();
        document.getElementById('jobsList').innerHTML = '';
        checkJobsList();
        
        // Reset submit button state
        const submitBtn = document.getElementById('submitBtn');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '🚀 Submit Workflow';
        }
    }
}

async function handleSubmitWorkflow(e) {
    e.preventDefault();
    userId = document.getElementById('userId').value;
    
    if (!userId) {
        showNotification('Please enter a User ID', 'error');
        return;
    }

    const formData = new FormData(e.target);
    const workflowName = document.getElementById('workflowName').value;
    
    // Collect jobs
    const jobs = [];
    const jobCount = document.getElementById('jobsList').children.length;
    
    if (jobCount === 0) {
        showNotification('Please add at least one job to the workflow', 'error');
        return;
    }
    
    for (let i = 0; i < jobCount; i++) {
        const jobId = formData.get(`job_id_${i}`) || `job-${i + 1}`;
        const jobType = formData.get(`job_type_${i}`);
        let imagePath = formData.get(`image_path_${i}`);
        const customPath = formData.get(`image_path_custom_${i}`);
        const branch = formData.get(`branch_${i}`);
        const dependsOnStr = formData.get(`depends_on_${i}`) || '';
        const dependsOn = dependsOnStr ? dependsOnStr.split(',').map(s => s.trim()).filter(s => s) : [];
        
        // Use custom path if provided
        if (customPath) {
            imagePath = customPath;
        }
        
        if (!jobType || !imagePath || !branch) {
            showNotification(`Job ${i + 1} is missing required fields`, 'error');
            return;
        }
        
        jobs.push({
            job_id: jobId,
            job_type: jobType,
            image_path: imagePath,
            branch: branch,
            depends_on: dependsOn
        });
    }

    const workflowData = {
        name: workflowName,
        jobs: jobs
    };

    // Disable submit button
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Submitting...';

    try {
        const response = await fetch(`${API_BASE}/workflows`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': userId
            },
            body: JSON.stringify(workflowData)
        });

        if (response.ok) {
            const workflow = await response.json();
            showNotification(`Workflow "${workflowName}" created successfully!`, 'success');
            
            // Reset form and button state immediately
            e.target.reset();
            document.getElementById('jobsList').innerHTML = '';
            checkJobsList();
            submitBtn.disabled = false;
            submitBtn.textContent = '🚀 Submit Workflow';
            
            // Switch to workflows tab and immediately refresh
            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            document.getElementById('workflowsTab').classList.add('active');
            const workflowsTabBtn = document.querySelector('.tab-btn[onclick*="workflows"]');
            if (workflowsTabBtn) {
                workflowsTabBtn.classList.add('active');
            }
            
            // Immediately load workflows to show the new one
            await loadWorkflows();
            
            // Ensure auto-refresh is enabled and start it
            const autoRefreshCheckbox = document.getElementById('autoRefresh');
            if (autoRefreshCheckbox) {
                autoRefreshCheckbox.checked = true;
                startAutoRefresh();
            }
        } else {
            const error = await response.json();
            showNotification(`Error: ${error.detail || 'Failed to create workflow'}`, 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = '🚀 Submit Workflow';
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Failed to create workflow. Check console for details.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = '🚀 Submit Workflow';
    }
}

async function loadWorkflows() {
    userId = document.getElementById('userId').value;
    if (!userId) {
        document.getElementById('workflowsList').innerHTML = '<div class="empty-state"><p>Please enter a User ID to view workflows</p></div>';
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/workflows`, {
            headers: {
                'X-User-ID': userId
            }
        });

        if (response.ok) {
            const workflows = await response.json();
            displayWorkflows(workflows);
        } else {
            document.getElementById('workflowsList').innerHTML = '<div class="empty-state"><p>Error loading workflows</p></div>';
        }
    } catch (error) {
        console.error('Error loading workflows:', error);
        document.getElementById('workflowsList').innerHTML = '<div class="empty-state"><p>Failed to load workflows</p></div>';
    }
}

function displayWorkflows(workflows) {
    const workflowsList = document.getElementById('workflowsList');
    
    if (workflows.length === 0) {
        workflowsList.innerHTML = `
            <div class="empty-state">
                <p>📭 No workflows yet</p>
                <p>Create your first workflow in the "Create Workflow" tab!</p>
            </div>
        `;
        return;
    }

    // Save current open/closed state of View Jobs sections before refreshing
    const openSections = new Set();
    workflows.forEach(workflow => {
        const detailsId = `jobs-${workflow.workflow_id}`;
        const details = document.getElementById(detailsId);
        if (details && details.style.display !== 'none') {
            openSections.add(workflow.workflow_id);
        }
    });

    workflowsList.innerHTML = workflows.map(workflow => {
        const statusClass = workflow.status.toLowerCase();
        const progressPercent = (workflow.progress * 100).toFixed(1);
        
        return `
        <div class="workflow-card" data-workflow-id="${workflow.workflow_id}">
            <div class="workflow-card-header">
                <div class="workflow-title-section">
                    <h3>${escapeHtml(workflow.name)}</h3>
                    <span class="workflow-id">ID: ${workflow.workflow_id.substring(0, 8)}...</span>
                </div>
                <div class="workflow-actions">
                    <span class="status-badge status-${statusClass}">${workflow.status}</span>
                </div>
            </div>
            
            <div class="workflow-stats">
                <div class="stat-item">
                    <span class="stat-label">Jobs:</span>
                    <span class="stat-value">${workflow.jobs_completed} / ${workflow.job_count}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Progress:</span>
                    <span class="stat-value">${progressPercent}%</span>
                </div>
                ${workflow.started_at ? `
                <div class="stat-item">
                    <span class="stat-label">Started:</span>
                    <span class="stat-value">${formatTime(workflow.started_at)}</span>
                </div>
                ` : ''}
            </div>
            
            <div class="progress-container">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progressPercent}%"></div>
                </div>
                <div class="progress-info">
                    <span class="progress-text">${progressPercent}%</span>
                    ${workflow.jobs.length > 0 && workflow.jobs[0].elapsed_time_seconds !== null && workflow.jobs[0].elapsed_time_seconds !== undefined ? `
                        <span class="progress-time">${formatDuration(workflow.jobs[0].elapsed_time_seconds)}</span>
                    ` : ''}
                    ${workflow.jobs.length > 0 && workflow.jobs[0].estimated_remaining_seconds !== null && workflow.jobs[0].estimated_remaining_seconds !== undefined ? `
                        <span class="progress-eta">ETA: ${formatDuration(workflow.jobs[0].estimated_remaining_seconds)}</span>
                    ` : ''}
                </div>
            </div>
            
            <div class="workflow-jobs">
                <button class="btn-toggle" onclick="toggleJobs(this, '${workflow.workflow_id}')">
                    <span class="toggle-icon">${openSections.has(workflow.workflow_id) ? '▲' : '▼'}</span> View Jobs (${workflow.jobs.length})
                </button>
                <div class="jobs-details" id="jobs-${workflow.workflow_id}" style="display: ${openSections.has(workflow.workflow_id) ? 'block' : 'none'};">
                    ${workflow.jobs.map(job => `
                        <div class="job-detail-item">
                            <div class="job-detail-header">
                                <span class="job-id">${escapeHtml(job.job_id)}</span>
                                <span class="job-type-badge">${job.job_type.replace('_', ' ')}</span>
                                <span class="status-badge status-${job.status.toLowerCase()}">${job.status}</span>
                            </div>
                            <div class="job-detail-info">
                                <div class="job-progress">
                                    <span>Progress: ${(job.progress * 100).toFixed(1)}%</span>
                                    ${job.tiles_total > 0 ? `<span class="tiles-info">Tiles: ${job.tiles_processed || 0} / ${job.tiles_total}</span>` : ''}
                                    ${job.elapsed_time_seconds !== null && job.elapsed_time_seconds !== undefined ? `
                                        <span class="time-info">Elapsed: ${formatDuration(job.elapsed_time_seconds)}</span>
                                    ` : ''}
                                    ${job.estimated_remaining_seconds !== null && job.estimated_remaining_seconds !== undefined ? `
                                        <span class="eta-info">ETA: ${formatDuration(job.estimated_remaining_seconds)}</span>
                                    ` : ''}
                                </div>
                                <div class="job-actions">
                                    ${job.status === 'SUCCEEDED' ? `
                                        <button class="btn-small primary" onclick="viewJobResults('${job.job_id}')">View Results</button>
                                    ` : ''}
                                    ${job.status === 'FAILED' && job.error_message ? `
                                        <span class="error-message" title="${escapeHtml(job.error_message)}">⚠️ Error</span>
                                    ` : ''}
                                </div>
                            </div>
                            ${job.branch ? `<div class="job-branch">Branch: ${escapeHtml(job.branch)}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
        `;
    }).join('');
    
    // Restore open/closed state after rendering
    workflows.forEach(workflow => {
        const detailsId = `jobs-${workflow.workflow_id}`;
        const details = document.getElementById(detailsId);
        const button = details?.previousElementSibling;
        if (details && button && openSections.has(workflow.workflow_id)) {
            details.style.display = 'block';
            const icon = button.querySelector('.toggle-icon');
            if (icon) icon.textContent = '▲';
        }
    });
}

function toggleJobs(button, workflowId) {
    const details = document.getElementById(`jobs-${workflowId}`);
    const icon = button.querySelector('.toggle-icon');
    
    if (details.style.display === 'none') {
        details.style.display = 'block';
        icon.textContent = '▲';
    } else {
        details.style.display = 'none';
        icon.textContent = '▼';
    }
}


async function viewJobResults(jobId) {
    userId = document.getElementById('userId').value;
    if (!userId) {
        showNotification('Please enter a User ID', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/jobs/${jobId}/results`, {
            headers: {
                'X-User-ID': userId
            }
        });

        if (response.ok) {
            const data = await response.json();
            showJobResultsModal(data);
        } else {
            const error = await response.json();
            showNotification(`Error: ${error.detail || 'Failed to load results'}`, 'error');
        }
    } catch (error) {
        console.error('Error loading job results:', error);
        showNotification('Failed to load job results', 'error');
    }
}

function showJobResultsModal(data) {
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Job Results: ${escapeHtml(data.job_id)}</h3>
                <button class="btn-icon" onclick="this.closest('.modal').remove()">✕</button>
            </div>
            <div class="modal-body">
                ${formatJobResults(data)}
            </div>
            <div class="modal-footer">
                <button class="btn-primary" onclick="this.closest('.modal').remove()">Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'flex';
}

function formatJobResults(data) {
    let html = '';
    
    if (data.results) {
        if (data.results.cells && Array.isArray(data.results.cells)) {
            const totalCells = data.results.total_cells || data.results.cells.length;
            html += `
                <div class="results-summary">
                    <div class="result-stat">
                        <strong>Total Cells Detected:</strong> ${totalCells}
                    </div>
                    <div class="result-stat">
                        <strong>Processing Method:</strong> ${data.results.method || 'unknown'}
                    </div>
                    ${data.results.tiles_processed ? `
                    <div class="result-stat">
                        <strong>Tiles Processed:</strong> ${data.results.tiles_processed}
                    </div>
                    ` : ''}
                </div>
            `;
            
            // Add validation message if no cells detected
            if (totalCells === 0) {
                html += `
                    <div class="result-warning" style="background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 8px; margin: 15px 0;">
                        <strong>⚠️ No cells detected</strong>
                        <p style="margin-top: 10px; color: #856404;">
                            This could mean:
                            <ul style="margin-left: 20px; margin-top: 5px;">
                                <li>The image region may not contain visible cells (e.g., background, empty tissue area)</li>
                                <li>The image may be too small or low resolution</li>
                                <li>The image format may not be fully supported</li>
                            </ul>
                            <strong>Recommendation:</strong> Try using a full slide image (CMU-1.svs, CMU-2.svs, or CMU-3.svs) 
                            which typically contain more tissue regions with cells.
                        </p>
                    </div>
                `;
            } else {
                html += `
                    <div class="result-success" style="background: #d4edda; border: 1px solid #28a745; padding: 15px; border-radius: 8px; margin: 15px 0;">
                        <strong>✅ Successfully detected ${totalCells} cell(s)</strong>
                        <p style="margin-top: 10px; color: #155724;">
                            The segmentation completed successfully. Each cell has been identified with its polygon coordinates.
                        </p>
                    </div>
                `;
            }
            
            if (data.results.cells.length > 0) {
                const sampleCells = data.results.cells.slice(0, 5);
                html += `
                    <details class="results-details">
                        <summary>Sample Cells (showing first 5 of ${data.results.cells.length})</summary>
                        <pre class="results-json">${JSON.stringify(sampleCells, null, 2)}</pre>
                    </details>
                `;
            }
            
            if (data.result_path) {
                html += `
                    <div class="results-download">
                        <a href="${data.result_path}" download class="btn-primary">
                            📥 Download Full Results (JSON)
                        </a>
                    </div>
                `;
            }
        } else {
            html += `<p>Results available at: ${escapeHtml(data.result_path || 'N/A')}</p>`;
            html += `<pre class="results-json">${JSON.stringify(data.results, null, 2)}</pre>`;
        }
    } else {
        html += `<p class="no-results">No results data available</p>`;
    }
    
    if (data.metadata) {
        html += `
            <details class="results-details">
                <summary>Metadata</summary>
                <pre class="results-json">${JSON.stringify(data.metadata, null, 2)}</pre>
            </details>
        `;
    }
    
    return html;
}

function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Show notification
    setTimeout(() => notification.classList.add('show'), 10);
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString();
}

function formatDuration(seconds) {
    if (seconds === null || seconds === undefined || isNaN(seconds)) return 'N/A';
    if (seconds < 60) {
        return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        return `${mins}m ${secs}s`;
    } else {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${mins}m`;
    }
}
