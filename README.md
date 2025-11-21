# Branch-Aware, Multi-Tenant Workflow Scheduler

A high-performance workflow scheduler for large-image inference tasks with branch-aware execution, multi-tenant isolation, and real-time progress tracking. This system is designed to handle large-scale Whole Slide Image (WSI) processing using InstanSeg for cell segmentation and tissue mask generation.

## Features

- **Branch-Aware Scheduling**: Serial execution within branches, parallel execution across branches
- **Multi-Tenant Isolation**: Each user sees only their own workflows and jobs
- **Active User Limit**: Maximum 3 concurrent active users with configurable limits
- **Real-Time Progress**: WebSocket-based progress tracking for workflows and jobs
- **Image Processing**: InstanSeg integration for cell segmentation and tissue mask generation
- **Workflow DAGs**: Define complex workflows with job dependencies
- **Prometheus Metrics**: Comprehensive monitoring and observability
- **RESTful API**: Well-documented API with OpenAPI/Swagger support

## Project Structure

```
.
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI application entry point
│   ├── config.py               # Configuration management
│   ├── api/                    # API routes
│   │   ├── __init__.py
│   │   ├── workflows.py        # Workflow management endpoints
│   │   ├── jobs.py             # Job management endpoints
│   │   ├── progress.py         # Progress tracking endpoints
│   │   ├── visualization.py    # Visualization endpoints
│   │   └── metrics.py          # Metrics endpoints
│   ├── core/                   # Core business logic
│   │   ├── __init__.py
│   │   ├── scheduler.py        # Branch-aware scheduler
│   │   ├── workflow_engine.py  # Workflow execution engine
│   │   ├── tenant_manager.py   # Multi-tenant management
│   │   └── user_limit.py       # Active user limit control
│   ├── models/                 # Data models
│   │   ├── __init__.py
│   │   ├── workflow.py         # Workflow and DAG models
│   │   ├── job.py              # Job models
│   │   └── tenant.py           # Tenant models
│   ├── services/               # Service layer
│   │   ├── __init__.py
│   │   ├── image_processor.py  # Image processing service
│   │   ├── instanseg_service.py # InstanSeg integration
│   │   ├── tissue_mask_service.py # Tissue mask generation
│   │   └── storage.py          # Result storage service
│   ├── middleware/             # Middleware
│   │   ├── __init__.py
│   │   ├── metrics_middleware.py # Prometheus metrics
│   │   └── rate_limit.py       # Rate limiting
│   ├── utils/                  # Utilities
│   │   ├── __init__.py
│   │   ├── wsi_handler.py      # WSI image handling
│   │   ├── tile_processor.py   # Tile-based processing
│   │   └── metrics.py          # Metrics utilities
│   └── websocket/              # WebSocket handlers
│       └── __init__.py
├── frontend/                   # Web UI (TailAdmin-based)
│   ├── index.html              # Main HTML file
│   ├── js/                     # Modular JavaScript
│   │   ├── app.js              # Main entry point
│   │   ├── config.js           # Configuration
│   │   ├── api.js              # API calls
│   │   ├── workflows.js        # Workflow management
│   │   ├── visualization.js    # Visualization features
│   │   ├── monitoring.js       # Monitoring dashboard
│   │   ├── websocket.js        # WebSocket client
│   │   ├── workflow-form.js    # Workflow form handling
│   │   ├── utils.js            # Utility functions
│   │   └── refresh.js          # Auto-refresh logic
│   └── tailadmin-css/          # TailAdmin CSS
├── results/                    # Exported segmentation results
├── docker-compose.yml          # Docker deployment
├── Dockerfile                  # Backend Docker image
├── requirements.txt            # Python dependencies
├── prometheus.yml              # Prometheus configuration
├── verify-docker-setup.sh      # Docker setup verification script
└── README.md

```

## Setup Instructions

### Prerequisites

- **Python** 3.11+ (with pip)
- **Node.js** 18+ (for frontend CSS build)
- **Git** (for cloning InstanSeg)
- **NVIDIA GPU** (recommended for InstanSeg acceleration, but not required)

### Local Development

#### 1. Clone the Repository

```bash
git clone https://github.com/Jane1217/branch-aware-workflow-scheduler.git
cd branch-aware-workflow-scheduler
```

#### 2. Create Virtual Environment

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

#### 3. Install Python Dependencies

```bash
pip install -r requirements.txt
```

#### 4. Install InstanSeg

```bash
pip install git+https://github.com/instanseg/instanseg.git
```

#### 5. Build Frontend CSS (Required for UI)

```bash
npm install
npm run build:css
```

#### 6. Run the Application

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### 7. Access the Application

- **Frontend UI**: http://localhost:8000/ (or http://0.0.0.0:8000/)
- **API Documentation**: 
  - Swagger UI: http://localhost:8000/docs
  - ReDoc: http://localhost:8000/redoc
- **Health Check**: http://localhost:8000/health
- **Prometheus Metrics**: http://localhost:8000/metrics

### Docker Deployment

**Prerequisites**: Make sure Docker Desktop (or Docker daemon) is running on your system.

Start all services using Docker Compose:

```bash
# For Docker Compose v2 (recommended)
docker compose up -d

# Or for Docker Compose v1
docker-compose up -d
```

**Note**: If you see "Cannot connect to the Docker daemon", start Docker Desktop first.

This starts:
- **Backend API server** (port 8000)
- **Worker service** for job processing
- **Redis** for distributed queue and rate limiting (port 6379)
- **Prometheus** for metrics collection (port 9090)
- **Grafana** for metrics visualization (port 3000)

**Service URLs:**
- **API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3000 (username: `admin`, password: `admin`)

Optional: Verify configuration before starting:
```bash
./verify-docker-setup.sh
```

## API Documentation

The API is fully documented using OpenAPI 3.0 specification. Interactive documentation is available at:

- **Swagger UI**: http://localhost:8000/docs

### API Authentication

All API requests require the `X-User-ID` header for tenant identification. This is a simple header-based tenant identification system (no login/authentication required). You can use any string as the user ID:

```http
X-User-ID: user-123
```

**Note**: This is not a full authentication system. The `X-User-ID` header is used solely for:
- Multi-tenant isolation (each user sees only their own workflows)
- Active user limit enforcement (max 3 concurrent active users)
- Rate limiting per tenant

### Example: Create Workflow

```http
POST /api/workflows
Content-Type: application/json
X-User-ID: user-123

{
  "name": "Cell Segmentation Workflow",
  "jobs": [
    {
      "job_id": "job-1",
      "job_type": "cell_segmentation",
      "image_path": "/path/to/image.svs",
      "branch": "branch-1"
    },
    {
      "job_id": "job-2",
      "job_type": "tissue_mask",
      "image_path": "/path/to/image.svs",
      "branch": "branch-1",
      "depends_on": ["job-1"]
    }
  ]
}
```

### Key API Endpoints

- `POST /api/workflows` - Create a new workflow
- `GET /api/workflows` - List all workflows for the current user
- `GET /api/workflows/{workflow_id}` - Get workflow details
- `GET /api/jobs/{job_id}` - Get job details
- `GET /api/jobs/{job_id}/results` - Get job results
- `GET /api/visualization/{job_id}/visualization` - Get visualization data
- `GET /api/metrics/dashboard` - Get system metrics
- `WS /api/progress/ws` - WebSocket connection for real-time progress

For complete API documentation, visit http://localhost:8000/docs after starting the server.

## Scaling to 10× More Jobs/Users

To scale this system to handle 10× more jobs/users (e.g., from 100 to 1000 concurrent jobs, or from 3 to 30 active users), the following architectural changes are recommended:

### 1. Distributed Queue System

**Current**: In-memory queue using Python `deque` and `asyncio.Semaphore`

**Scaled Solution**: 
- Replace with **Redis Cluster** or **RabbitMQ** for distributed job queuing
- Implement distributed locks using Redis for branch-aware scheduling
- Use Redis Streams for job event distribution across multiple workers

**Benefits**: 
- Horizontal scalability across multiple API instances
- Persistent job queue (survives server restarts)
- Better fault tolerance and job recovery

### 2. Distributed Worker Pool

**Current**: Single-process worker pool with `ProcessPoolExecutor`

**Scaled Solution**:
- Implement **Celery** or **RQ (Redis Queue)** for distributed task execution
- Deploy dedicated worker nodes that pull jobs from the distributed queue
- Use worker pools with configurable concurrency per worker node

**Benefits**:
- True horizontal scaling of compute resources
- Independent scaling of API servers and workers
- Better resource utilization across multiple machines

### 3. Persistent Database

**Current**: In-memory storage for workflows and jobs

**Scaled Solution**:
- Migrate to **PostgreSQL** or **MongoDB** for workflow and job state persistence
- Use database transactions for atomic workflow updates
- Implement database indexes on `tenant_id`, `branch`, and `status` for efficient queries

**Benefits**:
- Data persistence across server restarts
- Complex querying capabilities (e.g., job history, analytics)
- ACID guarantees for multi-tenant data isolation

### 4. Caching Layer

**Current**: Direct access to workflow engine state

**Scaled Solution**:
- Add **Redis** as a caching layer for frequently accessed data
- Cache workflow states, job results, and metrics
- Implement cache invalidation strategies for real-time updates

**Benefits**:
- Reduced database load
- Faster API response times
- Better handling of read-heavy workloads

### 5. Load Balancing

**Current**: Single API instance

**Scaled Solution**:
- Deploy multiple API instances behind **nginx** or **HAProxy**
- Use consistent hashing for WebSocket connections (sticky sessions)
- Implement health checks and automatic failover

**Benefits**:
- High availability (no single point of failure)
- Horizontal scaling of API layer
- Better handling of traffic spikes

### 6. Monitoring and Observability

**Current**: Prometheus metrics endpoint

**Scaled Solution**:
- Deploy **Prometheus** for metrics collection
- Use **Grafana** for visualization and alerting
- Implement distributed tracing with **Jaeger** or **Zipkin**
- Add structured logging with **ELK Stack** (Elasticsearch, Logstash, Kibana)

**Benefits**:
- Real-time visibility into system performance
- Proactive alerting for issues
- Better debugging and performance optimization

### 7. Result Storage Optimization

**Current**: Local file system storage

**Scaled Solution**:
- Migrate to **S3-compatible object storage** (AWS S3, MinIO, etc.)
- Implement result compression and chunking for large files
- Use CDN for result delivery to reduce API server load

**Benefits**:
- Scalable storage capacity
- Better durability and backup capabilities
- Reduced API server storage I/O

### Implementation Priority

1. **Phase 1 (Immediate)**: Distributed queue (Redis) + Database (PostgreSQL)
2. **Phase 2 (Short-term)**: Distributed workers (Celery) + Load balancing
3. **Phase 3 (Long-term)**: Caching layer + Object storage + Advanced monitoring

## Testing and Monitoring in Production

This section describes how to verify system functionality and monitor system health in a production environment.

### Testing in Production

**API Testing**: Use the interactive Swagger UI at http://localhost:8000/docs to test endpoints directly.

**Integration Testing**: Test complete workflow lifecycle:
- Create workflows via `POST /api/workflows`
- Monitor progress via WebSocket or `GET /api/jobs/{job_id}`
- Retrieve results via `GET /api/jobs/{job_id}/results`

**Load Testing**: Use tools like Locust or Apache Bench to test under load. Monitor RPS, job throughput, response times (p50, p95, p99), and resource utilization.

### Monitoring in Production

The system provides **two monitoring approaches**:

#### 1. Built-in Web Dashboard (Recommended for Quick Monitoring)

Access the **Monitoring** tab in the web UI (http://localhost:8000/) to view:
- **Average Job Latency per minute**: Average total time for jobs completed in the last 60 seconds
- **Active Workers**: Currently running jobs (global and per-tenant)
- **Per-Branch Queue Depth**: Number of pending jobs per tenant and branch
- **Active Users**: Current number of concurrent active users

This dashboard uses the `/api/metrics/dashboard` endpoint which provides real-time metrics directly from the scheduler state.

#### 2. Prometheus + Grafana (Recommended for Production Monitoring)

For advanced monitoring and alerting:

**Metrics Collection**: The system exposes Prometheus metrics at `/metrics` endpoint. Key metrics include:
- `http_requests_total`, `http_request_duration_seconds`, `http_errors_total` (HTTP metrics)
- `jobs_total`, `job_latency_seconds` (job metrics by type, status, tenant)
- `queue_depth` (pending jobs per tenant and branch)
- `worker_active_jobs` (running jobs per tenant)
- `active_users` (concurrent active users)

**Setup**:
1. Prometheus automatically collects metrics from `/metrics` (configured in `prometheus.yml`)
2. Access Prometheus UI at http://localhost:9090 to query metrics
3. Access Grafana at http://localhost:3000 (username: `admin`, password: `admin`)
4. In Grafana, add Prometheus as data source (URL: `http://prometheus:9090`)
5. Create dashboards to visualize system health, job performance, and queue monitoring

**Alerting**: Set up alerts in Prometheus or Grafana for:
- High queue depth (> 100 jobs)
- High error rate (> 5%)
- Slow jobs (latency > SLA threshold)
- System overload (active users/jobs exceeding limits)

**Health Checks**: Monitor via `/health` endpoint. Check API server status, Redis connectivity, worker pool status, and resource availability.

## Exported Segmentation Results

The system exports per-cell segmentation results in JSON format. Results are saved in the `results/` directory with the naming pattern: `{workflow_id}_{job_id}_segmentation.json`.

### Result File Format

Each result file contains:

```json
{
  "cells": [
    {
      "cell_id": "cell_1.0_0",
      "label_id": 1,
      "polygon": [
        [175.5, 1003.0],
        [175.5, 1002.0],
        ...
      ],
      "area": 168,
      "centroid": [1873.46, 2919.74]
    },
    ...
  ],
  "total_cells": 4509,
  "tiles_processed": 42,
  "method": "tiled_parallel"
}
```

### Result Fields

- **`cells`**: Array of detected cells, each containing:
  - **`cell_id`**: Unique identifier for the cell
  - **`label_id`**: Segmentation label ID from InstanSeg
  - **`polygon`**: Array of `[y, x]` coordinate pairs defining the cell boundary in WSI coordinates
  - **`area`**: Cell area in pixels
  - **`centroid`**: `[x, y]` coordinates of the cell centroid
- **`total_cells`**: Total number of cells detected
- **`tiles_processed`**: Number of tiles processed
- **`method`**: Processing method used (`"tiled_parallel"` or `"direct"`)

### Example Result Files

Sample result files are included in the `results/` directory. For example:

- `34e26e14-da81-41d9-acb7-2743934bb4ee_job-1_segmentation.json`: Contains 4,509 detected cells with polygon coordinates and metadata

### Accessing Results

Results can be accessed via:

1. **API Endpoint**: `GET /api/jobs/{job_id}/results`
2. **File System**: Direct access to `results/` directory
3. **Visualization**: Use the Visualization tab in the web UI to view results

## License

MIT
