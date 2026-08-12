# Como contribuir

Obrigado pelo interesse no SARA. Este é um projeto acadêmico de código aberto e
contribuições são bem-vindas, desde correções de digitação na documentação até
novos módulos.

Ao participar, você concorda em seguir o [Código de Conduta](CODE_OF_CONDUCT.md).

## Antes de começar

Se a sua ideia for grande, abra uma issue descrevendo o problema antes de
escrever código. Isso evita que você invista tempo em uma abordagem que não
será aceita. Para correções pequenas e óbvias, pode ir direto ao pull request.

Vulnerabilidades de segurança **não** devem ser reportadas em issues públicas.
Siga o procedimento descrito em [SECURITY.md](SECURITY.md).

## Preparando o ambiente

Pré-requisitos: [Bun](https://bun.sh) 1.1 ou superior, Docker e Docker Compose.

```bash
git clone https://github.com/SARA-Donaduzzi/sara-api.git
cd sara-api

# Dependências
bun install

# Variáveis de ambiente. Edite o .env antes de seguir:
# gere um JWT_SECRET aleatório e revise as credenciais.
cp .env.example .env

# Sobe apenas a infraestrutura (PostgreSQL na 5433 e MinIO nas 9000/9001).
# A API não sobe por aqui.
docker compose up -d

# Prisma Client e migrations
bun run prisma:generate-all

# Dados de exemplo (opcional)
bun run db:seed

# API em http://localhost:8080
bun run dev
```

## Rodando os testes

```bash
bunx jest
```

Testes são obrigatórios em pull requests que alterem regra de negócio. Se você
corrigiu um bug, inclua um teste que falhe sem a correção.

Atenção: quando `NODE_ENV=test`, o `EmbeddingEngine` devolve vetores
pseudoaleatórios determinísticos em vez de carregar o modelo ONNX. Isso mantém
a suíte rápida, mas significa que testes de qualidade de recomendação precisam
rodar com `NODE_ENV=production`.

## Organização do código

O backend segue Clean Architecture em quatro camadas. Respeite a direção das
dependências: `presentation` conhece `application`, que conhece
`infrastructure` por meio de interfaces. O caminho inverso não deve existir.

```
src/
├── presentation/    # Controllers, rotas, middlewares. Sem regra de negócio.
├── application/     # Services e DTOs. O núcleo das regras.
├── infrastructure/  # Repositories (Prisma), MinIO, e-mail, modelo de embeddings.
└── shared/          # Erros e utilitários sem dependência de camada.
```

Consequência prática: um controller nunca importa `PrismaClient` diretamente, e
um service nunca importa `Request` ou `Response` do Express.

## Estilo

- TypeScript com `strict` ligado. Não use `any` para silenciar o compilador.
- Nomes de domínio em inglês no código (`Article`, `Evaluation`), mensagens ao
  usuário final em português.
- Não deixe `console.log` de depuração. Para log permanente, use o logger da
  aplicação.
- Nada de segredos no código. Tudo que varia por ambiente vai para o `.env` e
  é documentado no `.env.example` com valor fictício.

## Migrations

Alterações no `prisma/schema.prisma` exigem migration versionada:

```bash
bunx prisma migrate dev --name descricao_curta
```

Nunca edite uma migration já publicada no `main`. Crie outra por cima.

## Commits e pull requests

Usamos [Conventional Commits](https://www.conventionalcommits.org/pt-br/):

```
feat(oai): adicionar suporte ao verbo ListSets
fix(auth): corrigir expiração do token de reset
docs(readme): atualizar porta do PostgreSQL
test(matching): cobrir empate de similaridade
```

Prefixos usados: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `perf`.

No pull request, descreva **o que muda e por quê**. Se houver mudança de
comportamento visível, diga qual era o comportamento anterior. Vincule a issue
correspondente com `Closes #123`.

Antes de abrir o PR, confirme que:

- o projeto compila (`bun run build`);
- os testes passam (`bunx jest`);
- não há segredos, dados pessoais nem `console.log` de depuração no diff;
- a documentação afetada foi atualizada.

## Licença das contribuições

Ao enviar um pull request, você concorda que sua contribuição será
distribuída sob a [Licença MIT](LICENSE), a mesma do projeto.
