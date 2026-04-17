import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * 应用二进制路径
 * - 默认使用 debug 构建（E2E_RELEASE=1 时切换到 release 构建）
 * - 运行测试前需先构建：pnpm tauri build --debug
 */
const USE_RELEASE = process.env['E2E_RELEASE'] === '1'
const APP_BIN = path.resolve(
  __dirname,
  USE_RELEASE
    ? 'src-tauri/target/release/lwb_ui_editor.exe'
    : 'src-tauri/target/debug/lwb_ui_editor.exe'
)

export const config: WebdriverIO.Config = {
  runner: 'local',

  specs: ['./e2e/specs/**/*.spec.ts'],
  exclude: [],

  /**
   * 单实例串行执行：Tauri 桌面应用只能同时运行一个窗口
   */
  maxInstances: 1,

  /**
   * capabilities 使用类型断言：
   * - maxInstances 是 WebdriverIO per-capability 扩展属性，已在顶层设置
   * - tauri:app / tauri:options 是 @wdio/tauri-service 私有协议，不在标准类型中
   */
  capabilities: [
    {
      platformName: 'Windows',
      automationName: 'TauriDriver',
      'tauri:app': APP_BIN,
      'tauri:options': {
        commandTimeout: 30_000,
      },
    } as WebdriverIO.Capabilities,
  ],

  logLevel: 'info',

  bail: 0,

  waitforTimeout: 15_000,

  connectionRetryTimeout: 120_000,

  connectionRetryCount: 3,

  services: [
    [
      '@wdio/tauri-service',
      {
        /**
         * 自动安装 tauri-driver（需要 Rust toolchain / cargo 在 PATH 中）
         * 若已手动安装（cargo install tauri-driver），可改为 false
         */
        autoInstallTauriDriver: true,
        commandTimeout: 30_000,
      },
    ],
  ],

  framework: 'mocha',

  reporters: [
    'spec',
    [
      'junit',
      {
        outputDir: './qa-reports/junit',
        outputFileFormat: (options: { cid: string }) =>
          `results-${options.cid}.xml`,
      },
    ],
  ],

  mochaOpts: {
    ui: 'bdd',
    timeout: 60_000,
  },
}
