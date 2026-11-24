import * as Linking from 'expo-linking';
import { toAppError } from '@/core/errors';
import type { Membership, Profile } from '@/domain/types';
import { assertBackendConfigured, rpc, supabase } from '../remote/supabase';

interface ContextRow {
  profile: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    is_platform_admin: boolean;
    active: boolean;
  } | null;
  memberships: {
    id: string;
    school_id: string;
    role: Membership['role'];
    school_name: string;
    school_city: string;
    school_state: string;
    school_status: Membership['schoolStatus'];
    school_timezone: string;
  }[];
}

export interface UserContext {
  profile: Profile;
  memberships: Membership[];
}

export const authRepository = {
  async signIn(email: string, password: string): Promise<void> {
    assertBackendConfigured();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw toAppError(error, 'Não foi possível entrar.');
  },

  /** Retorna true quando a conta precisa de confirmação por e-mail. */
  async signUp(fullName: string, email: string, password: string): Promise<{ needsConfirmation: boolean }> {
    assertBackendConfigured();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: Linking.createURL('/login') },
    });
    if (error) throw toAppError(error, 'Não foi possível criar a conta.');
    return { needsConfirmation: !data.session };
  },

  async signOut(): Promise<void> {
    await supabase.auth.signOut({ scope: 'local' });
  },

  /** Envia e-mail com código de recuperação (OTP). */
  async requestPasswordReset(email: string): Promise<void> {
    assertBackendConfigured();
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw toAppError(error, 'Não foi possível enviar o e-mail de recuperação.');
  },

  /** Valida o código recebido por e-mail e define a nova senha. */
  async resetPasswordWithCode(email: string, code: string, newPassword: string): Promise<void> {
    assertBackendConfigured();
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' });
    if (error) throw toAppError(error, 'Código inválido ou expirado.');
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) throw toAppError(updateError, 'Não foi possível alterar a senha.');
  },

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw toAppError(error, 'Não foi possível alterar a senha.');
  },

  async getContext(): Promise<UserContext> {
    const row = await rpc<ContextRow>('get_my_context');
    if (!row.profile) throw toAppError({ code: 'P0002', message: 'Perfil não encontrado.' });
    return {
      profile: {
        id: row.profile.id,
        fullName: row.profile.full_name,
        email: row.profile.email,
        phone: row.profile.phone,
        isPlatformAdmin: row.profile.is_platform_admin,
        active: row.profile.active,
      },
      memberships: row.memberships.map((m) => ({
        id: m.id,
        schoolId: m.school_id,
        role: m.role,
        schoolName: m.school_name,
        schoolCity: m.school_city,
        schoolState: m.school_state,
        schoolStatus: m.school_status,
        schoolTimezone: m.school_timezone,
      })),
    };
  },

  async redeemInvite(code: string): Promise<{ schoolName: string; role: Membership['role'] }> {
    const r = await rpc<{ school_name: string; role: Membership['role'] }>('redeem_invite', { p_code: code });
    return { schoolName: r.school_name, role: r.role };
  },

  async updateProfile(userId: string, fullName: string, phone: string): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName, phone: phone || null })
      .eq('id', userId);
    if (error) throw toAppError(error);
  },
};
