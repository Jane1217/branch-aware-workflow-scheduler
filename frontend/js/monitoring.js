// Monitoring and metrics management
import { fetchMonitoringData } from './api.js';
import { showNotification } from './ui.js';

let latencyChart = null;
let workersChart = null;
let queueChart = null;
let latencyData = [];
let workersData = [];
let queueData = [];

// Destroy existing charts before recreating HTML
function destroyCharts() {
    if (latencyChart) {
        latencyChart.destroy();
        latencyChart = null;
    }
    if (workersChart) {
        workersChart.destroy();
        workersChart = null;
    }
    if (queueChart) {
        queueChart.destroy();
        queueChart = null;
    }
}

export async function loadMonitoringData() {
    const monitoringContent = document.getElementById('monitoringContent');
    
    if (!monitoringContent) {
        // Retry up to 10 times with increasing delay
        let attempts = 0;
        const maxAttempts = 10;
        const retry = () => {
            attempts++;
            if (attempts < maxAttempts) {
        setTimeout(() => {
                    const content = document.getElementById('monitoringContent');
                    if (content) {
            loadMonitoringData();
                    } else {
                        retry();
                    }
                }, 100 * attempts); // Increasing delay
            }
        };
        retry();
        return;
    }
    
    // Only show loading message if content is empty or showing loading
    const currentContent = monitoringContent.innerHTML.trim();
    if (!currentContent || currentContent.includes('Loading metrics') || currentContent === '') {
        monitoringContent.innerHTML = '<p class="text-gray-500 dark:text-gray-400">Loading metrics...</p>';
    }
    
    try {
        const { health, metrics, healthError, metricsError } = await fetchMonitoringData();
        
        if (metrics) {
            displayMonitoringData(metrics);
        } else if (health) {
            displayMonitoringData(health);
            setTimeout(() => {
                updateLatencyChart();
                updateQueueChart();
                updateWorkersChart();
            }, 100);
        } else {
            let errorDetails = '';
            if (metricsError && healthError) {
                errorDetails = ' (Both /api/metrics/dashboard and /health endpoints failed)';
            } else if (metricsError) {
                errorDetails = ' (/api/metrics/dashboard endpoint failed)';
            } else if (healthError) {
                errorDetails = ' (/health endpoint failed)';
            } else {
                errorDetails = ' (No data available from either endpoint)';
            }
            monitoringContent.innerHTML = `<p class="text-gray-500 dark:text-gray-400">Failed to load metrics${errorDetails}. Please check the backend server and try again.</p>`;
        }
        
        if (metricsError && !metrics) {
            showNotification('Failed to load dashboard metrics', 'error');
        }
    } catch (error) {
        monitoringContent.innerHTML = `<p class="text-gray-500 dark:text-gray-400">Failed to load monitoring data: ${error.message}. Please try again.</p>`;
    }
}

export function displayMonitoringData(data) {
    // Destroy existing charts before recreating HTML
    destroyCharts();
    
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
                    <svg class="fill-gray-800 dark:fill-white/90" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4ZM11 8C11 7.44772 11.4477 7 12 7C12.5523 7 13 7.44772 13 8V11H16C16.5523 11 17 11.4477 17 12C17 12.5523 16.5523 13 16 13H13V16C13 16.5523 12.5523 17 12 17C11.4477 17 11 16.5523 11 16V13H8C7.44772 13 7 12.5523 7 12C7 11.4477 7.44772 11 8 11H11V8Z" fill="currentColor"/>
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
                    <svg class="fill-gray-800 dark:fill-white/90" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M11.665 3.75621C11.8762 3.65064 12.1247 3.65064 12.3358 3.75621L18.7807 6.97856L12.3358 10.2009C12.1247 10.3065 11.8762 10.3065 11.665 10.2009L5.22014 6.97856L11.665 3.75621ZM12 5.5L7.5 7.86603V16.134L12 18.5L16.5 16.134V7.86603L12 5.5Z" fill="currentColor"/>
                    </svg>
                </div>
                <span class="text-sm text-gray-500 dark:text-gray-400">Active Workers</span>
                <h4 class="mt-2 text-title-sm font-bold text-gray-800 dark:text-white/90">
                    ${typeof data.active_workers === 'object' && data.active_workers !== null ? (data.active_workers.global || 0) : (data.active_workers || data.running_jobs || 0)} / 10
                </h4>
            </div>
            
            <!-- Queue Depth Card -->
            <div class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
                <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 mb-4">
                    <svg class="fill-gray-800 dark:fill-white/90" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M3.25 5.5C3.25 4.25736 4.25736 3.25 5.5 3.25H18.5C19.7426 3.25 20.75 4.25736 20.75 5.5V18.5C20.75 19.7426 19.7426 20.75 18.5 20.75H5.5C4.25736 20.75 3.25 19.7426 3.25 18.5V5.5ZM5.5 4.75C4.92157 4.75 4.45 5.22157 4.45 5.8V18.2C4.45 18.7784 4.92157 19.25 5.5 19.25H18.5C19.0784 19.25 19.55 18.7784 19.55 18.2V5.8C19.55 5.22157 19.0784 4.75 18.5 4.75H5.5Z" fill="currentColor"/>
                    </svg>
                </div>
                <span class="text-sm text-gray-500 dark:text-gray-400">Queue Depth</span>
                <h4 class="mt-2 text-title-sm font-bold text-gray-800 dark:text-white/90">
                    ${typeof data.queue_depth === 'object' && data.queue_depth !== null ? (data.queue_depth.total || 0) : (data.queue_depth || 0)} jobs
                </h4>
            </div>
            
            <!-- Active Users Card -->
            <div class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
                <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 mb-4">
                    <svg class="fill-gray-800 dark:fill-white/90" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M12 3.5C7.30558 3.5 3.5 7.30558 3.5 12C3.5 14.1526 4.3002 16.1184 5.61936 17.616C6.17279 15.3096 8.24852 13.5955 10.7246 13.5955H13.2746C15.7509 13.5955 17.8268 15.31 18.38 17.6167C19.6996 16.119 20.5 14.153 20.5 12C20.5 7.30558 16.6944 3.5 12 3.5ZM17.0246 18.8566V18.8455C17.0246 16.7744 15.3457 15.0955 13.2746 15.0955H10.7246C8.65354 15.0955 6.97461 16.7744 6.97461 18.8455V18.856C8.38223 19.8895 10.1198 20.5 12 20.5C13.8798 20.5 15.6171 19.8898 17.0246 18.8566ZM2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM11.9991 7.25C10.8847 7.25 9.98126 8.15342 9.98126 9.26784C9.98126 10.3823 10.8847 11.2857 11.9991 11.2857C13.1135 11.2857 14.0169 10.3823 14.0169 9.26784C14.0169 8.15342 13.1135 7.25 11.9991 7.25ZM8.48126 9.26784C8.48126 7.32499 10.0563 5.75 11.9991 5.75C13.9419 5.75 15.5169 7.32499 15.5169 9.26784C15.5169 11.2107 13.9419 12.7857 11.9991 12.7857C10.0563 12.7857 8.48126 11.2107 8.48126 9.26784Z" fill="currentColor"/>
                    </svg>
                </div>
                <span class="text-sm text-gray-500 dark:text-gray-400">Active Users</span>
                <h4 class="mt-2 text-title-sm font-bold text-gray-800 dark:text-white/90">
                    ${typeof data.active_users === 'object' && data.active_users !== null ? (data.active_users.count || 0) : (data.active_users || 0)} / 3
                </h4>
            </div>
        </div>
        
        <!-- Dashboard Charts: Average Job Latency per minute, Active Workers, Per-Branch Queue Depth -->
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-3 mb-6">
            <div class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white/90 mb-4">
                    Average Job Latency (per minute)
                </h3>
                <div class="relative h-[200px]">
                    <canvas id="latencyChart"></canvas>
                </div>
            </div>
            <div class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white/90 mb-4">
                    Active Workers
                </h3>
                <div class="relative h-[200px]">
                    <canvas id="workersChart"></canvas>
                </div>
            </div>
            <div class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white/90 mb-4">
                    Per-Branch Queue Depth
                </h3>
                <div class="relative h-[200px]">
                    <canvas id="queueChart"></canvas>
                </div>
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
        </div>
    `;
    
    // Initialize charts immediately after HTML is inserted
        // Use setTimeout to ensure DOM is ready and Chart.js is loaded
    setTimeout(() => {
            // Try to initialize charts, with retry if Chart.js not loaded
            let attempts = 0;
            const maxAttempts = 20;
            
            const tryInit = () => {
                attempts++;
                if (typeof Chart !== 'undefined') {
                    const chartsInitialized = initCharts();
                    if (chartsInitialized) {
                        // Charts initialized successfully, now update with data
                        if (data.job_latency || data.queue_depth || data.active_workers) {
            updateDashboardCharts(data);
        } else {
            // Initialize empty charts
            updateLatencyChart();
                            updateWorkersChart();
            updateQueueChart();
        }
                    } else if (attempts < maxAttempts) {
                        // Retry if charts not initialized yet
                        setTimeout(tryInit, 100);
                    }
                } else if (attempts < maxAttempts) {
                    // Retry if Chart.js not loaded yet
                    setTimeout(tryInit, 100);
                }
            };
            
            tryInit();
        }, 300);
    }


export function updateDashboardCharts(data) {
    const now = new Date();
    const timestamp = now.toLocaleTimeString();
    
    // Update latency chart
    if (data.job_latency) {
        const latencyMinutes = data.job_latency.average_minutes || 0;
        latencyData.push({
            time: timestamp,
            value: latencyMinutes
        });
        
        if (latencyData.length > 20) {
            latencyData.shift();
        }
        
        updateLatencyChart();
    }
    
    // Update active workers chart
    if (data.active_workers) {
        const workersCount = typeof data.active_workers === 'object' && data.active_workers !== null 
            ? (data.active_workers.global || 0) 
            : (data.active_workers || 0);
        
        workersData.push({
            time: timestamp,
            value: workersCount
        });
        
        if (workersData.length > 20) {
            workersData.shift();
        }
        
        updateWorkersChart();
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

function initCharts() {
    // Check if Chart.js is loaded
    if (typeof Chart === 'undefined') {
        return false;
    }
    
    let anyInitialized = false;
    
    // Initialize latency chart with Chart.js
    const latencyCtx = document.getElementById('latencyChart');
    if (latencyCtx && !latencyChart) {
        latencyChart = new Chart(latencyCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Latency (min)',
                    data: [],
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 3,
                    pointHoverRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: true
                    }
                },
                scales: {
                    x: {
                        display: true,
                        ticks: {
                            maxRotation: 45,
                            minRotation: 0
                        }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return value.toFixed(1) + ' min';
                            }
                        }
                    }
                }
            }
        });
        anyInitialized = true;
    }
    
    // Initialize workers chart
    const workersCtx = document.getElementById('workersChart');
    if (workersCtx && !workersChart) {
        workersChart = new Chart(workersCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Workers',
                    data: [],
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.4,
                    fill: true,
                    pointRadius: 3,
                    pointHoverRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: true
                    }
                },
                scales: {
                    x: {
                        display: true,
                        ticks: {
                            maxRotation: 45,
                            minRotation: 0
                        }
                    },
                    y: {
                        beginAtZero: true,
                        max: 10,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
        anyInitialized = true;
    }
    
    // Initialize queue depth chart
    const queueCtx = document.getElementById('queueChart');
    if (queueCtx && !queueChart) {
        queueChart = new Chart(queueCtx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Queue Depth',
                    data: [],
                    backgroundColor: []
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: true
                    }
                },
                scales: {
                    x: {
                        display: true,
                        ticks: {
                            maxRotation: 45,
                            minRotation: 0
                        }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
        anyInitialized = true;
    }
    
    // Return true if all charts exist (either newly initialized or already existed)
    // This ensures we can update charts even if they were initialized in a previous call
    if (latencyChart && workersChart && queueChart) {
        return true;
    }
    
    // If any chart is missing but canvas exists, return false to retry
    return anyInitialized;
}

export function updateLatencyChart() {
    if (typeof Chart === 'undefined') {
        setTimeout(updateLatencyChart, 100);
        return;
    }
    
    if (!latencyChart) {
        initCharts();
        if (!latencyChart) {
            setTimeout(updateLatencyChart, 100);
            return;
        }
    }
    
    if (latencyData.length === 0) {
        latencyChart.data.labels = ['No data'];
        latencyChart.data.datasets[0].data = [0];
    } else {
        latencyChart.data.labels = latencyData.map(d => d.time);
        latencyChart.data.datasets[0].data = latencyData.map(d => d.value);
    }
    latencyChart.update('none');
}

export function updateWorkersChart() {
    if (typeof Chart === 'undefined') {
        setTimeout(updateWorkersChart, 100);
        return;
    }
    
    if (!workersChart) {
        initCharts();
        if (!workersChart) {
            setTimeout(updateWorkersChart, 100);
            return;
        }
    }
    
    if (workersData.length === 0) {
        workersChart.data.labels = ['No data'];
        workersChart.data.datasets[0].data = [0];
        } else {
        workersChart.data.labels = workersData.map(d => d.time);
        workersChart.data.datasets[0].data = workersData.map(d => d.value);
    }
    workersChart.update('none');
}

export function updateQueueChart() {
    if (typeof Chart === 'undefined') {
        setTimeout(updateQueueChart, 100);
        return;
    }
    
    if (!queueChart) {
        initCharts();
        if (!queueChart) {
            setTimeout(updateQueueChart, 100);
            return;
        }
    }
    
    if (queueData.length === 0) {
        queueChart.data.labels = ['No data'];
        queueChart.data.datasets[0].data = [0];
        queueChart.data.datasets[0].backgroundColor = ['rgba(200, 200, 200, 0.5)'];
    } else {
        queueChart.data.labels = queueData.map(d => {
            const label = d.label || `${d.tenant_id}:${d.branch}`;
            return label.length > 15 ? label.substring(0, 13) + '...' : label;
        });
        queueChart.data.datasets[0].data = queueData.map(d => d.depth);
        queueChart.data.datasets[0].backgroundColor = queueData.map((_, index) => {
            const hue = (index * 60) % 360;
            return `hsl(${hue}, 70%, 50%)`;
        });
    }
    queueChart.update('none');
}

// Make functions available globally for onclick handlers
window.loadMonitoringData = loadMonitoringData;

