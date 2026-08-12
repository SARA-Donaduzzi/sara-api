import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { EmailService } from "../../application/services/EmailService";

const prisma = new PrismaClient();
const emailService = new EmailService();

/**
 * Agendador de emails programados para envio automático de feedbacks
 * Executa diariamente às 9h para enviar emails aos autores quando a data de liberação do feedback é atingida
 */
export class EmailScheduler {
  private static instance: EmailScheduler;
  private isRunning: boolean = false;

  /**
   * Retorna a instância singleton do agendador
   * @returns Instância do EmailScheduler
   */
  static getInstance(): EmailScheduler {
    if (!EmailScheduler.instance) {
      EmailScheduler.instance = new EmailScheduler();
    }
    return EmailScheduler.instance;
  }

  /**
   * Inicia o agendador de emails
   * Configura o job para rodar diariamente às 9h no timezone de São Paulo
   */
  start(): void {
    if (this.isRunning) {
      console.log("📧 Email scheduler já está rodando");
      return;
    }

    // Executar todos os dias às 9h
    cron.schedule(
      "0 9 * * *",
      async () => {
        console.log(
          "📧 Executando job de emails programados:",
          new Date().toISOString()
        );
        await this.processScheduledEmails();
      },
      {
        timezone: "America/Sao_Paulo",
      }
    );

    this.isRunning = true;
    console.log("✅ Email scheduler iniciado - rodando diariamente às 9h");
  }

  /**
   * Processa os emails programados para hoje
   * Busca eventos com feedbackReleaseDate igual a hoje e envia emails para autores
   */
  private async processScheduledEmails(): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Buscar eventos cuja feedbackReleaseDate é hoje
      const events = await prisma.event.findMany({
        where: {
          feedbackReleaseDate: {
            gte: today,
            lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
          },
          isActive: true,
        },
        include: {
          articles: {
            where: {
              isActive: true,
              status: {
                in: ["APPROVED", "REJECTED", "APPROVED_WITH_REMARKS"],
              },
            },
            include: {
              user: true,
              versions: {
                orderBy: { version: "desc" },
                take: 1,
                include: {
                  evaluations: true,
                },
              },
            },
          },
        },
      });

      console.log(
        `📅 Encontrados ${events.length} eventos com feedback hoje`
      );

      for (const event of events) {
        for (const article of event.articles) {
          // Verificar se já enviou email para este artigo hoje
          const alreadySent = await this.checkIfEmailSent(article.id, today);

          if (alreadySent) {
            console.log(
              `⏭️ Email já enviado para artigo ${article.id}, pulando...`
            );
            continue;
          }

          // Enviar email para o autor
          await emailService.sendArticleReviewedEmail(
            article.user.email,
            article.user.name,
            article.title,
            event.name
          );

          // Registrar envio
          await this.logEmailSent(article.id, article.user.email, today);

          console.log(
            `✅ Email enviado para ${article.user.email} - Artigo: ${article.title}`
          );
        }
      }
    } catch (error) {
      console.error("❌ Erro no processamento de emails programados:", error);
    }
  }

  /**
   * Verifica se já foi enviado email para o artigo na data especificada
   * @param articleId - ID do artigo
   * @param date - Data para verificar
   * @returns true se email já foi enviado, false caso contrário
   */
  private async checkIfEmailSent(
    articleId: string,
    date: Date
  ): Promise<boolean> {
    const log = await prisma.emailLog.findFirst({
      where: {
        articleId,
        type: "FEEDBACK_RELEASE",
        sentAt: {
          gte: date,
          lt: new Date(date.getTime() + 24 * 60 * 60 * 1000),
        },
      },
    });
    return !!log;
  }

  /**
   * Registra o envio de email no banco de dados
   * @param articleId - ID do artigo
   * @param email - Email do destinatário
   * @param date - Data do envio
   */
  private async logEmailSent(
    articleId: string,
    email: string,
    date: Date
  ): Promise<void> {
    await prisma.emailLog.create({
      data: {
        articleId,
        email,
        type: "FEEDBACK_RELEASE",
        sentAt: new Date(),
      },
    });
  }
}
