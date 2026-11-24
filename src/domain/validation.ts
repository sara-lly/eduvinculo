/** Esquemas de validação de formulários (Zod). Mensagens em português. */
import { z } from 'zod';

const email = z.string().trim().toLowerCase().min(1, 'Informe o e-mail.').email('E-mail inválido.');

export const passwordSchema = z
  .string()
  .min(8, 'A senha deve ter pelo menos 8 caracteres.')
  .max(72, 'A senha deve ter no máximo 72 caracteres.')
  .regex(/[A-Za-z]/, 'A senha deve conter letras.')
  .regex(/[0-9]/, 'A senha deve conter números.');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Informe a senha.'),
});
export type LoginForm = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(3, 'Informe seu nome completo.').max(160, 'Nome muito longo.'),
    email,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptPrivacy: z.boolean().refine((v) => v, 'É necessário aceitar a Política de Privacidade.'),
  })
  .refine((v) => v.password === v.confirmPassword, { message: 'As senhas não conferem.', path: ['confirmPassword'] });
export type RegisterForm = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    email,
    code: z.string().trim().regex(/^[0-9]{6,8}$/, 'Informe o código numérico recebido por e-mail.'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { message: 'As senhas não conferem.', path: ['confirmPassword'] });
export type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { message: 'As senhas não conferem.', path: ['confirmPassword'] });
export type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

export const inviteCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => v.replace(/[^A-Z0-9]/g, '').length >= 8, 'Código inválido. Confira com a escola.'),
});
export type InviteCodeForm = z.infer<typeof inviteCodeSchema>;

export const profileSchema = z.object({
  fullName: z.string().trim().min(3, 'Informe seu nome completo.').max(160),
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((v) => v === '' || /^[0-9()+\-\s]{8,30}$/.test(v), 'Telefone inválido.'),
});
export type ProfileForm = z.infer<typeof profileSchema>;

const optionalText = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres.`);

export const classroomSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome da turma.').max(80),
  grade: optionalText(40),
  shift: z.enum(['morning', 'afternoon', 'evening', 'full']),
  schoolYear: z.coerce.number().int().min(2000, 'Ano inválido.').max(2100, 'Ano inválido.'),
});
export type ClassroomForm = z.infer<typeof classroomSchema>;

export const studentSchema = z.object({
  fullName: z.string().trim().min(3, 'Informe o nome completo.').max(160),
  registrationCode: z.string().trim().min(1, 'Informe a matrícula.').max(40),
  birthDate: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{2}\/\d{2}\/\d{4}$/.test(v), 'Use o formato DD/MM/AAAA.'),
  classroomId: z.string().uuid('Selecione a turma.').or(z.literal('')),
});
export type StudentForm = z.infer<typeof studentSchema>;

export const guardianSchema = z.object({
  fullName: z.string().trim().min(3, 'Informe o nome completo.').max(160),
  email: z.string().trim().toLowerCase().max(160).refine((v) => v === '' || z.string().email().safeParse(v).success, 'E-mail inválido.'),
  phone: z.string().trim().max(30),
  relationship: z.string().trim().min(2, 'Informe o parentesco.').max(40),
  studentId: z.string().uuid('Selecione o estudante.'),
});
export type GuardianForm = z.infer<typeof guardianSchema>;

export const announcementSchema = z
  .object({
    title: z.string().trim().min(3, 'Informe o título.').max(120),
    body: z.string().trim().min(3, 'Escreva a mensagem.').max(4000),
    audience: z.enum(['all', 'guardians', 'students', 'teachers', 'classroom']),
    classroomId: z.string(),
    requiresAck: z.boolean(),
  })
  .refine((v) => v.audience !== 'classroom' || v.classroomId.length > 0, {
    message: 'Selecione a turma.',
    path: ['classroomId'],
  });
export type AnnouncementForm = z.infer<typeof announcementSchema>;

export const followupSchema = z
  .object({
    studentId: z.string().uuid('Selecione o estudante.'),
    reason: z.string().trim().min(3, 'Informe o motivo.').max(500),
    situation: optionalText(2000),
    actionsTaken: optionalText(4000),
    nextFollowupDate: z
      .string()
      .trim()
      .refine((v) => v === '' || /^\d{2}\/\d{2}\/\d{4}$/.test(v), 'Use o formato DD/MM/AAAA.'),
    status: z.enum(['open', 'in_progress', 'closed']),
    outcome: optionalText(2000),
  })
  .refine((v) => v.status !== 'closed' || v.outcome.length >= 3, {
    message: 'Descreva o resultado para encerrar o acompanhamento.',
    path: ['outcome'],
  });
export type FollowupForm = z.infer<typeof followupSchema>;

export const rulesSchema = z.object({
  minAttendancePercent: z.coerce.number().min(0, 'Entre 0 e 100.').max(100, 'Entre 0 e 100.'),
  consecutiveAbsencesThreshold: z.coerce.number().int().min(1).max(60),
  weeklyAbsencesThreshold: z.coerce.number().int().min(1).max(30),
  periodDays: z.coerce.number().int().min(7, 'Mínimo de 7 dias.').max(366),
  periodAbsencesThreshold: z.coerce.number().int().min(1).max(200),
  minRecordsForPercent: z.coerce.number().int().min(1).max(200),
  teacherEditWindowDays: z.coerce.number().int().min(0).max(60),
  lateCountsAsPresent: z.boolean(),
  justifiedCountsAsPresent: z.boolean(),
  notifyGuardiansOnAbsence: z.boolean(),
  notifyGuardiansOnAlert: z.boolean(),
});
export type RulesForm = z.infer<typeof rulesSchema>;

export const schoolSchema = z.object({
  name: z.string().trim().min(3, 'Informe o nome da escola.').max(160),
  city: z.string().trim().min(2, 'Informe a cidade.').max(80),
  state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'UF com 2 letras.'),
  inepCode: z.string().trim().refine((v) => v === '' || /^[0-9]{8}$/.test(v), 'Código INEP com 8 dígitos.'),
});
export type SchoolForm = z.infer<typeof schoolSchema>;

/** DD/MM/AAAA -> AAAA-MM-DD (ou null se vazio/ inválido). */
export function brDateToIso(value: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (date.getUTCDate() !== Number(d) || date.getUTCMonth() !== Number(mo) - 1) return null;
  return `${y}-${mo}-${d}`;
}
