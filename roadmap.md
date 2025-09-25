NemOS Project Roadmap
This document outlines the planned development phases for NemOS, prioritizing features to deliver a stable and useful product incrementally. The roadmap is structured to build foundational modules first, followed by enhancements and future-facing features.

Phase 1: Core Functionality (High Priority)
Goal: Build the essential, high-priority modules that form the backbone of NemOS for daily IT workflows. This phase focuses on delivering the primary value proposition of the project.

âœ… Clipboard Hub:

Status: Complete

Description: Implement persistent, searchable clipboard history with support for tagging and pinning items.

âœ… Script Deck:

Status: Complete

Description: Create the interface for adding, editing, and launching bash, powershell, and AHK scripts. Includes an option to make scripts executable on the host.

âœ… Container Control:

Status: Complete

Description: Develop the visual dashboard for Docker management, allowing users to view, start, stop, and see logs for their containers.

âœ… Markdown Vault:

Status: Complete

Description: Build the personal wiki with a three-pane editor, live preview, and automatic Git versioning for all saved notes.

Phase 2: Expanding the Toolkit (Medium Priority)
Goal: Add monitoring, management, and utility modules to make NemOS a more comprehensive control center for a self-hosted environment.

í ½í¿¡ System Monitor:

Status: Complete

Description: Integrate real-time hardware and network monitoring with live-updating charts and stats.

í ½í¿¡ Network Toolkit:

Status: Complete

Description: Add the tabbed interface for nmap, ping, dns lookup, and traceroute tools.

í ½í¿¡ Asset Library:

Status: Complete

Description: Develop a system for managing creative and technical assets, including file uploads and a visual grid view.

í ½í¿¡ Reverse Proxy Configurator:

Status: Complete

Description: Create a visual editor for Nginx rules to simplify web service management.

Phase 3: Advanced Features & Extensibility (Low Priority & Future Goals)
Goal: Introduce advanced integrations and features that enhance user experience and open the door to community contributions and future growth.

í ½í²¡ AI Prompt Studio:

Status: Complete

Description: Build the interface for interacting with local AI models like Ollama, with conversation management.

í ½í²¡ Plugin System:

Status: Not Started

Description: Develop an API and framework for third-party community modules to extend NemOS functionality.

í ½í²¡ Mobile-Friendly Layout:

Status: Not Started

Description: Ensure the dashboard is accessible and usable on mobile devices for remote access.

í ½í²¡ Local LLM Assistant:

Status: Not Started

Description: Integrate a local language model to provide contextual help and control within the OS itself.

Future Vision (Beyond the Roadmap)
These are long-term, experimental goals to be explored once the core project is mature and stable.

í ½í´® Git-Backed Config Sync: Implement a system for syncing and rolling back application configurations using Git.

í ½í´® VR Overlay Integration: Explore an immersive VR interface for dashboards.

í ½í´® Full Self-Hosted Authentication: Migrate all data persistence from Firebase to a local SQLite database, integrated with an identity provider like Authentik.irebase to a local SQLite database, integrated with an identity provider like Authentik.