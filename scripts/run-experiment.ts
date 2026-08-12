import articlesData from './data/dataset/articles.json'
import evaluatorsData from './data/dataset/evaluators.json'
import groundTruth from './data/dataset/ground-truth.json'
import { EmbeddingEngine } from '../src/infrastructure/ml/EmbeddingEngine'

const engine = EmbeddingEngine.getInstance()

function cosineSimilarity(a: number[], b: number[]): number {
  return engine.cosineSimilarity(a, b)
}

function computeRanking(
  articleVec: number[],
  evaluatorVecs: Array<{ id: string; vec: number[] }>
) {
  return evaluatorVecs
    .map((ev) => ({ id: ev.id, score: cosineSimilarity(articleVec, ev.vec) }))
    .sort((a, b) => b.score - a.score)
}

function randomRanking(evaluators: typeof evaluatorsData) {
  return [...evaluators]
    .sort(() => Math.random() - 0.5)
    .map(e => ({ id: e.id, score: 0 }))
}

function precisionAtK(ranked: { id: string }[], ideal: string[], k: number): number {
  const topK = ranked.slice(0, k).map(r => r.id)
  const hits = topK.filter(id => ideal.includes(id)).length
  return hits / k
}

function reciprocalRank(ranked: { id: string }[], ideal: string[]): number {
  const firstHit = ranked.findIndex(r => ideal.includes(r.id))
  return firstHit === -1 ? 0 : 1 / (firstHit + 1)
}

async function main() {
  if (process.env.NODE_ENV === 'test') {
    throw new Error('NODE_ENV=test ativa embeddings pseudo-aleatórios. Rode sem NODE_ENV=test.')
  }

  console.log('Carregando modelo Xenova/paraphrase-multilingual-mpnet-base-v2 ...')
  await engine.initialize()
  console.log('Modelo carregado. Gerando embeddings ...')

  // Pré-computa embeddings dos avaliadores (1x cada, reutilizados por todos os artigos)
  const evaluatorVecs: Array<{ id: string; vec: number[] }> = []
  for (const ev of evaluatorsData) {
    const profileText = [...ev.expertise, ...ev.pastArticles].join(' ')
    evaluatorVecs.push({ id: ev.id, vec: await engine.embed(profileText) })
  }
  console.log(`Embeddings de ${evaluatorVecs.length} avaliadores gerados.`)

  const metrics = {
    semantic: { p1: 0, p3: 0, mrr: 0 },
    random:   { p1: 0, p3: 0, mrr: 0 },
  }

  const perArticleResults: Array<{
    articleId: string
    title: string
    semanticTop3: string[]
    idealEvaluators: string[]
    p1: number
    p3: number
    rr: number
  }> = []

  const n = groundTruth.length

  // Run random baseline 5 times and average (to reduce variance)
  const RANDOM_RUNS = 5
  const randomAvg = { p1: 0, p3: 0, mrr: 0 }
  for (let run = 0; run < RANDOM_RUNS; run++) {
    for (const gt of groundTruth) {
      const randomRank = randomRanking(evaluatorsData)
      randomAvg.p1  += precisionAtK(randomRank, gt.idealEvaluators, 1) / (RANDOM_RUNS * n)
      randomAvg.p3  += precisionAtK(randomRank, gt.idealEvaluators, 3) / (RANDOM_RUNS * n)
      randomAvg.mrr += reciprocalRank(randomRank, gt.idealEvaluators) / (RANDOM_RUNS * n)
    }
  }

  for (const gt of groundTruth) {
    const article = articlesData.find(a => a.id === gt.articleId)!
    const articleText = `${article.title} ${article.abstract} ${article.keywords.join(' ')} ${article.thematicArea}`

    const articleVec = await engine.embed(articleText)
    const semanticRank = computeRanking(articleVec, evaluatorVecs)
    const p1  = precisionAtK(semanticRank, gt.idealEvaluators, 1)
    const p3  = precisionAtK(semanticRank, gt.idealEvaluators, 3)
    const rr  = reciprocalRank(semanticRank, gt.idealEvaluators)

    metrics.semantic.p1  += p1
    metrics.semantic.p3  += p3
    metrics.semantic.mrr += rr

    perArticleResults.push({
      articleId: gt.articleId,
      title: article.title.substring(0, 50),
      semanticTop3: semanticRank.slice(0, 3).map(r => r.id),
      idealEvaluators: gt.idealEvaluators,
      p1, p3, rr,
    })
  }

  metrics.random.p1  = randomAvg.p1
  metrics.random.p3  = randomAvg.p3
  metrics.random.mrr = randomAvg.mrr

  console.log('\n=== RESULTADOS DO EXPERIMENTO ===')
  console.log(`N artigos: ${n} | N avaliadores: ${evaluatorsData.length}`)
  console.log(`Método baseline: atribuição aleatória (média de ${RANDOM_RUNS} execuções)`)
  console.log('\n┌─────────────────┬───────────┬───────────┐')
  console.log('│ Métrica         │ Semântico │ Aleatório │')
  console.log('├─────────────────┼───────────┼───────────┤')
  console.log(`│ Precision@1     │   ${(metrics.semantic.p1/n).toFixed(3)}   │   ${metrics.random.p1.toFixed(3)}   │`)
  console.log(`│ Precision@3     │   ${(metrics.semantic.p3/n).toFixed(3)}   │   ${metrics.random.p3.toFixed(3)}   │`)
  console.log(`│ MRR             │   ${(metrics.semantic.mrr/n).toFixed(3)}   │   ${metrics.random.mrr.toFixed(3)}   │`)
  console.log('└─────────────────┴───────────┴───────────┘')

  console.log('\n=== POR ARTIGO (SEMÂNTICO) ===')
  console.log('ID        │ P@1 │ P@3 │ RR    │ Top-3 sugeridos │ Ideais')
  console.log('──────────┼─────┼─────┼───────┼─────────────────┼──────────')
  for (const r of perArticleResults) {
    console.log(
      `${r.articleId} │  ${r.p1}  │ ${r.p3.toFixed(2)} │ ${r.rr.toFixed(3)} │ ${r.semanticTop3.join(',')} │ ${r.idealEvaluators.join(',')}`
    )
  }

  console.log('\nModelo: Xenova/paraphrase-multilingual-mpnet-base-v2 (768d, mean pooling, L2-normalizado)')
}

main().catch(console.error)
