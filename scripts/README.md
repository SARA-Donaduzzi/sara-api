# Scripts de reprodução dos experimentos

Scripts que geram a evidência empírica dos dois módulos descritos no artigo:
conformidade do endpoint OAI-PMH e recomendação semântica de avaliadores.

## Requisitos

| Pipeline | Requisito |
|---|---|
| Validação OAI-PMH | Python 3.11+, `pip install requests xmlschema`, API rodando |
| Experimento de recomendação | Python 3.11+, [Bun](https://bun.sh) 1.1+, `bun install` na raiz |

O experimento roda em CPU. O modelo de embeddings
(`paraphrase-multilingual-mpnet-base-v2`) é baixado na primeira execução para
`.model-cache/` (~1 GB).

## Conformidade OAI-PMH

Levanta onze requisições contra o endpoint `/oai` e valida cada resposta XML
contra os esquemas oficiais `OAI-PMH.xsd` e `oai_dc.xsd`, resolvidos por sua vez
contra o `simpledc20021212.xsd`.

```bash
docker compose up -d          # Postgres + MinIO
bun run dev                   # API em :8080
bun run repro:validate-oai    # ou: python scripts/validate-oai.py [base_url]
```

Os esquemas são baixados uma única vez para `scripts/xsd/` e têm as declarações
de `schemaLocation` reescritas para caminhos locais, o que torna a validação
offline e determinística. Saída esperada: `11 conformes / 0 não conformes`.

## Experimento de recomendação de avaliadores

Três etapas encadeadas. Nenhum dado é redistribuído neste repositório: o corpus
é reconstruído a partir da SBC OpenLib pelo próprio protocolo OAI-PMH, o que
preserva a fonte como autoridade sobre os metadados.

```bash
bun run repro:harvest      # 1. coleta ~5.500 registros de 6 eventos (~15 min)
bun run repro:dataset      # 2. aplica o corte temporal e monta o dataset
bun run repro:experiment   # 3. cruza representação x agregação x método
```

### 1. `harvest_sol.py`

Coleta os metadados Dublin Core dos eventos SBIE, WEI, SEMISH, SBBD, SBSEG e
SBCAS. Aplica boas práticas de *harvesting*: uma requisição por vez, intervalo
entre chamadas, respeito ao `Retry-After` em 503 e *User-Agent* identificável.

As páginas XML brutas são preservadas em `data/corpus-sol/raw/`, de modo que
`--offline` reconstrói o `records.json` sem tocar na rede.

### 2. `build_dataset_sol.py`

Aplica o protocolo de corte temporal: fixado o ano-alvo, as consultas são os
trabalhos publicados nesse ano e o perfil de cada avaliador é construído apenas
com o que ele publicou *antes* dele. Nenhum documento aparece dos dois lados, o
que elimina o vazamento de vocabulário que um *leave-one-out* introduziria.

São elegíveis a avaliador os autores com pelo menos três trabalhos anteriores ao
corte. A desambiguação usa casamento exato sobre o nome normalizado — escolha
conservadora, que separa variantes abreviadas mas não funde pessoas distintas.

### 3. `run-experiment-sol.ts`

Cruza os três eixos em matriz completa:

- **representação**: `titulo` | `titulo+resumo`
- **agregação**: `media` | `maximo` | `top-3`
- **método**: `aleatorio` | `bm25` | `semantico` | `hibrido` (RRF)

Reporta Precision@1, Precision@3 e MRR, com teste de permutação pareado
bicaudal sobre o *reciprocal rank* por submissão (20.000 reamostragens). Os
vetores são cacheados em `data/dataset-sol/emb-*.bin`; apagar esses arquivos
força o recálculo.

Resultados em `data/dataset-sol/results.json`.

### `run-experiment.ts` (conjunto sintético)

Roda a mesma matriz sobre o conjunto sintético de 20 artigos e 12 perfis, com
*ground truth* definido manualmente, versionado em `data/dataset/`. Serve
unicamente para reproduzir o contraste discutido no artigo: os mesmos
componentes de software entregam Precision@1 de 0,850 nesse conjunto e 0,131 no
corpus real. É um exemplo de superestimação por desenho de avaliação, não um
resultado a ser citado como desempenho do módulo.

## Layout

```
scripts/
├── validate-oai.py          conformidade do endpoint contra os XSD oficiais
├── xsd/                     esquemas oficiais cacheados
├── harvest_sol.py           coleta OAI-PMH do corpus de avaliação
├── build_dataset_sol.py     corte temporal e montagem do dataset
├── run-experiment-sol.ts    matriz de experimentos sobre o corpus real
├── run-experiment.ts        mesma matriz sobre o conjunto sintético
└── data/
    ├── dataset/             conjunto sintético (versionado)
    ├── corpus-sol/          saída do harvest (não versionado)
    └── dataset-sol/         saída do build + resultados (não versionado)
```
