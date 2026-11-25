/** Testes de interface (React Native Testing Library). */
import { zodResolver } from '@hookform/resolvers/zod';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';
import { loginSchema, type LoginForm } from '@/domain/validation';
import { AttendanceRow } from './attendance';
import { FormTextField } from './forms';
import { Button } from './primitives';
import { ErrorState, SyncPill } from './states';
import { AppError } from '@/core/errors';

describe('AttendanceRow', () => {
  it('marca o status do estudante com rótulos acessíveis', async () => {
    const onChange = jest.fn();
    await render(<AttendanceRow studentId="s1" name="Ana Teste" registrationCode="M-1" index={0} status={undefined} onChange={onChange} />);
    await fireEvent.press(screen.getByLabelText('Ausente para Ana Teste'));
    expect(onChange).toHaveBeenCalledWith('s1', 'absent');
    await fireEvent.press(screen.getByLabelText('Falta justificada para Ana Teste'));
    expect(onChange).toHaveBeenLastCalledWith('s1', 'justified');
  });

  it('indica o status selecionado e respeita o modo desabilitado', async () => {
    const onChange = jest.fn();
    await render(<AttendanceRow studentId="s1" name="Ana Teste" registrationCode="M-1" index={2} status="late" disabled onChange={onChange} />);
    expect(screen.getByText('3. Ana Teste')).toBeTruthy();
    expect(screen.getByLabelText('Atrasado para Ana Teste').props.accessibilityState).toMatchObject({ selected: true, disabled: true });
    await fireEvent.press(screen.getByLabelText('Presente para Ana Teste'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

function LoginHarness({ onValid }: { onValid: (v: LoginForm) => void }) {
  const { control, handleSubmit } = useForm<LoginForm>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  return (
    <>
      <FormTextField control={control} name="email" label="E-mail" />
      <FormTextField control={control} name="password" label="Senha" secureTextEntry />
      <Button title="Entrar" onPress={() => void handleSubmit(onValid)()} />
    </>
  );
}

describe('Formulário com validação', () => {
  it('mostra erros em português e só envia dados válidos', async () => {
    const onValid = jest.fn();
    await render(<LoginHarness onValid={onValid} />);
    await fireEvent.press(screen.getByLabelText('Entrar'));
    expect(await screen.findByText('Informe o e-mail.')).toBeTruthy();
    expect(screen.getByText('Informe a senha.')).toBeTruthy();
    expect(onValid).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('E-mail'), 'professora@presenca.demo');
    await fireEvent.changeText(screen.getByLabelText('Senha'), 'Demo@2026');
    await fireEvent.press(screen.getByLabelText('Entrar'));
    await waitFor(() => expect(onValid).toHaveBeenCalledWith({ email: 'professora@presenca.demo', password: 'Demo@2026' }, undefined));
  });
});

describe('Estados de sincronização e erro', () => {
  it('mostra pendências offline', async () => {
    await render(<SyncPill pending={3} running={false} offline />);
    expect(screen.getByText('3 pendente(s) — offline')).toBeTruthy();
  });

  it('erro de rede oferece nova tentativa', async () => {
    const retry = jest.fn();
    await render(<ErrorState error={new AppError('Sem conexão com o servidor.', 'network', true)} onRetry={retry} />);
    expect(screen.getByText('Sem conexão')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Tentar novamente'));
    expect(retry).toHaveBeenCalled();
  });

  it('botão em carregamento fica desabilitado (evita toques duplicados)', async () => {
    const onPress = jest.fn();
    await render(<Button title="Salvar" loading onPress={onPress} />);
    await fireEvent.press(screen.getByLabelText('Salvar'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
