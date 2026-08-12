import { EmbeddingEngine } from '../../../src/infrastructure/ml/EmbeddingEngine'

describe('EmbeddingEngine.cosineSimilarity', () => {
  const engine = EmbeddingEngine.getInstance()

  it('retorna 1.0 para vetores idênticos', () => {
    const v = [1, 2, 3]
    expect(engine.cosineSimilarity(v, v)).toBeCloseTo(1.0, 5)
  })

  it('retorna 0.0 para vetores ortogonais', () => {
    const a = [1, 0, 0]
    const b = [0, 1, 0]
    expect(engine.cosineSimilarity(a, b)).toBeCloseTo(0.0, 5)
  })

  it('retorna -1.0 para vetores opostos', () => {
    const a = [1, 0, 0]
    const b = [-1, 0, 0]
    expect(engine.cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5)
  })

  it('retorna valor entre 0.9 e 1.0 para vetores similares', () => {
    const a = [1, 2, 3, 4]
    const b = [1, 2, 3, 5]
    const sim = engine.cosineSimilarity(a, b)
    expect(sim).toBeGreaterThan(0.9)
    expect(sim).toBeLessThanOrEqual(1.0)
  })
})
