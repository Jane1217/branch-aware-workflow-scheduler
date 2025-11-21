// Workflow list and display management
import { fetchWorkflows, cancelJob, fetchJobResults } from './api.js';
import { escapeHtml, formatTime, getJobStatus, getStatusBadgeClass } from './utils.js';
import { showNotification, showConfirmDialog } from './ui.js';
import { stopAutoRefresh, startAutoRefresh, isAutoRefreshActive } from './refresh.js';

export async function loadWorkflows() {
    const userId = document.getElementById('userId')?.value;
    if (!userId) {
        const workflowsList = document.getElementById('workflowsList');
        if (workflowsList) {
            workflowsList.innerHTML = '<div class="text-center py-12 text-gray-500 dark:text-gray-400"><p>Please enter a User ID to view workflows</p></div>';
        }
        return;
    }

    try {
        const workflows = await fetchWorkflows();
        displayWorkflows(workflows);
        
        // Check if there are any jobs in RUNNING status
        // Auto-refresh should only run when there are running jobs
        let hasRunningJob = false;
        
        if (workflows.length > 0) {
            for (const workflow of workflows) {
                if (workflow.jobs && workflow.jobs.length > 0) {
                    for (const job of workflow.jobs) {
                        // Handle job status (can be object or string)
                        let jobStatus = '';
                        if (job.status) {
                            if (typeof job.status === 'object' && job.status.value) {
                                jobStatus = String(job.status.value).toUpperCase();
                            } else {
                                jobStatus = String(job.status).toUpperCase();
                            }
                        }
                        
                        if (jobStatus === 'RUNNING') {
                            hasRunningJob = true;
                            break;
                        }
                    }
                    if (hasRunningJob) break;
                }
            }
        }
        
        // Manage auto-refresh based on running jobs
        if (hasRunningJob) {
            // If there are running jobs, ensure auto-refresh is active
                    if (!isAutoRefreshActive()) {
                        startAutoRefresh();
                }
        } else {
            // If no running jobs, stop auto-refresh
            if (isAutoRefreshActive()) {
                stopAutoRefresh();
            }
        }
    } catch (error) {
        const workflowsList = document.getElementById('workflowsList');
        if (workflowsList) {
            workflowsList.innerHTML = '<div class="text-center py-12 text-gray-500 dark:text-gray-400"><p>Failed to load workflows</p></div>';
        }
    }
}

export function displayWorkflows(workflows) {
    const workflowsList = document.getElementById('workflowsList');
    if (!workflowsList) return;
    
    if (workflows.length === 0) {
        workflowsList.innerHTML = `
            <div class="text-center py-12 text-gray-500 dark:text-gray-400">
                <p class="text-lg mb-2">No workflows yet</p>
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

    // Update scheduler metrics from workflows
    updateSchedulerMetrics(workflows);

    workflowsList.innerHTML = workflows.map(workflow => {
        const statusClass = workflow.status.toLowerCase();
        const progressPercent = (workflow.progress * 100).toFixed(1);
        const statusBadgeClass = getStatusBadgeClass(statusClass);
        
        return `
        <div class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6" data-workflow-id="${workflow.workflow_id}">
            <div class="flex items-start justify-between mb-4">
                <div>
                    <h3 class="text-lg font-semibold text-gray-800 dark:text-white/90 mb-1">
                        ${escapeHtml(workflow.name)}
                    </h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        ID: ${workflow.workflow_id.substring(0, 8)}...
                    </p>
                </div>
                <span class="${statusBadgeClass}">${workflow.status}</span>
            </div>
            
            <div class="grid grid-cols-3 gap-4 mb-4">
                <div>
                    <span class="text-sm text-gray-500 dark:text-gray-400">Jobs</span>
                    <p class="text-lg font-semibold text-gray-800 dark:text-white/90">
                        ${workflow.jobs_completed} / ${workflow.job_count}
                    </p>
                </div>
                <div>
                    <span class="text-sm text-gray-500 dark:text-gray-400">Progress</span>
                    <p class="text-lg font-semibold text-gray-800 dark:text-white/90">
                        ${progressPercent}%
                    </p>
                </div>
                ${workflow.started_at ? `
                <div>
                    <span class="text-sm text-gray-500 dark:text-gray-400">Started</span>
                    <p class="text-lg font-semibold text-gray-800 dark:text-white/90">
                        ${formatTime(workflow.started_at)}
                    </p>
                </div>
                ` : '<div></div>'}
            </div>
            
            <div class="mb-4">
                <div class="flex items-center justify-between mb-1">
                    <span class="text-sm text-gray-500 dark:text-gray-400">Progress</span>
                    <span class="text-sm font-medium text-gray-800 dark:text-white/90">${progressPercent}%</span>
                </div>
                <div class="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800">
                    <div class="h-2 rounded-full bg-brand-500" style="width: ${progressPercent}%"></div>
                </div>
            </div>
            
            <div>
                <button 
                    class="w-full flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                    onclick="toggleJobs(this, '${workflow.workflow_id}')"
                >
                    <span>View Jobs (${workflow.jobs.length})</span>
                                    <svg class="w-4 h-4 toggle-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${openSections.has(workflow.workflow_id) ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}" />
                                    </svg>
                </button>
                <div 
                    class="mt-4 space-y-3" 
                    id="jobs-${workflow.workflow_id}" 
                    style="display: ${openSections.has(workflow.workflow_id) ? 'block' : 'none'};"
                >
                    ${workflow.jobs.map(job => {
                        const jobStatus = getJobStatus(job);
                        const jobStatusBadgeClass = getStatusBadgeClass(jobStatus.value.toLowerCase());
                        
                        return `
                        <div class="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800">
                            <div class="flex items-center justify-between mb-3">
                                <div class="flex items-center gap-2">
                                    <span class="font-mono text-sm font-medium text-gray-800 dark:text-white/90">
                                        ${escapeHtml(job.job_id.includes('_') ? job.job_id.split('_').pop() : job.job_id)}
                                    </span>
                                    <span class="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                                        ${job.job_type.replace('_', ' ')}
                                    </span>
                                    <span class="${jobStatusBadgeClass}">${jobStatus.display}</span>
                                </div>
                            </div>
                            <div class="space-y-2 mb-3">
                                <div class="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                                    <span>Progress: ${(job.progress * 100).toFixed(1)}%</span>
                                    ${job.image_path ? `<span>Image: ${escapeHtml(job.image_path.split('/').pop())}</span>` : ''}
                                    ${job.tiles_processed !== undefined && job.tiles_total !== undefined && job.tiles_total > 0 ? `
                                        <span>Tiles: ${job.tiles_processed} / ${job.tiles_total}</span>
                                    ` : ''}
                                </div>
                                ${job.branch ? `<div class="text-xs text-gray-500 dark:text-gray-400">Branch: ${escapeHtml(job.branch)}</div>` : ''}
                            </div>
                            <div class="flex items-center gap-2">
                                ${jobStatus.value === 'SUCCEEDED' ? `
                                    <button 
                                        class="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600" 
                                        onclick="viewJobResults('${job.job_id}')"
                                    >
                                        View Results
                                    </button>
                                ` : ''}
                                ${jobStatus.value === 'PENDING' ? `
                                    <button 
                                        class="inline-flex items-center gap-2 rounded-lg border border-error-300 bg-error-50 px-3 py-1.5 text-xs font-medium text-error-600 hover:bg-error-100 dark:border-error-800 dark:bg-error-500/15 dark:text-error-500" 
                                        onclick="cancelJob('${job.job_id}')"
                                    >
                                        Cancel
                                    </button>
                                ` : ''}
                                ${jobStatus.value === 'FAILED' && job.error_message ? `
                                    <span class="text-xs text-error-600 dark:text-error-500" title="${escapeHtml(job.error_message)}">
                                        <svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        ${escapeHtml(job.error_message.substring(0, 50))}${job.error_message.length > 50 ? '...' : ''}
                                    </span>
                                ` : ''}
                            </div>
                        </div>
                    `;
                    }).join('')}
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
            if (icon) {
                icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />';
            }
        }
    });
}

export function updateSchedulerMetrics(workflows) {
    // Calculate metrics from workflows
    let totalRunningJobs = 0;
    let totalPendingJobs = 0;
    const activeUsers = new Set();
    
    workflows.forEach(workflow => {
        workflow.jobs.forEach(job => {
            const jobStatus = getJobStatus(job);
            if (jobStatus.value === 'RUNNING') {
                totalRunningJobs++;
            } else if (jobStatus.value === 'PENDING') {
                totalPendingJobs++;
            }
        });
        if (workflow.tenant_id) {
            activeUsers.add(workflow.tenant_id);
        }
    });
    
    // Update UI elements if they exist
    const activeUsersEl = document.getElementById('schedulerActiveUsers');
    const activeWorkersEl = document.getElementById('schedulerActiveWorkers');
    const queueDepthEl = document.getElementById('schedulerQueueDepth');
    
    if (activeUsersEl) activeUsersEl.textContent = activeUsers.size;
    if (activeWorkersEl) activeWorkersEl.textContent = totalRunningJobs;
    if (queueDepthEl) queueDepthEl.textContent = totalPendingJobs;
}

export function toggleJobs(button, workflowId) {
    const details = document.getElementById(`jobs-${workflowId}`);
    const icon = button.querySelector('.toggle-icon');
    
    if (details.style.display === 'none') {
        details.style.display = 'block';
        if (icon) {
            icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />';
        }
    } else {
        details.style.display = 'none';
        if (icon) {
            icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />';
        }
    }
}

export async function handleCancelJob(jobId) {
    showConfirmDialog(
        `Are you sure you want to cancel job ${jobId}?`,
        async () => {
            try {
                await cancelJob(jobId);
                showNotification('Job cancelled successfully', 'success');
                loadWorkflows(); // Refresh to show updated status
            } catch (error) {
                showNotification(`Error: ${error.message}`, 'error');
            }
        }
    );
}

export async function handleViewJobResults(jobId) {
    try {
        const data = await fetchJobResults(jobId);
        showJobResultsModal(data);
    } catch (error) {
        showNotification(`Error: ${error.message}`, 'error');
    }
}

function showJobResultsModal(data) {
    // Create modal with TailAdmin styling
    const modal = document.createElement('div');
    modal.className = 'fixed left-0 top-0 z-999999 flex h-screen w-screen items-center justify-center bg-gray-900/50 dark:bg-black/50';
    modal.innerHTML = `
        <div class="relative max-w-[800px] w-full mx-4 rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] max-h-[90vh] overflow-hidden flex flex-col">
            <div class="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white/90">Job Results: ${escapeHtml(data.job_id)}</h3>
                <button 
                    class="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                    onclick="this.closest('.fixed').remove()"
                >
                    <svg class="fill-current" width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M6.21967 7.28131C5.92678 6.98841 5.92678 6.51354 6.21967 6.22065C6.51256 5.92775 6.98744 5.92775 7.28033 6.22065L11.999 10.9393L16.7176 6.22078C17.0105 5.92789 17.4854 5.92788 17.7782 6.22078C18.0711 6.51367 18.0711 6.98855 17.7782 7.28144L13.0597 12L17.7782 16.7186C18.0711 17.0115 18.0711 17.4863 17.7782 17.7792C17.4854 18.0721 17.0105 18.0721 16.7176 17.7792L11.999 13.0607L7.28033 17.7794C6.98744 18.0722 6.51256 18.0722 6.21967 17.7794C5.92678 17.4865 5.92678 17.0116 6.21967 16.7187L10.9384 12L6.21967 7.28131Z" fill=""/>
                    </svg>
                </button>
            </div>
            <div class="px-5 py-4 overflow-y-auto flex-1">
                ${formatJobResults(data)}
            </div>
            <div class="flex items-center justify-end gap-3 border-t border-gray-100 px-5 py-4 dark:border-gray-800">
                <button 
                    class="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
                    onclick="this.closest('.fixed').remove()"
                >
                    Close
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

function formatJobResults(data) {
    let html = '';
    
    if (data.results) {
        if (data.results.cells && Array.isArray(data.results.cells)) {
            const totalCells = data.results.total_cells || data.results.cells.length;
            html += `
                <div class="space-y-4 mb-4">
                    <div class="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800">
                        <div class="space-y-2 text-sm">
                            <div><strong>Total Cells Detected:</strong> <span class="font-semibold">${totalCells}</span></div>
                            <div><strong>Processing Method:</strong> ${data.results.method || 'unknown'}</div>
                            ${data.results.tiles_processed !== undefined ? `
                            <div><strong>Tiles Processed:</strong> ${data.results.tiles_processed}${data.results.tiles_total ? ` / ${data.results.tiles_total}` : ''}</div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
            
            // Add validation message if no cells detected
            if (totalCells === 0) {
                html += `
                    <div class="rounded-lg border border-orange-200 bg-orange-50 p-4 mb-4 dark:border-orange-800 dark:bg-orange-500/15">
                        <strong class="text-orange-800 dark:text-orange-500">⚠️ No cells detected</strong>
                        <p class="mt-2 text-sm text-orange-700 dark:text-orange-400">
                            This could mean the image region may not contain visible cells, the image may be too small, or the format may not be fully supported.
                            <strong>Recommendation:</strong> Try using a full slide image (CMU-1.svs, CMU-2.svs, or CMU-3.svs).
                        </p>
                    </div>
                `;
            } else {
                html += `
                    <div class="rounded-lg border border-success-200 bg-success-50 p-4 mb-4 dark:border-success-800 dark:bg-success-500/15">
                        <strong class="text-success-800 dark:text-success-500">✅ Successfully detected ${totalCells} cell(s)</strong>
                        <p class="mt-2 text-sm text-success-700 dark:text-success-400">
                            The segmentation completed successfully. Each cell has been identified with its polygon coordinates.
                        </p>
                    </div>
                `;
            }
            
            if (data.results.cells.length > 0) {
                const sampleCells = data.results.cells.slice(0, 5);
                html += `
                    <details class="mt-4">
                        <summary class="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Sample Cells (showing first 5 of ${data.results.cells.length})
                        </summary>
                        <pre class="mt-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs overflow-x-auto">${JSON.stringify(sampleCells, null, 2)}</pre>
                    </details>
                `;
            }
            
            if (data.result_path) {
                html += `
                    <div class="mt-4">
                        <a href="${data.result_path}" download class="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600">
                            📥 Download Full Results (JSON)
                        </a>
                    </div>
                `;
            }
        } else {
            html += `<p class="text-sm text-gray-600 dark:text-gray-400">Results available at: ${escapeHtml(data.result_path || 'N/A')}</p>`;
            html += `<pre class="mt-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs overflow-x-auto">${JSON.stringify(data.results, null, 2)}</pre>`;
        }
    } else {
        html += `<p class="text-sm text-gray-600 dark:text-gray-400">No results data available</p>`;
    }
    
    if (data.metadata) {
        html += `
            <details class="mt-4">
                <summary class="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Metadata</summary>
                <pre class="mt-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs overflow-x-auto">${JSON.stringify(data.metadata, null, 2)}</pre>
            </details>
        `;
    }
    
    return html;
}

// Make functions available globally for onclick handlers
window.toggleJobs = toggleJobs;
window.cancelJob = handleCancelJob;
window.viewJobResults = handleViewJobResults;

