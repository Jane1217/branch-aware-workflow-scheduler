// Main application entry point
import { showTab } from './ui.js';
import { loadWorkflows } from './workflows.js';
import { loadVisualizationJobList } from './visualization.js';
import { loadMonitoringData } from './monitoring.js';
import { handleSubmitWorkflow, updateAvailableImages } from './workflow-form.js';
import { connectWebSocket } from './websocket.js';
import { startAutoRefresh } from './refresh.js';

// Initialize application
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
    
    if (workflowForm) {
        workflowForm.addEventListener('submit', handleSubmitWorkflow);
    }
    
    // Load initial data
    loadWorkflows();
    updateAvailableImages();
    
    // Start auto-refresh automatically
    startAutoRefresh();
    
    // Listen for WebSocket progress updates
    window.addEventListener('workflowProgress', () => {
        if (document.body.__x && document.body.__x.$data && document.body.__x.$data.activeTab === 'workflows') {
            loadWorkflows();
        }
    });
    
    // Listen for userId changes and reload workflows
    const userIdInput = document.getElementById('userId');
    if (userIdInput) {
        userIdInput.addEventListener('change', () => {
            // Reload workflows when user changes
            loadWorkflows();
            // Reload visualization job list
            loadVisualizationJobList();
            // Reconnect WebSocket with new user ID
            connectWebSocket();
        });
    }
});

// Make showTab available globally for onclick handlers
window.showTab = (tabName) => {
    showTab(tabName);
    
    // Load data if needed
    if (tabName === 'workflows') {
        loadWorkflows();
    } else if (tabName === 'visualization') {
        loadVisualizationJobList();
    } else if (tabName === 'monitoring') {
        loadMonitoringData();
    }
};

// Make connectWebSocket available globally
window.connectWebSocket = connectWebSocket;

// Make loadWorkflows available globally for onclick handlers
window.loadWorkflows = loadWorkflows;

