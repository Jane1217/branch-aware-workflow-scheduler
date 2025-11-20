#!/bin/bash
# Quick script to stop the uvicorn server

echo "Stopping uvicorn server on port 8000..."

# Find and kill uvicorn processes
pkill -f "uvicorn app.main:app"

# Also kill any Python processes running the app
pkill -f "python.*app.main"

echo "Server stopped. You can now restart with: uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

