const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const WebSocket = require('ws');
const pty = require('node-pty');

const ROOT_DIR = '/workspaces/terminal';

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const reqUrl = new URL(req.url, `http://${req.headers.host}`);

    // AI İçin Doğrudan Komut Çalıştırma Motoru
    if (reqUrl.pathname === '/api/exec' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { command } = JSON.parse(body);
                exec(command, { cwd: ROOT_DIR, maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({
                        stdout: stdout || '',
                        stderr: stderr || '',
                        exitCode: error ? error.code : 0,
                        error: error ? error.message : null
                    }));
                });
            } catch(e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // Dosya Listeleme API
    if (reqUrl.pathname === '/api/list') {
        let targetDir = reqUrl.searchParams.get('dir') || ROOT_DIR;
        try {
            targetDir = path.resolve(targetDir);
            const entries = fs.readdirSync(targetDir, { withFileTypes: true });
            const list = entries.map(e => {
                let size = 0;
                try {
                    if (!e.isDirectory()) size = fs.statSync(path.join(targetDir, e.name)).size;
                } catch(err) {}
                return {
                    name: e.name,
                    isDir: e.isDirectory(),
                    size: size,
                    fullPath: path.join(targetDir, e.name)
                };
            });
            list.sort((a, b) => (a.isDir === b.isDir) ? a.name.localeCompare(b.name) : (a.isDir ? -1 : 1));
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ currentDir: targetDir, parentDir: path.dirname(targetDir), items: list }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // Dosya Okuma API
    if (reqUrl.pathname === '/api/read') {
        const filePath = reqUrl.searchParams.get('file');
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ content, name: path.basename(filePath) }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Okunamadı: ' + err.message }));
        }
        return;
    }

    // Dosya İndirme API
    if (reqUrl.pathname === '/api/download') {
        const filePath = reqUrl.searchParams.get('file');
        try {
            if (!fs.existsSync(filePath)) throw new Error('Dosya yok');
            const filename = path.basename(filePath);
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
            res.setHeader('Content-Type', 'application/octet-stream');
            fs.createReadStream(filePath).pipe(res);
        } catch (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Dosya bulunamadi.');
        }
        return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Codespace Server Aktif');
});

// PTY Bash Terminal WebSocket
const wss = new WebSocket.Server({ server });
wss.on('connection', (ws) => {
    const shell = process.env.SHELL || 'bash';
    const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 30,
        cwd: ROOT_DIR,
        env: process.env
    });

    ptyProcess.onData(data => { if (ws.readyState === WebSocket.OPEN) ws.send(data); });

    ws.on('message', message => {
        try {
            const msg = JSON.parse(message);
            if (msg.type === 'input') ptyProcess.write(msg.data);
            else if (msg.type === 'resize') ptyProcess.resize(msg.cols, msg.rows);
        } catch(e) {
            ptyProcess.write(message.toString());
        }
    });

    ws.on('close', () => ptyProcess.kill());
});

server.listen(8080, '0.0.0.0', () => {
    console.log('Sunucu 8080 portunda aktif (AI Exec + Bash + Files)');
});
