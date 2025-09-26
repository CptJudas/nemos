NemOS 
NemOS (Neil’s Modular Operating System) is a self-hosted, web-based dashboard designed to be a personal control center for IT workflows, automation, and creative exploration. It emphasizes a modular, personal, and extensible environment for scripting, monitoring, and documentation. Truthfully, I made this just for me. Suck it losers!

✨ **Core Features**
NemOS is built around a series of powerful, independent modules:

Clipboard Hub: A persistent clipboard history with tagging, previews, and search capabilities.

Script Deck: Launch, schedule, and monitor your favorite scripts (AHK, Bash, PowerShell) from a central UI.

Utilites: Right now focused on stripping url and texts for web filter entries

Container Control: A visual interface to manage Docker containers and Docker Compose stacks running on the NemOS system

Markdown Vault: Your own personal wiki with support for Mermaid diagrams and syntax highlighting, versioned with Git.

System Monitor: View real-time CPU, RAM, disk, and network statistics with configurable alerts.

Network Toolkit: A suite of tools including an IP scanner, DNS lookup, and a traceroute visualizer.

Asset Library: Upload and organize project files

Reverse Proxy Manager: Handle reverse proxy 

AI Prompt Studio: A web UI for running local AI models (not included in deployment)

Desktop: Links to stand-alone kasm desktop docker container (not included in deployment)

**Technical Stack**
Frontend: A reactive, modular framework (Vue.js or Svelte) styled with Tailwind CSS.

Backend: A lightweight core server using Node.js or Python (Flask/FastAPI).

Database: SQLite for primary data storage, with optional Redis for caching.



⚙️ **Getting Started on Ubuntu**
These instructions assume you have git, npm, docker, and docker-compose installed on your Ubuntu server.

Clone the repository:

  Step 1: Clone the Repository

  This downloads a full copy of your project from GitHub to the new machine.

   1 git clone https://github.com/CptJudas/nemos.git

  This will create a new nemos folder in your current directory.

  Step 2: Install Dependencies

  Navigate into the new project folder and run the installation script you created.

   1 cd nemos
   2 ./install.sh

  This runs the script and installs all the necessary Node.js packages for the backend.

  Step 3: Run the Application

  The `install.sh` script will automatically start the backend server for you using a process manager. You do not need to run it manually.

  To control the server, you can now use the following scripts:
  - `./start.sh` - Starts the backend server.
  - `./stop.sh` - Stops the backend server.

  You can check the status and logs of the server at any time with the command: `pm2 status`

**Access NemOS:**
Once the containers are running, you can access the NemOS dashboard by navigating to http://your-server-ip:port in your web browser.

### Step 4: Configure Autostart (Optional)

If you want the NemOS server to start automatically on system boot, you can use the provided `autostart.sh` script.

To enable autostart, run the following command:

```bash
./autostart.sh
```

This script will configure the necessary system services to ensure the backend server is always running.
