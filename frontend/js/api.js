// API call functions
import { API_BASE } from './config.js';
import { getUserId } from './utils.js';

export async function fetchWorkflows() {
    const userId = getUserId();
    if (!userId) {
        throw new Error('User ID is required');
    }
    
    const response = await fetch(`${API_BASE}/workflows`, {
        headers: {
            'X-User-ID': userId
        }
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to load workflows');
    }
    
    return await response.json();
}

export async function createWorkflow(workflowData) {
    const userId = getUserId();
    if (!userId) {
        throw new Error('User ID is required');
    }
    
    const response = await fetch(`${API_BASE}/workflows`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-User-ID': userId
        },
        body: JSON.stringify(workflowData)
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create workflow');
    }
    
    return await response.json();
}

export async function cancelJob(jobId) {
    const userId = getUserId();
    if (!userId) {
        throw new Error('User ID is required');
    }
    
    const response = await fetch(`${API_BASE}/jobs/${jobId}`, {
        method: 'DELETE',
        headers: {
            'X-User-ID': userId
        }
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to cancel job');
    }
    
    return true;
}

export async function fetchJobResults(jobId) {
    const userId = getUserId();
    if (!userId) {
        throw new Error('User ID is required');
    }
    
    const response = await fetch(`${API_BASE}/jobs/${jobId}/results`, {
        headers: {
            'X-User-ID': userId
        }
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to load results');
    }
    
    return await response.json();
}

export async function fetchVisualizationData(jobId) {
    const userId = getUserId();
    if (!userId) {
        throw new Error('User ID is required');
    }
    
    const response = await fetch(`${API_BASE}/visualization/${jobId}/visualization`, {
        headers: {
            'X-User-ID': userId
        }
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to load visualization');
    }
    
    return await response.json();
}

export async function fetchMonitoringData() {
    const baseUrl = API_BASE.replace('/api', '');
    const [healthResponse, metricsResponse] = await Promise.all([
        fetch(`${baseUrl}/health`),
        fetch(`${API_BASE}/metrics/dashboard`)
    ]);
    
    const healthData = healthResponse.ok ? await healthResponse.json() : null;
    const metricsData = metricsResponse.ok ? await metricsResponse.json() : null;
    
    return {
        health: healthData,
        metrics: metricsData,
        healthError: !healthResponse.ok,
        metricsError: !metricsResponse.ok
    };
}

