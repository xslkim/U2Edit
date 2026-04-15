/**
 * T0.1 — Tauri 2 + Vue 3 + TypeScript 项目初始化
 *
 * 对应 tasks.md T0.1 测试用例：
 *   TC2  桌面窗口打开，尺寸约 1400×900，显示 "LWB UI Editor"（主链路 E2E）
 *   TC4  窗口尺寸信息性验证（< 50MB 构建体积为 CI 级检查，此处仅记录）
 *
 * TC1（pnpm install 无报错）和 TC3（热更新）属于 CI / 手动验证范畴，
 * 不在此 E2E 文件覆盖。
 *
 * 前置条件：已执行 `pnpm tauri build --debug`（或 release build）。
 */

import { waitForApp, getDocTitle, getWindowSize, takeScreenshot, Selectors } from '../helpers/app.js'

describe('T0.1 — 项目初始化冒烟测试', () => {
  before(async () => {
    // 等待 Vue 渲染根元素，最多 15 秒
    await waitForApp()
  })

  after(async () => {
    // 无论通过/失败，保留一张截图供人工核查
    await takeScreenshot('t0.1-end')
  })

  // ─── TC2-a: 窗口成功打开 ─────────────────────────────────────────────────
  it('TC2-a: 应用根元素 .app-root 存在（WebDriver 连接成功，Vue 已渲染）', async () => {
    const root = await $(Selectors.appRoot)
    const exists = await root.isExisting()
    expect(exists).toBe(true)
  })

  // ─── TC2-b: HTML title ────────────────────────────────────────────────────
  it('TC2-b: HTML document.title === "LWB UI Editor"', async () => {
    const title = await getDocTitle()
    expect(title).toBe('LWB UI Editor')
  })

  // ─── TC2-c: 占位文字可见 ─────────────────────────────────────────────────
  it('TC2-c: 页面内 .placeholder 文字为 "LWB UI Editor"', async () => {
    const el = await $(Selectors.placeholder)
    const text = await el.getText()
    expect(text).toBe('LWB UI Editor')
  })

  // ─── TC4: 窗口尺寸（信息性）──────────────────────────────────────────────
  it('TC4: 窗口宽度在 1350–1450px 之间，高度在 850–950px 之间', async () => {
    const { width, height } = await getWindowSize()
    // 允许 ±50px 系统边框差异（DPI scaling / taskbar 等原因）
    expect(width).toBeGreaterThanOrEqual(1350)
    expect(width).toBeLessThanOrEqual(1450)
    expect(height).toBeGreaterThanOrEqual(850)
    expect(height).toBeLessThanOrEqual(950)
  })
})
