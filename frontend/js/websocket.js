// WebSocket connection management
import { getUserId } from './utils.js';
import { showNotification } from './ui.js';

let wsConnection = null;
let currentUserId = null;

export function connectWebSocket() {
    const userId = getUserId();
    if (!userId) {
        showNotification('Please enter a User ID first', 'warning');
        return;
    }

    // If already connected to the same user, do nothing
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN && currentUserId === userId) {
        showNotification(`Already connected as ${userId}`, 'info');
        return;
    }

    // If connected to a different user, close the old connection
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.close();
    }

    currentUserId = userId;
    const wsUrl = `ws://localhost:8000/api/progress/ws/${userId}`;
    wsConnection = new WebSocket(wsUrl);

    // Update UI to show connecting state
    updateConnectionUI('connecting', userId);

    wsConnection.onopen = () => {
        updateConnectionUI('connected', userId);
        showNotification(`Connected as ${userId}`, 'success');
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
        updateConnectionUI('error', currentUserId);
        currentUserId = null;
    };

    wsConnection.onclose = () => {
        updateConnectionUI('disconnected', null);
        currentUserId = null;
    };
}

function updateConnectionUI(state, userId) {
    const statusEl = document.getElementById('wsStatus');
    const statusIcon = document.getElementById('wsStatusIcon');
    const btnEl = document.getElementById('connectBtn');
    
    if (!statusEl || !statusIcon || !btnEl) return;
    
    // Remove all state classes
    btnEl.classList.remove('connected', 'bg-green-50', 'border-green-300', 'text-green-700', 
                          'bg-red-50', 'border-red-300', 'text-red-700',
                          'bg-yellow-50', 'border-yellow-300', 'text-yellow-700');
    statusIcon.classList.remove('text-green-500', 'text-red-500', 'text-yellow-500', 'text-gray-500');
    
    switch (state) {
        case 'connected':
            statusEl.textContent = userId ? `Connected (${userId})` : 'Connected';
            statusIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />';
            statusIcon.classList.add('text-green-500');
            btnEl.classList.add('connected', 'bg-green-50', 'border-green-300', 'text-green-700');
            break;
        case 'connecting':
            statusEl.textContent = userId ? `Connecting (${userId})...` : 'Connecting...';
            statusIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />';
            statusIcon.classList.add('text-yellow-500');
            btnEl.classList.add('bg-yellow-50', 'border-yellow-300', 'text-yellow-700');
            break;
        case 'error':
            statusEl.textContent = userId ? `Error (${userId})` : 'Error';
            statusIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />';
            statusIcon.classList.add('text-red-500');
            btnEl.classList.add('bg-red-50', 'border-red-300', 'text-red-700');
            break;
        case 'disconnected':
        default:
            statusEl.textContent = 'Connect';
            statusIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />';
            statusIcon.classList.add('text-gray-500');
            break;
    }
}

export function getWebSocketConnection() {
    return wsConnection;
}

export function isWebSocketConnected() {
    return wsConnection && wsConnection.readyState === WebSocket.OPEN;
}

