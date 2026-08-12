// src/presentation/middlewares/emailNotificationMiddleware.ts
import { Request, Response, NextFunction } from "express";
import { EmailService } from "../../application/services/EmailService";
import { ArticleRepository } from "../../infrastructure/repositories/ArticleRepository";
import { AuthRepository } from "../../infrastructure/repositories/AuthRepository";
import { EventRepository } from "../../infrastructure/repositories/EventRepository";

// Instanciar repositórios
const articleRepository = new ArticleRepository();
const authRepository = new AuthRepository();
const eventRepository = new EventRepository();

export class EmailNotificationMiddleware {
  private emailService: EmailService;

  constructor() {
    this.emailService = new EmailService();
  }

  /**
   * Notifica avaliadores quando são adicionados a um evento
   * Usado em: POST /api/events/:eventId/evaluators
   */
  notifyEvaluatorAdded() {
    return (req: Request, res: Response, next: NextFunction): void => {
      // Interceptar a resposta original
      const originalJson = res.json;

      res.json = function (body: any) {
        // Chamar o método original primeiro
        const result = originalJson.call(this, body);

        // Se a operação foi bem-sucedida, enviar notificações
        if (body.success && body.data && body.data.added) {
          const addedEvaluators = body.data.added;

          // Para cada avaliador adicionado, enviar notificação assíncrona
          addedEvaluators.forEach((evaluator: any) => {
            if (evaluator.user && evaluator.event) {
              setImmediate(async () => {
                try {
                  const emailService = new EmailService();
                  await emailService.sendEvaluatorAddedEmail(
                    evaluator.user.email,
                    evaluator.user.name,
                    evaluator.event.name,
                    evaluator.event.description
                  );
                  console.log(
                    `✅ Email enviado para avaliador: ${evaluator.user.email}`
                  );
                } catch (error) {
                  console.error(
                    `❌ Erro ao enviar email para ${evaluator.user.email}:`,
                    error
                  );
                }
              });
            }
          });
        }

        return result;
      };

      next();
    };
  }

  /**
   * Notifica avaliadores quando um artigo é atribuído para avaliação
   * Usado em: POST /api/articles/:articleId/evaluators
   */
  notifyEvaluatorAddedToArticle() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const originalJson = res.json;

      res.json = function (body: any) {
        const result = originalJson.call(this, body);

        // Se a operação foi bem-sucedida e tem avaliadores atribuídos
        if (body.success && body.data && body.data.assignedEvaluators) {
          const { assignedEvaluators, articleId, eventId } = body.data;

          // Enviar emails em background (fire and forget)
          setImmediate(async () => {
            try {
              // Buscar informações do artigo e evento
              const [article, event] = await Promise.all([
                articleRepository.findById(articleId),
                eventId
                  ? eventRepository.findById(eventId)
                  : Promise.resolve(null),
              ]);

              if (!article) {
                console.error(`Artigo ${articleId} não encontrado`);
                return;
              }

              // Para cada avaliador atribuído, enviar notificação
              for (const assignment of assignedEvaluators) {
                try {
                  const evaluator = await authRepository.findActiveById(
                    assignment.userId
                  );

                  if (!evaluator) {
                    console.error(
                      `Avaliador ${assignment.userId} não encontrado`
                    );
                    continue;
                  }

                  const emailService = new EmailService();
                  await emailService.sendEvaluatorAssignedToArticleEmail(
                    evaluator.email,
                    evaluator.name,
                    event?.name || "Evento",
                    event?.description || undefined,
                    article.title,
                    event?.evaluationDeadline
                      ? new Date(event.evaluationDeadline)
                      : undefined
                  );

                  console.log(
                    `✅ Email de artigo atribuído enviado para: ${evaluator.email}`
                  );
                } catch (error) {
                  console.error(
                    `❌ Erro ao enviar email para avaliador ${assignment.userId}:`,
                    error
                  );
                }
              }
            } catch (error) {
              console.error("Erro ao processar notificações de email:", error);
            }
          });
        }

        return result;
      };

      next();
    };
  }

  /**
   * Notifica autor quando artigo é submetido
   * Usado em: POST /api/articles
   */
  notifyArticleSubmitted() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const originalJson = res.json;

      res.json = function (body: any) {
        const result = originalJson.call(this, body);

        // Se artigo foi criado com sucesso
        if (body.success && body.data && req.method === "POST") {
          const article = body.data;

          // Verificar se tem os dados necessários
          if (article.user && article.event && article.title) {
            setImmediate(async () => {
              try {
                const emailService = new EmailService();
                await emailService.sendArticleSubmittedEmail(
                  article.user.email,
                  article.user.name,
                  article.title,
                  article.event.name
                );
                console.log(
                  `✅ Email de submissão enviado para: ${article.user.email}`
                );
              } catch (error) {
                console.error("Erro ao enviar email de submissão:", error);
              }
            });
          }
        }

        return result;
      };

      next();
    };
  }

  /**
   * Notifica autor quando artigo é revisado (status final)
   * Usado em: PUT /api/articles/:articleId
   */
  notifyArticleReviewed() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const originalJson = res.json;

      res.json = function (body: any) {
        const result = originalJson.call(this, body);

        // Se status do artigo foi atualizado para um dos finais
        if (body.success && body.data && req.method === "PUT") {
          const article = body.data;

          if (
            article.user &&
            article.event &&
            article.title &&
            article.status
          ) {
            const finalStatuses = ["APPROVED", "TO_CORRECTION", "REJECTED"];

            if (finalStatuses.includes(article.status)) {
              setImmediate(async () => {
                try {
                  const emailService = new EmailService();

                  await emailService.sendArticleReviewedEmail(
                    article.user.email,
                    article.user.name,
                    article.title,
                    article.event.name
                  );
                  console.log(
                    `✅ Email de revisão enviado para: ${article.user.email}`
                  );
                } catch (error) {
                  console.error("Erro ao enviar email de revisão:", error);
                }
              });
            }
          }
        }

        return result;
      };

      next();
    };
  }
}

// Instância singleton para uso global
const emailNotificationMiddleware = new EmailNotificationMiddleware();

// ========================================
// EXPORTS
// ========================================

// Para adicionar avaliador ao evento
export const notifyEvaluatorAdded =
  emailNotificationMiddleware.notifyEvaluatorAdded.bind(
    emailNotificationMiddleware
  );

// Para atribuir avaliador a um artigo específico
export const notifyEvaluatorAddedToArticle =
  emailNotificationMiddleware.notifyEvaluatorAddedToArticle.bind(
    emailNotificationMiddleware
  );

// Para submissão de artigo
export const notifyArticleSubmitted =
  emailNotificationMiddleware.notifyArticleSubmitted.bind(
    emailNotificationMiddleware
  );

// Para artigo revisado
export const notifyArticleReviewed =
  emailNotificationMiddleware.notifyArticleReviewed.bind(
    emailNotificationMiddleware
  );
