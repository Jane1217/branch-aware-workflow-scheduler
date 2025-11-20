# Branch-Aware, Multi-Tenant Workflow Scheduler

A high-performance workflow scheduler for large-image inference tasks with branch-aware execution, multi-tenant isolation, and real-time progress tracking.

## Features

- **Branch-Aware Scheduling**: Serial execution within branches, parallel execution across branches
- **Multi-Tenant Isolation**: Each user sees only their own workflows
- **Active User Limit**: Maximum 3 concurrent active users
- **Real-Time Progress**: WebSocket-based progress tracking for workflows and jobs
- **Image Processing**: InstanSeg integration for cell segmentation and tissue mask generation
- **Workflow DAGs**: Define complex workflows with dependencies

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
│   │   └── progress.py         # Progress tracking endpoints
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
├── frontend/                   # Simple web UI
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── tests/                      # Test files
├── docker-compose.yml          # Docker deployment
├── Dockerfile                  # Backend Docker image
├── requirements.txt            # Python dependencies
└── README.md

```

## Setup Instructions

### Local Development

1. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Install InstanSeg:
```bash
pip install git+https://github.com/instanseg/instanseg.git
```

4. Run the application:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

5. Access the API documentation:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### Docker Deployment

```bash
docker-compose up -d
```

## API Usage

All requests require the `X-User-ID` header for tenant identification:

```http
X-User-ID: <user-uuid>
```

### Create Workflow

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

## Scaling to 10× More Jobs/Users

To scale this system to handle 10× more jobs/users:

1. **Distributed Queue**: Replace in-memory queue with Redis Cluster or RabbitMQ
2. **Worker Pool**: Implement distributed workers using Celery or similar
3. **Database**: Migrate from in-memory to PostgreSQL for persistence
4. **Caching**: Add Redis for caching workflow states and results
5. **Load Balancing**: Use nginx or similar for API load balancing
6. **Horizontal Scaling**: Deploy multiple API instances behind a load balancer
7. **Monitoring**: Implement comprehensive monitoring with Prometheus and Grafana

## Testing and Monitoring in Production

### Testing Strategy

1. **Unit Tests**: Test individual components (scheduler, workflow engine)
2. **Integration Tests**: Test API endpoints and workflow execution
3. **Load Tests**: Use Locust or similar to test high QPS scenarios
4. **End-to-End Tests**: Test complete workflows from submission to completion

### Monitoring

1. **Metrics**: Expose Prometheus metrics for queue depth, job latency, active workers
2. **Logging**: Structured logging with correlation IDs for tracing
3. **Alerting**: Set up alerts for queue depth, error rates, and latency
4. **Dashboard**: Grafana dashboard for real-time system health

## License

MIT

