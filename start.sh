#!/bin/bash
# Starts the NemOS backend server using PM2

echo "Starting NemOS backend..."
pm2 start nemos-app
echo "Done."
