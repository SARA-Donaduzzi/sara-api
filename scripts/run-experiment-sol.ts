/**
 * Experimento de recomendacao de avaliadores sobre o corpus publico da SBC
 * OpenLib, coletado por OAI-PMH.
 *
 * Protocolo: corte temporal. Fixado um ano-alvo T, as consultas sao os
 * trabalhos publicados em T e o perfil de cada avaliador e formado apenas
 * pelo que ele publicou antes de T. Nenhum documento aparece dos dois lados,
 * o que elimina o vazamento de vocabulario do leave-one-out.
 *
 * Verdade de referencia: os autores do trabalho que pertencem ao pool. E uma
 * aproximacao — quem escreveu sobre o tema demonstravelmente entende dele —
 * usada na literatura de expertise retrieval por dispensar anotacao manual.
 *
 * Eixos comparados:
 *   representacao : quais campos descrevem submissao e documento de perfil
 *   agregacao     : como reduzir as pontuacoes do historico a uma so
 *   metodo        : aleatorio | BM25 lexico | embeddings | fusao RRF
 *
 * A agregacao e um eixo e nao uma constante porque o historico varia de 3 a
 * mais de 40 trabalhos: a media penaliza quem publica em muitas frentes e o
 * maximo premia quem publica muito, entao a escolha nao e neutra.
 *
 * O SOL nao preenche dc:subject em nenhum registro, entao nao ha representacao
 * baseada em palavras-chave — restam titulo e titulo+resumo.
 */

import submissionsData from './data/dataset-sol/submissions.json'
import reviewersData from './data/dataset-sol/reviewers.json'
import profileDocsData from './data/dataset-sol/profile_docs.json'
import { EmbeddingEngine } from '../src/infrastructure/ml/EmbeddingEngine'

const RANDOM_RUNS = 30
const BM25_K1 = 1.2
const BM25_B = 0.75
const RRF_K = 60

const engine = EmbeddingEngine.getInstance()

type Doc = { id: string; title: string; abstract: string; keywords: string }
type Scored = { id: string; score: number }

const REPRESENTATIONS: Record<string, (d: Doc) => string> = {
  'titulo': (d) => d.title,
  'titulo+resumo': (d) => [d.title, d.abstract].filter(Boolean).join('. '),
}

const METHODS = ['semantico', 'bm25', 'hibrido'] as const
type Method = (typeof METHODS)[number]

/** Reducao das pontuacoes do historico de um avaliador a um unico valor. */
const AGGREGATIONS: Record<string, (scores: number[]) => number> = {
  'media': (s) => s.reduce((a, b) => a + b, 0) / s.length,
  'maximo': (s) => Math.max(...s),
  'top3': (s) => {
    const t = [...s].sort((a, b) => b - a).slice(0, 3)
    return t.reduce((a, b) => a + b, 0) / t.length
  },
}

// ------------------------------------------------------------------ texto

const STOPWORDS = new Set(
  (
    'a o e de da do das dos em no na nos nas um uma uns umas para por com sem sobre ' +
    'que se ao aos as os como mais menos entre ser sao foi era este esta esse essa ' +
    'isso aquele aquela pelo pela nao ja tambem apos ate cada qual quais seu sua seus ' +
    'suas ou the of and to in for on with as at by from is are was were be been this ' +
    'that these those it its an or which we our their can may such using used use ' +
    'artigo trabalho presente paper study resultados results resumo abstract ' +
    'este trabalho objetivo forma partir sendo pode ainda dois tres bem'
  ).split(/\s+/)
)

const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

function tokenize(text: string): string[] {
  return stripAccents(text.toLowerCase())
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t))
}

// ------------------------------------------------------------------ BM25

class BM25 {
  private df = new Map<string, number>()
  private avgLen: number
  private n: number
  constructor(private docs: Map<string, string[]>) {
    this.n = docs.size
    let total = 0
    for (const toks of docs.values()) {
      total += toks.length
      for (const t of new Set(toks)) this.df.set(t, (this.df.get(t) ?? 0) + 1)
    }
    this.avgLen = total / Math.max(this.n, 1)
  }
  private idf(t: string) {
    const df = this.df.get(t) ?? 0
    return Math.log(1 + (this.n - df + 0.5) / (df + 0.5))
  }
  score(query: Set<string>, docId: string): number {
    const doc = this.docs.get(docId)
    if (!doc || doc.length === 0) return 0
    const tf = new Map<string, number>()
    for (const t of doc) tf.set(t, (tf.get(t) ?? 0) + 1)
    const norm = BM25_K1 * (1 - BM25_B + (BM25_B * doc.length) / this.avgLen)
    let s = 0
    for (const term of query) {
      const f = tf.get(term)
      if (f) s += this.idf(term) * ((f * (BM25_K1 + 1)) / (f + norm))
    }
    return s
  }
}

// ------------------------------------------------------------------ metricas

function precisionAtK(ranked: Scored[], relevant: Set<string>, k: number): number {
  const hits = ranked.slice(0, k).filter((r) => relevant.has(r.id)).length
  return hits / Math.min(k, relevant.size)
}
function reciprocalRank(ranked: Scored[], relevant: Set<string>): number {
  const i = ranked.findIndex((r) => relevant.has(r.id))
  return i === -1 ? 0 : 1 / (i + 1)
}
function rankFromScores(ids: string[], scores: Float64Array): Scored[] {
  return ids
    .map((id, i) => ({ id, score: scores[i] }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
}
function rrf(rankings: Scored[][], k = RRF_K): Scored[] {
  const agg = new Map<string, number>()
  for (const r of rankings) r.forEach((x, i) => agg.set(x.id, (agg.get(x.id) ?? 0) + 1 / (k + i + 1)))
  return [...agg.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
}
const mean = (s: number[]) => s.reduce((x, y) => x + y, 0) / s.length

/** Teste de permutacao pareado sobre a diferenca media (bicaudal). */
function pairedPermutationTest(a: number[], b: number[], iters = 20_000): number {
  const d = a.map((x, i) => x - b[i])
  const observed = Math.abs(mean(d))
  let extreme = 0
  for (let it = 0; it < iters; it++) {
    let sum = 0
    for (const v of d) sum += Math.random() < 0.5 ? -v : v
    if (Math.abs(sum / d.length) >= observed - 1e-12) extreme++
  }
  return (extreme + 1) / (iters + 1)
}

const dot = (a: Float32Array, b: Float32Array) => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

/**
 * Embeddings de uma lista de textos, com cache binario em disco. Rodar a
 * matriz completa exige varias passadas sobre o mesmo corpus; sem o cache
 * cada ajuste custaria minutos de reprocessamento identico.
 */
async function embedAll(tag: string, texts: string[], dim = 768): Promise<Float32Array[]> {
  // o hash entra no nome: se o corpus mudar, o cache antigo simplesmente nao
  // e encontrado, em vez de ser reaproveitado fora de ordem
  const h = Bun.hash(texts.join('\u0000')).toString(36)
  const path = `scripts/data/dataset-sol/emb-${tag}-${h}.bin`
  const expected = texts.length * dim * 4
  const file = Bun.file(path)
  if ((await file.exists()) && file.size === expected) {
    const buf = new Float32Array(await file.arrayBuffer())
    console.log(`    embeddings lidos do cache (${texts.length})`)
    return texts.map((_, i) => buf.subarray(i * dim, (i + 1) * dim))
  }
  const t0 = Date.now()
  const buf = new Float32Array(texts.length * dim)
  for (let i = 0; i < texts.length; i++) {
    buf.set(await engine.embed(texts[i]), i * dim)
    if ((i + 1) % 500 === 0) console.log(`    ${i + 1}/${texts.length}`)
  }
  await Bun.write(path, buf)
  console.log(`    ${texts.length} embeddings em ${((Date.now() - t0) / 1000).toFixed(0)}s`)
  return texts.map((_, i) => buf.subarray(i * dim, (i + 1) * dim))
}

// ------------------------------------------------------------------ main

async function main() {
  if (process.env.NODE_ENV === 'test') {
    throw new Error('NODE_ENV=test ativa embeddings pseudo-aleatorios. Rode sem NODE_ENV=test.')
  }

  const submissions = submissionsData as any[]
  const reviewers = reviewersData as any[]
  const profileDocs = profileDocsData as any[]

  const docById = new Map<string, Doc>(profileDocs.map((d) => [d.id, d]))
  const revIds = reviewers.map((r) => r.id)
  const revHistory = reviewers.map((r) => (r.history_ids as string[]).filter((id) => docById.has(id)))
  const docIds = profileDocs.map((d) => d.id)
  const docIndex = new Map(docIds.map((id, i) => [id, i]))
  const revDocIdx = revHistory.map((h) => h.map((id) => docIndex.get(id)!))

  const queries = submissions
    .map((s) => ({
      doc: s as Doc,
      year: s.year,
      relevant: new Set<string>((s.relevant_reviewers as string[]).filter((k) => revIds.includes(k))),
    }))
    .filter((q) => q.relevant.size > 0)

  const n = queries.length
  console.log(
    `Consultas: ${n} | pool: ${reviewers.length} avaliadores | docs de perfil: ${profileDocs.length}`
  )
  console.log(`Historico medio: ${(mean(revHistory.map((h) => h.length))).toFixed(2)} docs/avaliador`)
  console.log('Carregando Xenova/paraphrase-multilingual-mpnet-base-v2 ...')
  await engine.initialize()

  // ------------------------------------------------- baseline aleatorio
  const randomAcc = { p1: 0, p3: 0, mrr: 0 }
  const randomRR: number[] = []
  for (const q of queries) {
    let p1 = 0, p3 = 0, mrr = 0
    for (let i = 0; i < RANDOM_RUNS; i++) {
      const perm = revIds.map((id) => ({ id, score: Math.random() })).sort((a, b) => b.score - a.score)
      p1 += precisionAtK(perm, q.relevant, 1) / RANDOM_RUNS
      p3 += precisionAtK(perm, q.relevant, 3) / RANDOM_RUNS
      mrr += reciprocalRank(perm, q.relevant) / RANDOM_RUNS
    }
    randomAcc.p1 += p1; randomAcc.p3 += p3; randomAcc.mrr += mrr
    randomRR.push(mrr)
  }

  const results: any[] = []
  const rrBy: Record<string, number[]> = {}
  const detailBy: Record<string, any[]> = {}

  for (const [repName, repFn] of Object.entries(REPRESENTATIONS)) {
    console.log(`\n--- representacao "${repName}" ---`)

    const docVec = await embedAll(`${repName}-perfil`, docIds.map((id) => repFn(docById.get(id)!)))
    const qVec = await embedAll(`${repName}-consulta`, queries.map((q) => repFn(q.doc)))

    const docToks = new Map(docIds.map((id) => [id, tokenize(repFn(docById.get(id)!))]))
    const bm25 = new BM25(docToks)

    const acc: Record<string, { p1: number; p3: number; mrr: number }> = {}
    for (const agg of Object.keys(AGGREGATIONS))
      for (const m of METHODS) {
        acc[`${agg}|${m}`] = { p1: 0, p3: 0, mrr: 0 }
        rrBy[`${repName}|${agg}|${m}`] = []
      }

    for (let qi = 0; qi < n; qi++) {
      const q = queries[qi]
      const qv = qVec[qi]
      const qt = new Set(tokenize(repFn(q.doc)))

      // pontuacao documento a documento, uma unica passada por consulta
      const simDoc = new Float64Array(docIds.length)
      const lexDoc = new Float64Array(docIds.length)
      for (let i = 0; i < docIds.length; i++) {
        simDoc[i] = dot(qv, docVec[i]) // vetores ja normalizados (L2)
        lexDoc[i] = bm25.score(qt, docIds[i])
      }

      for (const [aggName, aggFn] of Object.entries(AGGREGATIONS)) {
        const semScore = new Float64Array(revIds.length)
        const lexScore = new Float64Array(revIds.length)
        for (let r = 0; r < revIds.length; r++) {
          const idxs = revDocIdx[r]
          if (idxs.length === 0) continue
          semScore[r] = aggFn(idxs.map((i) => simDoc[i]))
          lexScore[r] = aggFn(idxs.map((i) => lexDoc[i]))
        }
        const rankSem = rankFromScores(revIds, semScore)
        const rankLex = rankFromScores(revIds, lexScore)
        const ranks: Record<Method, Scored[]> = {
          semantico: rankSem,
          bm25: rankLex,
          hibrido: rrf([rankSem, rankLex]),
        }
        for (const m of METHODS) {
          const key = `${aggName}|${m}`
          acc[key].p1 += precisionAtK(ranks[m], q.relevant, 1)
          acc[key].p3 += precisionAtK(ranks[m], q.relevant, 3)
          const rr = reciprocalRank(ranks[m], q.relevant)
          acc[key].mrr += rr
          rrBy[`${repName}|${key}`].push(rr)
        }
        ;(detailBy[`${repName}|${aggName}`] ??= []).push({
          id: (q.doc as any).id,
          title: q.doc.title.slice(0, 58),
          nRelevant: q.relevant.size,
          semRR: reciprocalRank(rankSem, q.relevant),
          bm25RR: reciprocalRank(rankLex, q.relevant),
          hibRR: reciprocalRank(ranks.hibrido, q.relevant),
        })
      }
      if ((qi + 1) % 100 === 0) console.log(`    consulta ${qi + 1}/${n}`)
    }

    for (const agg of Object.keys(AGGREGATIONS))
      for (const m of METHODS) {
        const a = acc[`${agg}|${m}`]
        results.push({
          representacao: repName,
          agregacao: agg,
          metodo: m,
          p1: +(a.p1 / n).toFixed(3),
          p3: +(a.p3 / n).toFixed(3),
          mrr: +(a.mrr / n).toFixed(3),
        })
        console.log(
          `    ${agg.padEnd(7)} ${m.padEnd(10)} P@1=${(a.p1 / n).toFixed(3)} P@3=${(a.p3 / n).toFixed(3)} MRR=${(a.mrr / n).toFixed(3)}`
        )
      }
  }

  // ------------------------------------------------------------- relatorio
  console.log(`\n=== MATRIZ representacao x agregacao x metodo (n=${n} submissoes) ===`)
  console.log('representacao   agregacao metodo     |  P@1  |  P@3  |  MRR')
  console.log('------------------------------------+-------+-------+-------')
  for (const r of results)
    console.log(
      `${r.representacao.padEnd(15)} ${r.agregacao.padEnd(9)} ${r.metodo.padEnd(10)}| ${r.p1.toFixed(3)} | ${r.p3.toFixed(3)} | ${r.mrr.toFixed(3)}`
    )
  console.log(
    `${'-'.padEnd(15)} ${'-'.padEnd(9)} ${'aleatorio'.padEnd(10)}| ${(randomAcc.p1 / n).toFixed(3)} | ${(randomAcc.p3 / n).toFixed(3)} | ${(randomAcc.mrr / n).toFixed(3)}`
  )

  const best = [...results].sort((a, b) => b.mrr - a.mrr)[0]
  console.log(
    `\nMelhor configuracao: ${best.representacao} + ${best.agregacao} + ${best.metodo} (MRR ${best.mrr})`
  )

  console.log('\n=== TESTE DE PERMUTACAO PAREADO (RR, bicaudal) ===')
  const bestKey = `${best.representacao}|${best.agregacao}|${best.metodo}`
  const bestSem = `${best.representacao}|${best.agregacao}|semantico`
  const pairs: [string, string][] = [
    [bestKey, `${best.representacao}|${best.agregacao}|bm25`],
    [bestKey, bestSem],
    [bestSem, `${best.representacao}|media|semantico`],
    [`${best.representacao}|${best.agregacao}|hibrido`, `${best.representacao}|${best.agregacao}|bm25`],
  ]
  const tests: any[] = []
  for (const [x, y] of pairs) {
    if (x === y) continue
    const p = pairedPermutationTest(rrBy[x], rrBy[y])
    const d = mean(rrBy[x]) - mean(rrBy[y])
    console.log(
      `  ${x} vs ${y}: dMRR=${d >= 0 ? '+' : ''}${d.toFixed(3)} p=${p.toFixed(4)} ${p < 0.05 ? 'SIGNIFICATIVO' : 'nao significativo'}`
    )
    tests.push({ a: x, b: y, deltaMRR: +d.toFixed(4), p: +p.toFixed(4), significant: p < 0.05 })
  }
  const pRandom = pairedPermutationTest(rrBy[bestKey], randomRR)
  const dRandom = mean(rrBy[bestKey]) - mean(randomRR)
  console.log(
    `  ${bestKey} vs aleatorio: dMRR=+${dRandom.toFixed(3)} p=${pRandom.toFixed(4)} ${pRandom < 0.05 ? 'SIGNIFICATIVO' : 'nao significativo'}`
  )
  tests.push({ a: bestKey, b: 'aleatorio', deltaMRR: +dRandom.toFixed(4), p: +pRandom.toFixed(4), significant: pRandom < 0.05 })

  const d = detailBy[`${best.representacao}|${best.agregacao}`]
  const w = d.filter((r) => r.semRR > r.bm25RR).length
  const l = d.filter((r) => r.semRR < r.bm25RR).length
  console.log(
    `\nSemantico vs BM25 em "${best.representacao} / ${best.agregacao}": ${w} vitorias, ${l} derrotas, ${n - w - l} empates`
  )
  console.log('\n=== SEMANTICO GANHA POR MARGEM ===')
  for (const r of [...d].sort((a, b) => b.semRR - b.bm25RR - (a.semRR - a.bm25RR)).slice(0, 5))
    console.log(`  sem=${r.semRR.toFixed(3)} bm25=${r.bm25RR.toFixed(3)} | ${r.title}`)
  console.log('\n=== BM25 GANHA POR MARGEM ===')
  for (const r of [...d].sort((a, b) => b.bm25RR - b.semRR - (a.bm25RR - a.semRR)).slice(0, 5))
    console.log(`  sem=${r.semRR.toFixed(3)} bm25=${r.bm25RR.toFixed(3)} | ${r.title}`)

  await Bun.write(
    'scripts/data/dataset-sol/results.json',
    JSON.stringify(
      {
        corpus: {
          submissions: n,
          pool: reviewers.length,
          profileDocs: profileDocs.length,
          avgHistory: +mean(revHistory.map((h) => h.length)).toFixed(2),
          avgRelevant: +mean(queries.map((q) => q.relevant.size)).toFixed(2),
          year: (submissions[0] as any)?.year ?? null,
        },
        matrix: results,
        random: {
          p1: +(randomAcc.p1 / n).toFixed(3),
          p3: +(randomAcc.p3 / n).toFixed(3),
          mrr: +(randomAcc.mrr / n).toFixed(3),
        },
        best,
        significance: tests,
        perQuery: detailBy,
        model: 'Xenova/paraphrase-multilingual-mpnet-base-v2 (768d, mean pooling, L2)',
      },
      null,
      2
    )
  )
  console.log('\nResultados salvos em scripts/data/dataset-sol/results.json')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
