import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { defineConfig } from 'vite';

function getLanIpv4Addresses() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    const low = String(name || '').toLowerCase();
    const isVirtual = /vethernet|wsl|hyper-v|vmware|virtualbox|vbox|loopback|tailscale|zerotier/.test(low);
    for (const addr of addrs || []) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      if (addr.address.startsWith('169.254.')) continue;
      const isPrivate =
        addr.address.startsWith('192.168.') ||
        addr.address.startsWith('10.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(addr.address);
      ips.push({
        address: addr.address,
        priority: (isPrivate ? 0 : 10) + (isVirtual ? 20 : 0),
      });
    }
  }
  ips.sort((a, b) => a.priority - b.priority);
  return [...new Set(ips.map((x) => x.address))];
}

const tunnelState = {
  status: 'idle',
  publicUrl: '',
  provider: '',
  error: '',
  port: 0,
  proc: null,
};
let tunnelSessionId = 0;

function stopPublicTunnel() {
  tunnelSessionId += 1;
  const proc = tunnelState.proc;
  tunnelState.proc = null;
  if (proc && !proc.killed) {
    try {
      proc.kill();
    } catch {
      // ignore
    }
  }
}

process.once('exit', stopPublicTunnel);

function ensurePublicTunnel(port, forceRestart = false) {
  if (process.env.SPS_NO_TUNNEL === '1') return tunnelState;
  if (
    !forceRestart &&
    tunnelState.proc &&
    tunnelState.port === port &&
    (tunnelState.status === 'starting' || tunnelState.status === 'ready')
  ) {
    return tunnelState;
  }

  stopPublicTunnel();
  const session = ++tunnelSessionId;
  tunnelState.status = 'starting';
  tunnelState.publicUrl = '';
  tunnelState.provider = '';
  tunnelState.error = '';
  tunnelState.port = port;

  const localCf = path.resolve(process.cwd(), 'tools', 'cloudflared.exe');
  const cfCmd = fs.existsSync(localCf) ? localCf : 'cloudflared';
  const cfProc = spawn(
    cfCmd,
    ['tunnel', '--url', `http://127.0.0.1:${port}`, '--protocol', 'http2', '--no-autoupdate'],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );
  tunnelState.proc = cfProc;

  const onChunk = (chunk) => {
    if (session !== tunnelSessionId) return;
    const text = String(chunk || '');
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/i);
    if (match && tunnelState.status !== 'ready') {
      tunnelState.publicUrl = match[0];
      tunnelState.status = 'ready';
      tunnelState.provider = 'cloudflare';
      tunnelState.error = '';
      console.log(`\n  ➜  SPS 2.0 Mobil Internet (4G/5G): ${match[0]}/\n`);
      try {
        const payload = JSON.stringify({
          ips: getLanIpv4Addresses(),
          port,
          publicUrl: match[0],
          tunnelStatus: 'ready',
          updatedAt: new Date().toISOString(),
        });
        for (const dir of ['dist', 'public']) {
          const dPath = path.resolve(process.cwd(), dir);
          if (fs.existsSync(dPath)) {
            fs.writeFileSync(path.join(dPath, 'tunnel-status.json'), payload, 'utf8');
          }
        }
      } catch {
        // ignore
      }
    }
  };

  cfProc.stdout?.on('data', onChunk);
  cfProc.stderr?.on('data', onChunk);
  cfProc.once('error', (err) => {
    if (session !== tunnelSessionId) return;
    tunnelState.status = 'error';
    tunnelState.error = err?.message || 'cloudflared error';
  });
  return tunnelState;
}

function attachSpsNetworkMiddleware(server) {
  const resolveBoundPort = () => {
    const addr = server.httpServer?.address();
    return typeof addr === 'object' && addr ? addr.port : 5185;
  };

  server.httpServer?.once('listening', () => {
    ensurePublicTunnel(resolveBoundPort());
  });
  server.httpServer?.once('close', stopPublicTunnel);

  server.middlewares.use((req, res, next) => {
    if (!req.url || !req.url.startsWith('/api/lan-info')) return next();
    const parsed = new URL(req.url, 'http://localhost');
    const port = resolveBoundPort();
    if (parsed.searchParams.get('restart') === '1') {
      ensurePublicTunnel(port, true);
    } else if (tunnelState.status === 'idle') {
      ensurePublicTunnel(port);
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(
      JSON.stringify({
        ips: getLanIpv4Addresses(),
        port,
        publicUrl: tunnelState.publicUrl || null,
        tunnelStatus: tunnelState.status,
        tunnelProvider: tunnelState.provider || null,
        tunnelError: tunnelState.error || null,
      }),
    );
  });
}

export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'sps-arch2-network',
      configureServer: attachSpsNetworkMiddleware,
      configurePreviewServer: attachSpsNetworkMiddleware,
    },
  ],
  server: { host: '0.0.0.0', port: 5185, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 5185, allowedHosts: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-three': ['three'],
        },
      },
    },
  },
});
