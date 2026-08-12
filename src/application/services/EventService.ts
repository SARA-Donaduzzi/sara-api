import { EventRepository } from "../../infrastructure/repositories/EventRepository";
import { AuthRepository } from "../../infrastructure/repositories/AuthRepository";
import { AppError } from "../../shared/errors/AppError";
import {
  CreateEventDto,
  UpdateEventDto,
  EventResponseDto,
  ListEventsDto,
  PaginatedEventsDto,
  OptionalArgs,
  SendBulkEmailDto,
  SendBulkEmailResponseDto,
} from "../dtos/EventDto";
import { Article, Event, ArticleStatus } from "@prisma/client";
import { ChecklistRepository } from "../../infrastructure/repositories/ChecklistRepository";
import { EmailService } from "./EmailService";
import { prisma } from "../../lib/prisma";

export class EventService {
  private eventRepository: EventRepository;
  private checklistRepository: ChecklistRepository;
  private authRepository: AuthRepository;
  private emailService: EmailService;

  constructor() {
    this.eventRepository = new EventRepository();
    this.checklistRepository = new ChecklistRepository();
    this.authRepository = new AuthRepository();
    this.emailService = new EmailService();
  }

  // ========================================
  // CREATE
  // ========================================
  async createEvent(eventData: CreateEventDto): Promise<EventResponseDto> {
    // Validar dados de entrada
    this.validateCreateData(eventData);

    // Validar datas
    this.validateDates(eventData);

    const event = await this.eventRepository.create(eventData);
    return this.toEventResponse(event);
  }

  // ========================================
  // READ
  // ========================================

  // Buscar evento por ID
  async getEventById(
    id: string,
    includeStats = false
  ): Promise<EventResponseDto> {
    if (!this.isValidUUID(id)) {
      throw new AppError("Invalid event ID format", 400);
    }

    const event = includeStats
      ? await this.eventRepository.findByIdWithStats(id)
      : await this.eventRepository.findById(id);

    if (!event) {
      throw new AppError("Event not found", 404);
    }

    return this.toEventResponse(event);
  }

  async getArticlesByEventId(
    eventId: string,
    optionalArgs: OptionalArgs
  ): Promise<{
    articles: Article[];
    pagination: object;
  }> {
    const { search, status, page, limit } = optionalArgs;
    if (!this.isValidUUID(eventId)) {
      throw new AppError("Invalid event ID format", 400);
    }

    if (page) {
      if (!limit) throw new AppError("Limit must be defined", 400);
      if (isNaN(Number(page))) throw new AppError("Invalid type of page", 400);
      if (Number(page) <= 0)
        throw new AppError("Page must be highter than 0", 400);
    }
    if (limit) {
      if (isNaN(Number(limit)))
        throw new AppError("Invalid type of limit", 400);
      if (Number(limit) <= 0)
        throw new AppError("Limit must be highter than 0", 400);
    }

    const data = await this.eventRepository.findArticlesByEventId(
      eventId,
      optionalArgs
    );

    if (!data) {
      throw new AppError("Articles not found", 404);
    }
    if (data.articles.length == 0) {
      throw new AppError("Articles not found", 404);
    }

    let total: number = data.total;
    let totalPages: number = Math.ceil(total / (limit ?? 1));

    return {
      articles: data.articles,
      pagination: {
        total: total,
        page,
        limit,
        totalPages,
      },
    };
  }

  // async getStatsByEventId(id: string): Promise<Object> {
  //   if (!this.isValidUUID(id)) {
  //     throw new AppError("Invalid event ID format", 400);
  //   }

  //   const stats = await this.eventRepository.findStatsById(id);
  //   if (!stats) {
  //     throw new AppError("Event not found", 404);
  //   }
  //   return stats;
  // }

  async getActiveEventById(
    id: string,
    includeStats = false
  ): Promise<EventResponseDto> {
    if (!this.isValidUUID(id)) {
      throw new AppError("Invalid event ID format", 400);
    }

    const event = await this.eventRepository.findActiveById(id);

    if (!event) {
      throw new AppError("Event not found", 404);
    }

    return this.toEventResponse(event);
  }

  // Listar eventos com filtros e paginação
  async getEvents(filters: ListEventsDto): Promise<PaginatedEventsDto> {
    // Validar parâmetros de paginação
    if (filters.page && filters.page < 1) {
      throw new AppError("Page must be greater than 0", 400);
    }

    if (filters.limit && (filters.limit < 1 || filters.limit > 100)) {
      throw new AppError("Limit must be between 1 and 100", 400);
    }

    const { events, total } = await this.eventRepository.findMany(filters);

    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const totalPages = Math.ceil(total / limit);

    return {
      events: events.map((event) => this.toEventResponse(event)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  // Buscar apenas eventos ativos
  async getActiveEvents(): Promise<EventResponseDto[]> {
    const events = await this.eventRepository.findActiveEvents();
    return events.map((event) => this.toEventResponse(event));
  }

  // Obter estatísticas de eventos
  async getEventsStats(): Promise<{ [key: string]: number }> {
    return await this.eventRepository.countByStatus();
  }

  // ========================================
  // UPDATE
  // ========================================
  async updateEvent(
    id: string,
    eventData: UpdateEventDto
  ): Promise<EventResponseDto> {
    if (!this.isValidUUID(id)) {
      throw new AppError("Invalid event ID format", 400);
    }

    // Verificar se evento existe
    const existingEvent = await this.eventRepository.findById(id);
    if (!existingEvent) {
      throw new AppError("Event not found", 404);
    }

    // Validar dados se fornecidos
    if (Object.keys(eventData).length === 0) {
      throw new AppError("No data provided for update", 400);
    }

    // Validar datas se fornecidas
    if (this.hasDateFields(eventData)) {
      this.validateUpdateDates(eventData, existingEvent);
    }

    const updatedEvent = await this.eventRepository.update(id, eventData);
    return this.toEventResponse(updatedEvent);
  }

  // JPF: Editar evento
  async editEvent(
    id: string,
    eventData: UpdateEventDto
  ): Promise<EventResponseDto> {
    if (!this.isValidUUID(id)) {
      throw new AppError("Invalid event ID format", 400);
    }

    // Verificar se evento existe
    const existingEvent = await this.eventRepository.findById(id);
    if (!existingEvent) {
      throw new AppError("Event not found", 404);
    }

    // Não permitir que eventos completos sejam editados
    const status = ["COMPLETED"];
    if (status.includes(existingEvent.status)) {
      throw new AppError("Can't edit completed event", 400);
    }

    const allowedKeys = [
      "name",
      "description",
      "banner",
      "evaluationType",
      "status",
      "eventStartDate",
      "eventEndDate",
      "submissionStartDate",
      "submissionEndDate",
    ];
    // Remove objetos desnecessarios do eventData
    eventData = Object.fromEntries(
      Object.entries(eventData).filter(([key]) => allowedKeys.includes(key))
    );

    // Validar dados se fornecidos
    if (Object.keys(eventData).length === 0) {
      throw new AppError("No data provided for update", 400);
    }

    // Validar datas se fornecidas
    if (this.hasDateFields(eventData)) {
      this.validateUpdateDates(eventData, existingEvent);
    }

    let eventStartDate = eventData.eventStartDate;
    if (!eventStartDate) eventStartDate = existingEvent.eventStartDate;

    let eventEndDate = eventData.eventEndDate;
    if (!eventEndDate) eventEndDate = existingEvent.eventEndDate;

    let submissionStartDate = eventData.submissionStartDate;
    if (!submissionStartDate)
      submissionStartDate = existingEvent.submissionStartDate;

    let submissionEndDate = eventData.submissionEndDate;
    if (!submissionEndDate) submissionEndDate = existingEvent.submissionEndDate;

    if (eventStartDate > eventEndDate)
      throw new AppError(
        "start date can't be higher than end date of event",
        400
      );
    if (submissionEndDate > eventEndDate)
      throw new AppError(
        "end submission date can't be higher than end date of event",
        400
      );
    if (submissionStartDate < eventStartDate)
      throw new AppError(
        "submission date can't be lower than start date of event",
        400
      );
    if (submissionStartDate > submissionEndDate)
      throw new AppError(
        "submission start date can't be higher than submission end date",
        400
      );

    // Validar evaluationType
    if (eventData.evaluationType) {
      let evaluationTypes = ["DIRECT", "PAIR", "PANEL"];
      if (!evaluationTypes.includes(eventData.evaluationType)) {
        throw new AppError("Type of evaluation dosen't exist", 400);
      }
    }

    // Validar status
    if (eventData.status) {
      let statusTypes = [
        "DRAFT",
        "SUBMISSIONS_OPEN",
        "SUBMISSIONS_CLOSED",
        "IN_EVALUATION",
        "COMPLETED",
        "CANCELLED",
      ];
      if (!statusTypes.includes(eventData.status)) {
        throw new AppError("Type of status dosen't exist", 400);
      }
    }

    const updatedEvent = await this.eventRepository.update(id, eventData);
    return this.toEventResponse(updatedEvent);
  }

  // ========================================
  // DELETE
  // ========================================

  // Soft delete (recomendado)
  async softDeleteEvent(id: string): Promise<{ message: string }> {
    if (!this.isValidUUID(id)) {
      throw new AppError("Invalid event ID format", 400);
    }

    const existingEvent = await this.eventRepository.findById(id);
    if (!existingEvent) {
      throw new AppError("Event not found", 404);
    }

    if (!existingEvent.isActive) {
      throw new AppError("Event is already inactive", 400);
    }

    await this.eventRepository.softDelete(id);
    return { message: "Event deactivated successfully" };
  }

  // Hard delete (apenas se não houver artigos)
  async hardDeleteEvent(id: string): Promise<{ message: string }> {
    if (!this.isValidUUID(id)) {
      throw new AppError("Invalid event ID format", 400);
    }

    const existingEvent = await this.eventRepository.findById(id);
    if (!existingEvent) {
      throw new AppError("Event not found", 404);
    }

    // Verificar se tem artigos associados
    const hasArticles = await this.eventRepository.hasArticles(id);
    if (hasArticles) {
      throw new AppError(
        "Cannot delete event with associated articles. Use soft delete instead.",
        400
      );
    }

    await this.eventRepository.hardDelete(id);
    return { message: "Event deleted permanently" };
  }

  //CHECKLISTS

  async assignChecklistToEvent(
    eventId: string,
    checklistId: string
  ): Promise<EventResponseDto> {
    const event = await this.eventRepository.findActiveById(eventId);
    if (!event) {
      throw new AppError("Event not found or inactive", 404);
    }

    const checklist = await this.checklistRepository.findActiveById(
      checklistId
    );
    if (!checklist) {
      throw new AppError("Checklist not found or inactive", 404);
    }

    // 3 VERIFICAR SE O EVENTO JÁ TEM UM CHECKLIST
    if (event.checklistId) {
      throw new AppError(
        `Event already has a checklist assigned. Remove the current checklist first.`,
        400
      );
    }

    // 4 ATRIBUIR O CHECKLIST AO EVENTO
    const updatedEvent = await this.eventRepository.assignChecklist(
      eventId,
      checklistId
    );

    // 5 RETORNAR RESPOSTA FORMATADA
    return this.toEventResponse(updatedEvent);
  }

  // ========================================
  // REMOVE CHECKLIST FROM EVENT
  // ========================================
  async removeChecklistFromEvent(eventId: string): Promise<EventResponseDto> {
    const event = await this.eventRepository.findActiveById(eventId);
    if (!event) {
      throw new AppError("Event not found or inactive", 404);
    }

    if (!event.checklistId) {
      throw new AppError("Event does not have a checklist assigned", 400);
    }

    // 3 REMOVER O CHECKLIST DO EVENTO
    const updatedEvent = await this.eventRepository.removeChecklist(eventId);

    // 4 RETORNAR RESPOSTA FORMATADA
    return this.toEventResponse(updatedEvent);
  }

  // ========================================
  // NOVO: GET EVENT CHECKLIST QUESTIONS
  // ========================================
  async getEventChecklistQuestions(eventId: string): Promise<any[]> {
    // 1 VALIDAR ID DO EVENTO
    if (!this.isValidUUID(eventId)) {
      throw new AppError("Invalid event ID format", 400);
    }

    // 2 BUSCAR EVENTO
    const event = await this.eventRepository.findActiveById(eventId);
    if (!event) {
      throw new AppError("Event not found or inactive", 404);
    }

    // 3 VERIFICAR SE TEM CHECKLIST
    if (!event.checklistId) {
      throw new AppError("Event does not have a checklist assigned", 404);
    }

    // 4 BUSCAR QUESTÕES DO CHECKLIST
    const checklist = await this.checklistRepository.findByIdWithQuestions(
      event.checklistId
    );

    if (!checklist) {
      throw new AppError("Checklist not found", 404);
    }

    // 5 RETORNAR APENAS AS QUESTÕES ATIVAS
    return (checklist as any).questions || [];
  }
  // ========================================
  // EMAIL EM MASSA
  // ========================================

  /**
   * Envia emails em massa para autores e/ou avaliadores de um evento
   * @param eventId - ID do evento
   * @param coordinatorId - ID do coordenador solicitante
   * @param data - DTO com filtros e conteúdo do email
   * @returns Estatísticas de envio (total, enviados, falhas, erros)
   */
  async sendBulkEmail(
    eventId: string,
    coordinatorId: string,
    data: SendBulkEmailDto
  ): Promise<SendBulkEmailResponseDto> {
    // Verificar se é coordenador
    const coordinator = await this.authRepository.findActiveById(coordinatorId);
    if (!coordinator || coordinator.role !== "COORDINATOR") {
      throw new AppError("Apenas coordenadores podem enviar emails em massa", 403);
    }

    // Verificar evento
    const event = await this.eventRepository.findActiveById(eventId);
    if (!event) {
      throw new AppError("Evento não encontrado", 404);
    }

    // Buscar destinatários
    const recipients = await this.getRecipients(eventId, data.filters);

    if (recipients.length === 0) {
      return {
        totalRecipients: 0,
        sent: 0,
        failed: 0,
        errors: ["Nenhum destinatário encontrado com os filtros selecionados"],
      };
    }

    // Rate limiting: 50 emails por lote, 1s entre lotes
    const BATCH_SIZE = 50;
    const DELAY_BETWEEN_BATCHES = 1000;

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    // Processar em lotes
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);

      // Enviar lote em paralelo com Promise.allSettled
      const batchResults = await Promise.allSettled(
        batch.map((recipient) =>
          this.sendEmailToRecipient(
            recipient,
            event.name,
            data.subject,
            data.body
          )
        )
      );

      // Contar resultados
      batchResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          sent++;
        } else {
          failed++;
          const errorMessage =
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason);
          errors.push(
            `Falha ao enviar para ${batch[index].email}: ${errorMessage}`
          );
        }
      });

      // Delay entre lotes (exceto após o último)
      if (i + BATCH_SIZE < recipients.length) {
        await this.delay(DELAY_BETWEEN_BATCHES);
      }
    }

    return {
      totalRecipients: recipients.length,
      sent,
      failed,
      errors: errors.slice(0, 10), // Limitar a 10 erros no response
    };
  }

  /**
   * Busca destinatários com base nos filtros
   */
  private async getRecipients(
    eventId: string,
    filters: SendBulkEmailDto["filters"]
  ): Promise<Array<{ id: string; name: string; email: string }>> {
    const recipients = new Map<
      string,
      { id: string; name: string; email: string }
    >();

    // Se filtro por roles incluir STUDENT
    if (filters.roles?.includes("STUDENT")) {
      const authors = await this.getEventAuthors(eventId, filters);
      authors.forEach((author) => {
        recipients.set(author.id, author);
      });
    }

    // Se filtro por roles incluir EVALUATOR
    if (filters.roles?.includes("EVALUATOR")) {
      const evaluators = await this.getEventEvaluators(eventId);
      evaluators.forEach((evaluator) => {
        recipients.set(evaluator.id, evaluator);
      });
    }

    return Array.from(recipients.values());
  }

  /**
   * Busca autores (estudantes) de um evento com filtros opcionais
   */
  private async getEventAuthors(
    eventId: string,
    filters: SendBulkEmailDto["filters"]
  ): Promise<Array<{ id: string; name: string; email: string }>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      eventId,
      isActive: true,
    };

    if (filters.articleStatus) {
      where.status = filters.articleStatus;
    }

    if (filters.onlySubmittedArticles) {
      where.currentVersion = { gte: 1 };
    }

    const articles = await prisma.article.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Remover duplicados (autores com múltiplos artigos)
    const uniqueAuthors = new Map();
    articles.forEach((article) => {
      if (article.user) {
        uniqueAuthors.set(article.user.id, article.user);
      }
    });

    return Array.from(uniqueAuthors.values());
  }

  /**
   * Busca avaliadores de um evento
   */
  private async getEventEvaluators(
    eventId: string
  ): Promise<Array<{ id: string; name: string; email: string }>> {
    const eventEvaluators = await prisma.eventEvaluator.findMany({
      where: {
        eventId,
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return eventEvaluators
      .map((ee) => ee.user)
      .filter((user): user is { id: string; name: string; email: string } =>
        Boolean(user)
      );
  }

  /**
   * Envia email para um destinatário específico
   */
  private async sendEmailToRecipient(
    recipient: { id: string; name: string; email: string },
    eventName: string,
    subject: string,
    body: string
  ): Promise<void> {
    const template = this.emailService.generateCustomEmailTemplate(
      recipient.name,
      eventName,
      body,
      subject
    );

    await this.emailService.sendEmail({
      to: recipient.email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Delay helper para rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ========================================
  // MÉTODOS PRIVADOS
  // ========================================

  private validateCreateData(eventData: CreateEventDto): void {
    if (!eventData.name || eventData.name.trim().length < 3) {
      throw new AppError("Event name must have at least 3 characters", 400);
    }

    if (eventData.name.length > 150) {
      throw new AppError("Event name cannot exceed 150 characters", 400);
    }

    if (eventData.description && eventData.description.length > 300) {
      throw new AppError("Event description cannot exceed 300 characters", 400);
    }

    if (eventData.banner && eventData.banner.length > 200) {
      throw new AppError("Banner URL cannot exceed 200 characters", 400);
    }

    if (!["DIRECT", "PAIR", "PANEL"].includes(eventData.evaluationType)) {
      throw new AppError("Invalid evaluation type", 400);
    }
  }

  private validateDates(eventData: CreateEventDto): void {
    const now = new Date();
    const eventStart = new Date(eventData.eventStartDate);
    const eventEnd = new Date(eventData.eventEndDate);
    const submissionStart = new Date(eventData.submissionStartDate);
    const submissionEnd = new Date(eventData.submissionEndDate);

    // Validar se as datas são válidas
    if (
      isNaN(eventStart.getTime()) ||
      isNaN(eventEnd.getTime()) ||
      isNaN(submissionStart.getTime()) ||
      isNaN(submissionEnd.getTime())
    ) {
      throw new AppError("Invalid date format", 400);
    }
  }

  private validateUpdateDates(
    eventData: UpdateEventDto,
    existingEvent: Event
  ): void {
    const eventStart = eventData.eventStartDate || existingEvent.eventStartDate;
    const eventEnd = eventData.eventEndDate || existingEvent.eventEndDate;
    const submissionStart =
      eventData.submissionStartDate || existingEvent.submissionStartDate;
    const submissionEnd =
      eventData.submissionEndDate || existingEvent.submissionEndDate;

    // Validar se as datas são válidas
    if (
      isNaN(eventStart.getTime()) ||
      isNaN(eventEnd.getTime()) ||
      isNaN(submissionStart.getTime()) ||
      isNaN(submissionEnd.getTime())
    ) {
      throw new AppError("Invalid date format", 400);
    }
  }

  private hasDateFields(eventData: UpdateEventDto): boolean {
    return !!(
      eventData.eventStartDate ||
      eventData.eventEndDate ||
      eventData.submissionStartDate ||
      eventData.submissionEndDate
    );
  }

  private isValidUUID(uuid: string): boolean {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  private toEventResponse(event: Event & { _count?: any }): EventResponseDto {
    return {
      id: event.id,
      name: event.name,
      banner: event.banner ?? "",
      description: event.description ?? "",
      eventStartDate: event.eventStartDate,
      eventEndDate: event.eventEndDate,
      submissionStartDate: event.submissionStartDate,
      submissionEndDate: event.submissionEndDate,
      status: event.status,
      evaluationType: event.evaluationType,
      isActive: event.isActive,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
      _count: event._count,
    };
  }
}
