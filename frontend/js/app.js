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
    
    // Check if monitoring tab is initially visible and load data
    // This handles the case when user refreshes page while on monitoring tab
    setTimeout(() => {
        const monitoringTab = document.querySelector('[x-show*="monitoring"]');
        if (monitoringTab) {
            const computedStyle = window.getComputedStyle(monitoringTab);
            const isVisible = computedStyle.display !== 'none' && 
                             computedStyle.visibility !== 'hidden' &&
                             monitoringTab.offsetParent !== null &&
                             !monitoringTab.hasAttribute('hidden');
            if (isVisible) {
                loadMonitoringData();
            }
        }
    }, 500); // Wait a bit for Alpine.js to initialize
    
    // Don't start auto-refresh automatically
    // Auto-refresh will be started by loadWorkflows() if there are running jobs
    
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
            // Reconnect WebSocket with new user ID first
            connectWebSocket();
            // Reload workflows when user changes
            loadWorkflows();
            // Reload visualization job list
            loadVisualizationJobList();
        });
    }
    
    // Watch for Alpine.js activeTab changes
    // This is critical because HTML uses Alpine.js @click to change activeTab directly
    // Alpine.js loads with "defer" attribute, so we need to wait for it
    
    const handleTabChange = (tabName) => {
        // Load data when switching tabs
        if (tabName === 'workflows') {
            loadWorkflows();
        } else if (tabName === 'visualization') {
            loadVisualizationJobList();
        } else if (tabName === 'monitoring') {
            loadMonitoringData();
        }
    };
    
    const setupTabObservers = () => {
        // Watch for x-show visibility changes - more reliable than Alpine.js detection
        const visualizationTab = document.querySelector('[x-show*="visualization"]');
        const monitoringTab = document.querySelector('[x-show*="monitoring"]');
        const workflowsTab = document.querySelector('[x-show*="workflows"]');
        
        const createObserver = (tab, tabName) => {
            if (!tab) return;
            
            let lastVisible = false;
            
            const checkVisibility = () => {
                const computedStyle = window.getComputedStyle(tab);
                const isVisible = computedStyle.display !== 'none' && 
                                 computedStyle.visibility !== 'hidden' &&
                                 tab.offsetParent !== null &&
                                 !tab.hasAttribute('hidden');
                
                if (isVisible && !lastVisible) {
                    handleTabChange(tabName);
                }
                lastVisible = isVisible;
            };
            
            const observer = new MutationObserver((mutations) => {
                let shouldCheck = false;
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes') {
                        if (mutation.attributeName === 'style' || 
                            mutation.attributeName === 'hidden' ||
                            mutation.attributeName === 'x-show') {
                            shouldCheck = true;
                        }
                    }
                });
                if (shouldCheck) {
                    // Use setTimeout to ensure Alpine.js has finished updating
                    setTimeout(checkVisibility, 10);
                }
            });
            
            observer.observe(tab, { 
                attributes: true, 
                attributeFilter: ['style', 'hidden', 'x-show'],
                childList: false,
                subtree: false
            });
            
            // Also check immediately if tab is already visible
            setTimeout(checkVisibility, 50);
            
            // Periodic check as backup (every 500ms)
            setInterval(checkVisibility, 500);
        };
        
        if (visualizationTab) createObserver(visualizationTab, 'visualization');
        if (monitoringTab) createObserver(monitoringTab, 'monitoring');
        if (workflowsTab) createObserver(workflowsTab, 'workflows');
    };
    
    // Try to set up Alpine.js watcher, but always set up MutationObserver as backup
    let attempts = 0;
    const maxAttempts = 30;
    
    const setupAlpineWatcher = () => {
        attempts++;
        const body = document.body;
        
        if (body && body.__x && body.__x.$data && body.__x.$data.activeTab !== undefined) {
            if (body.__x.$watch) {
                body.__x.$watch('activeTab', (newTab) => {
                    handleTabChange(newTab);
                });
            }
            setupTabObservers();
            return true;
        } else if (attempts < maxAttempts) {
            setTimeout(setupAlpineWatcher, 100);
            return false;
        } else {
            setupTabObservers();
            return false;
        }
    };
    
    // Start trying to set up Alpine watcher
    // Wait a bit longer since Alpine.js loads with defer
    setTimeout(setupAlpineWatcher, 200);
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

// Set up event listeners for buttons that need module functions
document.addEventListener('DOMContentLoaded', () => {
    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) {
        connectBtn.addEventListener('click', () => {
            connectWebSocket();
        });
    }
});

