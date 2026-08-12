import { prisma } from '../../lib/prisma'
import { EmbeddingEngine } from '../../infrastructure/ml/EmbeddingEngine'

export interface RankedEvaluator {
  evaluatorId: string
  name: string
  email: string
  score: number
  hasConflict: boolean
  conflictReason?: string
}

export class ReviewerMatchingService {
  private engine = EmbeddingEngine.getInstance()

  async suggestEvaluators(articleId: string, eventId: string): Promise<RankedEvaluator[]> {
    const [article, eventEvaluators] = await Promise.all([
      prisma.article.findUnique({
        where: { id: articleId },
        include: { keywords: true, relatedAuthors: true, user: true },
      }),
      prisma.eventEvaluator.findMany({
        where: { eventId, isActive: true },
        include: { user: true },
      }),
    ])

    if (!article) throw new Error(`Article not found: ${articleId}`)

    const articleText = [
      article.title,
      article.summary,
      article.thematicArea ?? '',
      article.keywords.map((k: any) => k.name).join(' '),
    ].join(' ')

    const articleVector = await this.engine.embed(articleText)

    const results: RankedEvaluator[] = []
    for (const ee of eventEvaluators as any[]) {
      const evaluatorVector = await this.getOrComputeEvaluatorEmbedding(ee.userId)
      const score = this.engine.cosineSimilarity(articleVector, evaluatorVector)
      const conflict = this.detectConflict(article, ee.user)
      results.push({
        evaluatorId: ee.userId,
        name: ee.user.name,
        email: ee.user.email,
        score: Math.round(score * 100) / 100,
        hasConflict: conflict.hasConflict,
        conflictReason: conflict.reason,
      })
    }

    return results.sort((a, b) => b.score - a.score)
  }

  async getOrComputeEvaluatorEmbedding(evaluatorId: string): Promise<number[]> {
    const cached = await prisma.evaluatorEmbedding.findUnique({ where: { evaluatorId } })
    if (cached) return cached.vector as number[]
    return this.updateEvaluatorEmbedding(evaluatorId)
  }

  async updateEvaluatorEmbedding(evaluatorId: string): Promise<number[]> {
    const evaluations = await prisma.evaluation.findMany({
      where: { userId: evaluatorId },
      include: {
        articleVersion: {
          include: { article: { include: { keywords: true } } },
        },
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
    })

    let profileText: string
    if (evaluations.length > 0) {
      profileText = evaluations
        .map((e: any) => {
          const art = e.articleVersion.article
          return [
            art.title,
            art.thematicArea ?? '',
            art.keywords.map((k: any) => k.name).join(' '),
          ].join(' ')
        })
        .join(' | ')
    } else {
      // Cold start: use only declared name + institution
      const user = await prisma.user.findUnique({
        where: { id: evaluatorId },
        select: { name: true, institution: true },
      })
      profileText = [user?.name ?? '', user?.institution ?? ''].filter(Boolean).join(' ')
    }

    const vector = await this.engine.embed(profileText)
    await prisma.evaluatorEmbedding.upsert({
      where: { evaluatorId },
      update: { vector: vector as any },
      create: { evaluatorId, vector: vector as any },
    })
    return vector
  }

  /**
   * Best-effort conflict detection.
   * Co-author check uses name string matching — fragile against
   * name variations (accents, middle names). This is a domain
   * model limitation: RelatedAuthor stores only a name string, no user FK.
   */
  private detectConflict(
    article: any,
    evaluatorUser: { name: string; email: string }
  ): { hasConflict: boolean; reason?: string } {
    const coAuthorNames = article.relatedAuthors.map((a: any) =>
      a.coAuthorName.toLowerCase().trim()
    )
    if (coAuthorNames.includes(evaluatorUser.name.toLowerCase().trim())) {
      return { hasConflict: true, reason: 'Avaliador é co-autor do artigo' }
    }
    if (article.user.email === evaluatorUser.email) {
      return { hasConflict: true, reason: 'Avaliador é o autor principal do artigo' }
    }
    return { hasConflict: false }
  }
}
