<div align="center">
  <h1>Screen Time Monitor</h1>
  <p>Track how you spend time on your desktop. Build healthier digital habits.</p>
  <p>
    <img src="https://img.shields.io/badge/platform-Windows-0078D6?logo=windows" alt="Platform" />
    <img src="https://img.shields.io/badge/electron-33-47848F?logo=electron" alt="Electron" />
    <img src="https://img.shields.io/badge/react-19-61DAFB?logo=react" alt="React" />
    <img src="https://img.shields.io/badge/tests-69%20passed-brightgreen" alt="Tests" />
    <img src="https://img.shields.io/badge/license-MIT-blue" alt="License" />
  </p>
</div>

---

## Screenshots

*Placeholder — screenshots coming soon*

## Features

### Core Tracking
- Automatically records every application you use via `active-win`
- Idle detection — pauses tracking when you're away from the keyboard
- Privacy mode — optionally record only app names, never window titles
- All data stored locally in SQLite — nothing leaves your machine

### Reports & Analytics
- **Today** — real-time dashboard with app rankings, hourly heatmap, and pie chart
- **Weekly** — week-over-week comparison with daily breakdown
- **Monthly** — monthly totals with weekly trend visualization
- **Custom Range** — pick any date range, see trends, rankings, and totals
- CSV & PDF export for any report

### Focus Mode
- Whitelist productive apps; everything else counts as distracted time
- **Productivity Score** — daily focus/distraction ratio (0–100%)
- Focus vs. distracted breakdown on the Today page
- **Auto Schedule** — automatically enable Focus Mode on workdays (e.g. Mon–Fri, 9:00–18:00)

### Notifications
- **Pomodoro Timer** — configurable interval (15–60 min), reminds you to take breaks
- **Sedentary Reminder** — prompts you to stand up after prolonged sitting (30–120 min)

### User Experience
- **Floating Mini Widget** — always-on-top window showing current app + today's duration + focus status
- **Onboarding Wizard** — 3-step guided setup for first-time users
- Light / Dark / System theme toggle
- Full Chinese (zh-CN) and English localization
- Keyboard shortcuts — `Ctrl+Shift+P` to pause/resume tracking

### System Integration
- **Auto-launch** on Windows startup (registry-level, survives updates)
- System tray with today's summary and quick actions
- **Auto-update** via GitHub Releases (electron-updater)

## Tech Stack

| Layer | Stack |
|-------|-------|
| Runtime | Electron 33 |
| Frontend | React 19 · TypeScript · MUI 6 · Tailwind CSS |
| Charts | Recharts |
| State | Zustand |
| Database | SQLite (better-sqlite3) |
| i18n | i18next + react-i18next |
| Build | electron-vite 3 · electron-builder 25 |
| Test | Vitest |

## Installation

Download the latest installer from [Releases](https://github.com/3013197919/screen-time-monitor/releases) and run `Screen Time Monitor Setup x.x.x.exe`.

The app supports automatic updates — you'll be notified when a new version is available.

## Development

### Prerequisites
- Node.js ≥ 22
- npm ≥ 10
- Windows (for native modules `active-win`, `better-sqlite3`)

```bash
# Clone & install
git clone https://github.com/3013197919/screen-time-monitor.git
cd screen-time-monitor
npm install

# Start development
npm run dev

# Run tests (69 tests)
npm test

# Build production
npm run build

# Create NSIS Windows installer
npm run package:win
```

> **Note:** `npm run package:win` requires Visual Studio Build Tools with C++ workload and NSIS installed.

## Project Structure

```
├── electron/              # Main process
│   ├── main.ts            # App entry, IPC handlers, lifecycle
│   ├── preload.ts         # contextBridge API
│   ├── tracker.ts         # Window polling engine
│   ├── floating-window.ts # Floating mini widget
│   ├── notifications.ts   # Desktop notifications
│   ├── db/                # SQLite database & queries
│   └── services/          # auto-launch, reminder, focus-automation
├── src/                   # Renderer process (React)
│   ├── App.tsx            # Root component
│   ├── pages/             # Today, Weekly, Monthly, CustomRange, Settings
│   ├── components/        # Reusable UI components
│   ├── store/             # Zustand stores (tracker, settings, update)
│   ├── hooks/             # useReminder
│   ├── contexts/          # ThemeContext
│   ├── i18n/              # zh-CN & en locales
│   ├── types/             # TypeScript type definitions
│   └── utils/             # format, constants
├── tests/                 # Vitest test suite (69 tests)
├── docs/                  # Architecture & PRD documents
├── resources/             # App icons & tray assets
├── electron-builder.yml   # NSIS packaging config
└── electron.vite.config.ts # Build config
```

## License

MIT © Screen Time Monitor Team
