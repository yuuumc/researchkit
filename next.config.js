/** @type {import('next').NextConfig} */
const nextConfig = {
  // 把 pdf-parse 排除出 webpack 打包，避免 Object.defineProperty called on non-object 错误
  // pdf-parse 是 CommonJS 库，其内部依赖（旧版 pdf.js）会调用 Object.defineProperty(module.exports, ...)
  // webpack 把 module 对象 freeze 后该调用失败。让 Node 直接 require 即可。
  // 注意：Next.js 14.x 必须用 experimental.serverComponentsExternalPackages
  //       Next.js 15+ 才支持顶层 serverExternalPackages
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse'],
  },
}

module.exports = nextConfig
