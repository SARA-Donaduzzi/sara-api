# Política de Segurança

## Versões suportadas

O SARA está em desenvolvimento ativo e ainda não possui versões estáveis com
suporte de longo prazo. Correções de segurança são aplicadas ao branch `main`.

| Versão | Suportada |
| ------ | --------- |
| `main` | sim       |
| outras | não       |

## Como reportar uma vulnerabilidade

**Não abra uma issue pública para relatar vulnerabilidades.** Issues são
visíveis a qualquer pessoa e expõem o problema antes que haja correção.

Use o canal privado do GitHub:

1. Acesse a aba **Security** do repositório.
2. Clique em **Report a vulnerability**.
3. Descreva o problema com o máximo de detalhe possível.

Se possível, inclua:

- o tipo de vulnerabilidade (por exemplo, injeção de SQL, XSS, escalada de privilégio);
- os arquivos ou endpoints afetados;
- os passos para reproduzir o comportamento;
- o impacto que você consegue demonstrar;
- qualquer sugestão de mitigação.

## O que esperar

- **Confirmação de recebimento** em até 7 dias.
- **Avaliação inicial** com uma classificação de severidade em até 30 dias.
- **Divulgação coordenada**: pedimos que você não torne o problema público até
  que uma correção esteja disponível. Créditos serão dados no advisory, salvo
  se você preferir permanecer anônimo.

Este é um projeto acadêmico mantido por estudantes, sem equipe dedicada de
segurança e sem programa de recompensas. Os prazos acima são um compromisso de
boa-fé, não uma garantia contratual.

## Escopo

Estão no escopo os repositórios `sara-api`, `sara-web` e `sara-docs`.

Estão **fora** do escopo:

- vulnerabilidades em dependências de terceiros que já possuam CVE público
  (reporte ao projeto de origem, mas sinta-se à vontade para abrir uma issue
  pedindo a atualização da dependência);
- instalações de terceiros do SARA que não sejam mantidas por este projeto;
- ataques que exijam acesso físico ou credenciais administrativas legítimas.

## Boas práticas para quem instala o SARA

O repositório distribui apenas arquivos `.env.example` com valores fictícios.
Antes de expor uma instância na rede:

- gere um `JWT_SECRET` aleatório e longo, nunca reaproveite o valor de exemplo;
- troque as credenciais padrão do banco de dados e do MinIO;
- sirva a aplicação atrás de HTTPS;
- restrinja o acesso administrativo ao banco e ao object storage.
