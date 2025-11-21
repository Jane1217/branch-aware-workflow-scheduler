// API base URL
const API_BASE = 'http://localhost:8000/api';
let userId = 'user-1';
let wsConnection = null;
let autoRefreshInterval = null;
let autoRefreshCheckInterval = null; // Track the WebSocket status check interval
let currentRefreshInterval = null; // Track the current refresh interval value

// Available images (will be loaded from server)
const AVAILABLE_IMAGES = [
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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Set custom validation messages in English
    const workflowForm = document.getElementById('workflowForm');
    const workflowNameInput = document.getElementById('workflowName');
    
    if (workflowNameInput) {
        workflowNameInput.addEventListener('invalid', (e) => {
            if (e.target.validity.valueMissing) {
                e.target.setCustomValidity('Workflow name is required');
            } else {
                e.target.setCustomValidity('');
            }
        });
        
        workflowNameInput.addEventListener('input', (e) => {
            e.target.setCustomValidity('');
        });
    }
    
    workflowForm.addEventListener('submit', handleSubmitWorkflow);
    
    // Load initial data
    loadWorkflows();
    updateAvailableImages();
    
    // Start auto-refresh automatically
    startAutoRefresh();
    
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
    } else if (tabName === 'visualization') {
        loadVisualizationJobList();
    } else if (tabName === 'monitoring') {
        loadMonitoringData();
    }
}

function startAutoRefresh() {
    if (autoRefreshInterval) return;
    
    // Use longer interval when WebSocket is connected (WebSocket provides real-time updates)
    // Use shorter interval as fallback when WebSocket is disconnected
    const refreshInterval = (wsConnection && wsConnection.readyState === WebSocket.OPEN) 
        ? 3000  // 3 seconds when WebSocket is active (WebSocket handles real-time updates)
        : 2000;  // 2 seconds when WebSocket is disconnected (fallback polling)
    
    currentRefreshInterval = refreshInterval; // Save current interval
    autoRefreshInterval = setInterval(async () => {
        // Check if auto-refresh was stopped (e.g., by loadWorkflows detecting completion)
        if (!autoRefreshInterval) return;
        
        if (document.getElementById('workflowsTab').classList.contains('active')) {
            await loadWorkflows(); // loadWorkflows now checks if all workflows are completed and stops auto-refresh
        }
    }, refreshInterval);
    
    // Also check immediately if workflows are already completed
    // This handles the case where user opens the page after workflows are done
    setTimeout(async () => {
        // Check if auto-refresh was stopped before this timeout fires
        if (!autoRefreshInterval) return;
        
        if (document.getElementById('workflowsTab').classList.contains('active')) {
            await loadWorkflows();
            // After loadWorkflows, check if it stopped auto-refresh
            if (!autoRefreshInterval) return;
        }
    }, 100);
    
    // Re-adjust interval if WebSocket connection status changes
    // Only create one check interval, and clear it when stopping
    if (!autoRefreshCheckInterval) {
        autoRefreshCheckInterval = setInterval(() => {
            if (autoRefreshInterval) {
                const newInterval = (wsConnection && wsConnection.readyState === WebSocket.OPEN) ? 3000 : 2000;
                // Only restart if interval actually changed
                if (newInterval !== currentRefreshInterval) {
                    stopAutoRefresh();
                    startAutoRefresh(); // Restart with new interval based on WebSocket status
                }
            }
        }, 8000); // Check every 8 seconds
    }
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
    if (autoRefreshCheckInterval) {
        clearInterval(autoRefreshCheckInterval);
        autoRefreshCheckInterval = null;
    }
    currentRefreshInterval = null;
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
        document.getElementById('wsStatus').textContent = '🟢';
        document.getElementById('connectBtn').classList.add('connected');
        showNotification('Connected to real-time updates', 'success');
    };

    wsConnection.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'job_progress' || data.type === 'workflow_progress') {
            // Only refresh if auto-refresh is active (workflows are still running)
            // If auto-refresh is stopped, it means all workflows are completed
            if (autoRefreshInterval) {
                loadWorkflows();
            }
            
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
        document.getElementById('wsStatus').textContent = '🔴';
        document.getElementById('connectBtn').classList.remove('connected');
    };

    wsConnection.onclose = () => {
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
                    Job ID
                </label>
                <input type="text" name="job_id_${jobIndex}" placeholder="Auto: job-${jobIndex + 1}">
            </div>
            
            <div class="form-group">
                <label>
                    Job Type <span class="required">*</span>
                </label>
                <select name="job_type_${jobIndex}" required oninvalid="this.setCustomValidity('Job type is required')" oninput="this.setCustomValidity('')">
                    <option value="">-- Select Type --</option>
                    <option value="cell_segmentation">Cell Segmentation</option>
                    <option value="tissue_mask">Tissue Mask</option>
                </select>
            </div>
        </div>
        
        <div class="form-group">
            <label>
                Image File <span class="required">*</span>
            </label>
            <select name="image_path_${jobIndex}" class="image-selector" required oninvalid="this.setCustomValidity('Please select an image file')" oninput="this.setCustomValidity('')">
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
                </label>
                <input type="text" name="branch_${jobIndex}" placeholder="e.g., branch-1" required oninvalid="this.setCustomValidity('Branch is required')" oninput="this.setCustomValidity('')">
            </div>
            
            <div class="form-group">
                <label>
                    Depends On
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
            
            // Start auto-refresh
            startAutoRefresh();
        } else {
            const error = await response.json();
            showNotification(`Error: ${error.detail || 'Failed to create workflow'}`, 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = '🚀 Submit Workflow';
        }
    } catch (error) {
        showNotification('Failed to create workflow', 'error');
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
            
            // Check if all workflows are completed (SUCCEEDED or FAILED)
            // If all are completed, stop auto-refresh to avoid unnecessary GET requests
            if (workflows.length > 0) {
                const allCompleted = workflows.every(w => {
                    // Handle both enum objects and strings
                    const status = (w.status && typeof w.status === 'object' && w.status.value) 
                        ? w.status.value.toUpperCase() 
                        : String(w.status || '').toUpperCase();
                    return status === 'SUCCEEDED' || status === 'FAILED';
                });
                
                if (allCompleted) {
                    if (autoRefreshInterval) {
                        stopAutoRefresh();
                    }
                } else {
                    // If not all completed, ensure auto-refresh is running
                    if (!autoRefreshInterval) {
                        startAutoRefresh();
                    }
                }
            }
        } else {
            document.getElementById('workflowsList').innerHTML = '<div class="empty-state"><p>Error loading workflows</p></div>';
        }
    } catch (error) {
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
                <span class="progress-text">${progressPercent}%</span>
            </div>
            
            <div class="workflow-jobs">
                <button class="btn-toggle" onclick="toggleJobs(this, '${workflow.workflow_id}')">
                    <span class="toggle-icon">${openSections.has(workflow.workflow_id) ? '▲' : '▼'}</span> View Jobs (${workflow.jobs.length})
                </button>
                <div class="jobs-details" id="jobs-${workflow.workflow_id}" style="display: ${openSections.has(workflow.workflow_id) ? 'block' : 'none'};">
                    ${workflow.jobs.map(job => `
                        <div class="job-detail-item">
                            <div class="job-detail-header">
                                <span class="job-id">${escapeHtml(job.job_id.includes('_') ? job.job_id.split('_').pop() : job.job_id)}</span>
                                <span class="job-type-badge">${job.job_type.replace('_', ' ')}</span>
                                <span class="status-badge status-${job.status.toLowerCase()}">${job.status}</span>
                            </div>
                            <div class="job-detail-info">
                                <div class="job-progress">
                                    <span>Progress: ${(job.progress * 100).toFixed(1)}%</span>
                                    ${job.image_path ? `<span class="image-info">Image: ${escapeHtml(job.image_path.split('/').pop())}</span>` : ''}
                                    ${job.tiles_processed !== undefined && job.tiles_total !== undefined && job.tiles_total > 0 ? `
                                        <span class="tiles-info">Tiles: ${job.tiles_processed} / ${job.tiles_total}</span>
                                    ` : ''}
                                </div>
                                <div class="job-actions">
                                    ${(job.status === 'SUCCEEDED' || job.status?.toUpperCase() === 'SUCCEEDED') ? `
                                        <button class="btn-small primary" onclick="viewJobResults('${job.job_id}')">View Results</button>
                                    ` : ''}
                                    ${(job.status === 'PENDING' || job.status?.toUpperCase() === 'PENDING') ? `
                                        <button class="btn-small danger" onclick="cancelJob('${job.job_id}')">Cancel</button>
                                    ` : ''}
                                    ${(job.status === 'FAILED' || job.status?.toUpperCase() === 'FAILED') && job.error_message ? `
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


async function cancelJob(jobId) {
    userId = document.getElementById('userId').value;
    if (!userId) {
        showNotification('Please enter a User ID', 'error');
        return;
    }

    if (!confirm(`Are you sure you want to cancel job ${jobId}?`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/jobs/${jobId}`, {
            method: 'DELETE',
            headers: {
                'X-User-ID': userId
            }
        });

        if (response.ok) {
            showNotification('Job cancelled successfully', 'success');
            loadWorkflows(); // Refresh to show updated status
        } else {
            const error = await response.json();
            showNotification(`Error: ${error.detail || 'Failed to cancel job'}`, 'error');
        }
    } catch (error) {
        showNotification('Failed to cancel job', 'error');
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
                    ${data.results.tiles_processed !== undefined ? `
                    <div class="result-stat">
                        <strong>Tiles Processed:</strong> ${data.results.tiles_processed}${data.results.tiles_total ? ` / ${data.results.tiles_total}` : ''}
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

// Visualization functions
let autoMonitoringInterval = null;

async function loadVisualizationJobList() {
    userId = document.getElementById('userId').value;
    if (!userId) {
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
            const select = document.getElementById('visualizationJobId');
            if (!select) return;
            
            select.innerHTML = '<option value="">-- Select a completed job --</option>';
            
            workflows.forEach(workflow => {
                workflow.jobs.forEach(job => {
                    if (job.status === 'SUCCEEDED' && job.job_type === 'cell_segmentation') {
                        const option = document.createElement('option');
                        option.value = job.job_id;
                        option.textContent = `${job.job_id.split('_').pop()} - ${job.image_path.split('/').pop()}`;
                        select.appendChild(option);
                    }
                });
            });
        }
    } catch (error) {
        // Silent error handling
    }
}

async function loadVisualization() {
    const jobId = document.getElementById('visualizationJobId')?.value;
    if (!jobId) {
        showNotification('Please select a job', 'warning');
        return;
    }

    userId = document.getElementById('userId').value;
    if (!userId) {
        showNotification('Please enter a User ID', 'error');
        return;
    }

    const container = document.getElementById('visualizationContainer');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Loading visualization...</div>';

    try {
        const response = await fetch(`http://localhost:8000/api/visualization/${jobId}/visualization`, {
            headers: {
                'X-User-ID': userId
            }
        });

        if (response.ok) {
            const data = await response.json();
            displayVisualization(data);
        } else {
            const error = await response.json();
            container.innerHTML = `<div class="error">Error: ${error.detail || 'Failed to load visualization'}</div>`;
        }
    } catch (error) {
        container.innerHTML = `<div class="error">Failed to load visualization: ${error.message}</div>`;
    }
}

function displayVisualization(data) {
    const container = document.getElementById('visualizationContainer');
    if (!container) return;
    
    let html = `
        <div class="visualization-header">
            <h3>Job: ${escapeHtml(data.job_id.split('_').pop())}</h3>
            <p><strong>Image:</strong> ${escapeHtml(data.image_path.split('/').pop())}</p>
            <p><strong>Total Cells:</strong> ${data.total_cells}</p>
            <p><strong>Status:</strong> ${data.status}</p>
            <p><strong>Progress:</strong> ${(data.progress * 100).toFixed(1)}%</p>
        </div>
    `;

    if (data.cells && data.cells.length > 0) {
        html += `
            <div class="visualization-canvas-container">
                <canvas id="visualizationCanvas" width="800" height="600"></canvas>
                <div class="visualization-controls">
                    <label>
                        <input type="checkbox" id="showCells" checked onchange="updateVisualization()">
                        Show Cell Outlines
                    </label>
                    <label>
                        <input type="checkbox" id="showCentroids" checked onchange="updateVisualization()">
                        Show Centroids
                    </label>
                </div>
            </div>
            <div class="visualization-stats">
                <h4>Cell Statistics</h4>
                <p>Total cells detected: ${data.total_cells}</p>
                <p>Tiles processed: ${data.tiles_processed || 0} / ${data.tiles_total || data.tiles_processed || 0}</p>
            </div>
        `;
        
        container.innerHTML = html;
        
        // Store visualization data globally for canvas rendering
        window.visualizationData = data;
        
        // Draw visualization
        setTimeout(() => {
            drawVisualization(data);
        }, 100);
    } else {
        html += `
            <div class="visualization-placeholder">
                <p>No cells detected in this job.</p>
            </div>
        `;
        container.innerHTML = html;
    }
}

function drawVisualization(data) {
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

function updateVisualization() {
    if (window.visualizationData) {
        drawVisualization(window.visualizationData);
    }
}


// Monitoring functions
let latencyChart = null;
let queueChart = null;
let latencyData = [];
let queueData = [];

async function loadMonitoringData() {
    try {
        // Load both health and dashboard metrics
        const [healthResponse, metricsResponse] = await Promise.all([
            fetch('http://localhost:8000/health'),
            fetch('http://localhost:8000/api/metrics/dashboard')
        ]);
        
        if (healthResponse.ok) {
            const healthData = await healthResponse.json();
            displayMonitoringData(healthData);
        }
        
        if (metricsResponse.ok) {
            const metricsData = await metricsResponse.json();
            updateDashboardCharts(metricsData);
        } else {
            showNotification('Failed to load dashboard metrics', 'error');
        }
    } catch (error) {
        showNotification('Failed to load monitoring data', 'error');
    }
}

function displayMonitoringData(data) {
    const healthEl = document.getElementById('systemHealth');
    const workersEl = document.getElementById('activeWorkers');
    const queueEl = document.getElementById('queueDepth');
    const usersEl = document.getElementById('activeUsers');
    
    if (healthEl) {
        healthEl.innerHTML = `
            <div class="health-status ${data.status === 'healthy' ? 'healthy' : 'unhealthy'}">
                <span class="status-indicator">${data.status === 'healthy' ? '🟢' : '🔴'}</span>
                <span>${data.status.toUpperCase()}</span>
            </div>
        `;
    }
    
    if (workersEl) {
        workersEl.innerHTML = `
            <div class="metric-value">${data.running_jobs || 0}</div>
            <div class="metric-label">/ 10 max</div>
        `;
    }
    
    if (queueEl) {
        queueEl.innerHTML = `
            <div class="metric-value">${data.queue_depth || 0}</div>
            <div class="metric-label">jobs waiting</div>
        `;
    }
    
    if (usersEl) {
        usersEl.innerHTML = `
            <div class="metric-value">${data.active_users || 0}</div>
            <div class="metric-label">/ 3 max</div>
        `;
    }
}

function startAutoMonitoring() {
    if (autoMonitoringInterval) return;
    
    loadMonitoringData();
    autoMonitoringInterval = setInterval(() => {
        loadMonitoringData();
    }, 10000); // Refresh every 10 seconds
    
    showNotification('Auto-monitoring started (10s interval)', 'success');
}

function stopAutoMonitoring() {
    if (autoMonitoringInterval) {
        clearInterval(autoMonitoringInterval);
        autoMonitoringInterval = null;
        showNotification('Auto-monitoring stopped', 'info');
    }
}

function updateDashboardCharts(data) {
    const now = new Date();
    const timestamp = now.toLocaleTimeString();
    
    // Update latency chart
    if (data.job_latency) {
        const latencyMinutes = data.job_latency.average_minutes || 0;
        latencyData.push({
            time: timestamp,
            value: latencyMinutes
        });
        
        // Keep only last 20 data points
        if (latencyData.length > 20) {
            latencyData.shift();
        }
        
        updateLatencyChart();
    }
    
    // Update queue depth chart
    if (data.queue_depth && data.queue_depth.by_branch) {
        queueData = [];
        Object.keys(data.queue_depth.by_branch).forEach(branch => {
            const branchData = data.queue_depth.by_branch[branch];
            const totalDepth = Object.values(branchData).reduce((sum, val) => sum + val, 0);
            queueData.push({
                branch: branch,
                depth: totalDepth
            });
        });
        
        updateQueueChart();
    }
}

function updateLatencyChart() {
    const canvas = document.getElementById('latencyChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    if (latencyData.length === 0) {
        ctx.fillStyle = '#999';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No data yet', width / 2, height / 2);
        return;
    }
    
    // Find max value for scaling
    const maxValue = Math.max(...latencyData.map(d => d.value), 1);
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    // Draw axes
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();
    
    // Draw grid lines
    ctx.strokeStyle = '#eee';
    for (let i = 0; i <= 5; i++) {
        const y = padding + (chartHeight / 5) * i;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
    }
    
    // Draw line
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    latencyData.forEach((point, index) => {
        const x = padding + (chartWidth / (latencyData.length - 1 || 1)) * index;
        const y = height - padding - (point.value / maxValue) * chartHeight;
        
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();
    
    // Draw points
    ctx.fillStyle = '#667eea';
    latencyData.forEach((point, index) => {
        const x = padding + (chartWidth / (latencyData.length - 1 || 1)) * index;
        const y = height - padding - (point.value / maxValue) * chartHeight;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fill();
    });
    
    // Draw labels
    ctx.fillStyle = '#666';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('0', padding - 5, height - padding);
    ctx.fillText(maxValue.toFixed(1), padding - 5, padding + 5);
    ctx.fillText('min', padding - 5, padding / 2);
}

function updateQueueChart() {
    const canvas = document.getElementById('queueChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    if (queueData.length === 0) {
        ctx.fillStyle = '#999';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No queue data yet', width / 2, height / 2);
        return;
    }
    
    const maxDepth = Math.max(...queueData.map(d => d.depth), 1);
    const barWidth = (width - 60) / queueData.length;
    const padding = 40;
    
    // Draw axes
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();
    
    // Draw bars
    queueData.forEach((item, index) => {
        const barHeight = (item.depth / maxDepth) * (height - padding * 2);
        const x = padding + index * barWidth + 5;
        const y = height - padding - barHeight;
        
        // Bar
        ctx.fillStyle = `hsl(${(index * 60) % 360}, 70%, 50%)`;
        ctx.fillRect(x, y, barWidth - 10, barHeight);
        
        // Label
        ctx.fillStyle = '#666';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(item.branch, x + barWidth / 2 - 5, height - padding + 15);
        ctx.fillText(item.depth.toString(), x + barWidth / 2 - 5, y - 5);
    });
    
    // Y-axis label
    ctx.fillStyle = '#666';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Depth', padding - 5, padding / 2);
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
