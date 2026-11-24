# Proteção de dados (LGPD) — EduVínculo

O sistema trata dados pessoais de crianças e adolescentes. Princípios aplicados (LGPD, arts. 6º e 14):
finalidade, necessidade (minimização), segurança, prevenção, transparência e melhor interesse.

## Inventário de dados

| Dado | Titular | Finalidade | Base / observação | Quem acessa |
|---|---|---|---|---|
| Nome, e-mail, telefone (opcional) | usuário do app | Autenticação e contato | Execução do serviço educacional | o próprio usuário; gestão da escola |
| Nome, matrícula, turma | estudante | Identificação na chamada | Obrigação legal/regulatória da escola | coordenação; professores da turma; responsáveis legais; o próprio estudante |
| Data de nascimento (opcional) | estudante | Identificação em homônimos | Opcional | coordenação |
| Registros de frequência (status, data, autor) | estudante | Acompanhamento da frequência | Obrigação legal da escola | mesmos acima (famílias só veem chamadas concluídas) |
| Acompanhamento pedagógico | estudante | Ação preventiva da equipe | Melhor interesse da criança | **somente** coordenação/direção |
| Observações de professores | estudante | Registro pedagógico | — | autor + coordenação |
| Notificações, leitura e ciência | usuário | Comunicação escola-família | — | destinatário; coordenação (envios) |
| Token de push | usuário | Entrega de avisos | Consentimento (permissão do sistema) | apenas o servidor |
| Auditoria (autor, ação, campos) | usuários | Segurança e responsabilização | Legítimo interesse/segurança | coordenação (escola) e administração da plataforma |

**Não coletados:** CPF, endereço do estudante, fotos, localização, contatos, dados de saúde, dados biométricos.

## Medidas técnicas

* RLS em todas as tabelas; nenhuma tabela acessível sem login; isolamento por escola testado.
* Administração da plataforma **não** acessa dados de estudantes (apenas contagens).
* Senhas: hash pelo Supabase Auth; nunca armazenadas ou registradas pelo app.
* Sessão no armazenamento seguro do sistema (Keychain/Keystore).
* Chave administrativa (service role) somente em Edge Functions, nunca no app.
* Convites: apenas o hash SHA-256 do código é armazenado; validade e número de usos limitados.
* Notificações na tela bloqueada com texto genérico; detalhes somente dentro do app.
* Auditoria registra **quais campos** mudaram, sem copiar os valores.
* Logout apaga os dados escolares do aparelho (alerta se houver chamadas não sincronizadas).
* Sem inteligência artificial para decisões escolares; alertas descrevem fatos e exigem avaliação humana.
* Desativação de contas/cadastros sem exclusão física dos registros escolares obrigatórios.

## Retenção

| Dado | Prazo | Mecanismo |
|---|---|---|
| Operações de sincronização processadas | 30 dias | `purge_expired_data()` |
| Notificações e entregas | 1 ano | `purge_expired_data()` |
| Auditoria | 5 anos | `purge_expired_data()` |
| Frequência, matrículas, cadastros | conforme legislação educacional e política da escola | não removidos automaticamente; desativação lógica |
| Cache no aparelho | histórico de 60 dias; listas não abertas há 30 dias; respostas 7 dias | `pruneCache()`; apagado no logout |

## Direitos dos titulares

Solicitações de acesso, correção e desativação são feitas à escola (controladora), que usa as
telas de gestão. A Política de Privacidade está disponível no app (Cadastro e Mais › Política de privacidade).
