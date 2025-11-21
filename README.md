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
│   │   ├── tenant_manager.py  # Multi-tenant management
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
│   │   └── storage.py          # Result storage service
│   ├── utils/                  # Utilities
│   │   ├── __init__.py
│   │   ├── wsi_handler.py      # WSI image handling
│   │   └── tile_processor.py   # Tile-based processing
│   └── websocket/              # WebSocket handlers
│       ├── __init__.py
│       └── progress.py         # Real-time progress updates
├── frontend/                   # Web UI (TailAdmin-based)
│   ├── index.html              # Main HTML file
│   ├── js/                     # Modular JavaScript
│   │   ├── app.js              # Main entry point
│   │   ├── config.js           # Configuration
│   │   ├── api.js              # API calls
│   │   ├── workflows.js        # Workflow management
│   │   ├── visualization.js    # Visualization features
│   │   └── monitoring.js        # Monitoring dashboard
│   └── tailadmin-css/          # TailAdmin CSS
├── results/                    # Exported segmentation results
├── tests/                      # Test files
├── docker-compose.yml          # Docker deployment
├── Dockerfile                  # Backend Docker image
├── requirements.txt            # Python dependencies
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
git clone <repository-url>
cd "Branch-Aware, Multi-Tenant Workflow Scheduler"
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

For production deployment, use Docker Compose:

```bash
docker-compose up -d
```

This will start:
- **Backend API server** (port 8000)
- **Worker service** for job processing
- **Redis** for distributed queue and rate limiting (port 6379)
- **Prometheus** for metrics collection (port 9090)
- **Grafana** for metrics visualization (port 3000)

#### Verify Docker Setup

Before starting, verify the Docker Compose configuration:

```bash
./verify-docker-setup.sh
```

This script checks that all required services are properly configured.

#### Service URLs

After starting all services:

- **API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3000 (username: `admin`, password: `admin`)

#### Docker Setup Details

**Required Services:**

The `docker-compose.yml` includes:
1. **api** - Backend API server (FastAPI)
2. **worker** - Worker service for job processing
3. **redis** - Redis for distributed queue and rate limiting
4. **prometheus** - Prometheus for metrics collection
5. **grafana** - Grafana for metrics visualization

**Quick Start:**

1. Verify configuration (optional but recommended):
   ```bash
   ./verify-docker-setup.sh
   ```

2. Start all services:
   ```bash
   docker-compose up -d
   ```

3. Check service status:
   ```bash
   docker-compose ps
   ```

4. View logs:
   ```bash
   docker-compose logs -f
   ```

**Service Dependencies:**

```
api ──┐
      ├──> redis
worker ──┘

prometheus ──> api

grafana ──> prometheus
```

**Health Checks:**

All services include health checks. Verify services are running:

```bash
# API
curl http://localhost:8000/health

# Redis
docker-compose exec redis redis-cli ping

# Prometheus
curl http://localhost:9090/-/healthy

# Grafana
curl http://localhost:3000/api/health
```

**Troubleshooting:**

- **Services not starting**: Check logs with `docker-compose logs`
- **Port conflicts**: Modify port mappings in `docker-compose.yml`
- **Redis connection issues**: Verify Redis is running with `docker-compose ps redis`
- **Prometheus not scraping**: Check targets at http://localhost:9090/targets

**Stopping Services:**

```bash
# Stop all services (keeps volumes)
docker-compose stop

# Stop and remove containers (keeps volumes)
docker-compose down

# Stop and remove containers and volumes
docker-compose down -v
```

**Scaling Workers:**

To scale the worker service:

```bash
docker-compose up -d --scale worker=3
```

## API Documentation

The API is fully documented using OpenAPI 3.0 specification. Interactive documentation is available at:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### API Authentication

All API requests require the `X-User-ID` header for tenant identification:

```http
X-User-ID: <user-uuid>
```

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

### Testing Strategy

#### 1. Unit Tests

Test individual components in isolation:

```bash
# Test scheduler logic
pytest tests/test_scheduler.py

# Test workflow engine
pytest tests/test_workflow_engine.py

# Test API endpoints
pytest tests/test_api.py
```

**Key Areas**:
- Branch-aware scheduling logic
- Multi-tenant isolation
- Job dependency resolution
- Workflow validation (duplicate IDs, circular dependencies)

#### 2. Integration Tests

Test API endpoints and workflow execution:

```bash
# Test complete workflow lifecycle
pytest tests/test_integration.py
```

**Key Scenarios**:
- Create workflow → Execute jobs → Retrieve results
- Multi-user concurrent workflow submission
- Job cancellation and cleanup
- Error handling and recovery

#### 3. Load Tests

Test system behavior under high load:

```bash
# Using Locust
locust -f tests/locustfile.py --host=http://localhost:8000
```

**Key Metrics**:
- Requests per second (RPS) capacity
- Job throughput (jobs/second)
- API response times (p50, p95, p99)
- Resource utilization (CPU, memory, GPU)

#### 4. End-to-End Tests

Test complete workflows from submission to completion:

```bash
# Test with real WSI images
pytest tests/test_e2e.py --image-path=/path/to/test.svs
```

**Key Scenarios**:
- Complete cell segmentation workflow
- Multi-job workflows with dependencies
- Real-time progress tracking
- Result visualization

### Monitoring in Production

#### 1. Metrics Collection

The system exposes Prometheus metrics at `/metrics`:

**Key Metrics**:
- `workflow_jobs_total`: Total number of jobs processed
- `workflow_jobs_active`: Currently active jobs
- `workflow_queue_depth`: Number of pending jobs per branch
- `job_latency_seconds`: Job execution time (histogram)
- `active_users`: Number of concurrent active users

**Example Prometheus Query**:
```promql
# Average job latency per minute
rate(job_latency_seconds_sum[1m]) / rate(job_latency_seconds_count[1m])

# Per-branch queue depth
workflow_queue_depth{tenant_id="user-1", branch="branch-1"}
```

#### 2. Dashboard Visualization

Use Grafana to create dashboards:

**Recommended Dashboards**:
- **System Health**: Overall system status, error rates, active users
- **Job Performance**: Job latency, throughput, success/failure rates
- **Queue Monitoring**: Queue depth per branch, wait times
- **Resource Utilization**: CPU, memory, GPU usage

#### 3. Alerting

Set up alerts for critical issues:

**Recommended Alerts**:
- **High Queue Depth**: Alert when queue depth exceeds threshold (e.g., > 100 jobs)
- **High Error Rate**: Alert when error rate exceeds 5%
- **Slow Jobs**: Alert when average job latency exceeds SLA (e.g., > 5 minutes)
- **System Resource Exhaustion**: Alert when CPU/memory usage exceeds 80%

#### 4. Logging

Implement structured logging:

**Log Levels**:
- **INFO**: Workflow creation, job completion, normal operations
- **WARNING**: Job failures, retries, resource constraints
- **ERROR**: System errors, API failures, unexpected exceptions
- **DEBUG**: Detailed execution traces (disabled in production)

**Log Aggregation**:
- Use ELK Stack (Elasticsearch, Logstash, Kibana) or similar
- Include correlation IDs for tracing requests across services
- Rotate logs regularly to manage disk space

#### 5. Health Checks

Monitor application health:

```bash
# Health check endpoint
curl http://localhost:8000/health
```

**Health Check Components**:
- Database connectivity (if using database)
- Redis connectivity (if using Redis)
- Worker pool status
- Disk space availability
- GPU availability (if using GPU)

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
