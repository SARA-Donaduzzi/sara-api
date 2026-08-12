import { ArticleStatus, Checklist, Question } from "@prisma/client";

// DTO para resposta completa do artigo (visão 360° para coordenador)
export interface ArticleCompleteResponseDto {
  id: string;
  title: string;
  summary: string;
  thematicArea: string | null;
  status: ArticleStatus;
  currentVersion: number;
  evaluationsDone: number;
  createdAt: Date;
  updatedAt: Date;

  author: {
    id: string;
    name: string;
    email: string;
  };

  event: {
    id: string;
    name: string;
    evaluationType: string;
    checklist: Checklist | null;
  };

  keywords: string[];
  relatedAuthors: string[];

  versions: ArticleVersionCompleteDto[];
  evaluators: EvaluatorAssignmentDto[];
  stats: ArticleStatsDto;
}

export interface ArticleVersionCompleteDto {
  id: string;
  version: number;
  pdfPath: string;
  createdAt: Date;
  evaluations: EvaluationCompleteDto[];
  questionResponses: QuestionResponseCompleteDto[];
}

export interface EvaluationCompleteDto {
  id: string;
  grade: number;
  evaluationDescription: string | null;
  status: string;
  evaluationDate: Date;
  evaluator: {
    id: string;
    name: string;
    email: string;
  };
}

export interface QuestionResponseCompleteDto {
  id: string;
  questionId: string;
  questionDescription: string;
  questionType: string;
  booleanResponse: boolean | null;
  scaleResponse: number | null;
  textResponse: string | null;
  evaluator: {
    id: string;
    name: string;
    email: string;
  };
}

export interface EvaluatorAssignmentDto {
  id: string;
  name: string;
  email: string;
  isCorrected: boolean;
  assignedAt: Date;
}

export interface ArticleStatsDto {
  totalVersions: number;
  totalEvaluations: number;
  averageGrade: number;
  evaluationsByStatus: {
    approved: number;
    toCorrection: number;
    rejected: number;
  };
  assignedEvaluators: number;
  completedEvaluators: number;
}

// DTO para criação de artigo
export interface CreateArticleDto {
  title: string;
  summary: string;
  thematicArea?: string;
  pdfPath: string; // Caminho do PDF que será salvo
  eventId: string; // ID do evento
  userId: string; // ID do autor principal
  keywords: string[]; // Array de palavras-chave
  relatedAuthors: string[]; // Array de nomes dos co-autores
}

// DTO para resposta de artigo (apenas dados principais)
export interface ArticleResponseDto {
  id: string;
  title: string;
  summary: string;
  thematicArea?: string;
  currentVersion: number;
  evaluationsDone: number;
  status: ArticleStatus;
  eventId: string;
  userId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  // Relacionamentos criados junto
  keywords: Array<{
    id: string;
    name: string;
  }>;
  relatedAuthors: Array<{
    id: string;
    coAuthorName: string;
  }>;
  versions: Array<{
    id: string;
    version: number;
    pdfPath: string;
    createdAt: Date;
  }>;
}

export interface UpdateArticleDto {
  // Dados principais do artigo (opcionais)
  title?: string;
  summary?: string;
  thematicArea?: string;

  // Arrays relacionados (opcionais)
  keywords?: string[]; // Se fornecido, substitui todas as keywords
  relatedAuthors?: string[]; // Se fornecido, substitui todos os related authors
}

export interface UpdateArticleResponseDto {
  id: string;
  title: string;
  summary: string;
  thematicArea?: string;
  currentVersion: number;
  evaluationsDone: number;
  status: ArticleStatus;
  eventId: string;
  userId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  // Relacionamentos atualizados
  keywords: Array<{
    id: string;
    name: string;
  }>;
  relatedAuthors: Array<{
    id: string;
    coAuthorName: string;
  }>;
  lastVersion: {
    id: string;
    version: number;
    pdfPath: string;
    createdAt: Date;
  };
}
