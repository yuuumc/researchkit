/**
 * Global 类型声明 — D25
 *
 * __non_webpack_require__ — webpack 5 在 build 时注入的全局变量
 * 用于绕过 webpack 的 static analysis，直接调用 Node.js 的 require()
 * 这样能 require 'node:' scheme 的内置模块（如 node:async_hooks）
 *
 * 注意：__non_webpack_require__ 只在 server bundle 中存在
 * 客户端 bundle 中不存在（typeof __non_webpack_require__ === 'undefined'）
 */

declare const __non_webpack_require__: NodeRequire
