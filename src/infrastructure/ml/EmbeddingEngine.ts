import path from 'path'

const isTest = process.env.NODE_ENV === 'test'

export class EmbeddingEngine {
  private static instance: EmbeddingEngine
  private pipe: any = null
  private readonly MODEL = 'Xenova/paraphrase-multilingual-mpnet-base-v2'

  private constructor() {}

  static getInstance(): EmbeddingEngine {
    if (!EmbeddingEngine.instance) {
      EmbeddingEngine.instance = new EmbeddingEngine()
    }
    return EmbeddingEngine.instance
  }

  async initialize(): Promise<void> {
    if (isTest || this.pipe) return
    const { pipeline } = await import('@xenova/transformers')
    this.pipe = await pipeline('feature-extraction', this.MODEL, {
      cache_dir: path.join(process.cwd(), '.model-cache'),
    })
    console.log('[EmbeddingEngine] Model loaded:', this.MODEL)
  }

  async embed(text: string): Promise<number[]> {
    if (isTest) {
      // In test mode: return deterministic pseudo-random vector based on text hash
      const seed = text.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
      return Array.from({ length: 768 }, (_, i) => Math.sin(seed + i) * 0.5 + 0.5)
    }
    if (!this.pipe) await this.initialize()
    const output = await this.pipe(text, { pooling: 'mean', normalize: true })
    return Array.from(output.data as Float32Array)
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) throw new Error(`Vector dimensions must match: ${a.length} vs ${b.length}`)
    let dot = 0, normA = 0, normB = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB)
    return denom === 0 ? 0 : dot / denom
  }
}
