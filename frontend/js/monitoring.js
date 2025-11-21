// Monitoring and metrics management
import { fetchMonitoringData } from './api.js';
import { showNotification } from './ui.js';

let autoMonitoringInterval = null;
let latencyData = [];
let queueData = [];

export async function loadMonitoringData() {
    const monitoringContent = document.getElementById('monitoringContent');
    if (!monitoringContent) {
        // If monitoringContent doesn't exist, try to find it after a short delay
        setTimeout(() => {
            loadMonitoringData();
        }, 100);
        return;
    }
    
    try {
        const { health, metrics, healthError, metricsError } = await fetchMonitoringData();
        
        // Use metrics data if available (it contains all the dashboard data)
        // metrics contains: active_workers, queue_depth, job_latency, active_users, system_health
        if (metrics) {
            displayMonitoringData(metrics);
        } else if (health) {
            // Fallback to health data if metrics not available
            displayMonitoringData(health);
            // Initialize empty charts
            setTimeout(() => {
                updateLatencyChart();
                updateQueueChart();
            }, 100);
        } else {
            // Show detailed error message
            const errorDetails = metricsError ? ' (API returned error)' : ' (No data available)';
            monitoringContent.innerHTML = `<p class="text-gray-500 dark:text-gray-400">Failed to load metrics${errorDetails}. Please try again.</p>`;
        }
        
        if (metricsError && !metrics) {
            showNotification('Failed to load dashboard metrics', 'error');
        }
    } catch (error) {
        monitoringContent.innerHTML = `<p class="text-gray-500 dark:text-gray-400">Failed to load monitoring data: ${error.message}. Please try again.</p>`;
    }
}

export function displayMonitoringData(data) {
    const monitoringContent = document.getElementById('monitoringContent');
    if (!monitoringContent) {
        // Fallback for old HTML structure
        const healthEl = document.getElementById('systemHealth');
        const workersEl = document.getElementById('activeWorkers');
        const queueEl = document.getElementById('queueDepth');
        const usersEl = document.getElementById('activeUsers');
        
        if (healthEl) {
            const status = data.system_health?.status || data.status || 'unknown';
            healthEl.innerHTML = `
                <div class="rounded-full px-2 py-0.5 text-xs font-medium ${
                    status === 'healthy' 
                        ? 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500' 
                        : 'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-500'
                }">${status.toUpperCase()}</div>
            `;
        }
        
        if (workersEl) {
            workersEl.innerHTML = `
                <div class="text-2xl font-bold text-gray-800 dark:text-white/90">${data.active_workers?.global || data.running_jobs || 0}</div>
                <div class="text-sm text-gray-500 dark:text-gray-400">/ 10 max</div>
            `;
        }
        
        if (queueEl) {
            queueEl.innerHTML = `
                <div class="text-2xl font-bold text-gray-800 dark:text-white/90">${data.queue_depth?.total || data.queue_depth || 0}</div>
                <div class="text-sm text-gray-500 dark:text-gray-400">jobs waiting</div>
            `;
        }
        
        if (usersEl) {
            usersEl.innerHTML = `
                <div class="text-2xl font-bold text-gray-800 dark:text-white/90">${data.active_users?.count || data.active_users || 0}</div>
                <div class="text-sm text-gray-500 dark:text-gray-400">/ 3 max</div>
            `;
        }
        return;
    }
    
    const status = data.system_health?.status || data.status || 'unknown';
    const statusColor = status.toLowerCase() === 'healthy' ? 'success' : 'warning';
    
    monitoringContent.innerHTML = `
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4 mb-6">
            <!-- System Health Card -->
            <div class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
                <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 mb-4">
                    <svg class="fill-gray-800 dark:fill-white/90" width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2Z" fill=""/>
                    </svg>
                </div>
                <span class="text-sm text-gray-500 dark:text-gray-400">System Health</span>
                <h4 class="mt-2 text-title-sm font-bold text-gray-800 dark:text-white/90">
                    <span class="rounded-full px-2 py-0.5 text-xs font-medium ${
                        statusColor === 'success' 
                            ? 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500' 
                            : 'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-500'
                    }">${status.toUpperCase()}</span>
                </h4>
            </div>
            
            <!-- Active Workers Card -->
            <div class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
                <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 mb-4">
                    <svg class="fill-gray-800 dark:fill-white/90" width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M11.665 3.75621C11.8762 3.65064 12.1247 3.65064 12.3358 3.75621L18.7807 6.97856L12.3358 10.2009C12.1247 10.3065 11.8762 10.3065 11.665 10.2009L5.22014 6.97856L11.665 3.75621Z" fill=""/>
                    </svg>
                </div>
                <span class="text-sm text-gray-500 dark:text-gray-400">Active Workers</span>
                <h4 class="mt-2 text-title-sm font-bold text-gray-800 dark:text-white/90">
                    ${data.active_workers?.global || data.running_jobs || 0} / 10
                </h4>
            </div>
            
            <!-- Queue Depth Card -->
            <div class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
                <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 mb-4">
                    <svg class="fill-gray-800 dark:fill-white/90" width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M3.25 5.5C3.25 4.25736 4.25736 3.25 5.5 3.25H18.5C19.7426 3.25 20.75 4.25736 20.75 5.5V18.5C20.75 19.7426 19.7426 20.75 18.5 20.75H5.5C4.25736 20.75 3.25 19.7426 3.25 18.5V5.5Z" fill=""/>
                    </svg>
                </div>
                <span class="text-sm text-gray-500 dark:text-gray-400">Queue Depth</span>
                <h4 class="mt-2 text-title-sm font-bold text-gray-800 dark:text-white/90">
                    ${data.queue_depth?.total || data.queue_depth || 0} jobs
                </h4>
            </div>
            
            <!-- Active Users Card -->
            <div class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
                <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 mb-4">
                    <svg class="fill-gray-800 dark:fill-white/90" width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M12 3.5C7.30558 3.5 3.5 7.30558 3.5 12C3.5 14.1526 4.3002 16.1184 5.61936 17.616C6.17279 15.3096 8.24852 13.5955 10.7246 13.5955H13.2746C15.7509 13.5955 17.8268 15.31 18.38 17.6167C19.6996 16.119 20.5 14.153 20.5 12C20.5 7.30558 16.6944 3.5 12 3.5ZM17.0246 18.8566V18.8455C17.0246 16.7744 15.3457 15.0955 13.2746 15.0955H10.7246C8.65354 15.0955 6.97461 16.7744 6.97461 18.8455V18.856C8.38223 19.8895 10.1198 20.5 12 20.5C13.8798 20.5 15.6171 19.8898 17.0246 18.8566ZM2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM11.9991 7.25C10.8847 7.25 9.98126 8.15342 9.98126 9.26784C9.98126 10.3823 10.8847 11.2857 11.9991 11.2857C13.1135 11.2857 14.0169 10.3823 14.0169 9.26784C14.0169 8.15342 13.1135 7.25 11.9991 7.25ZM8.48126 9.26784C8.48126 7.32499 10.0563 5.75 11.9991 5.75C13.9419 5.75 15.5169 7.32499 15.5169 9.26784C15.5169 11.2107 13.9419 12.7857 11.9991 12.7857C10.0563 12.7857 8.48126 11.2107 8.48126 9.26784Z" fill=""/>
                    </svg>
                </div>
                <span class="text-sm text-gray-500 dark:text-gray-400">Active Users</span>
                <h4 class="mt-2 text-title-sm font-bold text-gray-800 dark:text-white/90">
                    ${data.active_users?.count || data.active_users || 0} / 3
                </h4>
            </div>
        </div>
        
        <!-- Dashboard Charts: Average Job Latency per minute, Active Workers, Per-Branch Queue Depth -->
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-6">
            <div class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white/90 mb-4">
                    Average Job Latency (per minute)
                </h3>
                <canvas id="latencyChart" width="400" height="200"></canvas>
            </div>
            <div class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white/90 mb-4">
                    Per-Branch Queue Depth
                </h3>
                <canvas id="queueChart" width="400" height="200"></canvas>
            </div>
        </div>
        
        <div class="mt-6 flex items-center gap-3">
            <button
                type="button"
                onclick="loadMonitoringData()"
                class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
            >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh Metrics
            </button>
            <button
                type="button"
                onclick="startAutoMonitoring()"
                class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
            >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Auto-Refresh (10s)
            </button>
            <button
                type="button"
                onclick="stopAutoMonitoring()"
                class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
            >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Stop Auto-Refresh
            </button>
        </div>
    `;
    
    // Initialize charts immediately after HTML is inserted
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => {
        if (data.job_latency || data.queue_depth) {
            updateDashboardCharts(data);
        } else {
            // Initialize empty charts
            updateLatencyChart();
            updateQueueChart();
        }
    }, 100);
}

export function startAutoMonitoring() {
    if (autoMonitoringInterval) return;
    
    loadMonitoringData();
    autoMonitoringInterval = setInterval(() => {
        loadMonitoringData();
    }, 10000); // Refresh every 10 seconds
    
    showNotification('Auto-monitoring started (10s interval)', 'success');
}

export function stopAutoMonitoring() {
    if (autoMonitoringInterval) {
        clearInterval(autoMonitoringInterval);
        autoMonitoringInterval = null;
        showNotification('Auto-monitoring stopped', 'info');
    }
}

export function updateDashboardCharts(data) {
    const now = new Date();
    const timestamp = now.toLocaleTimeString();
    
    // Update latency chart
    if (data.job_latency) {
        const latencyMinutes = data.job_latency.average_minutes || 0;
        // Always add data point, even if 0 (to show "no data" state)
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
        const branches = Object.keys(data.queue_depth.by_branch);
        
        if (branches.length > 0) {
            branches.forEach(branch => {
                const branchData = data.queue_depth.by_branch[branch];
                Object.keys(branchData).forEach(tenantId => {
                    const depth = branchData[tenantId];
                    if (depth > 0) {
                        queueData.push({
                            label: `${tenantId}:${branch}`,
                            branch: branch,
                            tenant_id: tenantId,
                            depth: depth
                        });
                    }
                });
            });
        }
        
        updateQueueChart();
    }
}

export function updateLatencyChart() {
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
    
    // Filter out zero values for max calculation, but keep them for display
    const nonZeroValues = latencyData.map(d => d.value).filter(v => v > 0);
    const maxValue = nonZeroValues.length > 0 ? Math.max(...nonZeroValues, 1) : 1;
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

export function updateQueueChart() {
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
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        const label = item.label || `${item.tenant_id}:${item.branch}`;
        if (queueData.length <= 8) {
            ctx.save();
            ctx.translate(x + barWidth / 2 - 5, height - padding + 12);
            ctx.fillText(label, 0, 0);
            ctx.restore();
        } else {
            const shortLabel = label.length > 12 ? label.substring(0, 10) + '...' : label;
            ctx.fillText(shortLabel, x + barWidth / 2 - 5, height - padding + 12);
        }
        // Depth value on top of bar
        ctx.fillText(item.depth.toString(), x + barWidth / 2 - 5, y - 5);
    });
    
    // Y-axis label
    ctx.fillStyle = '#666';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Depth', padding - 5, padding / 2);
}

// Make functions available globally for onclick handlers
window.loadMonitoringData = loadMonitoringData;
window.startAutoMonitoring = startAutoMonitoring;
window.stopAutoMonitoring = stopAutoMonitoring;

