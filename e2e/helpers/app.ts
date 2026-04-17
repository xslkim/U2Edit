/**
 * E2E 公共工具：选择器常量 + 等待/断言辅助函数
 *
 * 随功能迭代逐步扩充；每个任务在此对应一个 Selectors 命名空间。
 */

// ─── 选择器 ─────────────────────────────────────────────────────────────────

/** T0.1 阶段：占位启动页 */
export const Selectors = {
  appRoot: '.app-root',
  placeholder: '.placeholder',

  // T1.5+ 四面板布局（功能完成后补充）
  toolbar: '[data-testid="toolbar"]',
  nodeTree: '[data-testid="node-tree"]',
  canvas: '[data-testid="canvas"]',
  properties: '[data-testid="properties"]',
  assets: '[data-testid="assets"]',
  statusBar: '[data-testid="status-bar"]',
} as const

// ─── 等待辅助 ────────────────────────────────────────────────────────────────

/**
 * 等待应用根元素可见，超时 15s。
 * 所有 spec 的 `before` 钩子中调用，以确保页面已渲染。
 */
export async function waitForApp(timeout = 15_000): Promise<void> {
  await browser.waitUntil(
    async () => {
      const el = await $(Selectors.appRoot)
      return el.isExisting()
    },
    {
      timeout,
      timeoutMsg: `超时 ${timeout}ms：未找到 .app-root，应用可能未正常渲染`,
    }
  )
}

/**
 * 等待某个元素存在并返回（返回类型由 TypeScript 自动推断）。
 */
export async function waitForElement(selector: string, timeout = 10_000) {
  const el = $(selector)
  await el.waitForExist({ timeout, timeoutMsg: `超时：未找到 ${selector}` })
  return el
}

// ─── 截图辅助 ────────────────────────────────────────────────────────────────

/**
 * 保存当前页面截图到 qa-reports/screenshots/ 目录。
 * @param name 截图文件名前缀（不含扩展名）
 */
export async function takeScreenshot(name: string): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  await browser.saveScreenshot(`./qa-reports/screenshots/${name}-${timestamp}.png`)
}

// ─── 窗口辅助 ────────────────────────────────────────────────────────────────

/**
 * 获取 HTML 文档 title。
 */
export async function getDocTitle(): Promise<string> {
  return browser.getTitle()
}

/**
 * 获取当前窗口的宽高（外部尺寸，含系统边框）。
 */
export async function getWindowSize(): Promise<{ width: number; height: number }> {
  return browser.getWindowSize()
}
