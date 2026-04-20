# LWB UI Editor

轻量级桌面 UI 编辑器（Tauri 2 + Vue 3 + TypeScript）。需求与任务见 `docs/`。

## 环境要求

- **Node.js** 20+
- **pnpm**（推荐）或 npm
- **Rust** stable（[rustup](https://rustup.rs/) 安装，`rustc`、`cargo` 在 PATH 中）
- **Windows**：需安装 [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（使用「使用 C++ 的桌面开发」工作负载），以便编译 Tauri 原生依赖

## 开发

### 桌面端（开发模式）

在项目根目录执行：

```bash
pnpm install
pnpm tauri dev
```

- 会启动 **Vite 开发服务器**并拉起 **Tauri 桌面窗口**（WebView2），前端热更新一般会自动刷新界面。
- 首次运行会编译 Rust 侧，耗时可能较长；后续仅改前端时通常较快。
- 需满足上文「环境要求」（Node、pnpm、Rust、Windows 下 C++ 构建工具等）。

### 仅前端（浏览器，无桌面壳）

不启动 Tauri，只在浏览器里调 UI：

```bash
pnpm dev
```

桌面相关 API（`@tauri-apps/api` 等）在纯浏览器模式下可能不可用或行为不同，完整功能请以 `pnpm tauri dev` 为准。

## 构建安装包

```bash
pnpm tauri build
```

产物位于 `src-tauri/target/release/bundle/`（如 `.msi` / `.exe`）。

## 测试

### 单元测试（Vitest）

```bash
pnpm test          # 单次运行
pnpm test:watch    # 监视模式
pnpm typecheck     # vue-tsc 类型检查
```

### E2E 端到端测试（WebdriverIO + tauri-driver）

**架构**：WebdriverIO → tauri-driver → msedgedriver → Tauri WebView2

#### 前置条件

1. **Rust toolchain** 已安装（`cargo` 在 PATH 中）
2. **tauri-driver**：首次运行时由 `autoInstallTauriDriver: true` 自动通过 cargo 安装；也可手动安装：
   ```bash
   cargo install tauri-driver
   ```
3. **应用二进制**：需先构建 debug 包（见下方）

#### 运行 E2E 测试

```bash
# 步骤 1：构建 debug 包（含前端构建，约 1-3 分钟）
pnpm tauri build --debug

# 步骤 2：运行所有 E2E 测试
pnpm test:e2e

# 或者一步完成（构建 + 测试）
pnpm test:e2e:build
```

运行指定 spec 文件：

```bash
pnpm test:e2e:spec e2e/specs/t0.1.smoke.spec.ts
```

切换 release 构建（需先 `pnpm tauri build`）：

```powershell
# PowerShell
$env:E2E_RELEASE = '1'; pnpm test:e2e
```

#### 测试产物

| 路径 | 内容 |
|------|------|
| `qa-reports/junit/` | JUnit XML 报告（CI 集成用） |
| `qa-reports/screenshots/` | 自动截图（每个 spec after 钩子） |
| `qa-reports/T*.md` | QA Agent 手工验证报告（见 `docs/tasks.md`） |

#### 类型检查（E2E 代码）

```bash
pnpm typecheck:e2e
```
