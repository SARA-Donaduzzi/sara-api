import { Router } from 'express'
import { OaiPmhController } from '../controllers/OaiPmhController'

const controller = new OaiPmhController()
const router = Router()

router.get('/', async (req, res, next) => {
  await controller.handle(req, res, next)
})

export { router as oaiRoutes }
