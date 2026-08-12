import { PrismaClient, RoleType, EventStatus, EvaluationType, ArticleStatus, EvaluationStatus, QuestionType } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...\n');

  // Limpar dados existentes (opcional - descomente se quiser limpar tudo)
  // await cleanDatabase();

  // 1. Criar usuários de teste
  console.log('👥 Criando usuários de teste...');
  const users = await createUsers();
  console.log(`✅ ${users.length} usuários criados\n`);

  // 2. Criar coordenador
  console.log('👔 Criando coordenador...');
  const coordinator = await createCoordinator();
  console.log(`✅ Coordenador: ${coordinator.email}\n`);

  // 3. Criar avaliadores
  console.log('🔍 Criando avaliadores...');
  const evaluators = await createEvaluators();
  console.log(`✅ ${evaluators.length} avaliadores criados\n`);

  // 4. Criar estudantes/autores
  console.log('🎓 Criando estudantes...');
  const students = await createStudents();
  console.log(`✅ ${students.length} estudantes criados\n`);

  // 5. Criar checklist
  console.log('📋 Criando checklist...');
  const checklist = await createChecklist();
  console.log(`✅ Checklist criado: ${checklist.name}\n`);

  // 6. Criar evento
  console.log('📅 Criando evento de teste...');
  const event = await createEvent(coordinator.id, checklist.id);
  console.log(`✅ Evento criado: ${event.name}\n`);

  // 7. Adicionar avaliadores ao evento
  console.log('🔗 Vinculando avaliadores ao evento...');
  const eventEvaluators = await addEvaluatorsToEvent(event.id, evaluators);
  console.log(`✅ ${eventEvaluators.length} avaliadores vinculados\n`);

  // 8. Criar artigos com versões
  console.log('📝 Criando artigos...');
  const articles = await createArticles(event.id, students);
  console.log(`✅ ${articles.length} artigos criados\n`);

  // 9. Atribuir avaliadores a artigos
  console.log('📎 Atribuindo avaliadores aos artigos...');
  const assignments = await assignEvaluatorsToArticles(articles, eventEvaluators);
  console.log(`✅ ${assignments.length} atribuições criadas\n`);

  // 10. Criar avaliações
  console.log('⭐ Criando avaliações...');
  const evaluations = await createEvaluations(articles, evaluators, checklist);
  console.log(`✅ ${evaluations.length} avaliações criadas\n`);

  console.log('✨ Seed concluído com sucesso!');
  console.log('\n📊 Resumo:');
  console.log(`   • Coordenador: ${coordinator.email} / senha: Teste123!`);
  console.log(`   • Avaliadores: ${evaluators.map(e => e.email).join(', ')}`);
  console.log(`   • Estudantes: ${students.map(s => s.email).join(', ')}`);
  console.log(`   • Evento: ${event.name}`);
  console.log(`   • Artigos: ${articles.length}`);
  console.log(`   • Avaliações: ${evaluations.length}`);
}

async function createUsers() {
  const passwordHash = await bcrypt.hash('Teste123!', 12);

  const users = [
    // Coordenador
    {
      name: 'Coordenador Teste',
      email: 'coord@teste.com',
      password: passwordHash,
      role: RoleType.COORDINATOR,
      isActive: true,
      isFromBpk: true,
      isFirstLogin: false,
    },
    // Avaliadores
    {
      name: 'Dr. Maria Silva',
      email: 'avaliador1@teste.com',
      password: passwordHash,
      role: RoleType.EVALUATOR,
      isActive: true,
      isFromBpk: true,
      isFirstLogin: false,
    },
    {
      name: 'Prof. João Santos',
      email: 'avaliador2@teste.com',
      password: passwordHash,
      role: RoleType.EVALUATOR,
      isActive: true,
      isFromBpk: false,
      isFirstLogin: false,
    },
    // Estudantes
    {
      name: 'Ana Paula Oliveira',
      email: 'aluno1@teste.com',
      password: passwordHash,
      role: RoleType.STUDENT,
      isActive: true,
      isFromBpk: true,
      isFirstLogin: false,
    },
    {
      name: 'Pedro Henrique Costa',
      email: 'aluno2@teste.com',
      password: passwordHash,
      role: RoleType.STUDENT,
      isActive: true,
      isFromBpk: true,
      isFirstLogin: false,
    },
    {
      name: 'Juliana Martins',
      email: 'aluno3@teste.com',
      password: passwordHash,
      role: RoleType.STUDENT,
      isActive: true,
      isFromBpk: false,
      isFirstLogin: false,
    },
  ];

  const createdUsers = [];
  for (const userData of users) {
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {},
      create: userData,
    });
    createdUsers.push(user);
  }

  return createdUsers;
}

async function createCoordinator() {
  return prisma.user.findUnique({
    where: { email: 'coord@teste.com' },
  }) as Promise<any>;
}

async function createEvaluators() {
  return prisma.user.findMany({
    where: { role: RoleType.EVALUATOR },
  });
}

async function createStudents() {
  return prisma.user.findMany({
    where: { role: RoleType.STUDENT },
  });
}

async function createChecklist() {
  const checklistData = {
    name: 'Checklist Padrão - Evento de Teste',
    description: 'Checklist para avaliação de artigos científicos',
    isActive: true,
    questions: {
      create: [
        {
          description: 'O trabalho possui introdução clara e objetiva?',
          type: QuestionType.YES_NO,
          isRequired: true,
          order: 1,
          isActive: true,
        },
        {
          description: 'A metodologia está adequadamente descrita?',
          type: QuestionType.YES_NO,
          isRequired: true,
          order: 2,
          isActive: true,
        },
        {
          description: 'Os resultados são apresentados de forma clara?',
          type: QuestionType.YES_NO,
          isRequired: true,
          order: 3,
          isActive: true,
        },
        {
          description: 'Avalie a qualidade da redação (1-5)',
          type: QuestionType.SCALE,
          isRequired: true,
          order: 4,
          isActive: true,
        },
        {
          description: 'Avalie a relevância do tema (1-5)',
          type: QuestionType.SCALE,
          isRequired: true,
          order: 5,
          isActive: true,
        },
        {
          description: 'Comentários adicionais',
          type: QuestionType.TEXT,
          isRequired: false,
          order: 6,
          isActive: true,
        },
      ],
    },
  };

  return prisma.checklist.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: checklistData,
    include: { questions: true },
  });
}

async function createEvent(coordinatorId: string, checklistId: string) {
  const now = new Date();
  const future = new Date(now);
  future.setMonth(future.getMonth() + 3);

  const eventData = {
    name: 'VII Congresso de Iniciação Científica - 2025',
    description: 'Evento anual de divulgação científica para estudantes de graduação',
    eventStartDate: future,
    eventEndDate: new Date(future.getTime() + 3 * 24 * 60 * 60 * 1000), // +3 dias
    submissionStartDate: now,
    submissionEndDate: new Date(future.getTime() - 30 * 24 * 60 * 60 * 1000), // -30 dias
    feedbackReleaseDate: new Date(future.getTime() - 7 * 24 * 60 * 60 * 1000), // -7 dias
    evaluationDeadline: new Date(future.getTime() - 14 * 24 * 60 * 60 * 1000), // -14 dias
    status: EventStatus.SUBMISSIONS_OPEN,
    evaluationType: EvaluationType.PAIR,
    isActive: true,
    checklistId: checklistId,
  };

  return prisma.event.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: eventData,
  });
}

async function addEvaluatorsToEvent(eventId: string, evaluators: any[]) {
  const assignments = [];

  for (const evaluator of evaluators) {
    const assignment = await prisma.eventEvaluator.upsert({
      where: {
        eventId_userId: {
          eventId,
          userId: evaluator.id,
        },
      },
      update: {},
      create: {
        eventId,
        userId: evaluator.id,
        isActive: true,
      },
    });
    assignments.push(assignment);
  }

  return assignments;
}

async function createArticles(eventId: string, students: any[]) {
  const articlesData = [
    {
      title: 'Impacto da Inteligência Artificial na Educação Superior',
      summary: 'Este trabalho investiga como as ferramentas de IA estão transformando o processo de ensino-aprendizagem nas universidades, analisando benefícios e desafios.',
      thematicArea: 'Educação e Tecnologia',
      keywords: ['Inteligência Artificial', 'Educação', 'Tecnologia Educacional'],
      relatedAuthors: ['Prof. Carlos Mendes', 'Dra. Fernanda Lima'],
      studentIndex: 0,
      status: ArticleStatus.IN_EVALUATION,
    },
    {
      title: 'Sustentabilidade na Indústria Farmacêutica: Um Estudo de Caso',
      summary: 'Análise das práticas sustentáveis adotadas por indústrias farmacêuticas brasileiras e seu impacto ambiental e econômico.',
      thematicArea: 'Sustentabilidade e Meio Ambiente',
      keywords: ['Sustentabilidade', 'Indústria Farmacêutica', 'ESG'],
      relatedAuthors: ['Dr. Roberto Almeida'],
      studentIndex: 1,
      status: ArticleStatus.TO_CORRECTION,
    },
    {
      title: 'Desenvolvimento de Aplicativo para Gestão de Saúde Mental',
      summary: 'Protótipo de aplicativo móvel voltado para acompanhamento de saúde mental de estudantes universitários.',
      thematicArea: 'Saúde e Tecnologia',
      keywords: ['Saúde Mental', 'Aplicativos', 'Bem-estar'],
      relatedAuthors: ['Psic. Amanda Souza', 'Dev. Lucas Pereira'],
      studentIndex: 2,
      status: ArticleStatus.SUBMITTED,
    },
  ];

  const createdArticles = [];

  for (const articleData of articlesData) {
    const student = students[articleData.studentIndex];

    // Criar artigo
    const article = await prisma.article.create({
      data: {
        title: articleData.title,
        summary: articleData.summary,
        thematicArea: articleData.thematicArea,
        status: articleData.status,
        eventId: eventId,
        userId: student.id,
        isActive: true,
        keywords: {
          create: articleData.keywords.map(name => ({ name })),
        },
        relatedAuthors: {
          create: articleData.relatedAuthors.map(coAuthorName => ({ coAuthorName })),
        },
        versions: {
          create: {
            version: 1,
            pdfPath: `http://localhost:9000/sara-pdfs/${articleData.title.toLowerCase().replace(/\s+/g, '-')}.pdf`,
          },
        },
      },
      include: {
        keywords: true,
        relatedAuthors: true,
        versions: true,
      },
    });

    createdArticles.push(article);
  }

  return createdArticles;
}

async function assignEvaluatorsToArticles(articles: any[], eventEvaluators: any[]) {
  const assignments = [];

  // Artigo 1 (IN_EVALUATION) - atribuir 2 avaliadores
  if (articles[0]) {
    for (let i = 0; i < Math.min(2, eventEvaluators.length); i++) {
      const assignment = await prisma.articleEvaluatorAssignment.create({
        data: {
          eventEvaluatorId: eventEvaluators[i].id,
          articleId: articles[0].id,
          userId: eventEvaluators[i].userId,
          isCorrected: i === 0, // Primeiro já avaliou
        },
      });
      assignments.push(assignment);
    }
  }

  // Artigo 2 (TO_CORRECTION) - já foi avaliado antes
  if (articles[1] && eventEvaluators[0]) {
    const assignment = await prisma.articleEvaluatorAssignment.create({
      data: {
        eventEvaluatorId: eventEvaluators[0].id,
        articleId: articles[1].id,
        userId: eventEvaluators[0].userId,
        isCorrected: true,
      },
    });
    assignments.push(assignment);
  }

  // Artigo 3 (SUBMITTED) - sem avaliadores ainda
  // (para testar atribuição manual)

  return assignments;
}

async function createEvaluations(articles: any[], evaluators: any[], checklist: any) {
  const evaluations = [];

  // Artigo 1 - Avaliação completa do primeiro avaliador
  if (articles[0] && evaluators[0] && articles[0].versions[0]) {
    const evaluation = await prisma.evaluation.create({
      data: {
        grade: 85, // 8.5/10
        evaluationDescription: 'Excelente trabalho! A metodologia está bem estruturada e os resultados são promissores. Sugiro apenas ajustar a seção de conclusão para destacar mais as contribuições práticas.',
        status: EvaluationStatus.APPROVED,
        evaluationDate: new Date(),
        userId: evaluators[0].id,
        articleVersionId: articles[0].versions[0].id,
        questionResponses: {
          create: checklist.questions.map((question: any, index: number) => ({
            questionId: question.id,
            userId: evaluators[0].id,
            articleVersionId: articles[0].versions[0].id,
            booleanResponse: question.type === 'YES_NO' ? true : null,
            scaleResponse: question.type === 'SCALE' 
              ? (index === 3 ? 4 : 5) // Qualidade: 4, Relevância: 5
              : null,
            textResponse: question.type === 'TEXT' 
              ? 'Parabéns pela qualidade do trabalho!' 
              : null,
          })),
        },
      },
    });
    evaluations.push(evaluation);

    // Atualizar contador de avaliações do artigo
    await prisma.article.update({
      where: { id: articles[0].id },
      data: { evaluationsDone: { increment: 1 } },
    });
  }

  // Artigo 2 - Avaliação que pediu correção
  if (articles[1] && evaluators[0] && articles[1].versions[0]) {
    const evaluation = await prisma.evaluation.create({
      data: {
        grade: 60, // 6.0/10
        evaluationDescription: 'O trabalho apresenta uma boa ideia, mas precisa de ajustes significativos na metodologia. Recomendo revisar a revisão bibliográfica e incluir mais referências recentes.',
        status: EvaluationStatus.TO_CORRECTION,
        evaluationDate: new Date(),
        userId: evaluators[0].id,
        articleVersionId: articles[1].versions[0].id,
        questionResponses: {
          create: checklist.questions.map((question: any, index: number) => ({
            questionId: question.id,
            userId: evaluators[0].id,
            articleVersionId: articles[1].versions[0].id,
            booleanResponse: question.type === 'YES_NO' 
              ? (index === 0 || index === 2) // Introdução e Resultados OK
              : null,
            scaleResponse: question.type === 'SCALE' 
              ? (index === 3 ? 3 : 4)
              : null,
            textResponse: question.type === 'TEXT' 
              ? 'Necessita melhorar a fundamentação teórica.' 
              : null,
          })),
        },
      },
    });
    evaluations.push(evaluation);

    // Atualizar contador de avaliações do artigo
    await prisma.article.update({
      where: { id: articles[1].id },
      data: { evaluationsDone: { increment: 1 } },
    });
  }

  return evaluations;
}

async function cleanDatabase() {
  console.log('🧹 Limpando dados existentes...');
  
  // Ordem importa devido às foreign keys
  await prisma.questionResponse.deleteMany({});
  await prisma.evaluation.deleteMany({});
  await prisma.articleEvaluatorAssignment.deleteMany({});
  await prisma.articleVersion.deleteMany({});
  await prisma.articleKeyword.deleteMany({});
  await prisma.relatedAuthor.deleteMany({});
  await prisma.article.deleteMany({});
  await prisma.eventEvaluator.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.question.deleteMany({});
  await prisma.checklist.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('✅ Banco limpo\n');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
