// Auto-refresh management
import { isWebSocketConnected } from './websocket.js';
import { loadWorkflows } from './workflows.js';

let autoRefreshInterval = null;
let autoRefreshCheckInterval = null;
let currentRefreshInterval = null;

export function startAutoRefresh() {
    if (autoRefreshInterval) return;
    
    // Use shorter interval for real-time progress updates
    // WebSocket provides instant updates, but polling ensures smooth progress bar animation
    const refreshInterval = isWebSocketConnected() 
        ? 1000  // 1 second when WebSocket is active (for smooth progress bar)
        : 1000;  // 1 second when WebSocket is disconnected (same for consistency)
    
    currentRefreshInterval = refreshInterval;
    autoRefreshInterval = setInterval(async () => {
        // Check if auto-refresh was stopped
        if (!autoRefreshInterval) return;
        
        // Always refresh workflows when auto-refresh is active
        // The tab check is not needed - we want to keep data fresh regardless of active tab
        await loadWorkflows();
    }, refreshInterval);
    
    // Also check immediately if workflows are already completed
    setTimeout(async () => {
        if (!autoRefreshInterval) return;
        await loadWorkflows();
    }, 100);
    
    // Re-adjust interval if WebSocket connection status changes
    if (!autoRefreshCheckInterval) {
        autoRefreshCheckInterval = setInterval(() => {
            if (autoRefreshInterval) {
                const newInterval = 1000; // Always use 1 second for smooth progress updates
                // Only restart if interval actually changed
                if (newInterval !== currentRefreshInterval) {
                    stopAutoRefresh();
                    startAutoRefresh();
                }
            }
        }, 8000); // Check every 8 seconds
    }
}

export function stopAutoRefresh() {
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

export function isAutoRefreshActive() {
    return autoRefreshInterval !== null;
}

