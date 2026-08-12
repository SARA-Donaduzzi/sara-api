// src/presentation/routes/articleRoutes.ts
import { Router } from "express";
import {
  authenticate,
  requireCoordinator,
  requireStudent,
  requireStaff,
} from "../middlewares/authMiddleware";
import { notifyEvaluatorAddedToArticle } from "../middlewares/emailNotificationMiddleware";
import { ArticleController } from "../controllers/ArticleController";
import { ReviewerMatchingController } from '../controllers/ReviewerMatchingController'

const articleController = new ArticleController();
const reviewerMatchingController = new ReviewerMatchingController();
const router = Router();

// Pegar artigos de usuario especifico
router.get("/:articleId",
  authenticate,
  // requireStudent(),
  async (req, res, next): Promise<void> => {
  await articleController.getArticlesById(req, res, next);
});

// Criar evento (apenas COORDINATOR)
router.post("/", authenticate, requireStudent(), async (req, res, next): Promise<void> => {
  await articleController.createArticle(req, res, next);
});

router.post(
  "/:articleId/evaluators",
  authenticate,
  requireCoordinator(),
  notifyEvaluatorAddedToArticle(),
  async (req, res, next): Promise<void> => {
    await articleController.assignEvaluatorsToArticle(req, res, next);
  }
);

router.delete(
  "/:articleId/evaluators",
  authenticate,
  requireStaff(), // Permite COORDINATOR e EVALUATOR
  async (req, res, next): Promise<void> => {
    await articleController.removeEvaluatorFromArticle(req, res);
  }
);

// Alterar avaliador (apenas COORDINATOR)
router.put(
  "/:articleId/reassign-evaluator",
  authenticate,
  requireCoordinator(),
  async (req, res, next): Promise<void> => {
    await articleController.reassignEvaluator(req, res, next);
  }
);

// Inserir uma nova versão do artigo
router.put(
  "/:articleId/new-version",
  authenticate,
  requireStudent(),
  async (req, res, next): Promise<void> => {
    await articleController.createNewVersion(req, res, next);
  }
);

// Atualizar artigos (informações)
router.put(
  "/:articleId",
  authenticate,
  requireStudent(), // ou requireStudent() dependendo da regra
  async (req, res, next): Promise<void> => {
    await articleController.updateArticle(req, res, next);
  }
);

router.get(
  '/:articleId/reviewer-suggestions',
  authenticate,
  requireCoordinator(),
  async (req, res, next) => {
    await reviewerMatchingController.suggest(req, res, next)
  }
)

export { router as articleRoutes };
