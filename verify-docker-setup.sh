#!/bin/bash

# Docker Compose Setup Verification Script
# This script verifies that all required services are properly configured and running

set -e

echo "=========================================="
echo "Docker Compose Setup Verification"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if docker-compose is installed
echo "1. Checking Docker Compose installation..."
DOCKER_COMPOSE_CMD=""
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
    echo -e "${GREEN}✓${NC} Docker Compose (v1) is installed"
elif docker compose version &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker compose"
    echo -e "${GREEN}✓${NC} Docker Compose (v2) is installed"
else
    echo -e "${RED}✗${NC} Docker Compose is not installed"
    exit 1
fi

# Check if docker-compose.yml exists
echo ""
echo "2. Checking docker-compose.yml file..."
if [ -f "docker-compose.yml" ]; then
    echo -e "${GREEN}✓${NC} docker-compose.yml exists"
else
    echo -e "${RED}✗${NC} docker-compose.yml not found"
    exit 1
fi

# Check if required services are defined
echo ""
echo "3. Checking required services in docker-compose.yml..."
REQUIRED_SERVICES=("api" "worker" "redis" "prometheus" "grafana")
MISSING_SERVICES=()

for service in "${REQUIRED_SERVICES[@]}"; do
    if grep -q "^  ${service}:" docker-compose.yml; then
        echo -e "${GREEN}✓${NC} Service '${service}' is defined"
    else
        echo -e "${RED}✗${NC} Service '${service}' is missing"
        MISSING_SERVICES+=("${service}")
    fi
done

if [ ${#MISSING_SERVICES[@]} -gt 0 ]; then
    echo -e "${RED}Error: Missing required services: ${MISSING_SERVICES[*]}${NC}"
    exit 1
fi

# Check if Dockerfile exists
echo ""
echo "4. Checking Dockerfile..."
if [ -f "Dockerfile" ]; then
    echo -e "${GREEN}✓${NC} Dockerfile exists"
else
    echo -e "${RED}✗${NC} Dockerfile not found"
    exit 1
fi

# Check if prometheus.yml exists
echo ""
echo "5. Checking Prometheus configuration..."
if [ -f "prometheus.yml" ]; then
    echo -e "${GREEN}✓${NC} prometheus.yml exists"
    # Check if it references the API service
    if grep -q "api:8000" prometheus.yml; then
        echo -e "${GREEN}✓${NC} Prometheus is configured to scrape API metrics"
    else
        echo -e "${YELLOW}⚠${NC} Prometheus configuration may not reference API service"
    fi
else
    echo -e "${RED}✗${NC} prometheus.yml not found"
    exit 1
fi

# Validate docker-compose.yml syntax
echo ""
echo "6. Validating docker-compose.yml syntax..."
if $DOCKER_COMPOSE_CMD config > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} docker-compose.yml syntax is valid"
else
    echo -e "${RED}✗${NC} docker-compose.yml has syntax errors"
    $DOCKER_COMPOSE_CMD config
    exit 1
fi

# Check if services can be started (dry run)
echo ""
echo "7. Testing service startup (dry run)..."
if $DOCKER_COMPOSE_CMD up -d --no-start > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} All services can be created"
    $DOCKER_COMPOSE_CMD down > /dev/null 2>&1
else
    echo -e "${RED}✗${NC} Failed to create services"
    $DOCKER_COMPOSE_CMD down > /dev/null 2>&1
    exit 1
fi

# Summary
echo ""
echo "=========================================="
echo -e "${GREEN}All checks passed!${NC}"
echo "=========================================="
echo ""
echo "To start all services, run:"
echo "  $DOCKER_COMPOSE_CMD up -d"
echo ""
echo "To check service status, run:"
echo "  $DOCKER_COMPOSE_CMD ps"
echo ""
echo "To view logs, run:"
echo "  $DOCKER_COMPOSE_CMD logs -f"
echo ""
echo "To stop all services, run:"
echo "  $DOCKER_COMPOSE_CMD down"
echo ""
echo "Service URLs (after starting):"
echo "  - API: http://localhost:8000"
echo "  - API Docs: http://localhost:8000/docs"
echo "  - Redis: localhost:6379"
echo "  - Prometheus: http://localhost:9090"
echo "  - Grafana: http://localhost:3000 (admin/admin)"
echo ""

