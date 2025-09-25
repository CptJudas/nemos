#!/bin/bash
# Stops the NemOS backend server using PM2

echo "Stopping NemOS backend..."
pm2 stop nemos-backend
echo "Done."
