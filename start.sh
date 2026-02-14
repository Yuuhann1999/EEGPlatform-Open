#!/bin/bash

# Function to handle cleanup on exit
cleanup() {
    echo "Stopping all services..."
    kill $(jobs -p) 2>/dev/null
    exit
}

# Trap SIGINT (Ctrl+C)
trap cleanup SIGINT

echo "Starting EEGPlatform..."

# Check if backend venv exists, if not, create it
if [ ! -d "backend/.venv" ]; then
    echo "Creating Python virtual environment..."
    cd backend
    python3 -m venv .venv
    source .venv/bin/activate
    echo "Installing backend dependencies..."
    pip install -r requirements.txt
    cd ..
fi

# Start Backend
echo "Starting Backend..."
(cd backend && source .venv/bin/activate && python3 run.py) &

# Check if frontend node_modules exists, if not, install
if [ ! -d "frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd frontend
    npm install
    cd ..
fi

# Start Frontend
echo "Starting Frontend..."
(cd frontend && npm run dev) &

echo "Backend: http://localhost:8088"
echo "Frontend: http://localhost:5173"
echo "Press Ctrl+C to stop all services."

# Wait for all background processes
wait
