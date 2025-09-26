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

echo "--- Installing backend dependencies ---"
(cd backend && npm install)

echo ""
echo "--- Installing PM2 (a process manager for Node.js) ---"
npm install pm2 -g

echo ""
echo "--- Starting the NemOS backend server with PM2 ---"
# The --name flag gives our process an easy-to-remember name
pm2 start backend/server.js --name nemos-app

echo ""
echo "--- Configuring PM2 to start on server boot ---"
# This generates a command that you need to run
pm2 startup

echo ""
echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
echo "!!! ACTION REQUIRED !!!"
echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
echo "To make the server start automatically on boot, you must run the command that was just printed above this message."
echo "It will look something like: sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u <your_username> --hp <your_home_directory>"
echo "Please copy that command, paste it into your terminal, and run it now."
echo ""
echo "--- Installation complete ---"