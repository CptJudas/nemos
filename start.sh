#!/bin/bash
# Starts the NemOS backend server using PM2

# Log file path
LOG_FILE="/home/judas/nemos/start.log"

# Redirect stdout and stderr to the log file
exec >> "$LOG_FILE" 2>&1

echo "Starting NemOS backend..."
echo "---"
echo "Date: $(date)"
echo "User: $(whoami)"
echo "Current directory: $(pwd)"
echo "---"
echo "Node path: $(which node)"
echo "Node version: $(node -v)"
echo "---"
echo "PM2 path: $(which pm2)"
echo "PM2 version: $(pm2 -v)"
echo "---"
echo "Environment variables:"
printenv
echo "---"

cd backend
echo "Installing backend dependencies..."
npm install
echo "Starting server with PM2..."
pm2 start server.js --name nemos-app
pm2 save
echo "Done."