# Frontend JavaScript Modular Structure

## Module Overview

### Core Modules

1. **config.js** - Configuration and Constants
   - `API_BASE`: API base URL
   - `AVAILABLE_IMAGES`: List of available images

2. **utils.js** - Utility Functions
   - `escapeHtml()`: HTML escaping
   - `formatTime()`: Time formatting
   - `formatDuration()`: Duration formatting
   - `getUserId()`: Get user ID
   - `getJobStatus()`: Get job status
   - `getStatusBadgeClass()`: Get status badge CSS class

3. **ui.js** - UI Utility Functions
   - `showNotification()`: Show notification
   - `showConfirmDialog()`: Show confirmation dialog
   - `showTab()`: Switch tabs

### Feature Modules

4. **api.js** - API Calls
   - `fetchWorkflows()`: Fetch workflow list
   - `createWorkflow()`: Create workflow
   - `cancelJob()`: Cancel job
   - `fetchJobResults()`: Fetch job results
   - `fetchVisualizationData()`: Fetch visualization data
   - `fetchMonitoringData()`: Fetch monitoring data

5. **websocket.js** - WebSocket Connection Management
   - `connectWebSocket()`: Connect WebSocket
   - `getWebSocketConnection()`: Get WebSocket connection
   - `isWebSocketConnected()`: Check connection status

6. **refresh.js** - Auto-refresh Management
   - `startAutoRefresh()`: Start auto-refresh
   - `stopAutoRefresh()`: Stop auto-refresh
   - `isAutoRefreshActive()`: Check if auto-refresh is active

7. **workflow-form.js** - Workflow Form Management
   - `addJob()`: Add job
   - `checkJobsList()`: Check jobs list
   - `resetForm()`: Reset form
   - `handleSubmitWorkflow()`: Handle form submission
   - `updateAvailableImages()`: Update available images list

8. **workflows.js** - Workflow List and Display
   - `loadWorkflows()`: Load workflow list
   - `displayWorkflows()`: Display workflows
   - `updateSchedulerMetrics()`: Update scheduler metrics
   - `toggleJobs()`: Toggle jobs display
   - `handleCancelJob()`: Handle job cancellation
   - `handleViewJobResults()`: Handle viewing job results

9. **visualization.js** - Visualization Features
   - `loadVisualizationJobList()`: Load visualization job list
   - `loadVisualization()`: Load visualization data
   - `displayVisualization()`: Display visualization
   - `drawVisualization()`: Draw visualization chart
   - `updateVisualization()`: Update visualization

10. **monitoring.js** - Monitoring Features
    - `loadMonitoringData()`: Load monitoring data
    - `displayMonitoringData()`: Display monitoring data
    - `updateDashboardCharts()`: Update dashboard charts

### Entry Module

11. **app.js** - Main Entry File
    - Initialize application
    - Set up event listeners
    - Load initial data
    - Start auto-refresh

## Module Dependencies

```
app.js (entry)
├── ui.js
├── workflows.js
│   ├── api.js
│   ├── utils.js
│   └── ui.js
├── visualization.js
│   ├── api.js
│   └── utils.js
├── monitoring.js
│   └── api.js
├── workflow-form.js
│   ├── config.js
│   ├── api.js
│   ├── utils.js
│   ├── ui.js
│   ├── workflows.js
│   └── refresh.js
├── websocket.js
│   ├── utils.js
│   └── ui.js
└── refresh.js
    ├── websocket.js
    └── workflows.js
```

## Global Functions

The following functions are exposed via the `window` object for use in HTML `onclick` attributes:

- `showTab()`: Switch tabs
- `connectWebSocket()`: Connect WebSocket
- `addJob()`: Add job
- `checkJobsList()`: Check jobs list
- `resetForm()`: Reset form
- `toggleJobs()`: Toggle jobs display
- `cancelJob()`: Cancel job
- `viewJobResults()`: View job results
- `loadVisualization()`: Load visualization
- `updateVisualization()`: Update visualization
- `loadMonitoringData()`: Load monitoring data

## Usage

1. All modules use ES6 module syntax (`import`/`export`)
2. Main entry file `app.js` is loaded in `index.html` via `<script type="module">`
3. Modules communicate through explicit imports/exports
4. Global functions are exposed via `window` object to maintain compatibility with existing HTML

## Backend API Endpoints

The frontend communicates with the following backend endpoints:

- `POST /api/workflows` - Create workflow
- `GET /api/workflows` - List workflows
- `GET /api/workflows/{workflow_id}` - Get workflow
- `GET /api/jobs/{job_id}` - Get job
- `GET /api/jobs/{job_id}/results` - Get job results
- `DELETE /api/jobs/{job_id}` - Cancel job
- `GET /api/progress/workflow/{workflow_id}` - Get workflow progress
- `WebSocket /api/progress/ws/{tenant_id}` - WebSocket connection
- `GET /api/visualization/{job_id}/visualization` - Get visualization data
- `GET /api/metrics/dashboard` - Get monitoring metrics
- `GET /health` - Health check
