import { create } from 'xmlbuilder2'
import { prisma } from '../../lib/prisma'

interface OaiPmhConfig {
  baseUrl: string
  repositoryName: string
  adminEmail: string
}

const VALID_VERBS = [
  'Identify',
  'ListMetadataFormats',
  'ListRecords',
  'GetRecord',
  'ListIdentifiers',
  'ListSets',
]

const PAGE_SIZE = 100

/**
 * Formata data no granularity declarado pelo repositório (YYYY-MM-DDThh:mm:ssZ).
 * toISOString() inclui milissegundos, o que viola o granularity anunciado no Identify
 * e é rejeitado por validadores OAI-PMH.
 */
function toOaiDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export class OaiPmhService {
  constructor(private config: OaiPmhConfig) {}

  async handleRequest(verb: string, params: Record<string, string>): Promise<string> {
    if (!VALID_VERBS.includes(verb)) {
      return this.buildError('badVerb', `Illegal OAI verb: ${verb}`)
    }
    switch (verb) {
      case 'Identify':
        return this.buildIdentify()
      case 'ListMetadataFormats':
        return this.buildListMetadataFormats()
      case 'ListRecords':
        return this.buildListRecords(params)
      case 'GetRecord':
        return this.buildGetRecord(params)
      case 'ListIdentifiers':
        return this.buildListIdentifiers(params)
      case 'ListSets':
        return this.buildError('noSetHierarchy', 'This repository does not support sets')
      default:
        return this.buildError('badVerb', 'Unknown verb')
    }
  }

  private async buildIdentify(): Promise<string> {
    const earliest = await prisma.article.findFirst({
      where: { status: { in: ['APPROVED', 'APPROVED_WITH_REMARKS'] }, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    })
    const earliestDate = earliest ? toOaiDate(earliest.createdAt) : toOaiDate(new Date())

    return create({ version: '1.0', encoding: 'UTF-8' })
      .ele('OAI-PMH', {
        xmlns: 'http://www.openarchives.org/OAI/2.0/',
        'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        'xsi:schemaLocation':
          'http://www.openarchives.org/OAI/2.0/ http://www.openarchives.org/OAI/2.0/OAI-PMH.xsd',
      })
      .ele('responseDate')
      .txt(toOaiDate(new Date()))
      .up()
      .ele('request', { verb: 'Identify' })
      .txt(this.config.baseUrl)
      .up()
      .ele('Identify')
      .ele('repositoryName')
      .txt(this.config.repositoryName)
      .up()
      .ele('baseURL')
      .txt(this.config.baseUrl)
      .up()
      .ele('protocolVersion')
      .txt('2.0')
      .up()
      .ele('adminEmail')
      .txt(this.config.adminEmail)
      .up()
      .ele('earliestDatestamp')
      .txt(earliestDate)
      .up()
      .ele('deletedRecord')
      .txt('no')
      .up()
      .ele('granularity')
      .txt('YYYY-MM-DDThh:mm:ssZ')
      .up()
      .up()
      .up()
      .end({ prettyPrint: true })
  }

  private buildListMetadataFormats(): string {
    return create({ version: '1.0', encoding: 'UTF-8' })
      .ele('OAI-PMH', {
        xmlns: 'http://www.openarchives.org/OAI/2.0/',
        'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        'xsi:schemaLocation':
          'http://www.openarchives.org/OAI/2.0/ http://www.openarchives.org/OAI/2.0/OAI-PMH.xsd',
      })
      .ele('responseDate')
      .txt(toOaiDate(new Date()))
      .up()
      .ele('request', { verb: 'ListMetadataFormats' })
      .txt(this.config.baseUrl)
      .up()
      .ele('ListMetadataFormats')
      .ele('metadataFormat')
      .ele('metadataPrefix')
      .txt('oai_dc')
      .up()
      .ele('schema')
      .txt('http://www.openarchives.org/OAI/2.0/oai_dc.xsd')
      .up()
      .ele('metadataNamespace')
      .txt('http://www.openarchives.org/OAI/2.0/oai_dc/')
      .up()
      .up()
      .up()
      .up()
      .end({ prettyPrint: true })
  }

  private buildError(code: string, message: string): string {
    return create({ version: '1.0', encoding: 'UTF-8' })
      .ele('OAI-PMH', {
        xmlns: 'http://www.openarchives.org/OAI/2.0/',
        'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        'xsi:schemaLocation':
          'http://www.openarchives.org/OAI/2.0/ http://www.openarchives.org/OAI/2.0/OAI-PMH.xsd',
      })
      .ele('responseDate')
      .txt(toOaiDate(new Date()))
      .up()
      .ele('request')
      .txt(this.config.baseUrl)
      .up()
      .ele('error', { code })
      .txt(message)
      .up()
      .up()
      .end({ prettyPrint: true })
  }

  private async buildListRecords(params: Record<string, string>): Promise<string> {
    if (!params.metadataPrefix) {
      return this.buildError('badArgument', 'metadataPrefix is required')
    }
    if (params.metadataPrefix !== 'oai_dc') {
      return this.buildError('cannotDisseminateFormat', `Format not supported: ${params.metadataPrefix}`)
    }

    const offset = params.resumptionToken
      ? this.decodeResumptionToken(params.resumptionToken)
      : 0

    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        where: { status: { in: ['APPROVED', 'APPROVED_WITH_REMARKS'] }, isActive: true },
        include: { keywords: true, relatedAuthors: true, event: true, user: true },
        skip: offset,
        take: PAGE_SIZE,
        orderBy: { createdAt: 'asc' },
      }),
      prisma.article.count({
        where: { status: { in: ['APPROVED', 'APPROVED_WITH_REMARKS'] }, isActive: true },
      }),
    ])

    if (articles.length === 0) {
      return this.buildError('noRecordsMatch', 'No records match the given criteria')
    }

    const doc = create({ version: '1.0', encoding: 'UTF-8' })
    const root = doc
      .ele('OAI-PMH', {
        'xmlns': 'http://www.openarchives.org/OAI/2.0/',
        'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        'xsi:schemaLocation': 'http://www.openarchives.org/OAI/2.0/ http://www.openarchives.org/OAI/2.0/OAI-PMH.xsd',
      })
      .ele('responseDate').txt(toOaiDate(new Date())).up()
      .ele('request', { verb: 'ListRecords', metadataPrefix: 'oai_dc' }).txt(this.config.baseUrl).up()
      .ele('ListRecords')

    for (const article of articles) {
      const record = root.ele('record')
      record
        .ele('header')
          .ele('identifier').txt(`oai:sara:${article.id}`).up()
          .ele('datestamp').txt(toOaiDate(article.createdAt)).up()
        .up()

      const dcData = this.buildDublinCoreData(article)
      const metadata = record.ele('metadata')
      const dc = metadata.ele('oai_dc:dc', {
        'xmlns:oai_dc': 'http://www.openarchives.org/OAI/2.0/oai_dc/',
        'xmlns:dc': 'http://purl.org/dc/elements/1.1/',
        'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        'xsi:schemaLocation': 'http://www.openarchives.org/OAI/2.0/oai_dc/ http://www.openarchives.org/OAI/2.0/oai_dc.xsd',
      })
      for (const [tag, values] of Object.entries(dcData)) {
        for (const v of values) {
          dc.ele(tag).txt(v).up()
        }
      }
      dc.up()
      metadata.up()
      record.up()
    }

    const nextOffset = offset + articles.length
    if (nextOffset < total) {
      root.ele('resumptionToken', {
        completeListSize: String(total),
        cursor: String(offset),
      }).txt(this.encodeResumptionToken(nextOffset)).up()
    }

    return doc.end({ prettyPrint: true })
  }

  private async buildGetRecord(params: Record<string, string>): Promise<string> {
    if (!params.identifier || !params.metadataPrefix) {
      return this.buildError('badArgument', 'identifier and metadataPrefix are required')
    }
    if (params.metadataPrefix !== 'oai_dc') {
      return this.buildError('cannotDisseminateFormat', `Format not supported: ${params.metadataPrefix}`)
    }

    if (!params.identifier.startsWith('oai:sara:')) {
      return this.buildError('idDoesNotExist', `No record exists for identifier: ${params.identifier}`)
    }

    const articleId = params.identifier.replace('oai:sara:', '')
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      include: { keywords: true, relatedAuthors: true, event: true, user: true },
    })

    if (!article || !['APPROVED', 'APPROVED_WITH_REMARKS'].includes(article.status)) {
      return this.buildError('idDoesNotExist', `No record exists for identifier: ${params.identifier}`)
    }

    const dcData = this.buildDublinCoreData(article)

    const doc = create({ version: '1.0', encoding: 'UTF-8' })
    const dcEle = doc
      .ele('OAI-PMH', {
        'xmlns': 'http://www.openarchives.org/OAI/2.0/',
        'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        'xsi:schemaLocation': 'http://www.openarchives.org/OAI/2.0/ http://www.openarchives.org/OAI/2.0/OAI-PMH.xsd',
      })
      .ele('responseDate').txt(toOaiDate(new Date())).up()
      .ele('request', { verb: 'GetRecord' }).txt(this.config.baseUrl).up()
      .ele('GetRecord')
        .ele('record')
          .ele('header')
            .ele('identifier').txt(`oai:sara:${article.id}`).up()
            .ele('datestamp').txt(toOaiDate(article.createdAt)).up()
          .up()
          .ele('metadata')
            .ele('oai_dc:dc', {
              'xmlns:oai_dc': 'http://www.openarchives.org/OAI/2.0/oai_dc/',
              'xmlns:dc': 'http://purl.org/dc/elements/1.1/',
              'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
              'xsi:schemaLocation': 'http://www.openarchives.org/OAI/2.0/oai_dc/ http://www.openarchives.org/OAI/2.0/oai_dc.xsd',
            })

    for (const [tag, values] of Object.entries(dcData)) {
      for (const v of values) {
        dcEle.ele(tag).txt(v).up()
      }
    }

    // Close: oai_dc:dc → metadata → record → GetRecord → OAI-PMH
    dcEle.up().up().up().up().up()

    return doc.end({ prettyPrint: true })
  }

  private async buildListIdentifiers(params: Record<string, string>): Promise<string> {
    if (!params.metadataPrefix) {
      return this.buildError('badArgument', 'metadataPrefix is required')
    }
    if (params.metadataPrefix !== 'oai_dc') {
      return this.buildError('cannotDisseminateFormat', `Format not supported: ${params.metadataPrefix}`)
    }

    const offset = params.resumptionToken
      ? this.decodeResumptionToken(params.resumptionToken)
      : 0

    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        where: { status: { in: ['APPROVED', 'APPROVED_WITH_REMARKS'] }, isActive: true },
        select: { id: true, createdAt: true },
        skip: offset,
        take: PAGE_SIZE,
        orderBy: { createdAt: 'asc' },
      }),
      prisma.article.count({
        where: { status: { in: ['APPROVED', 'APPROVED_WITH_REMARKS'] }, isActive: true },
      }),
    ])

    if (articles.length === 0) {
      return this.buildError('noRecordsMatch', 'No records match the given criteria')
    }

    const doc = create({ version: '1.0', encoding: 'UTF-8' })
    const root = doc
      .ele('OAI-PMH', {
        'xmlns': 'http://www.openarchives.org/OAI/2.0/',
        'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
        'xsi:schemaLocation': 'http://www.openarchives.org/OAI/2.0/ http://www.openarchives.org/OAI/2.0/OAI-PMH.xsd',
      })
      .ele('responseDate').txt(toOaiDate(new Date())).up()
      .ele('request', { verb: 'ListIdentifiers' }).txt(this.config.baseUrl).up()
      .ele('ListIdentifiers')

    for (const article of articles) {
      root.ele('header')
        .ele('identifier').txt(`oai:sara:${article.id}`).up()
        .ele('datestamp').txt(toOaiDate(article.createdAt)).up()
      .up()
    }

    const nextOffset = offset + articles.length
    if (nextOffset < total) {
      root.ele('resumptionToken', {
        completeListSize: String(total),
        cursor: String(offset),
      }).txt(this.encodeResumptionToken(nextOffset)).up()
    }

    return doc.end({ prettyPrint: true })
  }

  private buildDublinCoreData(article: any): Record<string, string[]> {
    const creators = [article.user.name, ...article.relatedAuthors.map((a: any) => a.coAuthorName)]
    const subjects = article.keywords.map((k: any) => k.name)
    if (article.thematicArea) subjects.push(article.thematicArea)

    return {
      'dc:title': [article.title],
      'dc:creator': creators,
      'dc:subject': subjects,
      'dc:description': [article.summary],
      'dc:date': [toOaiDate(article.createdAt).split('T')[0]],
      'dc:type': ['Text'],
      'dc:identifier': [`oai:sara:${article.id}`],
      'dc:language': ['pt-BR'],
      'dc:rights': ['CC BY 4.0'],
    }
  }

  private encodeResumptionToken(offset: number): string {
    return Buffer.from(JSON.stringify({ offset })).toString('base64')
  }

  private decodeResumptionToken(token: string): number {
    try {
      return JSON.parse(Buffer.from(token, 'base64').toString('utf8')).offset ?? 0
    } catch {
      return 0
    }
  }
}
