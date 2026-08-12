import { Request, Response, NextFunction } from "express";
import {
  CreateEventDto,
  UpdateEventDto,
  ListEventsDto,
  SendBulkEmailDto,
} from "../../application/dtos/EventDto";
import { ApiResponse } from "../../shared/utils/response";
import { AppError } from "../../shared/errors/AppError";
import { EventService } from "../../application/services/EventService";
import { sanitizeUuidOrThrow } from "../../shared/utils/uuidSanitazer";

export class EventController {
  private eventService: EventService;

  constructor() {
    this.eventService = new EventService();
  }

  // ========================================
  // CREATE (Apenas COORDINATOR)
  // ========================================
  async createEvent(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const eventData: CreateEventDto = req.body;

      // Converter strings de data para Date objects
      if (eventData.eventStartDate) {
        eventData.eventStartDate = new Date(eventData.eventStartDate);
      }
      if (eventData.eventEndDate) {
        eventData.eventEndDate = new Date(eventData.eventEndDate);
      }
      if (eventData.submissionStartDate) {
        eventData.submissionStartDate = new Date(eventData.submissionStartDate);
      }
      if (eventData.submissionEndDate) {
        eventData.submissionEndDate = new Date(eventData.submissionEndDate);
      }

      const event = await this.eventService.createEvent(eventData);

      res
        .status(201)
        .json(ApiResponse.success(event, "Event created successfully!"));
    } catch (error) {
      this.handleError(error, res, "Create event error");
    }
  }

  // ========================================
  // READ (Todas as roles)
  // ========================================

  // Buscar evento por ID
  async getEventById(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const includeStats = req.query.includeStats === "true";

      const event = await this.eventService.getEventById(id, includeStats);

      res
        .status(200)
        .json(ApiResponse.success(event, "Event retrieved successfully!"));
    } catch (error) {
      this.handleError(error, res, "Get event error");
    }
  }

  // JPF: Listar artigos por id de evento
  async getArticlesByEventId(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { eventId } = req.params;
      const optionalArgs = {
        search: req.query?.search as string | undefined,
        status: req.query?.status as string | undefined,
        submissionType: req.query?.submissionType as "first" | "correction" | undefined,
        page:
          req.query?.page == undefined || req.query?.page == null
            ? 1
            : parseInt(req.query.page as string),
        limit:
          req.query?.limit == undefined || req.query?.limit == null
            ? 10
            : parseInt(req.query.limit as string),
      };

      if (!eventId) {
        res.status(400).json(ApiResponse.error("Event ID is required", 400));
        return;
      }

      const articlesByEventId = await this.eventService.getArticlesByEventId(
        eventId,
        optionalArgs
      );

      const response: any = ApiResponse.success(
        articlesByEventId.articles,
        "Articles retrieved successfully"
      );
      response.pagination = articlesByEventId.pagination;

      res.status(200).json(response);
    } catch (error) {
      this.handleError(error, res, "Get articles by event id error");
    }
  }

  // Listar eventos com filtros
  async getEvents(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const filters: ListEventsDto = {
        page: req.query.page ? parseInt(req.query.page as string) : undefined,
        limit: req.query.limit
          ? parseInt(req.query.limit as string)
          : undefined,
        search: req.query.search as string,
        status: req.query.status as any,
        isActive: req.query.isActive
          ? req.query.isActive === "true"
          : undefined,
        evaluationType: req.query.evaluationType as any,
        includeStats: req.query.includeStats === "true",
      };

      const result = await this.eventService.getEvents(filters);

      res
        .status(200)
        .json(ApiResponse.success(result, "Events retrieved successfully!"));
    } catch (error) {
      this.handleError(error, res, "Get events error");
    }
  }

  // Buscar apenas eventos ativos
  async getActiveEvents(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const events = await this.eventService.getActiveEvents();

      res
        .status(200)
        .json(
          ApiResponse.success(events, "Active events retrieved successfully!")
        );
    } catch (error) {
      this.handleError(error, res, "Get active events error");
    }
  }

  // Obter estatísticas de eventos
  async getEventsStats(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const stats = await this.eventService.getEventsStats();

      res
        .status(200)
        .json(
          ApiResponse.success(
            stats,
            "Events statistics retrieved successfully!"
          )
        );
    } catch (error) {
      this.handleError(error, res, "Get events stats error");
    }
  }

  // ========================================
  // UPDATE (Apenas COORDINATOR)
  // ========================================
  async updateEvent(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const eventData: UpdateEventDto = req.body;

      // Converter strings de data para Date objects se fornecidas
      if (eventData.eventStartDate) {
        eventData.eventStartDate = new Date(eventData.eventStartDate);
      }
      if (eventData.eventEndDate) {
        eventData.eventEndDate = new Date(eventData.eventEndDate);
      }
      if (eventData.submissionStartDate) {
        eventData.submissionStartDate = new Date(eventData.submissionStartDate);
      }
      if (eventData.submissionEndDate) {
        eventData.submissionEndDate = new Date(eventData.submissionEndDate);
      }

      const updatedEvent = await this.eventService.updateEvent(id, eventData);

      res
        .status(200)
        .json(ApiResponse.success(updatedEvent, "Event updated successfully!"));
    } catch (error) {
      this.handleError(error, res, "Update event error");
    }
  }

  // JPF: Editar evento
  async editEvent(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const eventData: UpdateEventDto = req.body;

      // Converter strings de data para Date objects se fornecidas
      if (eventData.eventStartDate) {
        eventData.eventStartDate = new Date(eventData.eventStartDate);
      }
      if (eventData.eventEndDate) {
        eventData.eventEndDate = new Date(eventData.eventEndDate);
      }
      if (eventData.submissionStartDate) {
        eventData.submissionStartDate = new Date(eventData.submissionStartDate);
      }
      if (eventData.submissionEndDate) {
        eventData.submissionEndDate = new Date(eventData.submissionEndDate);
      }

      const updatedEvent = await this.eventService.editEvent(id, eventData);

      res
        .status(200)
        .json(ApiResponse.success(updatedEvent, "Event updated successfully!"));
    } catch (error) {
      this.handleError(error, res, "Update event error");
    }
  }

  // ========================================
  // DELETE (Apenas COORDINATOR)
  // ========================================

  // Soft delete (recomendado)
  async softDeleteEvent(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;

      const result = await this.eventService.softDeleteEvent(id);

      res
        .status(200)
        .json(ApiResponse.success(result, "Event deactivated successfully!"));
    } catch (error) {
      this.handleError(error, res, "Soft delete event error");
    }
  }

  // Hard delete (apenas se não houver artigos)
  async hardDeleteEvent(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;

      const result = await this.eventService.hardDeleteEvent(id);

      res
        .status(200)
        .json(ApiResponse.success(result, "Event deleted permanently!"));
    } catch (error) {
      this.handleError(error, res, "Hard delete event error");
    }
  }

  //CHECKLISTS
  async assignChecklistToEvent(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      /*
      const eventId = sanitizeUuidOrThrow(req.params.eventId, "Event ID");
      const checklistId = sanitizeUuidOrThrow(
        req.body.checklistId,
        "Checklist ID"
      );*/

      const eventId = req.params.eventId;
      const checklistId = req.body.checklistId;

      const result = await this.eventService.assignChecklistToEvent(
        eventId,
        checklistId
      );

      // 3 RETORNAR SUCESSO
      res
        .status(200)
        .json(
          ApiResponse.success(
            result,
            `Checklist '${result?.name}' assigned to event '${result.name}' successfully!`
          )
        );
    } catch (error) {
      this.handleError(error, res, "Assign checklist to event error");
    }
  }

  // ========================================
  // REMOVE CHECKLIST FROM EVENT (Apenas COORDINATOR)
  // ========================================
  async removeChecklistFromEvent(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const eventId = req.params.eventId;

      const result = await this.eventService.removeChecklistFromEvent(eventId);

      res
        .status(200)
        .json(
          ApiResponse.success(
            result,
            `Checklist removed from event '${result.name}' successfully!`
          )
        );
    } catch (error) {
      this.handleError(error, res, "Remove checklist from event error");
    }
  }

  // ========================================
  // NOVO: GET EVENT CHECKLIST QUESTIONS
  // ========================================
  async getEventChecklistQuestions(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const eventId = req.params.eventId;

      const questions = await this.eventService.getEventChecklistQuestions(
        eventId
      );

      res
        .status(200)
        .json(
          ApiResponse.success(
            questions,
            "Event checklist questions retrieved successfully!"
          )
        );
    } catch (error) {
      this.handleError(error, res, "Get event checklist questions error");
    }
  }

  // ========================================
  // EMAIL EM MASSA (apenas COORDINATOR)
  // ========================================
  async sendBulkEmail(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { eventId } = req.params;
      const coordinatorId = req.user?.id;
      const emailData: SendBulkEmailDto = req.body;

      // Validações básicas
      if (!emailData.subject || !emailData.body) {
        res.status(400).json(
          ApiResponse.error("Assunto e corpo do email são obrigatórios", 400)
        );
        return;
      }

      if (!emailData.filters?.roles || emailData.filters.roles.length === 0) {
        res.status(400).json(
          ApiResponse.error("Selecione pelo menos um tipo de destinatário", 400)
        );
        return;
      }

      const result = await this.eventService.sendBulkEmail(
        eventId,
        coordinatorId!,
        emailData
      );

      res.status(200).json(
        ApiResponse.success(result, "Emails enviados com sucesso")
      );
    } catch (error) {
      this.handleError(error, res, "Send bulk email error");
    }
  }

  // ========================================
  // MÉTODO PRIVADO PARA TRATAMENTO DE ERROS
  // ========================================
  private handleError(error: unknown, res: Response, context: string): void {
    if (error instanceof AppError) {
      res
        .status(error.statusCode)
        .json(ApiResponse.error(error.message, error.statusCode));
      return;
    }

    res.status(500).json(ApiResponse.error("Internal server error", 500));
  }
}
