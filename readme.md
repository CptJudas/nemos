NemOS 
NemOS (Neil’s Modular Operating System) is a self-hosted, web-based dashboard designed to be a personal control center for IT workflows, automation, and creative exploration. It emphasizes a modular, private, and extensible environment for scripting, monitoring, and documentation.

The project's aesthetic is a cosmic control center meets a minimalist hacker theme, with a focus on a dark, keyboard-first interface.

✨ Core Features
NemOS is built around a series of powerful, independent modules:

Clipboard Hub: A persistent clipboard history with tagging, previews, and search capabilities.

Script Deck: Launch, schedule, and monitor your favorite scripts (AHK, Bash, PowerShell) from a central UI.

Container Control: A visual interface to manage Docker containers and Docker Compose stacks.

Markdown Vault: Your own personal wiki with support for Mermaid diagrams and syntax highlighting, versioned with Git.

System Monitor: View real-time CPU, RAM, disk, and network statistics with configurable alerts.

Network Toolkit: A suite of tools including an IP scanner, DNS lookup, and a traceroute visualizer.

Technical Stack
Frontend: A reactive, modular framework (Vue.js or Svelte) styled with Tailwind CSS.

Backend: A lightweight core server using Node.js or Python (Flask/FastAPI).

Database: SQLite for primary data storage, with optional Redis for caching.

Deployment: Containerized with Docker and Docker Compose for simple, modular deployment.

⚙️ Getting Started on Ubuntu
These instructions assume you have git, docker, and docker-compose installed on your Ubuntu server.

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

  Start the backend server just like you would on your original machine.

   1 node backend/server.js

Access NemOS:
Once the containers are running, you can access the NemOS dashboard by navigating to http://your-server-ip:port in your web browser.

