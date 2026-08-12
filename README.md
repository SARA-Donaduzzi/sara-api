# SARA - Donaduzzi | Backend

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Sistema de Avaliação e Revisão de Artigos - Plataforma para gerenciamento de eventos científicos e submissão de artigos acadêmicos.

Além do fluxo de submissão e avaliação por pares, o backend expõe dois módulos
voltados à ciência aberta:

- **Interoperabilidade OAI-PMH 2.0** (`/oai`), que publica os trabalhos aprovados
  em Dublin Core para colheita por bibliotecas digitais e agregadores.
- **Recomendação de avaliadores**, que sugere revisores por similaridade
  semântica entre o texto da submissão e o histórico de publicações do avaliador,
  com filtro de conflito de interesse.

O frontend está em [`sara-web`](https://github.com/SARA-Donaduzzi/sara-web) e a
documentação detalhada em [`sara-docs`](https://github.com/SARA-Donaduzzi/sara-docs).

## 📋 Tecnologias

| Tecnologia            | Versão | Uso                      |
| --------------------- | ------ | ------------------------ |
| Bun                   | 1.1+   | Runtime e gerenciador    |
| TypeScript            | 5.x    | Linguagem                |
| Express               | 5.x    | Framework Web            |
| Prisma                | 6.x    | ORM                      |
| PostgreSQL            | 15+    | Banco de Dados           |
| MinIO                 | Latest | Armazenamento S3         |
| JWT                   | -      | Autenticação             |
| Nodemailer            | -      | E-mails                  |
| Zod                   | -      | Validação                |
| @xenova/transformers  | 2.x    | Embeddings (ONNX, CPU)   |
| xmlbuilder2           | 4.x    | Serialização OAI-PMH     |

## 🏗️ Arquitetura

O projeto segue **Clean Architecture** com três camadas principais:

```
src/
├── presentation/          # Controllers, Routes, Middlewares
├── application/           # Services (regras de negócio)
├── infrastructure/        # Repositories, Config (Prisma, MinIO)
└── shared/                # Errors, Utils, Types
```

## ⚡ Início Rápido

### Pré-requisitos

- [Bun](https://bun.sh) 1.1+
- Docker e Docker Compose

### Instalação

```bash
# Instalar dependências
bun install

# Configurar variáveis de ambiente.
# Edite o .env e gere um JWT_SECRET aleatório antes de seguir.
cp .env.example .env

# Iniciar containers (PostgreSQL na 5433 + MinIO nas 9000/9001).
# Este comando NÃO sobe a API.
docker compose up -d

# Gerar Prisma Client e aplicar migrations
bun run prisma:generate-all

# Dados de exemplo (opcional)
bun run db:seed

# Iniciar servidor de desenvolvimento em http://localhost:8080
bun run dev
```

### Variáveis de Ambiente

```env
# Banco de Dados
DATABASE_URL="postgresql://user:password@localhost:5432/sara_db"

# JWT
JWT_SECRET="sua-chave-secreta-32-caracteres"
JWT_EXPIRES_IN="7d"

# MinIO
MINIO_ENDPOINT="localhost"
MINIO_PORT=9000
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin"
MINIO_USE_SSL=false

# E-mail
EMAIL_HOST="smtp.gmail.com"
EMAIL_PORT=587
EMAIL_USER="usuario@example.com"
EMAIL_PASS="senha-de-app"

# Servidor
PORT=8080
FRONTEND_URL="http://localhost:3000"
```

## 📦 Scripts

```bash
bun run dev                    # Desenvolvimento com hot reload
bun run build                  # Build de produção
bun start                      # Iniciar servidor produção
bun run prisma:generate-all    # Gerar client + migrations
bun run db:seed                # Popular com dados de exemplo
bunx jest                      # Rodar os testes
bunx prisma migrate dev        # Nova migration
bunx prisma studio             # Interface visual do BD
```

## 🔌 API Endpoints

### Autenticação

| Método | Rota                        | Descrição         |
| ------ | --------------------------- | ----------------- |
| POST   | `/api/auth/register`        | Registrar usuário |
| POST   | `/api/auth/login`           | Login             |
| POST   | `/api/auth/forgot-password` | Recuperar senha   |
| POST   | `/api/auth/reset-password`  | Redefinir senha   |

### Usuários

| Método | Rota             | Descrição                     |
| ------ | ---------------- | ----------------------------- |
| GET    | `/api/users`     | Listar usuários (COORDINATOR) |
| GET    | `/api/users/:id` | Buscar usuário                |
| PATCH  | `/api/users/:id` | Atualizar usuário             |
| DELETE | `/api/users/:id` | Remover usuário (COORDINATOR) |

### Eventos

| Método | Rota              | Descrição                  |
| ------ | ----------------- | -------------------------- |
| GET    | `/api/events`     | Listar eventos             |
| POST   | `/api/events`     | Criar evento (COORDINATOR) |
| GET    | `/api/events/:id` | Detalhes do evento         |
| PATCH  | `/api/events/:id` | Atualizar evento           |
| DELETE | `/api/events/:id` | Remover evento             |

### Artigos

| Método | Rota                         | Descrição          |
| ------ | ---------------------------- | ------------------ |
| GET    | `/api/articles`              | Listar artigos     |
| POST   | `/api/articles`              | Submeter artigo    |
| GET    | `/api/articles/:id`          | Detalhes do artigo |
| POST   | `/api/articles/:id/versions` | Nova versão        |
| DELETE | `/api/articles/:id`          | Remover artigo     |

### Avaliações

| Método | Rota                   | Descrição           |
| ------ | ---------------------- | ------------------- |
| GET    | `/api/evaluations`     | Listar avaliações   |
| POST   | `/api/evaluations`     | Criar avaliação     |
| PATCH  | `/api/evaluations/:id` | Atualizar avaliação |

### Checklists

| Método | Rota                  | Descrição         |
| ------ | --------------------- | ----------------- |
| GET    | `/api/checklists`     | Listar checklists |
| POST   | `/api/checklists`     | Criar checklist   |
| GET    | `/api/checklists/:id` | Detalhes          |
| PUT    | `/api/checklists/:id` | Atualizar         |
| DELETE | `/api/checklists/:id` | Remover           |

### OAI-PMH (público, sem autenticação)

Endpoint único em `/oai`, conforme a especificação OAI-PMH 2.0. Expõe apenas
trabalhos com status `APPROVED` ou `APPROVED_WITH_REMARKS`, serializados em
Dublin Core (`oai_dc`). A paginação usa `resumptionToken`.

| Verbo                 | Exemplo                                            |
| --------------------- | -------------------------------------------------- |
| `Identify`            | `/oai?verb=Identify`                                |
| `ListMetadataFormats` | `/oai?verb=ListMetadataFormats`                     |
| `ListSets`            | `/oai?verb=ListSets`                                |
| `ListIdentifiers`     | `/oai?verb=ListIdentifiers&metadataPrefix=oai_dc`   |
| `ListRecords`         | `/oai?verb=ListRecords&metadataPrefix=oai_dc`       |
| `GetRecord`           | `/oai?verb=GetRecord&metadataPrefix=oai_dc&identifier=...` |

### Recomendação de avaliadores

Sugere revisores para uma submissão comparando o texto do trabalho com o
histórico de publicações de cada avaliador. Utiliza o modelo
`Xenova/paraphrase-multilingual-mpnet-base-v2` (768 dimensões, *mean pooling*,
normalização L2) executado localmente em CPU via ONNX, sem chamadas a serviços
externos. Os vetores ficam em cache na tabela `evaluator_embeddings`.

A ordenação é por similaridade do cosseno, com filtro de conflito de interesse
(autor, coautor e mesma instituição) aplicado antes do ranqueamento.

## 👥 Roles do Sistema

| Role        | Permissões                               |
| ----------- | ---------------------------------------- |
| STUDENT     | Submeter artigos, visualizar avaliações  |
| EVALUATOR   | Avaliar artigos atribuídos               |
| COORDINATOR | Gerenciar eventos, usuários, atribuições |

## 🗄️ Estrutura do Banco

### Modelos Principais

- **User**: Usuários do sistema
- **Event**: Eventos científicos
- **Article**: Artigos submetidos
- **ArticleVersion**: Versões dos artigos
- **Evaluation**: Avaliações
- **Checklist**: Templates de avaliação
- **ChecklistQuestion**: Perguntas do checklist

## 🐳 Docker

```bash
# Iniciar containers
docker-compose up -d

# Parar containers
docker-compose down

# Ver logs
docker-compose logs -f
```

### Serviços

- **PostgreSQL**: porta 5432
- **MinIO**: porta 9000 (API) / 9001 (Console)

## 📁 Buckets MinIO

- `sara-pdfs`: Artigos em PDF
- `sara-banners`: Banners de eventos

## 🔒 Autenticação

O sistema utiliza JWT com middleware de verificação de roles:

```typescript
// Rota protegida por autenticação
router.get("/protected", authMiddleware, controller.method);

// Rota protegida por role específica
router.get(
  "/admin",
  authMiddleware,
  authorize(["COORDINATOR"]),
  controller.method
);
```

## 📧 Sistema de E-mails

Configurado com Nodemailer para:

- Confirmação de submissão
- Notificação de avaliação
- Recuperação de senha
- Notificações de prazo

## 🛠️ Troubleshooting

### Erro de conexão com banco

```bash
# Verificar se PostgreSQL está rodando
docker ps
# Testar conexão
npx prisma db pull
```

### Token inválido

- Verificar JWT_SECRET no .env
- Limpar cookies e fazer login novamente

### Erro de upload MinIO

- Verificar credenciais MINIO_ACCESS_KEY/SECRET_KEY
- Verificar se buckets existem

## 🤝 Contribuindo

Contribuições são bem-vindas. Leia o [CONTRIBUTING.md](CONTRIBUTING.md) para o
passo a passo do ambiente, o padrão de commits e o que verificamos em um pull
request. Ao participar, você concorda com o [Código de Conduta](CODE_OF_CONDUCT.md).

Encontrou uma vulnerabilidade? **Não abra uma issue pública.** Siga o
[SECURITY.md](SECURITY.md).

## 📚 Citação

Se este software for útil em trabalho acadêmico, os metadados de citação estão
em [CITATION.cff](CITATION.cff).

## 📄 Licença

Distribuído sob a **Licença MIT**. Veja [LICENSE](LICENSE) para o texto completo.

---
