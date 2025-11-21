// WebSocket connection management
import { getUserId } from './utils.js';
import { showNotification } from './ui.js';

let wsConnection = null;

export function connectWebSocket() {
    const userId = getUserId();
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
        const statusEl = document.getElementById('wsStatus');
        const statusIcon = document.getElementById('wsStatusIcon');
        const btnEl = document.getElementById('connectBtn');
        if (statusEl) statusEl.textContent = 'Connected';
        if (statusIcon) {
            statusIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />';
            statusIcon.classList.add('text-green-500');
            statusIcon.classList.remove('text-gray-500');
        }
        if (btnEl) {
            btnEl.classList.add('connected');
            btnEl.classList.add('bg-green-50', 'border-green-300', 'text-green-700');
        }
        showNotification('Connected to real-time updates', 'success');
    };

    wsConnection.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'job_progress' || data.type === 'workflow_progress') {
            // Dispatch custom event for other modules to listen
            window.dispatchEvent(new CustomEvent('workflowProgress', { detail: data }));
            
            // Trigger immediate workflow refresh for real-time updates
            // Import loadWorkflows dynamically to avoid circular dependency
            import('./workflows.js').then(module => {
                module.loadWorkflows();
            });
            
            // Show notification for significant progress updates
            if (data.progress >= 1.0) {
                showNotification('Workflow completed!', 'success');
            }
        } else if (data.type === 'pong') {
            // Keep-alive response
        }
    };

    wsConnection.onerror = () => {
        const statusEl = document.getElementById('wsStatus');
        const statusIcon = document.getElementById('wsStatusIcon');
        const btnEl = document.getElementById('connectBtn');
        if (statusEl) statusEl.textContent = 'Error';
        if (statusIcon) {
            statusIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />';
            statusIcon.classList.add('text-red-500');
            statusIcon.classList.remove('text-green-500', 'text-gray-500');
        }
        if (btnEl) {
            btnEl.classList.remove('connected', 'bg-green-50', 'border-green-300', 'text-green-700');
        }
    };

    wsConnection.onclose = () => {
        const statusEl = document.getElementById('wsStatus');
        const statusIcon = document.getElementById('wsStatusIcon');
        const btnEl = document.getElementById('connectBtn');
        if (statusEl) statusEl.textContent = 'Disconnected';
        if (statusIcon) {
            statusIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />';
            statusIcon.classList.add('text-gray-500');
            statusIcon.classList.remove('text-green-500', 'text-red-500');
        }
        if (btnEl) {
            btnEl.classList.remove('connected', 'bg-green-50', 'border-green-300', 'text-green-700');
        }
    };
}

export function getWebSocketConnection() {
    return wsConnection;
}

export function isWebSocketConnected() {
    return wsConnection && wsConnection.readyState === WebSocket.OPEN;
}

