// src/application/services/ArticleService.ts

import { ArticleRepository } from "../../infrastructure/repositories/ArticleRepository";
import { EventRepository } from "../../infrastructure/repositories/EventRepository";
import { AuthRepository } from "../../infrastructure/repositories/AuthRepository";
import { ArticleKeywordService } from "./ArticleKeywordService";
import { RelatedAuthorService } from "./RelatedAuthorService";
import { ArticleVersionService } from "./ArticleVersionService";
import { EmailService } from "./EmailService";
import { AppError } from "../../shared/errors/AppError";
import {
  CreateArticleDto,
  ArticleResponseDto,
  UpdateArticleResponseDto,
  UpdateArticleDto,
  ArticleCompleteResponseDto,
  ArticleStatsDto,
} from "../dtos/ArticleDto";
import { ArticleComplete } from "../../infrastructure/repositories/ArticleRepository";
import {
  AssignedEvaluatorDto,
  AssignEvaluatorsResponseDto,
} from "../dtos/AssignEvaluatorToArticleDto";
import { EventEvaluatorRepository } from "../../infrastructure/repositories/EventEvaluatorRepository";
import { ArticleEvaluatorAssignmentRepository } from "../../infrastructure/repositories/ArticleEvaluatorAssignmentRepository";
import {
  Article,
  ArticleKeyword,
  ArticleStatus,
  ArticleVersion,
  RelatedAuthor,
} from "@prisma/client";
import e from "express";

export class ArticleService {
  private articleRepository: ArticleRepository;
  private eventRepository: EventRepository;
  private authRepository: AuthRepository;
  private keywordService: ArticleKeywordService;
  private relatedAuthorService: RelatedAuthorService;
  private versionService: ArticleVersionService;
  private eventEvaluatorRepository: EventEvaluatorRepository;
  private assignmentRepository: ArticleEvaluatorAssignmentRepository;
  private emailService: EmailService;

  constructor() {
    this.articleRepository = new ArticleRepository();
    this.eventRepository = new EventRepository();
    this.authRepository = new AuthRepository();
    this.keywordService = new ArticleKeywordService();
    this.relatedAuthorService = new RelatedAuthorService();
    this.versionService = new ArticleVersionService();
    this.eventEvaluatorRepository = new EventEvaluatorRepository();
    this.assignmentRepository = new ArticleEvaluatorAssignmentRepository();
    this.emailService = new EmailService();
  }

  // ========================================
  // CREATE ARTICLE
  // ========================================
  async createArticle(
    articleData: CreateArticleDto
  ): Promise<ArticleResponseDto> {
    // 1 VALIDAR DADOS DE ENTRADA
    this.validateCreateData(articleData);

    // 2 VERIFICAR SE EVENTO EXISTE E ESTÁ ATIVO
    const event = await this.eventRepository.findActiveById(
      articleData.eventId
    );
    if (!event) {
      throw new AppError("Event not found or inactive", 404);
    }

    // 3 VERIFICAR SE USUÁRIO EXISTE E É ATIVO
    const user = await this.authRepository.findActiveById(articleData.userId);
    if (!user) {
      throw new AppError("User not found or inactive", 404);
    }

    try {
      // 5 CRIAR O ARTIGO PRINCIPAL
      const articleCreateData = {
        title: articleData.title.trim(),
        summary: articleData.summary.trim(),
        thematicArea: articleData.thematicArea?.trim(),
        eventId: articleData.eventId,
        userId: articleData.userId,
        currentVersion: 1, // Primeira versão
        status: "SUBMITTED" as const, // Status padrão
      };

      const createdArticle = await this.articleRepository.create(
        articleCreateData
      );

      // 6 CRIAR KEYWORDS (se fornecidas)
      let keywords: any[] = [];
      if (articleData.keywords.length > 0) {
        keywords = await this.keywordService.createMultipleKeywords(
          createdArticle.id,
          articleData.keywords
        );
      }

      // 7 CRIAR AUTORES RELACIONADOS (se fornecidos)
      let relatedAuthors: any[] = [];
      if (articleData.relatedAuthors.length > 0) {
        relatedAuthors =
          await this.relatedAuthorService.createMultipleRelatedAuthors(
            createdArticle.id,
            articleData.relatedAuthors
          );
      }

      // 8 CRIAR PRIMEIRA VERSÃO DO ARTIGO
      const firstVersion = await this.versionService.createArticleVersion({
        articleId: createdArticle.id,
        version: 1,
        pdfPath: articleData.pdfPath,
      });

      // ENVIAR EMAILS DE NOTIFICAÇÃO (best-effort)
      try {
        const [author, coordinators] = await Promise.all([
          this.authRepository.findActiveById(articleData.userId),
          this.authRepository.findCoordinators(),
        ]);

        // Email para autor (confirmação de submissão)
        if (author) {
          await this.emailService.sendArticleSubmittedEmail(
            author.email,
            author.name,
            createdArticle.title,
            event.name
          );
        }

        // Emails para coordenadores (notificação de nova submissão)
        for (const coordinator of coordinators) {
          await this.emailService.sendNewSubmissionToCoordinatorEmail(
            coordinator.email,
            coordinator.name,
            createdArticle.title,
            author?.name || "Autor",
            event.name
          );
        }
      } catch (emailError) {
        // Log error mas não falhar a submissão
        console.error("Falha ao enviar emails de notificação:", emailError);
      }

      // MONTAR RESPOSTA COMPLETA
      const response: ArticleResponseDto = {
        id: createdArticle.id,
        title: createdArticle.title,
        summary: createdArticle.summary,
        thematicArea: createdArticle.thematicArea ?? undefined,
        currentVersion: createdArticle.currentVersion,
        evaluationsDone: createdArticle.evaluationsDone,
        status: createdArticle.status,
        eventId: createdArticle.eventId,
        userId: createdArticle.userId,
        isActive: createdArticle.isActive,
        createdAt: createdArticle.createdAt,
        updatedAt: createdArticle.updatedAt,
        keywords: keywords.map((k) => ({
          id: k.id,
          name: k.name,
        })),
        relatedAuthors: relatedAuthors.map((ra) => ({
          id: ra.id,
          coAuthorName: ra.coAuthorName,
        })),
        versions: [
          {
            id: firstVersion.id,
            version: firstVersion.version,
            pdfPath: firstVersion.pdfPath,
            createdAt: firstVersion.createdAt,
          },
        ],
      };

      return response;
    } catch (error) {
      throw new AppError("Failed to create article", 500);
    }
  }

  async getArticlesByUserId(userId: string): Promise<Article[]> {
    if (!this.isValidUUID(userId)) {
      throw new AppError("Invalid user ID format", 400);
    }

    try {
      const articles = await this.articleRepository.findByUserId(userId);
      return articles;
    } catch (error) {
      throw new AppError("Failed to get articles by user ID", 500);
    }
  }

  // JPF: encontra artigo por id de usuario
  async findByUserId(userId: string): Promise<Article[]> {
    const articles = await this.articleRepository.findByUserId(userId);
    if (!articles) {
      throw new AppError("Articles not found", 404);
    }
    return articles;
  }

  async assignEvaluatorsToArticle(
    articleId: string,
    evaluatorIds: string[]
  ): Promise<AssignEvaluatorsResponseDto> {
    const article = await this.articleRepository.findById(articleId);
    if (!article) {
      throw new AppError("Article not found", 404);
    }

    if (article.status !== "SUBMITTED") {
      throw new AppError(
        "Article must be in SUBMITTED status to assign evaluators",
        400
      );
    }

    if (!Array.isArray(evaluatorIds) || evaluatorIds.length === 0) {
      throw new AppError("Evaluators must be a non-empty array", 400);
    }

    const event = await this.eventRepository.findActiveById(article.eventId);
    if (!event) {
      throw new AppError("Event not found or inactive", 404);
    }

    const maxEvaluators = this.getMaxEvaluatorsByType(event.evaluationType);

    if (maxEvaluators < evaluatorIds.length) {
      throw new AppError(
        `Cannot assign more than ${maxEvaluators} evaluators for ${event.evaluationType} evaluation`,
        400
      );
    }

    const currentAssignments = await this.assignmentRepository.countByArticleId(
      articleId
    );
    const remainingSlots = maxEvaluators - currentAssignments;

    if (remainingSlots <= 0) {
      throw new AppError(
        `Article already has maximum evaluators for ${event.evaluationType} evaluation (${maxEvaluators})`,
        400
      );
    }

    const requestedIds = evaluatorIds.slice(0, remainingSlots);

    if (requestedIds.length < evaluatorIds.length) {
      console.warn(
        `Only ${remainingSlots} slots available, limiting assignment`
      );
    }

    // 7 PROCESSAR CADA AVALIADOR
    const assigned: AssignedEvaluatorDto[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    for (const evaluatorId of requestedIds) {
      if (!this.isValidUUID(evaluatorId)) {
        errors.push(`Invalid evaluator ID format: ${evaluatorId}`);
        continue;
      }

      try {
        // Verificar se o avaliador está no evento
        const eventEvaluator =
          await this.eventEvaluatorRepository.findByEventAndUser(
            article.eventId,
            evaluatorId
          );

        if (!eventEvaluator || !eventEvaluator.isActive) {
          errors.push(`Evaluator ${evaluatorId} not found in this event`);
          continue;
        }

        // Verificar se já está atribuído
        const existingAssignment =
          await this.assignmentRepository.findByArticleAndUser(
            articleId,
            evaluatorId
          );

        if (existingAssignment) {
          skipped.push(evaluatorId);
          continue;
        }

        // Criar atribuição - usando eventEvaluator.userId para garantir consistência
        const newAssignment = await this.assignmentRepository.create({
          eventEvaluatorId: eventEvaluator.id,
          articleId,
          userId: eventEvaluator.userId, // Garante consistência com EventEvaluator
        });

        assigned.push({
          id: newAssignment.id,
          eventEvaluatorId: newAssignment.eventEvaluatorId,
          articleId: newAssignment.articleId,
          userId: newAssignment.userId,
          isCorrected: newAssignment.isCorrected,
          assignedAt: newAssignment.assignedAt,
        });
      } catch (error) {
        errors.push(`Error assigning evaluator ${evaluatorId}`);
      }
    }

    // Always return a response at the end
    const response: AssignEvaluatorsResponseDto = {
      articleId,
      eventId: article.eventId,
      evaluationType: event.evaluationType,
      maxEvaluators,
      assignedEvaluators: assigned,
      summary: {
        totalRequested: evaluatorIds.length,
        totalAssigned: assigned.length,
        totalSkipped: skipped.length,
        totalErrors: errors.length,
      },
      skipped,
      errors,
    };

    // SE PELO MENOS UM AVALIADOR FOI ATRIBUÍDO, MUDAR STATUS PARA IN_EVALUATION
    if (assigned.length > 0) {
      try {
        await this.articleRepository.update(articleId, {
          status: "IN_EVALUATION" as ArticleStatus,
        });
      } catch (error) {
        // Não falhar a operação inteira por causa disso
      }
    }

    return response;
  }

  async updateArticle(
    articleId: string,
    updateData: UpdateArticleDto,
    userId: string
  ): Promise<UpdateArticleResponseDto> {
    if (!this.isValidUUID(articleId)) {
      throw new AppError("Invalid article ID format", 400);
    }

    if (!this.isValidUUID(userId)) {
      throw new AppError("Invalid user ID format", 400);
    }

    const article = await this.articleRepository.findActiveById(articleId);

    if (article?.userId !== userId) {
      throw new AppError(
        "You do not have permission to edit this article",
        403
      );
    }

    if (!this.canEditArticle(article?.status || "")) {
      throw new AppError(
        `Article cannot be edited when status is ${article.status}`,
        400
      );
    }

    this.validateUpdateData(updateData);

    try {
      //Tratar de atualizar os campos principais do artigo
      if (this.hasMainFieldsToUpdate(updateData)) {
        const articleUpdateData = {
          title: updateData.title?.trim(),
          summary: updateData.summary?.trim(),
          thematicArea: updateData.thematicArea?.trim(),
        };

        Object.keys(articleUpdateData).forEach((key) => {
          const typedKey = key as keyof typeof articleUpdateData;
          if (articleUpdateData[typedKey] === undefined) {
            delete articleUpdateData[typedKey];
          }
        });

        await this.articleRepository.update(articleId, articleUpdateData);
      }

      // Atualizar palavras-chave
      if (updateData.keywords !== undefined) {
        if (updateData.keywords.length > 0) {
          await this.keywordService.updateKeywords(
            articleId,
            updateData.keywords
          );
        } else {
          await this.keywordService.deleteAllKeywords(articleId);
        }
      }

      // Atualizar co-autores
      if (updateData.relatedAuthors !== undefined) {
        if (updateData.relatedAuthors.length > 0) {
          await this.relatedAuthorService.updateRelatedAuthor(
            articleId,
            updateData.relatedAuthors
          );
        } else {
          await this.relatedAuthorService.deleteRelatedAllAuthor(articleId);
        }
      }

      return await this.getFullArticleForUpdate(articleId);
    } catch (error) {
      throw new AppError("Failed to update article", 500);
    }
  }

  async removeEvaluatorFromArticle(
    articleId: string,
    userId: string
  ): Promise<Boolean> {
    if (!this.isValidUUID(articleId)) {
      throw new AppError("Invalid article ID format", 400);
    }

    if (!this.isValidUUID(userId)) {
      throw new AppError("Invalid evaluator ID format", 400);
    }

    const assignment = await this.assignmentRepository.findByArticleAndUser(
      articleId,
      userId
    );

    if (!assignment) {
      throw new AppError("Evaluator not assigned to this article", 404);
    }

    const article = await this.articleRepository.findById(articleId);
    if (!article) {
      throw new AppError("Article not found", 404);
    }

    if (article.status !== "SUBMITTED" && article.status !== "IN_EVALUATION") {
      throw new AppError(
        "Article must be in SUBMITTED or IN_EVALUATION status to remove evaluators",
        400
      );
    }

    try {
      await this.assignmentRepository.removeByArticleAndUser(
        articleId,
        assignment.userId
      );

      const evaluatorDeleted =
        await this.assignmentRepository.findByArticleAndUser(articleId, userId);
      if (evaluatorDeleted) {
        throw new AppError("Failed to remove evaluator from article", 500);
      }

      // Verificar se ainda há avaliadores atribuídos
      const remainingAssignments =
        await this.assignmentRepository.countByArticleId(articleId);

      // Se não há mais avaliadores atribuídos, voltar para SUBMITTED
      if (remainingAssignments === 0) {
        await this.articleRepository.update(articleId, {
          status: "SUBMITTED" as ArticleStatus,
        });
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  async getArticlesById(articleId: string): Promise<{
    article: Article;
  }> {
    if (!this.isValidUUID(articleId)) {
      throw new AppError("Invalid article ID format", 400);
    }

    const article = await this.articleRepository.findByIdComplex(articleId);

    if (!article) {
      throw new AppError("Article not found", 404);
    }

    return { article };
  }

  /**
   * Retorna dados completos do artigo com visão 360° (apenas para coordenadores)
   * @param articleId - ID do artigo
   * @param userId - ID do usuário solicitante
   * @param userRole - Papel do usuário
   * @returns Dados completos do artigo
   */
  async getCompleteArticle(
    articleId: string,
    userId: string,
    userRole: string
  ): Promise<ArticleCompleteResponseDto> {
    // Verificar se usuário é coordenador
    if (userRole !== "COORDINATOR") {
      throw new AppError(
        "Apenas coordenadores podem acessar dados completos",
        403
      );
    }

    if (!this.isValidUUID(articleId)) {
      throw new AppError("Invalid article ID format", 400);
    }

    const article = await this.articleRepository.findCompleteById(articleId);

    if (!article) {
      throw new AppError("Artigo não encontrado", 404);
    }

    // Calcular estatísticas
    const stats = this.calculateArticleStats(article);

    return {
      id: article.id,
      title: article.title,
      summary: article.summary,
      thematicArea: article.thematicArea,
      status: article.status,
      currentVersion: article.currentVersion,
      evaluationsDone: article.evaluationsDone,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,

      // Autor
      author: {
        id: article.user.id,
        name: article.user.name,
        email: article.user.email,
      },

      // Evento
      event: {
        id: article.event.id,
        name: article.event.name,
        evaluationType: article.event.evaluationType,
        checklist: article.event.checklist,
      },

      // Metadados
      keywords: article.keywords.map((k) => k.name),
      relatedAuthors: article.relatedAuthors.map((ra) => ra.coAuthorName),

      // Versões completas
      versions: article.versions.map((version) => ({
        id: version.id,
        version: version.version,
        pdfPath: version.pdfPath,
        createdAt: version.createdAt,
        evaluations: version.evaluations.map((evaluation) => ({
          id: evaluation.id,
          grade: evaluation.grade,
          evaluationDescription: evaluation.evaluationDescription,
          status: evaluation.status,
          evaluationDate: evaluation.evaluationDate,
          evaluator: {
            id: evaluation.user.id,
            name: evaluation.user.name,
            email: evaluation.user.email,
          },
        })),
        questionResponses: version.questionResponses.map((response) => ({
          id: response.id,
          questionId: response.questionId,
          questionDescription: response.question.description,
          questionType: response.question.type,
          booleanResponse: response.booleanResponse,
          scaleResponse: response.scaleResponse,
          textResponse: response.textResponse,
          evaluator: {
            id: response.user.id,
            name: response.user.name,
            email: response.user.email,
          },
        })),
      })),

      // Avaliadores atribuídos
      evaluators: article.evaluatorAssignments.map((assignment) => ({
        id: assignment.user.id,
        name: assignment.user.name,
        email: assignment.user.email,
        isCorrected: assignment.isCorrected,
        assignedAt: assignment.assignedAt,
      })),

      // Estatísticas
      stats,
    };
  }

  /**
   * Calcula estatísticas do artigo
   * @param article - Artigo completo com todos os relacionamentos
   * @returns Estatísticas calculadas
   */
  private calculateArticleStats(article: ArticleComplete): ArticleStatsDto {
    const allEvaluations = article.versions.flatMap((v) => v.evaluations);

    return {
      totalVersions: article.versions.length,
      totalEvaluations: allEvaluations.length,
      averageGrade:
        allEvaluations.length > 0
          ? allEvaluations.reduce((sum, e) => sum + e.grade, 0) /
            allEvaluations.length
          : 0,
      evaluationsByStatus: {
        approved: allEvaluations.filter((e) => e.status === "APPROVED").length,
        toCorrection: allEvaluations.filter((e) => e.status === "TO_CORRECTION")
          .length,
        rejected: allEvaluations.filter((e) => e.status === "REJECTED").length,
      },
      assignedEvaluators: article.evaluatorAssignments.length,
      completedEvaluators: article.evaluatorAssignments.filter(
        (a) => a.isCorrected
      ).length,
    };
  }

  async getArticlesByEventIdAndUserId(
    eventId: string,
    userId: string
  ): Promise<{
    articles: Article[];
  }> {
    if (!this.isValidUUID(eventId)) {
      throw new AppError("Invalid event ID format", 400);
    }
    if (!this.isValidUUID(userId)) {
      throw new AppError("Invalid user ID format", 400);
    }

    const articles = await this.articleRepository.findByEventIdAndUserId(
      eventId,
      userId
    );

    if (!articles) {
      throw new AppError("Articles not found", 404);
    }

    return { articles };
  }

  async getArticlesByEventId(eventId: string): Promise<{
    articles: Article[];
  }> {
    if (!this.isValidUUID(eventId)) {
      throw new AppError("Invalid event ID format", 400);
    }

    const articles = await this.articleRepository.findByEventId(eventId);

    if (!articles) {
      throw new AppError("Articles not found", 404);
    }

    return { articles };
  }

  async getArticlesByEventIdAndStatus(
    eventId: string,
    status: ArticleStatus
  ): Promise<{
    articles: Article[];
  }> {
    if (!this.isValidUUID(eventId)) {
      throw new AppError("Invalid event ID format", 400);
    }

    const articles = await this.articleRepository.findByEventIdAndStatus(
      eventId,
      status
    );

    if (!articles) {
      throw new AppError("Articles not found", 404);
    }

    return { articles };
  }

  async getArticlesPending(eventId: string): Promise<{
    articles: Article[];
  }> {
    if (!this.isValidUUID(eventId)) {
      throw new AppError("Invalid event ID format", 400);
    }

    const articles = await this.articleRepository.findArticlesPending(eventId);

    if (!articles) {
      throw new AppError("Articles not found", 404);
    }

    return { articles };
  }

  async getArticlesStatsByEventId(eventId: string): Promise<{
    totalSubmissions: number;
    underReview: number;
    approved: number;
    evaluators: number;
  }> {
    if (!this.isValidUUID(eventId)) {
      throw new AppError("Invalid event ID format", 400);
    }

    try {
      const stats = await this.articleRepository.getStatsByEventId(eventId);
      return stats;
    } catch (error) {
      throw new AppError("Failed to get articles statistics", 500);
    }
  }

  async getArticlesForEvaluator(
    evaluatorId: string,
    filters: {
      search?: string;
      status?: string;
      eventId?: string;
      page: number;
      limit: number;
    }
  ): Promise<{
    articles: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    if (!this.isValidUUID(evaluatorId)) {
      throw new AppError("Invalid evaluator ID format", 400);
    }

    try {
      // Buscar artigos atribuídos ao avaliador
      const result = await this.articleRepository.findArticlesForEvaluator(
        evaluatorId,
        filters
      );

      const totalPages = Math.ceil(result.total / filters.limit);

      return {
        articles: result.articles,
        total: result.total,
        page: filters.page,
        limit: filters.limit,
        totalPages,
      };
    } catch (error) {
      throw new AppError("Failed to get articles for evaluator", 500);
    }
  }

  /**
   * Reatribuir avaliador de um artigo
   * @param articleId - ID do artigo
   * @param currentEvaluatorId - ID do avaliador atual
   * @param newEvaluatorId - ID do novo avaliador
   * @param coordinatorId - ID do coordenador realizando a operação
   * @returns Resultado da reatribuição
   */
  async reassignEvaluator(
    articleId: string,
    currentEvaluatorId: string,
    newEvaluatorId: string,
    coordinatorId: string
  ): Promise<{
    success: boolean;
    removedAssignmentId?: string;
    newAssignment: {
      id: string;
      articleId: string;
      userId: string;
      isCorrected: boolean;
      assignedAt: Date;
    };
  }> {
    // Verificar se coordenador existe
    const coordinator = await this.authRepository.findActiveById(coordinatorId);
    if (!coordinator || coordinator.role !== "COORDINATOR") {
      throw new AppError("Apenas coordenadores podem alterar avaliadores", 403);
    }

    // Verificar se artigo existe
    const article = await this.articleRepository.findById(articleId);
    if (!article) {
      throw new AppError("Artigo não encontrado", 404);
    }

    // Verificar se artigo está em status que permite alteração
    if (article.status !== "SUBMITTED" && article.status !== "IN_EVALUATION") {
      throw new AppError(
        "Apenas artigos submetidos ou em avaliação podem ter avaliadores alterados",
        400
      );
    }

    // Buscar assignment atual
    const currentAssignment =
      await this.assignmentRepository.findByArticleAndUser(
        articleId,
        currentEvaluatorId
      );

    if (!currentAssignment) {
      throw new AppError(
        "Avaliador atual não está atribuído a este artigo",
        404
      );
    }

    // Verificar se já existe avaliação (não pode alterar se já avaliou)
    const hasEvaluation = await this.assignmentRepository.hasEvaluation(
      currentAssignment.id
    );

    if (hasEvaluation) {
      throw new AppError(
        "Não é possível alterar avaliador que já realizou a avaliação",
        400
      );
    }

    // Verificar se novo avaliador está no evento
    const eventEvaluator = await this.eventEvaluatorRepository.findByEventAndUser(
      article.eventId,
      newEvaluatorId
    );

    if (!eventEvaluator || !eventEvaluator.isActive) {
      throw new AppError(
        "Novo avaliador não está cadastrado neste evento",
        400
      );
    }

    // Verificar se novo avaliador já está atribuído a este artigo
    const existingNewAssignment =
      await this.assignmentRepository.findByArticleAndUser(
        articleId,
        newEvaluatorId
      );

    if (existingNewAssignment) {
      throw new AppError(
        "Novo avaliador já está atribuído a este artigo",
        400
      );
    }

    // Verificar limite de avaliadores para o tipo de avaliação
    const event = await this.eventRepository.findActiveById(article.eventId);
    if (!event) {
      throw new AppError("Evento não encontrado", 404);
    }

    // Executar troca em transação
    try {
      // Remover assignment antigo
      await this.assignmentRepository.remove(currentAssignment.id);

      // Criar novo assignment
      const newAssignment = await this.assignmentRepository.create({
        eventEvaluatorId: eventEvaluator.id,
        articleId,
        userId: newEvaluatorId,
      });

      // Enviar email para novo avaliador (opcional, async)
      try {
        const newEvaluator = await this.authRepository.findActiveById(
          newEvaluatorId
        );
        if (newEvaluator) {
          await this.emailService.sendEvaluatorAddedEmail(
            newEvaluator.email,
            newEvaluator.name,
            event.name,
            event.description || undefined
          );
        }
      } catch (emailError) {
        console.error("Erro ao enviar email para novo avaliador:", emailError);
      }

      return {
        success: true,
        removedAssignmentId: currentAssignment.id,
        newAssignment: {
          id: newAssignment.id,
          articleId: newAssignment.articleId,
          userId: newAssignment.userId,
          isCorrected: newAssignment.isCorrected,
          assignedAt: newAssignment.assignedAt,
        },
      };
    } catch (error) {
      throw new AppError("Erro ao alterar avaliador", 500);
    }
  }

  // ========================================
  // MÉTODOS PRIVADOS
  // ========================================
  private validateCreateData(articleData: CreateArticleDto): void {
    if (!articleData.title || articleData.title.trim().length < 3) {
      throw new AppError("Title must have at least 3 characters", 400);
    }

    if (articleData.title.length > 150) {
      throw new AppError("Title cannot exceed 150 characters", 400);
    }

    if (!articleData.summary || articleData.summary.trim().length < 15) {
      throw new AppError("Summary must have at least 15 characters", 400);
    }

    if (articleData.summary.length > 1000) {
      throw new AppError("Summary cannot exceed 300 characters", 400);
    }

    if (articleData.thematicArea && articleData.thematicArea.length > 150) {
      throw new AppError("Thematic area cannot exceed 150 characters", 400);
    }

    if (!articleData.pdfPath || articleData.pdfPath.trim().length === 0) {
      throw new AppError("PDF path is required", 400);
    }

    if (!this.isValidUUID(articleData.eventId)) {
      throw new AppError("Invalid event ID format", 400);
    }

    if (!this.isValidUUID(articleData.userId)) {
      throw new AppError("Invalid user ID format", 400);
    }

    // Validar keywords
    if (articleData.keywords.length > 50) {
      throw new AppError("Maximum 50 keywords allowed", 400);
    }

    for (const keyword of articleData.keywords) {
      if (!keyword || keyword.trim().length === 0) {
        throw new AppError("Keywords cannot be empty", 400);
      }
      if (keyword.length > 45) {
        throw new AppError("Keywords cannot exceed 45 characters", 400);
      }
    }

    // Validar related authors
    if (articleData.relatedAuthors.length > 20) {
      throw new AppError("Maximum 20 related authors allowed", 400);
    }

    for (const author of articleData.relatedAuthors) {
      if (!author || author.trim().length === 0) {
        throw new AppError("Related author names cannot be empty", 400);
      }
      if (author.length > 100) {
        throw new AppError(
          "Related author names cannot exceed 100 characters",
          400
        );
      }
    }
  }

  private canEditArticle(status: string): boolean {
    // Artigo só pode ser editado se estiver SUBMITTED ou TO_CORRECTION
    return status === "SUBMITTED" || status === "TO_CORRECTION";
  }

  private getMaxEvaluatorsByType(evaluationType: string): number {
    switch (evaluationType) {
      case "DIRECT":
        return 1;
      case "PAIR":
        return 2;
      case "PANEL":
        return 5; // Você pode ajustar este número
      default:
        return 1;
    }
  }

  private validateUpdateData(updateData: UpdateArticleDto): void {
    // Validar título se fornecido
    if (updateData.title !== undefined) {
      if (!updateData.title || updateData.title.trim().length < 3) {
        throw new AppError("Title must have at least 3 characters", 400);
      }
      if (updateData.title.length > 150) {
        throw new AppError("Title cannot exceed 150 characters", 400);
      }
    }

    // Validar resumo se fornecido
    if (updateData.summary !== undefined) {
      if (!updateData.summary || updateData.summary.trim().length < 15) {
        throw new AppError("Summary must have at least 15 characters", 400);
      }
      if (updateData.summary.length > 1000) {
        throw new AppError("Summary cannot exceed 1000 characters", 400);
      }
    }

    // Validar área temática se fornecida
    if (
      updateData.thematicArea !== undefined &&
      updateData.thematicArea.length > 150
    ) {
      throw new AppError("Thematic area cannot exceed 150 characters", 400);
    }

    // Validar keywords se fornecidas
    if (updateData.keywords !== undefined) {
      if (updateData.keywords.length > 50) {
        throw new AppError("Maximum 50 keywords allowed", 400);
      }
      for (const keyword of updateData.keywords) {
        if (!keyword || keyword.trim().length === 0) {
          throw new AppError("Keywords cannot be empty", 400);
        }
        if (keyword.length > 45) {
          throw new AppError("Keywords cannot exceed 45 characters", 400);
        }
      }
    }

    // Validar related authors se fornecidos
    if (updateData.relatedAuthors !== undefined) {
      if (updateData.relatedAuthors.length > 20) {
        throw new AppError("Maximum 20 related authors allowed", 400);
      }
      for (const author of updateData.relatedAuthors) {
        if (!author || author.trim().length === 0) {
          throw new AppError("Related author names cannot be empty", 400);
        }
        if (author.length > 100) {
          throw new AppError(
            "Related author names cannot exceed 100 characters",
            400
          );
        }
      }
    }
  }

  private hasMainFieldsToUpdate(updateData: UpdateArticleDto): boolean {
    return !!(
      updateData.title ||
      updateData.summary ||
      updateData.thematicArea
    );
  }

  private async getFullArticleForUpdate(
    articleId: string
  ): Promise<UpdateArticleResponseDto> {
    const article = await this.articleRepository.findById(articleId);
    if (!article) {
      throw new AppError("Article not found", 404);
    }
    const keywords = await this.keywordService.getKeywordsByArticleId(
      articleId
    );
    const relatedAuthors =
      await this.relatedAuthorService.getRelatedAuthorsByArticleId(articleId);
    const lastVersion = await this.versionService.getLastVersionByArticleId(
      articleId
    );

    return {
      id: article.id,
      title: article.title,
      summary: article.summary,
      thematicArea: article.thematicArea ?? undefined,
      currentVersion: article.currentVersion,
      evaluationsDone: article.evaluationsDone,
      status: article.status,
      eventId: article.eventId,
      userId: article.userId,
      isActive: article.isActive,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
      keywords: keywords.map((k: ArticleKeyword) => ({
        id: k.id,
        name: k.name,
      })),
      relatedAuthors: relatedAuthors.map((ra: RelatedAuthor) => ({
        id: ra.id,
        coAuthorName: ra.coAuthorName,
      })),
      lastVersion: {
        id: lastVersion.id,
        version: lastVersion.version,
        pdfPath: lastVersion.pdfPath,
        createdAt: lastVersion.createdAt,
      },
    };
  }

  private isValidUUID(uuid: string): boolean {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }
}
