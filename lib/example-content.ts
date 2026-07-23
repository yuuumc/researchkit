/**
 * v2.3.3 (C) — 共享「载入示例」固定输入（单一事实源）
 *
 * 背景：v2.3.1 之前「载入示例」按钮的固定文本硬编码在 app/page.tsx 的
 * loadExample() 里。预计算缓存和 precompute 脚本如果独立复制一份字符串，
 * 任何空白/换行差异都会导致 cache miss，且难审计。
 *
 * 解决：把示例输入提到本模块，page.tsx 与缓存/precompute 都从这里 import，
 * 保证前端输入和缓存键永远一致。
 *
 * 约束：内容与 v2.3.1 page.tsx 严格一致（不借机改 demo 内容 —
 * 任何内容改动都属 demo UX 范畴，应单独 PR；本任务只做性能）。
 */

export const EXAMPLE_FIXTURE = {
  /** 固定输入文本（"Attention Is All You Need" 摘要，3 段，≈1.3K 字符） */
  content: `The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.

Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train. Our model achieves 28.4 BLEU on the WMT 2014 English-to-German translation task, improving over the existing best results, including ensembles, by over 2 BLEU.

On the WMT 2014 English-to-French translation task, our model establishes a new single-model state-of-the-art BLEU score of 41.8 after training for 3.5 days on eight GPUs, a small fraction of the training costs of the best models from the literature. We show that the Transformer generalizes well to other tasks by applying it successfully to English constituency parsing both with large and limited training data.`,

  /** 输入标题（写入 KB metadata / 工具调用） */
  title: 'Attention Is All You Need',

  /** 输入来源（写入 KB metadata / 工具调用） */
  source: '内置示例 · Attention Is All You Need',
} as const

/**
 * 规范化输入：折叠连续空白为单空格、合并 3+ 连续换行为双换行、trim
 *
 * 目的：容忍手工复制可能带来的 \r\n、多余空格等微差异，
 * 让 hash 对「同一份示例内容」始终稳定。
 */
export function normalizeExampleContent(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
