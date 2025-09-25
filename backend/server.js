console.log('NemOS backend script started');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const crypto = require('crypto');
const WebSocket = require('ws');
const Docker = require('dockerode');
const simpleGit = require('simple-git');
const multer = require('multer');
const sqlite3 = require('sqlite3');
const axios = require('axios');
const os = require('os');
const pty = require('node-pty');
const systeminformation = require('systeminformation');

// --- CONFIGURATION ---
const PORT = 3000;
const STORAGE_PATH = path.join(__dirname, '../storage');
const VAULT_PATH = path.join(STORAGE_PATH, 'vault');
const ASSETS_PATH = path.join(STORAGE_PATH, 'assets');
const ASSETS_DB_PATH = path.join(STORAGE_PATH, 'assets.db');
const AI_DB_PATH = path.join(STORAGE_PATH, 'ai_studio.db');
const CLIPBOARD_DB_PATH = path.join(STORAGE_PATH, 'clipboard.db');
const SCRIPT_DECK_DB_PATH = path.join(STORAGE_PATH, 'script_deck.db');
const NGINX_SITES_AVAILABLE = '/etc/nginx/sites-available';

// --- INITIALIZATION ---
// Ensure storage directories exist
[STORAGE_PATH, VAULT_PATH, ASSETS_PATH].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Initialize Git repo for the vault if it doesn't exist
const git = simpleGit(VAULT_PATH, { config: [ `safe.directory=${VAULT_PATH}` ] });
if (!fs.existsSync(path.join(VAULT_PATH, '.git'))) {
    git.init().add('.').commit('Initial commit');
    // Add the vault path to Git's safe directories locally
    git.addConfig('safe.directory', VAULT_PATH, true, 'local');
    console.log('Initialized Git repository in vault and marked as safe.');
}

// Initialize databases
const assetsDb = new sqlite3.Database(ASSETS_DB_PATH, err => {
    if (err) console.error('Error opening assets DB:', err);
    else {
        assetsDb.run(`CREATE TABLE IF NOT EXISTS assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            mimetype TEXT,
            size INTEGER,
            tags TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});
const aiDb = new sqlite3.Database(AI_DB_PATH, err => {
    if(err) console.error('Error opening AI DB:', err);
    else {
        aiDb.serialize(() => {
            aiDb.run(`CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                name TEXT,
                model TEXT,
                messages TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            aiDb.run(`CREATE TABLE IF NOT EXISTS templates (
                id TEXT PRIMARY KEY,
                name TEXT,
                content TEXT
            )`);
        });
    }
});
const clipboardDb = new sqlite3.Database(CLIPBOARD_DB_PATH, err => {
    if (err) console.error('Error opening clipboard DB:', err);
    else {
        clipboardDb.serialize(() => {
            clipboardDb.run(`CREATE TABLE IF NOT EXISTS clipboard (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                createdAt INTEGER NOT NULL,
                tags TEXT,
                isPinned INTEGER DEFAULT 0
            )`);
            // Add orderIndex column if it doesn't exist
            clipboardDb.run('ALTER TABLE clipboard ADD COLUMN orderIndex INTEGER', (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                    console.error('Error adding orderIndex column to clipboard:', err);
                }
            });
        });
    }
});
const scriptDeckDb = new sqlite3.Database(SCRIPT_DECK_DB_PATH, err => {
    if (err) console.error('Error opening script deck DB:', err);
    else {
        scriptDeckDb.serialize(() => {
            scriptDeckDb.run(`CREATE TABLE IF NOT EXISTS scripts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                scriptType TEXT NOT NULL,
                scriptContent TEXT,
                isExecutable INTEGER DEFAULT 1,
                createdAt INTEGER NOT NULL,
                lastRunStatus TEXT DEFAULT 'idle',
                lastRunOutput TEXT
            )`);
            scriptDeckDb.run('ALTER TABLE scripts ADD COLUMN tags TEXT', (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                    console.error('Error adding tags column:', err);
                }
            });
            scriptDeckDb.run('ALTER TABLE scripts ADD COLUMN orderIndex INTEGER', (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                    console.error('Error adding orderIndex column to scripts:', err);
                }
            });
        });
    }
});


// Docker client
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// Setup shell for pty
const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

// --- SERVER SETUP ---
const server = http.createServer((req, res) => {
    // Set CORS headers for all responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // API Route Handling
    if (pathname.startsWith('/api/')) {
        const parts = pathname.split('/').filter(Boolean);
        const method = req.method;
        handleApiRoutes(req, res, method, parts);
        return;
    }

    // Static File Serving
    const staticBasePath = path.join(__dirname, '..');
    let filePath;

    if (pathname.startsWith('/assets/')) {
        filePath = path.join(ASSETS_PATH, pathname.substring('/assets/'.length));
    } else {
        filePath = path.join(staticBasePath, pathname === '/' ? 'index.html' : pathname);
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon'
    };
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                // Fallback to index.html for SPA routing
                fs.readFile(path.join(staticBasePath, 'index.html'), (err, indexContent) => {
                    if (err) {
                        // If index.html itself is not found, send a proper 404
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Not Found' }));
                    } else {
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(indexContent, 'utf-8');
                    }
                });
            } else {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Server Error' }));
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
    console.log('Upgrade request received for path:', request.url);
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

    if (pathname.startsWith('/api/docker/stats')) {
        wss.handleUpgrade(request, socket, head, ws => dockerStatsWss.emit('connection', ws, request));
    } else if (pathname.startsWith('/api/docker/containers/')) {
        wss.handleUpgrade(request, socket, head, ws => dockerLogsWss.emit('connection', ws, request));
    } else if (pathname.startsWith('/api/system/stats')) {
        wss.handleUpgrade(request, socket, head, ws => systemStatsWss.emit('connection', ws, request));
    } else if (pathname.startsWith('/api/network/ping')) {
        wss.handleUpgrade(request, socket, head, ws => networkPingWss.emit('connection', ws, request));
    } else if (pathname.startsWith('/api/shell')) {
         wss.handleUpgrade(request, socket, head, ws => shellWss.emit('connection', ws, request));
    } else if (pathname.startsWith('/api/docker/shell/')) {
        wss.handleUpgrade(request, socket, head, ws => dockerShellWss.emit('connection', ws, request));
    } else {
        socket.destroy();
    }
});

// --- ROUTE HANDLER ---
function handleApiRoutes(req, res, method, parts) {
    const [api, module, ...rest] = parts;

    if (api !== 'api') return sendResponse(res, 404, { error: 'Not Found' });

    // Special handling for asset uploads (multipart/form-data)
    if (module === 'assets' && rest[0] === 'upload' && method === 'POST') {
        handleAssets(req, res, method, rest);
        return;
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
        let payload = {};
        try {
            payload = body ? JSON.parse(body) : {};
        } catch (parseError) {
            console.error('JSON Parse Error:', parseError);
            return sendResponse(res, 400, { error: 'Invalid JSON payload' });
        }

        try {
            switch (module) {
                case 'script-deck':
                    if (rest[0] === 'run-script' && method === 'POST') {
                        await handleRunScript(payload, res);
                    } else {
                        await handleScriptDeckRoutes(req, res, method, rest, payload);
                    }
                    break;
                case 'vault':
                     if (rest[0] === 'tree' && method === 'GET') await handleGetVaultTree(res);
                     else if (rest[0] === 'file' && method === 'GET') await handleGetVaultFile(req.url, res);
                     else if (rest[0] === 'file' && method === 'POST') await handleSaveVaultFile(payload, res);
                     else if (rest[0] === 'action' && method === 'POST') await handleVaultAction(payload, res);
                     else sendResponse(res, 404, { error: 'Vault route not found' });
                    break;
                case 'docker':
                    if (rest[0] === 'containers' && rest[2] === 'action' && method === 'POST') await handleDockerAction(rest[1], payload, res);
                    else if (rest[0] === 'running-containers' && method === 'GET') await handleGetRunningContainers(res);
                    else if (rest[0] === 'compose' && rest[1] === 'up' && method === 'POST') await handleDockerComposeUp(payload, res);
                    else sendResponse(res, 404, { error: 'Docker route not found' });
                    break;
                 case 'network':
                    if (rest[0] === 'scan' && method === 'POST') await handleNetworkScan(payload, res);
                    else if (rest[0] === 'dns' && method === 'POST') await handleNetworkDns(payload, res);
                    else if (rest[0] === 'traceroute' && method === 'POST') await handleNetworkTraceroute(payload, res);
                    else sendResponse(res, 404, { error: 'Network route not found' });
                    break;
                 case 'assets':
                    // Asset upload handled above, other asset routes still need payload
                    await handleAssets(req, res, method, rest, payload);
                    break;
                 case 'proxy':
                    if (rest[0] === 'rules' && method === 'GET') await handleGetProxyRules(res);
                    else if (rest[0] === 'rules' && method === 'POST') await handleSaveProxyRule(payload, res);
                    else if (rest[0] === 'rules' && method === 'DELETE') await handleDeleteProxyRule(rest[1], res);
                    else if (rest[0] === 'action' && method === 'POST') await handleProxyAction(payload, res);
                    else sendResponse(res, 404, { error: 'Proxy route not found' });
                    break;
                 case 'utils':
                    if (rest[0] === 'resolve-url' && method === 'POST') await handleResolveUrl(payload, res);
                    else sendResponse(res, 404, { error: 'Utils route not found' });
                    break;
                 case 'ai':
                    if(rest[0] === 'status' && method === 'GET') await handleAiStatus(res);
                    else if(rest[0] === 'generate' && method === 'POST') await handleAiGenerate(payload, res);
                    else if(rest[0] === 'conversations' && method === 'GET') await handleGetConversations(res);
                    else if(rest[0] === 'conversations' && method === 'POST') await handleSaveConversation(payload, res);
                    else if(rest[0] === 'conversations' && method === 'DELETE') await handleDeleteConversation(rest[1], res);
                    else sendResponse(res, 404, { error: 'AI route not found' });
                    break;
                case 'clipboard':
                    await handleClipboardRoutes(req, res, method, rest, payload);
                    break;
                case 'kasm-credentials':
                    if (method === 'GET') {
                        sendResponse(res, 200, {
                            user: process.env.KASM_USER,
                            pass: process.env.KASM_PASS,
                        });
                    }
                    break;
                default:
                    sendResponse(res, 404, { error: 'Module not found' });
            }
        } catch (error) {
            console.error('API Error:', error);
            sendResponse(res, 500, { error: error.message || 'Internal Server Error' });
        }
    });
}


// --- API IMPLEMENTATIONS ---

// Clipboard Hub
async function handleClipboardRoutes(req, res, method, rest, payload) {
    const itemId = rest[0] === 'items' ? rest[1] : rest[0];

    if (method === 'GET' && rest[0] === 'items' && !itemId) {
        clipboardDb.all('SELECT * FROM clipboard ORDER BY isPinned DESC, orderIndex ASC, createdAt DESC', (err, rows) => {
            if (err) return sendResponse(res, 500, { error: err.message });
            rows.forEach(r => {
                r.tags = JSON.parse(r.tags || '[]');
                r.isPinned = Boolean(r.isPinned);
            });
            sendResponse(res, 200, rows);
        });
    } else if (method === 'POST' && rest[0] === 'items' && !itemId) {
        const { id, content, createdAt, tags, isPinned } = payload;
        if (!id || !content || !createdAt) return sendResponse(res, 400, { error: 'Missing required fields.' });
        const tagsJson = JSON.stringify(tags || []);
        const pinnedInt = isPinned ? 1 : 0;
        clipboardDb.run('INSERT INTO clipboard (id, content, createdAt, tags, isPinned) VALUES (?, ?, ?, ?, ?)',
            [id, content, createdAt, tagsJson, pinnedInt], function(err) {
                if (err) return sendResponse(res, 500, { error: err.message });
                sendResponse(res, 201, { id });
            });
    } else if (method === 'PUT' && rest[0] === 'items' && itemId) {
        const { content, tags, isPinned } = payload;
        const fields = [];
        const values = [];
        if (content !== undefined) { fields.push('content = ?'); values.push(content); }
        if (tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(tags)); }
        if (isPinned !== undefined) { fields.push('isPinned = ?'); values.push(isPinned ? 1 : 0); }
        if (fields.length === 0) return sendResponse(res, 400, { error: 'No fields to update.' });
        values.push(itemId);

        clipboardDb.run(`UPDATE clipboard SET ${fields.join(', ')} WHERE id = ?`, values, function(err) {
            if (err) return sendResponse(res, 500, { error: err.message });
            sendResponse(res, 200, { message: 'Item updated' });
        });
    } else if (method === 'DELETE' && rest[0] === 'items' && itemId) {
        clipboardDb.run('DELETE FROM clipboard WHERE id = ?', [itemId], function(err) {
            if (err) return sendResponse(res, 500, { error: err.message });
            sendResponse(res, 200, { message: 'Item deleted' });
        });
    } else if (method === 'POST' && rest[0] === 'clear-untagged') {
         clipboardDb.run("DELETE FROM clipboard WHERE isPinned = 0 AND (tags = '[]' OR tags IS NULL)", function(err) {
            if (err) return sendResponse(res, 500, { error: err.message });
            sendResponse(res, 200, { message: `${this.changes} items cleared.` });
        });
    } else if (method === 'POST' && rest[0] === 'reorder') {
        const { orderedIds } = payload;
        if (!Array.isArray(orderedIds)) {
            return sendResponse(res, 400, { error: 'orderedIds must be an array.' });
        }
        clipboardDb.serialize(() => {
            clipboardDb.run('BEGIN TRANSACTION');
            orderedIds.forEach((id, index) => {
                clipboardDb.run('UPDATE clipboard SET orderIndex = ? WHERE id = ?', [index, id]);
            });
            clipboardDb.run('COMMIT', (err) => {
                if (err) {
                    clipboardDb.run('ROLLBACK');
                    return sendResponse(res, 500, { error: 'Failed to save order.' });
                }
                sendResponse(res, 200, { message: 'Order updated successfully.' });
            });
        });
    }
    else {
        sendResponse(res, 404, { error: 'Clipboard route not found' });
    }
}

// Script Deck
async function handleScriptDeckRoutes(req, res, method, rest, payload) {
    const scriptId = rest[0] === 'scripts' ? rest[1] : null;

    if (method === 'GET' && !scriptId) {
        scriptDeckDb.all('SELECT * FROM scripts ORDER BY orderIndex ASC, createdAt DESC', (err, rows) => {
            if (err) return sendResponse(res, 500, { error: err.message });
            rows.forEach(r => {
                r.isExecutable = Boolean(r.isExecutable);
                r.tags = JSON.parse(r.tags || '[]');
            });
            sendResponse(res, 200, rows);
        });
    } else if (method === 'POST' && !scriptId) {
        const { id, name, description, scriptType, scriptContent, isExecutable, createdAt, tags } = payload;
        if (!id || !name || !scriptType || !createdAt) return sendResponse(res, 400, { error: 'Missing required fields.' });
        const tagsJson = JSON.stringify(tags || []);
        scriptDeckDb.run(
            'INSERT INTO scripts (id, name, description, scriptType, scriptContent, isExecutable, createdAt, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [id, name, description, scriptType, scriptContent, isExecutable ? 1 : 0, createdAt, tagsJson],
            function(err) {
                if (err) return sendResponse(res, 500, { error: err.message });
                sendResponse(res, 201, { id });
            }
        );
    } else if (method === 'PUT' && scriptId) {
        const { name, description, scriptType, scriptContent, isExecutable, lastRunStatus, lastRunOutput, tags } = payload;
        const fields = [], values = [];
        if (name !== undefined) { fields.push('name = ?'); values.push(name); }
        if (description !== undefined) { fields.push('description = ?'); values.push(description); }
        if (scriptType !== undefined) { fields.push('scriptType = ?'); values.push(scriptType); }
        if (scriptContent !== undefined) { fields.push('scriptContent = ?'); values.push(scriptContent); }
        if (isExecutable !== undefined) { fields.push('isExecutable = ?'); values.push(isExecutable ? 1 : 0); }
        if (lastRunStatus !== undefined) { fields.push('lastRunStatus = ?'); values.push(lastRunStatus); }
        if (lastRunOutput !== undefined) { fields.push('lastRunOutput = ?'); values.push(lastRunOutput); }
        if (tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(tags)); }
        if (fields.length === 0) return sendResponse(res, 400, { error: 'No fields to update.' });
        values.push(scriptId);

        scriptDeckDb.run(`UPDATE scripts SET ${fields.join(', ')} WHERE id = ?`, values, function(err) {
            if (err) return sendResponse(res, 500, { error: err.message });
            sendResponse(res, 200, { message: 'Script updated' });
        });
    } else if (method === 'DELETE' && scriptId) {
        scriptDeckDb.run('DELETE FROM scripts WHERE id = ?', [scriptId], function(err) {
            if (err) return sendResponse(res, 500, { error: err.message });
            sendResponse(res, 200, { message: 'Script deleted' });
        });
    } else if (method === 'POST' && rest[0] === 'reorder') {
        const { orderedIds } = payload;
        if (!Array.isArray(orderedIds)) {
            return sendResponse(res, 400, { error: 'orderedIds must be an array.' });
        }
        scriptDeckDb.serialize(() => {
            scriptDeckDb.run('BEGIN TRANSACTION');
            orderedIds.forEach((id, index) => {
                scriptDeckDb.run('UPDATE scripts SET orderIndex = ? WHERE id = ?', [index, id]);
            });
            scriptDeckDb.run('COMMIT', (err) => {
                if (err) {
                    scriptDeckDb.run('ROLLBACK');
                    return sendResponse(res, 500, { error: 'Failed to save order.' });
                }
                sendResponse(res, 200, { message: 'Order updated successfully.' });
            });
        });
    } else {
        sendResponse(res, 404, { error: 'Script Deck route not found' });
    }
}

async function handleRunScript({ scriptType, scriptContent }, res) {
    if (!scriptContent || !['bash', 'powershell', 'ahk'].includes(scriptType)) {
        return sendResponse(res, 400, { error: 'Invalid script type or empty content.' });
    }
    if (scriptType === 'ahk') {
        return sendResponse(res, 400, { error: 'Cannot execute AHK scripts on the Ubuntu server.' });
    }
    const fileExtension = scriptType === 'powershell' ? '.ps1' : '.sh';
    const tempFileName = `nemos-script-${crypto.randomBytes(8).toString('hex')}${fileExtension}`;
    const tempFilePath = path.join('/tmp', tempFileName);
    fs.writeFileSync(tempFilePath, scriptContent);
    fs.chmodSync(tempFilePath, '755');
    
    const command = scriptType === 'powershell' ? `pwsh ${tempFilePath}` : `bash ${tempFilePath}`;
    
    exec(command, (error, stdout, stderr) => {
        fs.unlinkSync(tempFilePath);
        sendResponse(res, 200, {
            success: !error,
            output: stdout || stderr,
            error: error ? error.message : null
        });
    });
}

// Docker
const dockerStatsWss = new WebSocket.Server({ noServer: true });
dockerStatsWss.on('connection', ws => {
    console.log('Docker stats client connected');
    const sendAllContainers = () => {
        docker.listContainers({ all: true }, (err, containers) => {
            if (err) {
                console.error('Docker list error:', err);
                return;
            }
            try {
                const simplifiedContainers = containers.map(c => ({
                    Id: c.Id,
                    Name: c.Names && c.Names.length > 0 ? c.Names[0].substring(1) : '(no name)',
                    Image: c.Image,
                    State: c.State,
                    Status: c.Status,
                    Ports: c.Ports,
                }));
                ws.send(JSON.stringify({ type: 'all-containers', payload: simplifiedContainers }));
            } catch (e) {
                console.error('Error simplifying or sending container data:', e);
            }
        });
    };
    sendAllContainers();
    const interval = setInterval(sendAllContainers, 2000);
    ws.on('close', () => {
        console.log('Docker stats client disconnected');
        clearInterval(interval);
    });
});
const dockerLogsWss = new WebSocket.Server({ noServer: true });
dockerLogsWss.on('connection', (ws, req) => {
    const containerId = req.url.split('/')[4];
    const container = docker.getContainer(containerId);
    if (!container) return ws.close();

    container.logs({ follow: true, stdout: true, stderr: true }, (err, stream) => {
        if (err) {
            console.error('Docker logs error:', err);
            return ws.close();
        }
        stream.on('data', chunk => ws.send(chunk.toString('utf8')));
        ws.on('close', () => stream.destroy());
    });
});

async function handleDockerAction(containerId, { action }, res) {
    const container = docker.getContainer(containerId);
    try {
        if (action === 'delete') {
            await container.remove({ force: true });
        } else {
            await container[action]();
        }
        sendResponse(res, 200, { message: `Container action '${action}' successful.` });
    } catch (error) {
        sendResponse(res, 500, { error: `Failed to ${action} container: ${error.message}` });
    }
}

async function handleGetRunningContainers(res) {
    try {
        const containers = await docker.listContainers();
        const simplifiedContainers = containers.map(c => ({
            Id: c.Id,
            Name: c.Names && c.Names.length > 0 ? c.Names[0].substring(1) : '(no name)',
        }));
        sendResponse(res, 200, simplifiedContainers);
    } catch (error) {
        sendResponse(res, 500, { error: `Failed to get running containers: ${error.message}` });
    }
}

async function handleDockerComposeUp({ yaml }, res) {
    if (!yaml) {
        return sendResponse(res, 400, { error: 'Docker Compose YAML content is required.' });
    }

    const tempDir = path.join(os.tmpdir(), `nemos-compose-${crypto.randomBytes(8).toString('hex')}`);
    const composeFilePath = path.join(tempDir, 'docker-compose.yml');

    try {
        fs.mkdirSync(tempDir, { recursive: true });
        fs.writeFileSync(composeFilePath, yaml);

        // Use 'docker-compose' command (Docker Compose V1 compatibility)
        const { stdout, stderr } = await new Promise((resolve, reject) => {
            exec(`docker-compose -f ${composeFilePath} up -d`, { cwd: tempDir }, (error, stdout, stderr) => {
                if (error) return reject(error);
                resolve({ stdout, stderr });
            });
        });

        sendResponse(res, 200, { message: 'Docker Compose deployed successfully.', output: stdout || stderr });
    } catch (error) {
        console.error('Docker Compose deployment error:', error);
        sendResponse(res, 500, { error: `Docker Compose deployment failed: ${error.message}` });
    } finally {
        // Clean up temporary directory and file
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    }
}

// Markdown Vault
async function handleGetVaultTree(res) {
    const readDir = (dir) => {
        const dirents = fs.readdirSync(dir, { withFileTypes: true });
        return dirents.map(dirent => {
            const resPath = path.join(dir, dirent.name);
            if (dirent.name === '.git') return null;
            if (dirent.isDirectory()) {
                return { name: dirent.name, type: 'folder', children: readDir(resPath) };
            }
            return { name: dirent.name, type: 'file' };
        }).filter(Boolean);
    };
    const tree = { name: 'Vault', type: 'folder', children: readDir(VAULT_PATH) };
    sendResponse(res, 200, tree);
}

async function handleGetVaultFile(reqUrl, res) {
    const url = new URL(reqUrl, `http://localhost`);
    const filePath = path.join(VAULT_PATH, url.searchParams.get('path'));
    if (fs.existsSync(filePath)) {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        fs.createReadStream(filePath).pipe(res);
    } else {
        sendResponse(res, 404, { error: 'File not found' });
    }
}

async function handleSaveVaultFile({ path: relPath, content }, res) {
    const absPath = path.join(VAULT_PATH, relPath);
    console.log(`Attempting to save file to: ${absPath}`);
    try {
        // Ensure the parent directory exists before writing the file
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        console.log(`Directory ensured for: ${path.dirname(absPath)}`);
    } catch (dirError) {
        console.error(`Error ensuring directory ${path.dirname(absPath)}:`, dirError);
        return sendResponse(res, 500, { error: `Failed to create directory: ${dirError.message}` });
    }

    try {
        fs.writeFileSync(absPath, content);
        console.log(`File written to: ${absPath}`);
    } catch (writeError) {
        console.error(`Error writing file ${absPath}:`, writeError);
        return sendResponse(res, 500, { error: `Failed to write file: ${writeError.message}` });
    }

    try {
        await git.add(absPath);
        await git.commit(`Updated ${relPath}`);
        console.log(`Git commit successful for: ${relPath}`);
    } catch (gitError) {
        console.error(`Error with Git operations for ${absPath}:`, gitError);
        return sendResponse(res, 500, { error: `Failed Git operation: ${gitError.message}` });
    }
    sendResponse(res, 200, { message: 'File saved' });
}

async function handleVaultAction({ action, path: relPath }, res) {
    const absPath = path.join(VAULT_PATH, relPath);
    console.log(`Attempting vault action: ${action} for path: ${absPath}`);
    try {
        if (action === 'create-file') {
            if (fs.existsSync(absPath)) {
                console.warn(`File already exists: ${absPath}`);
                throw new Error('File already exists.');
            }
            const parentDir = path.dirname(absPath);
            console.log(`Ensuring parent directory for file: ${parentDir}`);
            fs.mkdirSync(parentDir, { recursive: true });
            console.log(`Writing new file to: ${absPath}`);
            fs.writeFileSync(absPath, '# New Note\n');
            console.log(`File written. Attempting Git add and commit for: ${absPath}`);
            await git.add(absPath);
            await git.commit(`Created ${relPath}`);
            console.log(`Git commit successful for new file: ${relPath}`);
        } else if (action === 'create-folder') {
            if (fs.existsSync(absPath)) {
                console.warn(`Folder already exists: ${absPath}`);
                throw new Error('Folder already exists.');
            }
            console.log(`Creating new folder: ${absPath}`);
            fs.mkdirSync(absPath);
            const gitkeepPath = path.join(absPath, '.gitkeep');
            console.log(`Writing .gitkeep to: ${gitkeepPath}`);
            fs.writeFileSync(gitkeepPath, '');
            console.log(`.gitkeep written. Attempting Git add and commit for: ${gitkeepPath}`);
            await git.add(gitkeepPath);
            await git.commit(`Created folder ${relPath}`);
            console.log(`Git commit successful for new folder: ${relPath}`);
        } else if (action === 'delete') {
            if (!fs.existsSync(absPath)) {
                console.warn(`Item does not exist for deletion: ${absPath}`);
                throw new Error('Item does not exist.');
            }
            console.log(`Deleting item: ${absPath}`);
            fs.rmSync(absPath, { recursive: true, force: true });
            console.log(`Item deleted. Attempting Git add and commit for deletion.`);
            await git.add('.'); // Add all changes to stage deletion
            await git.commit(`Deleted ${relPath}`);
            console.log(`Git commit successful for deletion: ${relPath}`);
        }
        sendResponse(res, 200, { message: 'Action successful' });
    } catch (error) {
        console.error(`Error during vault action '${action}' for path '${absPath}':`, error);
        sendResponse(res, 500, { error: error.message || 'Internal Server Error' });
    }
}

// System Monitor
const systemStatsWss = new WebSocket.Server({ noServer: true });
systemStatsWss.on('connection', ws => {
    const sendSystemStats = async () => {
        try {
            const [cpu, mem, fsSize, networkStats] = await Promise.all([
                systeminformation.currentLoad(),
                systeminformation.mem(),
                systeminformation.fsSize(),
                systeminformation.networkStats()
            ]);
            ws.send(JSON.stringify({ cpu, mem, fsSize, networkStats }));
        } catch (error) {
            console.error("Error fetching system stats:", error);
        }
    };
    sendSystemStats();
    const interval = setInterval(sendSystemStats, 2000);
    ws.on('close', () => clearInterval(interval));
});


// Network Toolkit
async function handleNetworkScan({ target }, res) {
    exec(`nmap -F ${target}`, (error, stdout, stderr) => {
        sendResponse(res, 200, { output: stdout || stderr });
    });
}
async function handleNetworkDns({ domain }, res) {
    exec(`dig ${domain}`, (error, stdout, stderr) => {
        sendResponse(res, 200, { output: stdout || stderr });
    });
}
async function handleNetworkTraceroute({ host }, res) {
    exec(`traceroute ${host}`, (error, stdout, stderr) => {
        sendResponse(res, 200, { output: stdout || stderr });
    });
}
const networkPingWss = new WebSocket.Server({ noServer: true });
networkPingWss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://localhost`);
    const host = url.searchParams.get('host');
    if (!host) return ws.close();

    const ping = spawn('ping', [host]);
    ping.stdout.on('data', data => ws.send(data.toString()));
    ping.stderr.on('data', data => ws.send(data.toString()));
    ws.on('close', () => ping.kill());
});

// Asset Library
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, ASSETS_PATH),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage }).array('assets');

async function handleAssets(req, res, method, rest) {
    if (method === 'GET' && rest.length === 0) {
        assetsDb.all('SELECT * FROM assets ORDER BY created_at DESC', (err, rows) => {
            if (err) return sendResponse(res, 500, { error: err.message });
            rows.forEach(r => r.tags = JSON.parse(r.tags || '[]'));
            sendResponse(res, 200, rows);
        });
    } else if (method === 'POST' && rest[0] === 'upload') {
        upload(req, res, (err) => {
            if (err) return sendResponse(res, 500, { error: err.message });
            const stmt = assetsDb.prepare('INSERT INTO assets (filename, mimetype, size, tags) VALUES (?, ?, ?, ?)');
            req.files.forEach(file => {
                stmt.run(file.filename, file.mimetype, file.size, '[]');
            });
            stmt.finalize();
            sendResponse(res, 200, { message: 'Files uploaded' });
        });
    } else if (method === 'PUT' && rest.length === 1) {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const { tags } = JSON.parse(body);
            assetsDb.run('UPDATE assets SET tags = ? WHERE id = ?', [JSON.stringify(tags), rest[0]], (err) => {
                 if (err) return sendResponse(res, 500, { error: err.message });
                 sendResponse(res, 200, { message: 'Asset updated' });
            });
        });
    } else if (method === 'DELETE' && rest.length === 1) {
        const assetId = rest[0];
        assetsDb.get('SELECT filename FROM assets WHERE id = ?', [assetId], (err, row) => {
            if (err) return sendResponse(res, 500, { error: err.message });
            if (!row) return sendResponse(res, 404, { error: 'Asset not found' });

            const filePath = path.join(ASSETS_PATH, row.filename);
            fs.unlink(filePath, (unlinkErr) => {
                if (unlinkErr) {
                    console.error(`Error deleting file ${filePath}:`, unlinkErr);
                    return sendResponse(res, 500, { error: `Failed to delete file: ${unlinkErr.message}` });
                }
                assetsDb.run('DELETE FROM assets WHERE id = ?', [assetId], (dbErr) => {
                    if (dbErr) return sendResponse(res, 500, { error: dbErr.message });
                    sendResponse(res, 200, { message: 'Asset deleted' });
                });
            });
        });
    } else {
        sendResponse(res, 404, { error: 'Asset route not found' });
    }
}

// Proxy Configurator
async function handleGetProxyRules(res) {
    const files = fs.readdirSync(NGINX_SITES_AVAILABLE).filter(f => f.startsWith('nemos-'));
    const rules = files.map(file => {
        const content = fs.readFileSync(path.join(NGINX_SITES_AVAILABLE, file), 'utf-8');
        const domainMatch = content.match(/server_name\s+([^;]+);/);
        const targetMatch = content.match(/proxy_pass\s+([^;]+);/);
        const sslMatch = content.includes('listen 443 ssl');
        return {
            id: file.replace('nemos-', '').replace('.conf', ''),
            domain: domainMatch ? domainMatch[1] : 'N/A',
            target: targetMatch ? targetMatch[1] : 'N/A',
            ssl: sslMatch
        };
    });
    sendResponse(res, 200, rules);
}

async function handleSaveProxyRule(rule, res) {
    const id = rule.id.startsWith('new_') ? crypto.randomBytes(8).toString('hex') : rule.id;
    const filename = `nemos-${id}.conf`;
    const filePath = path.join(NGINX_SITES_AVAILABLE, filename);
    const config = generateNginxConfig(rule.domain, rule.target, rule.ssl);
    fs.writeFileSync(filePath, config);
    sendResponse(res, 200, { message: 'Rule saved', id });
}

async function handleDeleteProxyRule(ruleId, res) {
    const filename = `nemos-${ruleId}.conf`;
    const filePath = path.join(NGINX_SITES_AVAILABLE, filename);
    if(fs.existsSync(filePath)) fs.unlinkSync(filePath);
    sendResponse(res, 200, { message: 'Rule deleted' });
}

async function handleProxyAction({ action }, res) {
    const command = action === 'test' ? 'sudo nginx -t' : 'sudo systemctl reload nginx';
    exec(command, (error, stdout, stderr) => {
        sendResponse(res, 200, { output: stdout || stderr });
    });
}

function generateNginxConfig(domain, target, ssl) {
    let config = `server {
    server_name ${domain};

    location / {
        proxy_pass ${target};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
`;
    if (ssl) {
        config += `
    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}
server {
    if ($host = ${domain}) {
        return 301 https://$host$request_uri;
    }

    listen 80;
    server_name ${domain};
    return 404;
`;
    } else {
        config += `    listen 80;`;
    }
    config += `\n}`;
    return config;
}

// Utilities
async function handleResolveUrl({ url }, res) {
    try {
        const hops = [];
        let currentUrl = url;
        for (let i = 0; i < 10; i++) { // Limit redirects
            hops.push(currentUrl);
            const response = await axios.get(currentUrl, { maxRedirects: 0, validateStatus: null });
            if (response.status >= 300 && response.status < 400 && response.headers.location) {
                currentUrl = new URL(response.headers.location, currentUrl).href;
            } else {
                break;
            }
        }
        sendResponse(res, 200, { finalUrl: currentUrl, hops });
    } catch (error) {
        sendResponse(res, 500, { error: 'Could not resolve URL.' });
    }
}

// AI Studio
const OLLAMA_API_URL = 'http://localhost:11434';
async function handleAiStatus(res) {
    try {
        const response = await axios.get(`${OLLAMA_API_URL}/api/tags`);
        sendResponse(res, 200, { isOnline: true, models: response.data.models });
    } catch (error) {
        sendResponse(res, 200, { isOnline: false, models: [] });
    }
}
async function handleAiGenerate(payload, res) {
    try {
        const ollamaRes = await axios.post(`${OLLAMA_API_URL}/api/chat`, {
            model: payload.model,
            messages: payload.messages,
            stream: true,
        }, { responseType: 'stream' });

        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Transfer-Encoding': 'chunked'
        });
        ollamaRes.data.pipe(res);
    } catch (error) {
         sendResponse(res, 500, { error: 'Failed to connect to Ollama service.' });
    }
}
async function handleGetConversations(res) {
    aiDb.all('SELECT * FROM conversations ORDER BY created_at DESC', (err, rows) => {
        if (err) return sendResponse(res, 500, { error: err.message });
        rows.forEach(r => r.messages = JSON.parse(r.messages || '[]'));
        sendResponse(res, 200, rows);
    });
}
async function handleSaveConversation(convo, res) {
    const { id, name, model, messages } = convo;
    const messagesJson = JSON.stringify(messages);
    aiDb.run(`INSERT INTO conversations (id, name, model, messages) VALUES (?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET name=excluded.name, messages=excluded.messages, model=excluded.model`,
              [id, name, model, messagesJson], function(err) {
        if (err) return sendResponse(res, 500, { error: err.message });
        sendResponse(res, 200, { ...convo });
    });
}
async function handleDeleteConversation(convoId, res) {
    aiDb.run('DELETE FROM conversations WHERE id = ?', [convoId], (err) => {
        if(err) return sendResponse(res, 500, { error: err.message });
        sendResponse(res, 200, { message: 'Conversation deleted' });
    });
}

// Interactive Shell
const shellWss = new WebSocket.Server({ noServer: true });
shellWss.on('connection', ws => {
    const term = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: process.env.HOME,
        env: process.env
    });

    term.onData(data => ws.send(data));
    ws.on('message', message => {
        const { type, data } = JSON.parse(message);
        if (type === 'input') {
            term.write(data);
        } else if (type === 'resize') {
            term.resize(data.cols, data.rows);
        }
    });
    ws.on('close', () => term.kill());
});

// Docker Container Shell
const dockerShellWss = new WebSocket.Server({ noServer: true });
dockerShellWss.on('connection', (ws, req) => {
    const containerId = req.url.split('/').pop();
    if (!containerId) return ws.close();

    const term = pty.spawn('docker', ['exec', '-it', containerId, 'sh', '-c', "TERM=xterm-256color /bin/bash || /bin/sh"], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: process.env.HOME,
        env: process.env
    });

    term.onData(data => ws.send(data));
    ws.on('message', message => {
        const { type, data } = JSON.parse(message);
        if (type === 'input') {
            term.write(data);
        } else if (type === 'resize') {
            term.resize(data.cols, data.rows);
        }
    });
    ws.on('close', () => term.kill());
});


// --- UTILITY FUNCTIONS ---
function sendResponse(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

// --- START SERVER ---
server.listen(PORT, '0.0.0.0', () => {
    console.log(`NemOS backend server running on http://localhost:${PORT}`);
});

