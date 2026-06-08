# Screen Time Monitor 项目记忆

## 项目概览
- Windows 桌面屏幕时间监控应用
- 技术栈：Electron + React 19 + TypeScript + MUI 6 + Tailwind CSS + SQLite
- 构建工具：electron-vite 3.x
- 包管理：npm
- 测试：Vitest (34 tests)

## 架构要点
- 主进程文件：`electron/main.ts`, `electron/tracker.ts`, `electron/db/queries.ts`
- 状态管理：Zustand (trackerStore, settingsStore)
- 主题：ThemeContext (light/dark/system)
- IPC：contextBridge 暴露 electronAPI

## v4 增量变更（2026-06-07）
- E-02 主题增强：StatusBar 快捷切换 + SettingsPage 外观分区 + 深色模式微调（代码已预置）
- E-03 开机自启完善：`electron/services/auto-launch-service.ts`（auto-launch 库），移除 `app.setLoginItemSettings()`
  - 新增 IPC：`app:get-auto-start-status`
  - settingsStore 新增 `autoStartLoading` 状态，失败回弹
- E-04 通知提醒：`electron/services/reminder-service.ts` + `src/hooks/useReminder.ts`
  - 番茄钟（默认 25min）+ 久坐提醒（默认 60min），通过 IPC push 到渲染进程弹出 Web Notification
  - tracker.ts 新增 `TrackerCallbacks` 回调接口，追踪状态变化通知 ReminderService
  - settingsStore 新增 4 个提醒字段 + 4 个 actions
  - 新增 4 个 settings KV key：pomodoro_enabled/interval, sedentary_enabled/interval
  - 新增 IPC：reminder:pomodoro-triggered, reminder:sedentary-triggered
- E-01 首次使用引导：待实现

## 关键配置
- `electron.vite.config.ts` — electron-vite 构建配置（注意：不是 vite.config.ts）
- `electron-builder.yml` — NSIS Windows 打包配置
- 预加载路径：`../preload/preload.js`（不是 ../preload/index.js）

## 已知限制
- Windows NSIS 打包需要 Visual Studio Build Tools（编译 native modules: active-win, better-sqlite3）
