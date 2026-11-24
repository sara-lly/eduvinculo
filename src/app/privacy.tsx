import { Screen } from '@/ui/components/layout';
import { AppText } from '@/ui/components/primitives';
import { spacing } from '@/ui/theme';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Quem somos',
    body: 'O EduVínculo é uma plataforma de acompanhamento escolar que conecta escola, família e estudante. A escola é a controladora dos dados; a plataforma atua como operadora, tratando os dados somente conforme as instruções da escola (LGPD, Lei nº 13.709/2018).',
  },
  {
    title: 'Dados coletados e finalidades',
    body: '• Conta: nome, e-mail e telefone (opcional) — para autenticação e contato.\n• Estudante: nome, matrícula, data de nascimento (opcional), turma — para identificar o estudante na chamada.\n• Frequência: presença, ausência, atraso e falta justificada, com data e autor do registro — para acompanhamento da frequência.\n• Acompanhamento pedagógico: registros feitos pela coordenação — para apoio preventivo ao estudante.\n• Notificações: histórico de envio e leitura — para comunicação com as famílias.\n\nNão coletamos localização, contatos, fotos, CPF ou dados de saúde.',
  },
  {
    title: 'Crianças e adolescentes',
    body: 'Os dados de estudantes são tratados no seu melhor interesse (art. 14 da LGPD). O acesso é restrito: responsáveis veem somente os estudantes sob sua responsabilidade legal; professores, somente as turmas em que lecionam; registros pedagógicos são visíveis apenas à coordenação e à direção. O sistema não usa inteligência artificial para decisões escolares e não classifica estudantes automaticamente.',
  },
  {
    title: 'Segurança',
    body: 'Senhas são armazenadas pelo provedor de autenticação com hash (nunca em texto puro). A sessão fica no armazenamento seguro do aparelho. Todas as tabelas possuem regras de acesso no banco de dados (Row Level Security), e operações sensíveis são registradas em auditoria. Notificações na tela bloqueada não exibem nomes nem detalhes.',
  },
  {
    title: 'Retenção',
    body: 'Registros escolares (frequência e cadastro) são mantidos pelo período exigido pela legislação educacional e pela escola. Notificações são removidas após 1 ano; registros técnicos de sincronização, após 30 dias; registros de auditoria, após 5 anos. Dados guardados no aparelho são apagados ao sair da conta.',
  },
  {
    title: 'Seus direitos',
    body: 'Você pode solicitar acesso, correção ou desativação dos seus dados à secretaria da escola. A desativação de contas e cadastros preserva os registros escolares obrigatórios, que deixam de ser exibidos.',
  },
];

export default function PrivacyScreen() {
  return (
    <Screen edges={['bottom']}>
      {SECTIONS.map((s) => (
        <AppText key={s.title} style={{ marginBottom: spacing.lg }}>
          <AppText variant="subtitle">{`${s.title}\n`}</AppText>
          <AppText>{s.body}</AppText>
        </AppText>
      ))}
      <AppText variant="caption">Versão 1.0 — documento de demonstração do projeto acadêmico EduVínculo.</AppText>
    </Screen>
  );
}
