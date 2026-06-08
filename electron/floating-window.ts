import { BrowserWindow, ipcMain, screen } from 'electron';
import { join } from 'path';

let floatingWindow: BrowserWindow | null = null;

export function getFloatingWindow(): BrowserWindow | null {
  return floatingWindow;
}

export function createFloatingWindow(): void {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.focus();
    return;
  }

  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;

  floatingWindow = new BrowserWindow({
    width: 220,
    height: 72,
    x: screenWidth - 240,
    y: 80,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, '../preload/preload.js'),
    },
  });

  floatingWindow.setVisibleOnAllWorkspaces(true);
  floatingWindow.setAlwaysOnTop(true, 'floating');
  floatingWindow.setIgnoreMouseEvents(false);

  const html = getFloatingWindowHTML();
  floatingWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  floatingWindow.on('closed', () => {
    floatingWindow = null;
  });
}

export function updateFloatingWindow(data: {
  currentApp: string | null;
  focusMode: boolean;
  todayDuration: string;
  isTracking: boolean;
}): void {
  if (!floatingWindow || floatingWindow.isDestroyed()) return;

  floatingWindow.webContents.send('floating:update', data);
}

export function destroyFloatingWindow(): void {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.close();
    floatingWindow = null;
  }
}

export function isFloatingWindowVisible(): boolean {
  return floatingWindow !== null && !floatingWindow.isDestroyed();
}

function getFloatingWindowHTML(): string {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Inter, system-ui, -apple-system, sans-serif;
    background: transparent;
    overflow: hidden;
    -webkit-app-region: drag;
    user-select: none;
  }
  .card {
    background: rgba(15, 23, 42, 0.92);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: 14px;
    padding: 10px 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    transition: all 0.3s ease;
  }
  .indicator {
    width: 10px; height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .indicator.tracking { background: #22C55E; box-shadow: 0 0 8px rgba(34,197,94,0.6); }
  .indicator.paused { background: #F97316; box-shadow: 0 0 8px rgba(249,115,22,0.6); }
  .indicator.stopped { background: #6B7280; }
  .info { flex: 1; min-width: 0; }
  .app { color: #E2E8F0; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .duration { color: #94A3B8; font-size: 11px; margin-top: 2px; }
  .badge {
    font-size: 10px; padding: 2px 6px; border-radius: 8px;
    font-weight: 600; flex-shrink: 0;
  }
  .badge.focus { background: rgba(129,140,248,0.2); color: #A5B4FC; }
  .badge.off { background: rgba(148,163,184,0.15); color: #64748B; }
  .close-btn {
    position: absolute; top: 4px; right: 8px;
    color: #475569; font-size: 14px; cursor: pointer;
    line-height: 1; -webkit-app-region: no-drag;
  }
  .close-btn:hover { color: #94A3B8; }
</style>
</head>
<body>
  <div class="card" id="card">
    <div class="indicator stopped" id="indicator"></div>
    <div class="info">
      <div class="app" id="app">未开始追踪</div>
      <div class="duration" id="duration">今日 --</div>
    </div>
    <div class="badge off" id="badge">--</div>
    <div class="close-btn" id="closeBtn" onclick="handleClose()">✕</div>
  </div>
  <script>
    const appEl = document.getElementById('app');
    const durEl = document.getElementById('duration');
    const badgeEl = document.getElementById('badge');
    const indicatorEl = document.getElementById('indicator');

    function handleClose() {
      window.electronAPI?.app?.quitFloatingWindow?.();
    }

    window.electronAPI?.reminder?.onFloatingUpdate?.(function(data) {
      appEl.textContent = data.currentApp || '未开始追踪';
      durEl.textContent = '今日 ' + (data.todayDuration || '--');
      badgeEl.textContent = data.focusMode ? '专注' : '--';
      badgeEl.className = 'badge ' + (data.focusMode ? 'focus' : 'off');

      indicatorEl.className = 'indicator ' + (data.isTracking ? 'tracking' : 'stopped');
      if (data.currentApp && !data.isTracking) {
        indicatorEl.className = 'indicator paused';
      }
    });
  </script>
</body>
</html>`;
}
