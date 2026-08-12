import { Request, Response, NextFunction } from 'express'
import { ReviewerMatchingService } from '../../application/services/ReviewerMatchingService'

const matchingService = new ReviewerMatchingService()

export class ReviewerMatchingController {
  async suggest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { articleId } = req.params
      const { eventId } = req.query as { eventId?: string }

      if (!eventId) {
        res.status(400).json({ error: 'eventId query param is required' })
        return
      }

      const suggestions = await matchingService.suggestEvaluators(articleId, eventId)
      res.json({ suggestions })
    } catch (err) {
      next(err)
    }
  }
}
