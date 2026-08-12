import { Request, Response, NextFunction } from 'express'
import { OaiPmhService } from '../../application/services/OaiPmhService'

const service = new OaiPmhService({
  baseUrl: process.env.OAI_BASE_URL ?? 'http://localhost:8080/oai',
  repositoryName: process.env.OAI_REPOSITORY_NAME ?? 'SARA — Sistema de Avaliação e Revisão de Artigos',
  adminEmail: process.env.OAI_ADMIN_EMAIL ?? 'admin@sara.example.com',
})

export class OaiPmhController {
  async handle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const verb = (req.query.verb as string) ?? ''
      const params: Record<string, string> = {}
      for (const [key, value] of Object.entries(req.query)) {
        if (key !== 'verb' && typeof value === 'string') params[key] = value
      }

      const xml = await service.handleRequest(verb, params)
      res.setHeader('Content-Type', 'text/xml; charset=UTF-8')
      res.send(xml)
    } catch (err) {
      next(err)
    }
  }
}
