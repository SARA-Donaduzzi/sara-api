import { OaiPmhService } from '../../../src/application/services/OaiPmhService'
import { prisma } from '../../../src/lib/prisma'

jest.mock('../../../src/lib/prisma', () => ({
  prisma: {
    article: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}))

const service = new OaiPmhService({
  baseUrl: 'http://localhost:8080/oai',
  repositoryName: 'SARA Test Repository',
  adminEmail: 'admin@test.com',
})

const mockArticle = {
  id: 'article-uuid-001',
  title: 'Segurança em Sistemas Distribuídos',
  summary: 'Este artigo apresenta uma análise de segurança.',
  thematicArea: 'Segurança Cibernética',
  createdAt: new Date('2026-01-15T10:00:00Z'),
  status: 'APPROVED',
  event: { name: 'VII CIC 2025', id: 'event-uuid-001' },
  keywords: [{ name: 'segurança' }, { name: 'distribuído' }],
  relatedAuthors: [{ coAuthorName: 'Maria Silva' }],
  user: { name: 'João Santos' },
}

describe('OaiPmhService', () => {
  describe('Identify', () => {
    beforeEach(() => {
      ;(prisma.article.findFirst as jest.Mock).mockResolvedValue({
        createdAt: new Date('2026-01-15T10:00:00Z'),
      })
    })

    it('retorna XML com elemento Identify', async () => {
      const xml = await service.handleRequest('Identify', {})
      expect(xml).toContain('<Identify>')
      expect(xml).toContain('<repositoryName>SARA Test Repository</repositoryName>')
      expect(xml).toContain('<baseURL>http://localhost:8080/oai</baseURL>')
      expect(xml).toContain('<protocolVersion>2.0</protocolVersion>')
    })
  })

  describe('ListMetadataFormats', () => {
    it('retorna oai_dc como formato disponível', async () => {
      const xml = await service.handleRequest('ListMetadataFormats', {})
      expect(xml).toContain('<metadataPrefix>oai_dc</metadataPrefix>')
    })
  })

  describe('Erro', () => {
    it('retorna badVerb para verbo inválido', async () => {
      const xml = await service.handleRequest('InvalidVerb', {})
      expect(xml).toContain('<error code="badVerb">')
    })
  })
})

describe('ListRecords', () => {
  beforeEach(() => {
    ;(prisma.article.findMany as jest.Mock).mockResolvedValue([mockArticle])
    ;(prisma.article.count as jest.Mock).mockResolvedValue(1)
  })

  it('retorna registros com Dublin Core', async () => {
    const xml = await service.handleRequest('ListRecords', { metadataPrefix: 'oai_dc' })
    expect(xml).toContain('<ListRecords>')
    expect(xml).toContain('Segurança em Sistemas Distribuídos')
    expect(xml).toContain('João Santos')
    expect(xml).toContain('segurança')
    expect(xml).toContain('article-uuid-001')
  })

  it('retorna badArgument quando metadataPrefix ausente', async () => {
    const xml = await service.handleRequest('ListRecords', {})
    expect(xml).toContain('<error code="badArgument">')
  })

  it('retorna cannotDisseminateFormat para formato não suportado', async () => {
    const xml = await service.handleRequest('ListRecords', { metadataPrefix: 'marc21' })
    expect(xml).toContain('<error code="cannotDisseminateFormat">')
  })
})

describe('GetRecord', () => {
  beforeEach(() => {
    ;(prisma.article.findUnique as jest.Mock).mockResolvedValue(mockArticle)
  })

  it('retorna registro individual por identifier', async () => {
    const xml = await service.handleRequest('GetRecord', {
      identifier: 'oai:sara:article-uuid-001',
      metadataPrefix: 'oai_dc',
    })
    expect(xml).toContain('<GetRecord>')
    expect(xml).toContain('Segurança em Sistemas Distribuídos')
  })

  it('retorna idDoesNotExist para identifier inválido', async () => {
    ;(prisma.article.findUnique as jest.Mock).mockResolvedValue(null)
    const xml = await service.handleRequest('GetRecord', {
      identifier: 'oai:sara:nao-existe',
      metadataPrefix: 'oai_dc',
    })
    expect(xml).toContain('<error code="idDoesNotExist">')
  })
})
