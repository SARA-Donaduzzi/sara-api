// src/infrastructure/services/EmailService.ts
import nodemailer from "nodemailer";
import { AppError } from "../../shared/errors/AppError";

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export class EmailService {
  private transporter!: nodemailer.Transporter;

  constructor() {
    this.createTransporter();
  }

  private createTransporter(): void {
    // Verificar se as variáveis de ambiente estão configuradas
    const requiredEnvVars = ["EMAIL_USER", "EMAIL_PASS", "EMAIL_FROM_ADDRESS"];

    return;
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new AppError(`Environment variable ${envVar} is required`, 500);
      }
    }

    this.transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || "gmail",
      host: process.env.EMAIL_HOST || "smtp.gmail.com",
      port: parseInt(process.env.EMAIL_PORT || "587"),
      secure: process.env.EMAIL_SECURE === "true", // true para 465, false para outros
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, // Senha de app do Gmail
      },
    });
  }

  // ========================================
  // MÉTODO PRINCIPAL PARA ENVIAR EMAIL
  // ========================================
  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      const mailOptions = {
        from: {
          name: process.env.EMAIL_FROM_NAME || "SARA - Donaduzzi",
          address: process.env.EMAIL_FROM_ADDRESS!,
        },
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      };

      const result = await this.transporter.sendMail(mailOptions);
    } catch (error) {
      throw new AppError("Failed to send email", 500);
    }
  }

  // ========================================
  // TEMPLATES DE EMAIL
  // ========================================

  // Template para avaliador adicionado ao evento
  generateEvaluatorAddedTemplate(
    evaluatorName: string,
    eventName: string,
    eventDescription?: string
  ): EmailTemplate {
    const subject = `🎓 Você foi designado como avaliador - ${eventName}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Designação como Avaliador</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #007bff; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          .btn { background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎓 SARA - Donaduzzi</h1>
          </div>
          <div class="content">
            <h2>Olá, ${evaluatorName}!</h2>
            <p>Você foi designado como <strong>avaliador</strong> para o evento:</p>
            <h3>📚 ${eventName}</h3>
            ${eventDescription ? `<p><em>${eventDescription}</em></p>` : ""}
            <p>Em breve você receberá artigos para avaliação. Acesse a plataforma para acompanhar suas atribuições.</p>
            <p style="text-align: center;">
              <a href="${
                process.env.FRONTEND_URL
              }/dashboard" class="btn">Acessar Plataforma</a>
            </p>
            <p><strong>Suas responsabilidades:</strong></p>
            <ul>
              <li>Avaliar artigos designados dentro do prazo</li>
              <li>Fornecer feedback construtivo aos autores</li>
              <li>Manter sigilo sobre a identidade dos autores</li>
            </ul>
          </div>
          <div class="footer">
            <p>Este é um email automático. Não responda.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Olá, ${evaluatorName}!

      Você foi designado como avaliador para o evento: ${eventName}
      ${eventDescription ? `Descrição: ${eventDescription}` : ""}

      Acesse a plataforma em: ${process.env.FRONTEND_URL}/dashboard

      Suas responsabilidades:
      - Avaliar artigos designados dentro do prazo
      - Fornecer feedback construtivo aos autores
      - Manter sigilo sobre a identidade dos autores

      SARA - Donaduzzi
    `;

    return { subject, html, text };
  }

  // Template para artigo submetido (confirmação para aluno)
  generateArticleSubmittedTemplate(
    authorName: string,
    articleTitle: string,
    eventName: string
  ): EmailTemplate {
    const subject = `✅ Artigo submetido com sucesso - ${eventName}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Artigo Submetido</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #28a745; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          .btn { background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
          .success-box { background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Submissão Confirmada</h1>
          </div>
          <div class="content">
            <h2>Parabéns, ${authorName}!</h2>
            <div class="success-box">
              <p><strong>Seu artigo foi submetido com sucesso!</strong></p>
            </div>
            <p><strong>Detalhes da submissão:</strong></p>
            <ul>
              <li><strong>Artigo:</strong> ${articleTitle}</li>
              <li><strong>Evento:</strong> ${eventName}</li>
              <li><strong>Status:</strong> Em Avaliação</li>
            </ul>
            <p>Seu artigo passará pelo processo de avaliação. Você será notificado quando houver atualizações.</p>
            <p style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/dashboard" class="btn">Acompanhar Status</a>
            </p>
            <p><strong>Próximos passos:</strong></p>
            <ul>
              <li>Aguarde a avaliação pelos revisores</li>
              <li>Acompanhe o status na plataforma</li>
              <li>Fique atento a notificações de correções</li>
            </ul>
          </div>
          <div class="footer">
            <p>Este é um email automático. Não responda.</p>
          </div>
        </div>
      </div>
      </body>
      </html>
    `;

    const text = `
      Parabéns, ${authorName}!

      Seu artigo foi submetido com sucesso!

      Detalhes:
      - Artigo: ${articleTitle}
      - Evento: ${eventName}
      - Status: Em Avaliação

      Acompanhe o status em: ${process.env.FRONTEND_URL}/dashboard

      Próximos passos:
      - Aguarde a avaliação pelos revisores
      - Acompanhe o status na plataforma
      - Fique atento a notificações de correções

      SARA - Donaduzzi
    `;

    return { subject, html, text };
  }

  // Template para artigo corrigido (SEM REVELAR O RESULTADO)
  generateArticleReviewedTemplate(
    authorName: string,
    articleTitle: string,
    eventName: string
  ): EmailTemplate {
    const subject = `📝 Seu artigo foi corrigido - ${articleTitle}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Artigo Corrigido</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #007bff; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          .btn { background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
          .info-box { background: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📝 Artigo Corrigido</h1>
          </div>
          <div class="content">
            <h2>Olá, ${authorName}!</h2>
            <div class="info-box">
              <p><strong>Seu artigo foi corrigido e a avaliação está disponível!</strong></p>
            </div>
            <p><strong>Detalhes:</strong></p>
            <ul>
              <li><strong>Artigo:</strong> ${articleTitle}</li>
              <li><strong>Evento:</strong> ${eventName}</li>
              <li><strong>Status:</strong> Avaliação concluída</li>
            </ul>
            <p>A avaliação do seu artigo foi finalizada. Para conhecer o resultado e visualizar os comentários dos avaliadores, acesse a plataforma.</p>
            <p style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/dashboard" class="btn">Ver Resultado da Avaliação</a>
            </p>
            <p><strong>Próximos passos:</strong></p>
            <ul>
              <li>Acesse sua conta na plataforma</li>
              <li>Visualize o resultado da avaliação</li>
              <li>Leia os comentários dos avaliadores</li>
              <li>Siga as orientações conforme o resultado</li>
            </ul>
          </div>
          <div class="footer">
            <p>Este é um email automático. Não responda.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Olá, ${authorName}!

      Seu artigo foi corrigido e a avaliação está disponível!

      Detalhes:
      - Artigo: ${articleTitle}
      - Evento: ${eventName}
      - Status: Avaliação concluída

      Acesse a plataforma para ver o resultado: ${process.env.FRONTEND_URL}/dashboard

      Próximos passos:
      - Acesse sua conta na plataforma
      - Visualize o resultado da avaliação
      - Leia os comentários dos avaliadores
      - Siga as orientações conforme o resultado

      SARA - Donaduzzi
    `;

    return { subject, html, text };
  }

  // ========================================
  // MÉTODOS DE CONVENIÊNCIA
  // ========================================

  async sendEvaluatorAddedEmail(
    evaluatorEmail: string,
    evaluatorName: string,
    eventName: string,
    eventDescription?: string
  ): Promise<void> {
    const template = this.generateEvaluatorAddedTemplate(
      evaluatorName,
      eventName,
      eventDescription
    );

    await this.sendEmail({
      to: evaluatorEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  // Template para avaliador atribuído a um artigo específico
  generateEvaluatorAssignedToArticleTemplate(
    evaluatorName: string,
    eventName: string,
    eventDescription: string | undefined,
    articleTitle: string,
    evaluationDeadline?: Date
  ): EmailTemplate {
    const subject = `📄 Novo artigo para avaliação - ${eventName}`;

    // Formatar data de prazo se existir
    const deadlineText = evaluationDeadline
      ? evaluationDeadline.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : null;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Novo Artigo para Avaliação</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #541822; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          .btn { background: #541822; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
          .article-box { background: #fff; border-left: 4px solid #541822; padding: 15px; margin: 15px 0; border-radius: 0 5px 5px 0; }
          .deadline-box { background: #fff3cd; border: 1px solid #ffc107; padding: 12px; margin: 15px 0; border-radius: 5px; }
          .blind-notice { background: #e7f3ff; border-left: 4px solid #007bff; padding: 12px; margin: 15px 0; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎓 SARA - Donaduzzi</h1>
            <p>Novo artigo para avaliação</p>
          </div>
          <div class="content">
            <h2>Olá, ${evaluatorName}!</h2>
            <p>Você foi designado como <strong>avaliador</strong> de um artigo no evento:</p>
            <h3>📚 ${eventName}</h3>
            ${eventDescription ? `<p><em>${eventDescription}</em></p>` : ""}
            
            <div class="article-box">
              <p><strong>📄 Título do Artigo:</strong></p>
              <p style="font-size: 16px; margin: 10px 0;">"${articleTitle}"</p>
            </div>

            <div class="blind-notice">
              <strong>🔒 Avaliação Cega (Blind Review)</strong>
              <p style="margin: 5px 0 0 0;">A identidade do autor não é revelada aos avaliadores para garantir imparcialidade.</p>
            </div>

            ${
              deadlineText
                ? `
            <div class="deadline-box">
              <strong>⏰ Prazo para Avaliação:</strong> ${deadlineText}
            </div>
            `
                : ""
            }

            <p>Por favor, acesse a plataforma para realizar a avaliação conforme as diretrizes do evento.</p>
            
            <p style="text-align: center;">
              <a href="${
                process.env.FRONTEND_URL
              }/dashboard" class="btn">Acessar Plataforma</a>
            </p>

            <p><strong>📋 Orientações para Avaliação:</strong></p>
            <ul>
              <li>Avalie o artigo de forma imparcial e construtiva</li>
              <li>Verifique a adequação ao escopo do evento</li>
              <li>Avalie a qualidade metodológica e a clareza</li>
              <li>Forneça comentários detalhados ao autor</li>
              <li>Mantenha sigilo sobre a identidade do autor</li>
            </ul>
          </div>
          <div class="footer">
            <p>Este é um email automático. Não responda.</p>
            <p>SARA - Sistema de Avaliação e Revisão de Artigos</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
Olá, ${evaluatorName}!

Você foi designado como avaliador de um artigo no evento: ${eventName}
${eventDescription ? `Descrição: ${eventDescription}` : ""}

📄 TÍTULO DO ARTIGO:
"${articleTitle}"

🔒 AVALIAÇÃO CEGA (Blind Review)
A identidade do autor não é revelada aos avaliadores para garantir imparcialidade.

${deadlineText ? `⏰ PRAZO PARA AVALIAÇÃO: ${deadlineText}` : ""}

Acesse a plataforma para realizar a avaliação:
${process.env.FRONTEND_URL}/dashboard

ORIENTAÇÕES PARA AVALIAÇÃO:
- Avalie o artigo de forma imparcial e construtiva
- Verifique a adequação ao escopo do evento
- Avalie a qualidade metodológica e a clareza
- Forneça comentários detalhados ao autor
- Mantenha sigilo sobre a identidade do autor

SARA - Sistema de Avaliação e Revisão de Artigos
    `;

    return { subject, html, text };
  }

  async sendEvaluatorAssignedToArticleEmail(
    evaluatorEmail: string,
    evaluatorName: string,
    eventName: string,
    eventDescription: string | undefined,
    articleTitle: string,
    evaluationDeadline?: Date
  ): Promise<void> {
    const template = this.generateEvaluatorAssignedToArticleTemplate(
      evaluatorName,
      eventName,
      eventDescription,
      articleTitle,
      evaluationDeadline
    );

    await this.sendEmail({
      to: evaluatorEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  async sendArticleSubmittedEmail(
    authorEmail: string,
    authorName: string,
    articleTitle: string,
    eventName: string
  ): Promise<void> {
    const template = this.generateArticleSubmittedTemplate(
      authorName,
      articleTitle,
      eventName
    );

    await this.sendEmail({
      to: authorEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  async sendArticleReviewedEmail(
    authorEmail: string,
    authorName: string,
    articleTitle: string,
    eventName: string
  ): Promise<void> {
    const template = this.generateArticleReviewedTemplate(
      authorName,
      articleTitle,
      eventName
    );

    await this.sendEmail({
      to: authorEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  // Template para notificação de nova submissão aos coordenadores
  generateNewSubmissionToCoordinatorTemplate(
    coordinatorName: string,
    articleTitle: string,
    authorName: string,
    eventName: string
  ): EmailTemplate {
    const subject = `📄 Nova submissão - ${eventName}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Nova Submissão</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #541822; color: white; padding: 20px; text-align: center; }
          .content { background: #f9f9f9; padding: 20px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          .btn { background: #541822; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📄 Nova Submissão Recebida</h1>
          </div>
          <div class="content">
            <h2>Olá, ${coordinatorName}!</h2>
            <p>Um novo artigo foi submetido para o evento <strong>${eventName}</strong>.</p>
            <p><strong>Detalhes:</strong></p>
            <ul>
              <li><strong>Título:</strong> ${articleTitle}</li>
              <li><strong>Autor:</strong> ${authorName}</li>
              <li><strong>Evento:</strong> ${eventName}</li>
            </ul>
            <p style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}/dashboard" class="btn">Acessar Plataforma</a>
            </p>
          </div>
          <div class="footer">
            <p>Este é um email automático. Não responda.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
      Olá, ${coordinatorName}!

      Um novo artigo foi submetido para o evento ${eventName}.

      Detalhes:
      - Título: ${articleTitle}
      - Autor: ${authorName}
      - Evento: ${eventName}

      Acesse: ${process.env.FRONTEND_URL}/dashboard

      SARA - Donaduzzi
    `;

    return { subject, html, text };
  }

  async sendNewSubmissionToCoordinatorEmail(
    coordinatorEmail: string,
    coordinatorName: string,
    articleTitle: string,
    authorName: string,
    eventName: string
  ): Promise<void> {
    const template = this.generateNewSubmissionToCoordinatorTemplate(
      coordinatorName,
      articleTitle,
      authorName,
      eventName
    );

    await this.sendEmail({
      to: coordinatorEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  // ========================================
  // TESTE DE CONFIGURAÇÃO
  // ========================================
  async testConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      return false;
    }
  }

  // ========================================
  // MÉTODOS PARA EMAIL EM MASSA
  // ========================================

  /**
   * Template para email customizado (usado em envio em massa)
   * @param recipientName - Nome do destinatário
   * @param eventName - Nome do evento
   * @param customBody - Corpo customizado do email (HTML)
   * @param customSubject - Assunto customizado (opcional)
   * @returns EmailTemplate com subject, html e text
   */
  generateCustomEmailTemplate(
    recipientName: string,
    eventName: string,
    customBody: string,
    customSubject?: string
  ): EmailTemplate {
    const subject = customSubject || `📧 Comunicado - ${eventName}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${eventName}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #541822; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          .custom-content { margin: 20px 0; }
          .custom-content p { margin: 10px 0; }
          .btn { background: #541822; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${eventName}</h1>
          </div>
          <div class="content">
            <h2>Olá, ${recipientName}!</h2>
            <div class="custom-content">
              ${customBody}
            </div>
            <p style="text-align: center; margin-top: 30px;">
              <a href="${process.env.FRONTEND_URL || "#"}" class="btn">Acessar Plataforma</a>
            </p>
          </div>
          <div class="footer">
            <p>Este é um email automático enviado pelo sistema SARA.</p>
            <p>SARA - Sistema de Avaliação e Revisão de Artigos</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Converter HTML para texto simples
    const text = `
Olá, ${recipientName}!

${customBody.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}

Acesse: ${process.env.FRONTEND_URL || "#"}

SARA - Sistema de Avaliação e Revisão de Artigos
    `;

    return { subject, html, text };
  }
}
