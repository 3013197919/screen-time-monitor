# Screen Time Monitor v4 增量 PRD

> 版本: v4.0（增量） | 日期: 2026-06-07 | 基准版本: v3.0 (docs/incremental_prd_v3.md)
>
> 本文档仅描述 v4 **增量变更**，不重复已有功能。已有功能详见 `docs/system_design_v3.md` 和 `docs/incremental_prd_v3.md`。

---

## 零、当前状态盘点（v3 开发完成后基准）

v3 已交付以下功能，本文档在此基础上进行 v4 增量设计：

**v3 版本已有**：

| # | v3 功能 | 现状 |
|---|---------|------|
| 1 | Focus Mode 专注模式 | 已完成：白名单设置、状态栏一键切换、今日页专注/分心对比卡片 |
| 2 | 应用搜索 | 已完成：AppUsageList 顶部模糊搜索 |
| 3 | 自动更新 (electron-updater) | 已完成：启动检查 + 手动检查 + 下载安装 |
| 4 | 自定义日期范围统计 | 已完成：CustomRangePage，快捷选项 + 日期选择器 |
| 5 | 多语言 i18n (react-i18next) | 已完成：中英文切换，托盘菜单同步更新 |
| 6 | ThemeContext (浅色/深色/跟随系统) | **已有基础**：`src/contexts/ThemeContext.tsx` 实现，SettingsPage 已有下拉选择器 |
| 7 | 开机自启 | **已有基础**：SettingsPage 已有 Switch，通过 `app.setLoginItemSettings()` 实现 |

**v4 新增功能（4 项，全部为体验打磨）**：

| # | v4 功能 | 目标 |
|---|---------|------|
| E-01 | 首次使用引导 (Onboarding Wizard) | 降低新用户上手门槛，3-4 步引导完成初始设置 |
| E-02 | 深色/浅色主题增强 | 完善 ThemeContext，增加状态栏快捷图标，视觉细节调优 |
| E-03 | 开机自启完善 | 引入 `electron-auto-launch` 库，持久化到 settings 表，修复注册表可靠性 |
| E-04 | 通知提醒 | 番茄钟提醒（默认 25 分钟）+ 久坐提醒（默认 60 分钟），设置页可配 |

> **定位**: v4 是「体验打磨」版本，不做核心功能扩展，聚焦新用户上手体验和已交付功能的细节完善。4 个需求均为独立模块，改动范围可控。

---

## 一、产品目标

1. **降低首次使用门槛**: Onboarding Wizard 引导用户在 3 步内完成核心偏好设置（开机自启、通知偏好），让用户「打开即用」而非「打开即跑」
2. **主题体验闭环**: 在已有 ThemeContext 基础上补充快捷切换入口和视觉一致性，让深色/浅色切换成为自然的使用习惯而非隐藏设置
3. **开机自启可靠性**: 用成熟的 `electron-auto-launch` 替代当前简单的 `app.setLoginItemSettings()`，解决 Windows 注册表跨环境兼容问题，持久化到 settings 表确保状态一致性
4. **健康时间感知**: 番茄钟 + 久坐提醒让追踪工具从「冷冰冰的数据」升级为「关心你健康的伙伴」，增加使用粘性

---

## 二、用户故事

| ID | 作为… | 我想要… | 以便… |
|----|-------|---------|-------|
| US-13 | 刚下载安装的新用户 | 首次启动时看到一个简短的引导向导，帮我设置好开机自启和通知偏好 | 不用翻设置页就能完成基础配置，快速开始使用 |
| US-14 | 深夜工作的开发者 | 在状态栏一键切换到深色模式 | 不进入设置页就能在夜间保护眼睛 |
| US-15 | 多台电脑用户 | 开机自启功能稳定可靠，每次换电脑登录后自动开始追踪 | 不需要每次手动启动软件 |
| US-16 | 长期伏案工作者 | 每坐 60 分钟收到一次起来活动提醒 | 避免久坐带来的健康问题 |
| US-17 | 使用番茄工作法的效率爱好者 | 每 25 分钟专注后收到提醒休息 | 不需要额外安装番茄钟工具 |
| US-18 | 已完成引导的用户 | 在设置页重新触发引导向导 | 回顾和修改自己的初始选择 |
| US-19 | 偏好跟随系统的用户 | 状态栏的快捷主题切换不影响我「跟随系统」的设定 | 临时切换暗色后，下次跟随系统时恢复正确模式 |

---

## 三、需求池

---

### E-01: 首次使用引导 (Onboarding Wizard)

**背景**: 当前应用安装后直接进入今日页面，新用户面对一个空白仪表盘和多个设置项，不知道从哪里开始。首次体验决定了用户是否会继续使用。本需求为全新模块。

**概念模型**:
- **触发时机**: 应用检测到 `localStorage` 中无 `onboarding_completed` 标记时自动展示
- **引导步骤**: 3 步，使用 MUI Stepper 组件
  - Step 1「欢迎」: 品牌介绍 + 功能介绍（3 个核心亮点卡片）
  - Step 2「偏好设置」: 开机自启开关 + 通知提醒开关（番茄钟 + 久坐）
  - Step 3「完成」: 祝贺页，总结已选择的设置，一键进入主界面
- **可重新触发**: 设置页底部提供「重新运行引导向导」按钮，点击后清除标记并显示 Wizard

**增量变更**:

**新建组件** (`src/components/onboarding/OnboardingWizard.tsx`):
- 全屏 Dialog（MUI Dialog fullScreen），覆盖在当前界面上方
- MUI Stepper 组件展示步骤进度（horizontal stepper，适配 3 步）
- Step 1「欢迎」内容：
  - 应用 Logo + 标题「欢迎使用 Screen Time Monitor」
  - 3 个 Feature Card：
    - 「自动追踪」: 无需手动操作，自动记录每个应用的使用时长
    - 「数据洞察」: 日报/周报/月报，可视化你的时间去向
    - 「专注模式」: 设置白名单，屏蔽分心应用，保持专注
- Step 2「偏好设置」内容：
  - 开机自启 Switch（带说明：「电脑启动时自动运行 Screen Time Monitor」）
  - 番茄钟提醒 Switch（默认开，25 分钟）+ 时间选择器
  - 久坐提醒 Switch（默认开，60 分钟）+ 时间选择器
- Step 3「完成」内容：
  - 完成图标（MUI CheckCircleOutline 大图标 + 绿色）
  - 文案：「一切就绪！Screen Time Monitor 将自动在后台追踪你的使用习惯」
  - 已选设置摘要（如：「已开启开机自启」「番茄钟提醒：25 分钟」）
  - 「开始使用」按钮 → 关闭 Dialog，写入 `onboarding_completed` 标记
- 每个 Step 底部：「上一步」/「下一步」/「跳过」按钮
  - Step 1 可「跳过」→ 直接进入 Step 3（完成页，设置使用默认值）
  - Step 2 可「跳过」→ 使用默认值进入 Step 3
  - Step 3 不可跳过

**入口逻辑** (`src/App.tsx`):
- `AppContent` 中新增 `showOnboarding` 状态
- `useEffect` 检查 `localStorage.getItem('onboarding_completed')`
- 若为 `null` → `setShowOnboarding(true)`

**设置页入口** (`src/pages/SettingsPage.tsx`):
- 在"通用"分区最底部新增「重新运行引导向导」按钮（MUI Button variant="outlined"）
- 点击 → 清除 `localStorage.removeItem('onboarding_completed')` → `setShowOnboarding(true)`

**与 E-03 / E-04 联动**:
- Step 2 的偏好设置结果直接写入 settingsStore：
  - 开机自启 → `settingsStore.setAutoStart(enabled)`
  - 番茄钟提醒 → 写入 settings 表 `pomodoro_enabled` / `pomodoro_interval`
  - 久坐提醒 → 写入 settings 表 `sedentary_enabled` / `sedentary_interval`

**新增设置 Key** (settings 表):

| Key | 类型 | 默认值 | 说明 |
|-----|------|--------|------|
| `onboarding_completed` | `"true"` / absent | absent | 标记引导是否完成（也存 localStorage 做快速判断） |

**验收标准**:
- [ ] 首次启动（localStorage 无标记）自动展示 Onboarding Wizard
- [ ] 3 步引导均可正常前进/后退/跳过
- [ ] Step 2 的偏好设置修改即时写入 settingsStore
- [ ] Step 3 点击「开始使用」后关闭 Wizard，进入正常界面
- [ ] 关闭后 localStorage 写入 `onboarding_completed = true`
- [ ] 设置页「重新运行引导向导」可重新触发
- [ ] 跳过引导时使用默认值（开机自启: 关，番茄钟: 25 分钟 & 开，久坐: 60 分钟 & 开）
- [ ] 引导页面的所有文案走 i18n 翻译

**涉及文件**: `src/components/onboarding/OnboardingWizard.tsx` (新增), `src/App.tsx`, `src/pages/SettingsPage.tsx`, `src/i18n/locales/zh-CN.json`, `src/i18n/locales/en.json`

---

### E-02: 深色/浅色主题增强

**背景**: 项目已有 `ThemeContext` (light/dark/system 三模式) 和 SettingsPage 中的 Select 选择器。但切换入口隐藏较深（设置页 > 通用 > 下拉框，需 3 步操作）。本需求在现有基础上增加快捷切换入口和视觉调优，不改变底层机制。

**现有代码基准**:
- `src/contexts/ThemeContext.tsx` — 第 12 行定义 `ThemeMode = 'light' | 'dark' | 'system'`，第 13 行 `ResolvedMode = 'light' | 'dark'`，第 47-57 行 `readStoredTheme()` 从 localStorage 读取
- `src/pages/SettingsPage.tsx` — 第 261 行已有 Select 下拉框切换 `themeMode`，调用 `setThemeMode()`
- `src/App.tsx` — 第 43-75 行 `createAppTheme()` 创建 MUI theme，第 254-268 行 `ThemedApp` 用 `resolvedMode` 驱动

**增量变更**:

**状态栏快捷图标** (`src/components/StatusBar.tsx`):
- 调用 `useThemeMode()` 获取 `mode` 和 `setMode`
- 新增图标按钮（lucide-react 的 `Sun` / `Moon` / `Monitor` 图标）
- 交互逻辑：
  - 当前为 `light` → 点击切换为 `dark`
  - 当前为 `dark` → 点击切换为 `system`
  - 当前为 `system` → 点击切换为 `light`（三态循环）
  - Tooltip 显示当前模式名称（走 i18n）
- 视觉效果：
  - `light` 模式：黄色 Sun 图标
  - `dark` 模式：蓝色 Moon 图标
  - `system` 模式：灰色 Monitor 图标
- 点击直接调用 `setMode()`，无需额外 IPC

**设置页主题分区重新组织** (修改 SettingsPage.tsx 现有代码):
- 将主题选择器从"通用"分区移至独立「外观 / Appearance」分区
- 新增分区标题：「外观 / Appearance」（走 i18n）
- 分区内容改为 ToggleButtonGroup（与语言切换风格一致，不再使用 Select）：
  ```
  [浅色] [深色] [跟随系统]
  ```
- ToggleButtonGroup 点击直接调用 `setThemeMode()`，即显效果
- 移除原 Select + MenuItem 实现

**MUI 主题微调** (修改 `src/App.tsx` `createAppTheme()`):
- 深色模式下的 `scrollbar` 颜色适配（`::-webkit-scrollbar-thumb` 深色背景更暗）
- 深色模式下 `MuiDrawer-paper` 的 border 颜色加深
- `shape.borderRadius` 保持 12 不变
- MUI CssBaseline 已处理大部分全局样式，本次仅补缺

**验收标准**:
- [ ] 状态栏显示主题切换图标按钮
- [ ] 点击状态栏图标可在 浅色/深色/跟随系统 之间循环切换
- [ ] 切换即时生效，无闪烁或布局错乱
- [ ] Tooltip 正确显示当前主题名称（含 i18n 翻译）
- [ ] 设置页「外观」分区使用 ToggleButtonGroup，风格与语言分区一致
- [ ] 深色模式下所有文本、卡片、图表、按钮清晰可读
- [ ] 主题选择持久化到 localStorage，重启不变
- [ ] 跟随系统模式下，切换 OS 主题后应用自动响应

**涉及文件**: `src/components/StatusBar.tsx`, `src/pages/SettingsPage.tsx`, `src/App.tsx`, `src/i18n/locales/zh-CN.json`, `src/i18n/locales/en.json`

---

### E-03: 开机自启完善

**背景**: SettingsPage 已有开机自启 Switch，当前使用 Electron 内建 `app.setLoginItemSettings()` 实现。但实际测试中发现该 API 在不同 Windows 版本上行为不一致（Windows 10 vs 11、管理员权限 vs 普通用户）。本需求引入成熟的 `electron-auto-launch` 库作为增强方案，并将开关状态持久化到 settings 表确保跨环境一致性。

**现有代码基准**:
- `src/store/settingsStore.ts` — 第 147-157 行 `setAutoStart()` 通过 `window.electronAPI.settings.set('auto_start', String(enabled))` 写入 settings 表
- `src/pages/SettingsPage.tsx` — 第 256 行已有 Switch 控件，绑定 `autoStart` 状态

**增量变更**:

**新增 npm 依赖**:
- `auto-launch` (`^5.0.6`) — 跨平台开机自启库，通过注册表 / plist / .desktop 文件实现

**主进程——AutoLaunch 服务** (`electron/services/auto-launch-service.ts` 新增):
- 封装 `AutoLaunch` 实例：
  ```typescript
  import AutoLaunch from 'auto-launch';
  const autoLauncher = new AutoLaunch({
    name: 'Screen Time Monitor',
    path: process.execPath,
  });
  ```
- 暴露方法：
  - `enable(): Promise<void>` — 调用 `autoLauncher.enable()` + 写入 settings 表 `auto_start = "true"`
  - `disable(): Promise<void>` — 调用 `autoLauncher.disable()` + 写入 settings 表 `auto_start = "false"`
  - `isEnabled(): Promise<boolean>` — 调用 `autoLauncher.isEnabled()`
- 应用启动时从 settings 表读取 `auto_start`，与 `autoLauncher.isEnabled()` 取 OR 逻辑（确保注册表状态与 settings 一致，不一致时以 settings 为准同步注册表）

**IPC 增强** (`electron/main.ts`):
- 修改现有 `settings:set` 处理器 — 当 key 为 `auto_start` 时，额外调用 `AutoLaunchService`：
  ```
  if (key === 'auto_start') {
    value === 'true' ? autoLaunchService.enable() : autoLaunchService.disable()
  }
  ```
- 新增 `app:get-auto-start-status` IPC 通道（`invoke`），返回 `{ enabled: boolean }`，直接调用 `autoLauncher.isEnabled()`

**设置页改造** (`src/pages/SettingsPage.tsx`):
- 现有 Switch 保持不变，但切换时增加 loading 状态：
  - 点击 Switch → Switch 暂时 disabled + 显示 CircularProgress
  - `setAutoStart()` 调用完成后恢复 Switch 状态
  - 若失败（如权限不足），Switch 回弹至原状态 + Snackbar 提示「开机自启设置失败」
- 在 Switch 下方增加帮助文字（走 i18n）：
  - 浅色注释：「开启后，电脑启动时 Screen Time Monitor 将自动在后台运行」

**settings 表** — 已有 Key 复用（不新增）:
- `auto_start` — 已在 v2 中存在，本次仅增强写入可靠性

**验收标准**:
- [ ] 设置页开关可正常启用/禁用开机自启
- [ ] 启用后，重启电脑应用自动启动并在系统托盘运行
- [ ] 禁用后，注册表/HKCU 中的自启条目被移除
- [ ] 设置失败时 Switch 回弹 + Snackbar 提示
- [ ] 应用启动时自检：若 settings 表 `auto_start = true` 但注册表条目缺失，自动修复注册表
- [ ] 开发者模式（`app.isPackaged === false`）下不触发注册表修改
- [ ] 与 E-01 Onboarding Wizard Step 2 联动：Wizard 中开启自启的效果与设置页一致

**涉及文件**: `electron/services/auto-launch-service.ts` (新增), `electron/main.ts`, `electron/preload.ts`, `src/pages/SettingsPage.tsx`, `src/store/settingsStore.ts`, `package.json`, `src/i18n/locales/zh-CN.json`, `src/i18n/locales/en.json`

---

### E-04: 通知提醒（番茄钟 + 久坐）

**背景**: 当前应用只有使用时长超限通知（LimitService），缺少正向健康提醒。番茄钟 + 久坐提醒是两个高频需求，可以显著提升应用的「关怀感」和用户粘性。

**概念模型**:
- **番茄钟提醒**: 用户开始追踪后，每 N 分钟（默认 25）发送一次 Web 通知「专注时段结束，休息一下吧」
  - 暂停追踪时番茄钟计时器也暂停
- **久坐提醒**: 从用户开始追踪（也就是开始使用电脑）起计时，每 N 分钟（默认 60）发送一次「你已经连续使用电脑 X 分钟了，起来活动一下吧」
  - 仅当追踪状态为 active（非暂停）时计时
  - 用户暂停追踪或检测到空闲（idle）时重置久坐计时器

**增量变更**:

**设置页——新增「提醒」分区** (`src/pages/SettingsPage.tsx`):
- 从"通用"分区中独立出来，新增一个 Section：「提醒 / Notifications」
- 番茄钟提醒：
  - Switch 开关（默认开）
  - 当开启时，下方显示时间选择器：MUI Select / Slider，范围 15-60 分钟，步长 5 分钟，默认 25
  - 帮助文字：「专注时段结束后发送桌面通知提醒休息」
- 久坐提醒：
  - Switch 开关（默认开）
  - 当开启时，下方显示时间选择器：范围 30-120 分钟，步长 10 分钟，默认 60
  - 帮助文字：「连续使用电脑达到设定时长后提醒活动」
- 所有文案走 i18n

**settings 表新增 Key**:

| Key | 类型 | 默认值 | 说明 |
|-----|------|--------|------|
| `pomodoro_enabled` | `"true"` / `"false"` | `"true"` | 番茄钟提醒开关 |
| `pomodoro_interval` | number string | `"25"` | 番茄钟间隔（分钟） |
| `sedentary_enabled` | `"true"` / `"false"` | `"true"` | 久坐提醒开关 |
| `sedentary_interval` | number string | `"60"` | 久坐提醒间隔（分钟） |

**Zustand Store 扩展** (`src/store/settingsStore.ts`):
- 新增状态字段：
  - `pomodoroEnabled: boolean` (默认 true)
  - `pomodoroInterval: number` (默认 25)
  - `sedentaryEnabled: boolean` (默认 true)
  - `sedentaryInterval: number` (默认 60)
- 新增 actions：
  - `setPomodoroEnabled(enabled: boolean): Promise<void>`
  - `setPomodoroInterval(minutes: number): Promise<void>`
  - `setSedentaryEnabled(enabled: boolean): Promise<void>`
  - `setSedentaryInterval(minutes: number): Promise<void>`
- `loadSettings()` 中新增对以上 4 个 key 的读取

**主进程——提醒定时器服务** (`electron/services/reminder-service.ts` 新增):
- 在 `TrackerService` 初始化时启动（或作为独立服务在 `main.ts` 中初始化）
- 番茄钟计时器：
  - `setInterval` 每 60 秒检查一次
  - 记录最后一次提醒时间戳
  - 当 `now - lastReminder >= pomodoroInterval` 且追踪状态为 active → 发送 Web 通知
  - 暂停追踪时暂停计时（不清零，恢复后继续累加）
- 久坐计时器：
  - 追踪状态变为 active → 开始计时
  - 追踪状态变为 paused / idle → 重置计时器为 0
  - 当累计时间 >= `sedentaryInterval` → 发送 Web 通知 + 重置计时器
- 通知发送方式：
  - 优先使用 `mainWindow.webContents.send()` 推送事件到渲染进程
  - 渲染进程使用 Web Notification API 弹出系统通知
  - 主进程也可以直接用 Electron `Notification` API 作为 fallback
- 设置变更时重新读取 settings 值，不重启计时器

**IPC 通道**:
- 新增 `reminder:pomodoro-triggered` (Main→Renderer, `send`): 推送番茄钟提醒事件
- 新增 `reminder:sedentary-triggered` (Main→Renderer, `send`): 推送久坐提醒事件

**渲染进程通知处理** (`src/App.tsx` 或 `src/hooks/useReminder.ts` 新增):
- 监听 `reminder:pomodoro-triggered` 事件 → 弹出 Web Notification:
  ```
  title: '番茄钟提醒'
  body: '25 分钟专注时段结束，休息一下吧!'
  icon: 应用图标
  ```
- 监听 `reminder:sedentary-triggered` 事件 → 弹出 Web Notification:
  ```
  title: '久坐提醒'
  body: '你已经连续使用电脑 60 分钟了，起来活动一下吧!'
  icon: 应用图标
  ```
- 通知文案走 i18n，使用渲染进程当前的 `t()` 函数

**通知权限**:
- 首次弹通知前，检查 `Notification.permission`
- 若为 `default` → 调用 `Notification.requestPermission()`
- 若为 `denied` → 静默跳过（不弹通知，不报错）

**验收标准**:
- [ ] 设置页可独立开关番茄钟和久坐提醒
- [ ] 番茄钟默认 25 分钟，可在 15-60 分钟范围内调整
- [ ] 久坐提醒默认 60 分钟，可在 30-120 分钟范围内调整
- [ ] 追踪活跃时，番茄钟到时发送系统通知
- [ ] 追踪活跃时，久坐到时发送系统通知，发送后重置计时器
- [ ] 暂停追踪后番茄钟暂停、久坐计时器重置
- [ ] 从暂停恢复追踪后番茄钟继续累加、久坐重新计时
- [ ] 空闲检测触发时久坐计时器重置
- [ ] 通知权限被拒绝时不报错、不弹窗
- [ ] 通知文案正确使用当前语言
- [ ] 设置持久化，重启后保持提醒偏好

**涉及文件**: `electron/services/reminder-service.ts` (新增), `electron/main.ts`, `electron/preload.ts`, `src/pages/SettingsPage.tsx`, `src/store/settingsStore.ts`, `src/hooks/useReminder.ts` (新增), `src/App.tsx`, `src/i18n/locales/zh-CN.json`, `src/i18n/locales/en.json`

---

## 四、UI 设计概要

### 4.1 Onboarding Wizard 页面流程

```
首次启动
│
├─ Step 1: 欢迎
│  ┌─────────────────────────────────────────┐
│  │     🕐 欢迎使用 Screen Time Monitor      │
│  │                                          │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │  │ 🔍 自动   │ │ 📊 数据   │ │ 🎯 专注   │ │
│  │  │ 追踪     │ │ 洞察     │ │ 模式     │ │
│  │  └──────────┘ └──────────┘ └──────────┘ │
│  │                                          │
│  │     [跳过引导]              [下一步 →]   │
│  └─────────────────────────────────────────┘
│
├─ Step 2: 偏好设置
│  ┌─────────────────────────────────────────┐
│  │     个性化你的体验                       │
│  │                                          │
│  │  🔌 开机自启                [ON ● OFF]  │
│  │     电脑启动时自动运行                    │
│  │                                          │
│  │  ⏰ 番茄钟提醒              [ON ● OFF]  │
│  │     间隔时间: [25 分钟 ▼]                │
│  │                                          │
│  │  🪑 久坐提醒                [ON ● OFF]  │
│  │     间隔时间: [60 分钟 ▼]                │
│  │                                          │
│  │     [← 上一步]    [跳过]    [下一步 →]  │
│  └─────────────────────────────────────────┘
│
└─ Step 3: 完成
   ┌─────────────────────────────────────────┐
   │          ✅ 一切就绪！                    │
   │                                          │
   │  已为你设置：                             │
   │  • 开机自启: 已开启                       │
   │  • 番茄钟提醒: 25 分钟                   │
   │  • 久坐提醒: 60 分钟                      │
   │                                          │
   │  Screen Time Monitor 将自动在后台         │
   │  追踪你的使用习惯。                       │
   │                                          │
   │              [开始使用 →]                 │
   └─────────────────────────────────────────┘
```

### 4.2 设置页 v4 布局变化

```
设置页 (v4)
├── 追踪 Tracking                        (已有，不变)
│   ├── 空闲检测阈值
│   ├── 自动开始追踪
│   └── 窗口标题隐私模式
├── 应用限制 App Limits                  (已有，不变)
├── 应用分类 App Categories              (已有，不变)
├── 专注模式 Focus Mode                  (已有，不变，v3)
├── 提醒 Notifications                   ← 新增
│   ├── 番茄钟提醒 [Switch] + 间隔 [Select]
│   └── 久坐提醒 [Switch] + 间隔 [Select]
├── 外观 Appearance                      ← 从通用中独立
│   └── 主题 [浅色] [深色] [跟随系统]
├── 语言 Language                        (已有，不变，v3)
├── 关于 About                           (已有，增强于 v3)
├── 通用 General                         (精简)
│   ├── 开机自启 [Switch]
│   └── 系统托盘 [Switch]
├── 数据管理 Data Management             (已有，不变)
└── 重新运行引导向导                      ← 新增
```

### 4.3 状态栏 v4 变化

```
v3 状态栏:
│ 🔴 正在追踪: VS Code  │  🎯 专注模式 · 关 │

v4 状态栏:
│ 🔴 正在追踪: VS Code  │  🎯 专注模式 · 关  │  🌙 │
                                                ↑ 新增主题快捷切换
```

---

## 五、与现有系统交互

### 5.1 涉及已有模块的变化

| 已有模块 | v4 交互方式 | 变化类型 |
|----------|-----------|----------|
| `src/App.tsx` | 新增 Onboarding 入口逻辑 + 通知事件监听 + 主题 scrollbar 微调 | **修改** |
| `src/pages/SettingsPage.tsx` | 新增「提醒」分区（E-04）+「外观」分区重组织（E-02）+「重新引导」按钮（E-01）+ 自启增强 loading（E-03） | **修改** |
| `src/components/StatusBar.tsx` | 新增主题快捷切换图标（E-02） | **修改** |
| `src/contexts/ThemeContext.tsx` | 不变，复用现有实现 | **不变** |
| `src/store/settingsStore.ts` | 新增 E-04 的 4 个提醒状态 + 4 个 actions + `loadSettings` 扩展 | **修改** |
| `electron/main.ts` | 新增 IPC 通道（reminder push）+ settings:set 增强（auto_start 联动 auto-launch）+ 启动时初始化 ReminderService | **修改** |
| `electron/preload.ts` | 新增 reminder 事件监听接口 + app:get-auto-start-status | **修改** |
| `electron/services/tracker-service.ts` | 追踪状态变化时通知 ReminderService（E-04） | **修改** |
| `src/i18n/locales/zh-CN.json` | 新增 onboarding / reminder / theme-switch / appearance 翻译 key | **修改** |
| `src/i18n/locales/en.json` | 同上 | **修改** |
| `package.json` | 新增 `auto-launch` 依赖（E-03） | **修改** |
| `src/types/electron.ts` | 新增 reminder 事件类型 | **修改** |

### 5.2 不变模块

| 模块 | 说明 |
|------|------|
| `electron/db/database.ts` | 数据库连接管理无变化 |
| `electron/db/migrations.ts` | Schema 无变化（不新增表，仅 settings KV 新增 key） |
| `electron/db/queries.ts` | 查询层无变化 |
| `electron/tracker/window-tracker.ts` | 窗口追踪逻辑无变化 |
| `electron/tracker/idle-detector.ts` | 空闲检测无变化 |
| `electron/tray/tray-manager.ts` | 托盘菜单无变化 |
| `src/pages/TodayPage.tsx` | 无变化 |
| `src/pages/WeeklyPage.tsx` | 无变化 |
| `src/pages/MonthlyPage.tsx` | 无变化 |
| `src/pages/CustomRangePage.tsx` | 无变化 |
| `src/components/AppUsageList.tsx` | 无变化 |
| `src/components/TimeChart.tsx` | 无变化 |
| `src/store/trackerStore.ts` | 无变化 |

### 5.3 新增文件

| 新增文件 | 所属需求 | 说明 |
|----------|----------|------|
| `src/components/onboarding/OnboardingWizard.tsx` | E-01 | 首次使用引导向导组件 |
| `electron/services/auto-launch-service.ts` | E-03 | 开机自启服务（封装 auto-launch） |
| `electron/services/reminder-service.ts` | E-04 | 番茄钟 + 久坐提醒定时器服务 |
| `src/hooks/useReminder.ts` | E-04 | 渲染进程提醒事件 Hook |

### 5.4 数据库变化

不新增表，仅在 settings KV 表新增 Key：

| Key | 类型 | 默认值 | 所属需求 |
|-----|------|--------|----------|
| `pomodoro_enabled` | `"true"` / `"false"` | `"true"` | E-04 |
| `pomodoro_interval` | number string | `"25"` | E-04 |
| `sedentary_enabled` | `"true"` / `"false"` | `"true"` | E-04 |
| `sedentary_interval` | number string | `"60"` | E-04 |

> 注: `onboarding_completed` 使用 localStorage 标记，不进 settings 表（快速判断，不依赖 IPC 通信）。`auto_start` key 已在 v2 中存在，本次不新增。

---

## 六、实现顺序建议

```
Phase 1（独立模块，无互相依赖，可并行，约 1 天）
  ├─ E-02: 主题快捷切换（改动最小：StatusBar 加图标 + SettingsPage 分区移动）
  └─ E-03: 开机自启完善（独立服务，改 main.ts 一个 handler）

Phase 2（中等复杂度，约 1-2 天）
  └─ E-04: 通知提醒（新服务 + IPC + Store + UI，与 E-01 有联动）

Phase 3（最后实现，依赖 E-03 和 E-04 的设置接口，约 1 天）
  └─ E-01: Onboarding Wizard（新组件 + App.tsx 入口 + 与 Phase 1/2 设置联动）

建议开发顺序: E-02 → E-03 → E-04 → E-01
理由:
- E-02 最简单，改动最小，先完成建立 v4 开发节奏
- E-03 是可靠性增强，单独交付价值高
- E-04 是新增功能模块，需要先稳定后再做 E-01 集成
- E-01 需要 E-03 和 E-04 的设置接口就绪后才能完整展示 Step 2，因此放最后
```

---

## 七、不纳入本次迭代

以下功能明确不纳入 v4 范围：

- 云同步 / 多设备数据合并 —— 架构复杂度高，留待后续
- 专注模式定时计划（如「工作日 9:00-18:00 自动开启」）—— v3 PRD 已提及留待 v4，但本次定位为「体验打磨」，不纳入（v5 可考虑）
- 移动端配套 App —— 跨平台，单独立项
- 自定义配色 / 主题市场 —— 需求不够明确
- 番茄钟的「强制锁定」模式（到时强制锁屏）—— 过于激进，用户体验风险大
- 自定义通知音效 —— 非核心，留待后续
- 专注模式分心提醒弹窗 —— v3 PRD 已提及留待 v4，但本次聚焦「健康提醒」而非「行为打断」，v5 可考虑

---

## 八、待确认问题

| # | 问题 | 备选方案 | 建议 |
|---|------|----------|------|
| 1 | **Onboarding 触发的判断依据？** | A) 仅 localStorage（快速，不依赖 IPC）；B) localStorage + settings 表双写（更可靠） | **建议 A**，localStorage 已足够。settings 表已有大量读取操作，加一个 onboarding 判断没必要。且清缓存不影响——此时重新引导反而合理 |
| 2 | **状态栏主题切换的三态循环（浅色→深色→系统→浅色）是否符合用户预期？** | A) 三态循环（当前方案）；B) 仅切换浅色/深色（系统作为独立模式不参与循环）；C) 弹出小菜单选择 | **建议 A**，三态循环操作最简单（单击即切换），系统模式也是合法主题之一。若用户只想要浅/深切换，设置页提供精确选择 |
| 3 | **番茄钟提醒是否需要「重置」按钮？** | A) 不提供（简单）；B) 设置页提供「重置计时器」按钮（灵活） | **建议 A**，v4 先不加。用户暂停再恢复追踪即可变相重置。如反馈强烈可在 v4.1 补充 |
| 4 | **久坐提醒的 idle 检测粒度？** | A) 复用现有 IdleDetector（默认 5 分钟空闲阈值）；B) 独立检测（如 1 分钟无操作即重置） | **建议 A**，复用现有 idle detection 基础设施，保持一致性。这意味着用户离开电脑 5 分钟后久坐计时器会重置 |
| 5 | **Onboarding Wizard 是否支持在设置页重跑时携带已保存的偏好？** | A) 回填 Step 2 为当前设置值；B) 始终使用默认值 | **建议 A**，重跑引导时显示已有设置（如已开启自启→Switch 默认 on），让用户感知这是「查看并修改」而非「重新选择」 |
| 6 | **auto-launch 库是否需要处理 Windows 管理员权限场景？** | A) 仅处理普通用户（HKCU 注册表）；B) 尝试 HKLM，fallback 到 HKCU | **建议 A**，`auto-launch` 默认写 HKCU，覆盖绝大多数使用场景。管理员权限场景极少，且注册表回退逻辑增加复杂度，不必要 |

---

*文档版本：v1.0 | 作者：许清楚 (Xu) 产品经理 | 日期：2026-06-07*
