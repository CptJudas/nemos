#!/bin/bash
# Installation script for NemOS

echo "--- Checking for npm ---"
if ! command -v npm &> /dev/null
then
    echo "npm could not be found, installing..."
    sudo apt-get update
    sudo apt-get install npm -y
else
    echo "npm is already installed."
fi

echo "--- Installing build dependencies ---"
sudo apt-get update
sudo apt-get install -y build-essential python3-distutils python3-setuptools

echo "--- Installing backend dependencies ---"
(cd backend && npm install)

echo ""
echo "--- Installing PM2 (a process manager for Node.js) ---"
sudo npm install pm2 -g

echo ""
echo "--- Installing Nginx ---"
sudo apt-get install nginx -y

echo ""
echo "--- Configuring Nginx for NemOS ---"
# Create Nginx configuration file
cat <<EOF | sudo tee /etc/nginx/sites-available/nemos.conf > /dev/null
server {
    listen 80;
    server_name _; # Listen on all available hostnames

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Enable the Nginx site
sudo ln -sf /etc/nginx/sites-available/nemos.conf /etc/nginx/sites-enabled/nemos.conf

# Remove default Nginx site
if [ -f "/etc/nginx/sites-enabled/default" ]; then
    sudo rm /etc/nginx/sites-enabled/default
fi

# Test Nginx configuration and restart
sudo nginx -t && sudo systemctl restart nginx

echo ""
echo "--- Starting the NemOS backend server with PM2 ---"
# The --name flag gives our process an easy-to-remember name
pm2 start backend/server.js --name nemos-app

echo "--- Waiting for server to start ---"
sleep 5

# Check if the server is running
if curl -s http://localhost:3000 > /dev/null; then
    echo "--- NemOS backend server started successfully! ---"
else
    echo "--- ERROR: NemOS backend server failed to start. ---"
    echo "Please check the logs with 'pm2 logs nemos-app'"
fi

echo ""
echo "--- Configuring PM2 to start on server boot ---"
# This generates a command that you need to run
pm2 startup

echo ""
echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
echo "!!! ACTION REQUIRED !!!"
!!!!!!!!!!!!!!!!!!!!!!!!!!!!
echo "To make the server start automatically on boot, you must run the command that was just printed above this message."
echo "It will look something like: sudo env PATH=\$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u <your_username> --hp <your_home_directory>"
echo "Please copy that command, paste it into your terminal, and run it now."
echo ""
echo "--- Installation complete ---"