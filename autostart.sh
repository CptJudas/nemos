#!/bin/bash

# Get the absolute path of the script
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)

# Check if the service file already exists
if [ -f "/etc/systemd/system/nemos.service" ]; then
  echo "Nemos service already exists. Skipping creation."
else
  # Create a systemd service file
  sudo bash -c "cat <<EOF > /etc/systemd/system/nemos.service
[Unit]
Description=Nemos Service
After=network.target

[Service]
Type=simple
User=judas
WorkingDirectory=$SCRIPT_DIR
ExecStart=$SCRIPT_DIR/start.sh
Restart=on-failure
Environment=PM2_HOME=/home/judas/.pm2

[Install]
WantedBy=multi-user.target
EOF"

  # Reload systemd to recognize the new service
  sudo systemctl daemon-reload

  # Enable the service to start on boot
  sudo systemctl enable nemos.service

  echo "Nemos service has been created."
fi

# Start the service immediately
sudo systemctl start nemos.service

echo "Nemos service started."
echo "It will now start automatically on boot."