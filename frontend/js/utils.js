// Utility functions
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function formatTime(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString();
}

export function formatDuration(seconds) {
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

export function getUserId() {
    const input = document.getElementById('userId');
    return input ? input.value : 'user-1';
}

export function getJobStatus(job) {
    // Handle both enum objects and strings for status
    if (job.status && typeof job.status === 'object' && job.status.value) {
        return {
            value: job.status.value.toUpperCase(),
            display: job.status.value
        };
    }
    const statusStr = String(job.status || '');
    return {
        value: statusStr.toUpperCase(),
        display: statusStr
    };
}

export function getStatusBadgeClass(status) {
    const statusLower = status.toLowerCase();
    let baseClass = 'rounded-full px-2 py-0.5 text-xs font-medium ';
    
    if (statusLower === 'succeeded') {
        return baseClass + 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500';
    } else if (statusLower === 'running') {
        return baseClass + 'bg-blue-light-50 text-blue-light-600 dark:bg-blue-light-500/15 dark:text-blue-light-500';
    } else if (statusLower === 'failed') {
        return baseClass + 'bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500';
    } else if (statusLower === 'pending') {
        return baseClass + 'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-500';
    } else {
        return baseClass + 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    }
}

