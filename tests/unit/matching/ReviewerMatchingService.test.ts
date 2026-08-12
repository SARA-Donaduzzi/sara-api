import { ReviewerMatchingService } from '../../../src/application/services/ReviewerMatchingService'

jest.mock('../../../src/lib/prisma', () => ({
  prisma: {
    eventEvaluator: { findMany: jest.fn() },
    article: { findUnique: jest.fn() },
    evaluatorEmbedding: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    evaluation: { findMany: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}))

jest.mock('../../../src/infrastructure/ml/EmbeddingEngine', () => ({
  EmbeddingEngine: {
    getInstance: () => ({
      embed: jest.fn().mockResolvedValue([1, 0, 0, 0]),
      cosineSimilarity: jest.fn((a: number[], b: number[]) => {
        return JSON.stringify(a) === JSON.stringify(b) ? 0.9 : 0.1
      }),
    }),
  },
}))

import { prisma } from '../../../src/lib/prisma'

const mockArticle = {
  id: 'art-001',
  title: 'Machine Learning aplicado',
  summary: 'Abstract sobre ML',
  thematicArea: 'IA',
  keywords: [{ name: 'machine learning' }, { name: 'redes neurais' }],
  relatedAuthors: [{ coAuthorName: 'Maria Santos' }],
  user: { id: 'user-001', name: 'João Silva', email: 'joao@test.com' },
}

const mockEvaluators = [
  {
    id: 'ee-001',
    userId: 'eval-001',
    isActive: true,
    user: { id: 'eval-001', name: 'Carlos Tech', email: 'carlos@test.com', institution: 'UFPR' },
  },
  {
    id: 'ee-002',
    userId: 'eval-002',
    isActive: true,
    user: { id: 'eval-002', name: 'Ana ML', email: 'ana@test.com', institution: 'UTFPR' },
  },
]

describe('ReviewerMatchingService', () => {
  const service = new ReviewerMatchingService()

  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.article.findUnique as jest.Mock).mockResolvedValue(mockArticle)
    ;(prisma.eventEvaluator.findMany as jest.Mock).mockResolvedValue(mockEvaluators)
    ;(prisma.evaluatorEmbedding.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.evaluation.findMany as jest.Mock).mockResolvedValue([])
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ name: 'Carlos Tech', institution: 'UFPR' })
    ;(prisma.evaluatorEmbedding.upsert as jest.Mock).mockResolvedValue({})
  })

  it('retorna lista de sugestões rankeadas', async () => {
    const suggestions = await service.suggestEvaluators('art-001', 'event-001')
    expect(suggestions).toHaveLength(2)
    expect(suggestions[0]).toHaveProperty('evaluatorId')
    expect(suggestions[0]).toHaveProperty('score')
    expect(suggestions[0]).toHaveProperty('hasConflict')
    expect(suggestions[0]).toHaveProperty('name')
  })

  it('detecta conflito quando avaliador é co-autor', async () => {
    const evaluatorsWithConflict = [
      {
        id: 'ee-003',
        userId: 'eval-003',
        isActive: true,
        user: { id: 'eval-003', name: 'Maria Santos', email: 'maria@test.com', institution: 'UFPR' },
      },
    ]
    ;(prisma.eventEvaluator.findMany as jest.Mock).mockResolvedValue(evaluatorsWithConflict)

    const suggestions = await service.suggestEvaluators('art-001', 'event-001')
    expect(suggestions[0].hasConflict).toBe(true)
    expect(suggestions[0].conflictReason).toBeDefined()
  })

  it('detecta conflito quando avaliador é autor principal', async () => {
    const evaluatorsAsAuthor = [
      {
        id: 'ee-004',
        userId: 'eval-004',
        isActive: true,
        user: { id: 'eval-004', name: 'João Silva', email: 'joao@test.com', institution: 'UFPR' },
      },
    ]
    ;(prisma.eventEvaluator.findMany as jest.Mock).mockResolvedValue(evaluatorsAsAuthor)

    const suggestions = await service.suggestEvaluators('art-001', 'event-001')
    expect(suggestions[0].hasConflict).toBe(true)
  })

  it('ordena por score decrescente', async () => {
    const suggestions = await service.suggestEvaluators('art-001', 'event-001')
    for (let i = 0; i < suggestions.length - 1; i++) {
      expect(suggestions[i].score).toBeGreaterThanOrEqual(suggestions[i + 1].score)
    }
  })
})
