/** Campos de formulário integrados ao React Hook Form. */
import { forwardRef, type ComponentRef, type ReactNode } from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { Pressable, StyleSheet, Switch, TextInput, View, type TextInputProps } from 'react-native';
import { colors, fonts, MIN_TOUCH, radius, spacing } from '../theme';
import { AppText } from './primitives';

export interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
}

export const TextField = forwardRef<ComponentRef<typeof TextInput>, TextFieldProps>(function TextField({ label, error, hint, style, ...rest }, ref) {
  return (
    <View style={styles.field}>
      <AppText variant="label" nativeID={`${label}-label`}>{label}</AppText>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={colors.disabled}
        style={[styles.input, rest.multiline && styles.multiline, error ? styles.inputError : null, style]}
        {...rest}
      />
      {error ? (
        <AppText style={styles.error} accessibilityRole="alert">{error}</AppText>
      ) : hint ? (
        <AppText variant="caption">{hint}</AppText>
      ) : null}
    </View>
  );
});

export function FormTextField<T extends FieldValues>({ control, name, ...rest }: Omit<TextFieldProps, 'value' | 'onChangeText'> & {
  control: Control<T>; name: FieldPath<T>;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
        <TextField {...rest} value={value == null ? '' : String(value)} onChangeText={onChange} onBlur={onBlur} error={error?.message} />
      )}
    />
  );
}

export function SwitchField({ label, description, value, onValueChange, disabled }: {
  label: string; description?: string; value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <Pressable
      style={styles.switchRow}
      onPress={() => !disabled && onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
    >
      <View style={{ flex: 1 }}>
        <AppText variant="label">{label}</AppText>
        {description ? <AppText variant="caption">{description}</AppText> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} disabled={disabled}
        trackColor={{ true: colors.accent, false: colors.border }} thumbColor={value ? colors.primary : '#fff'} />
    </Pressable>
  );
}

export function FormSwitchField<T extends FieldValues>({ control, name, label, description }: {
  control: Control<T>; name: FieldPath<T>; label: string; description?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange } }) => (
        <SwitchField label={label} description={description} value={!!value} onValueChange={onChange} />
      )}
    />
  );
}

export interface Option<V extends string> {
  value: V;
  label: string;
}

/** Seleção por "chips" (sem dependências nativas extras). */
export function ChipSelect<V extends string>({ label, options, value, onChange, error }: {
  label?: string; options: Option<V>[]; value: V | ''; onChange: (v: V) => void; error?: string;
}) {
  return (
    <View style={styles.field}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <View style={styles.chips} accessibilityRole="radiogroup">
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={o.label}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <AppText style={{ color: selected ? colors.textOnPrimary : colors.primary, fontWeight: '600', fontSize: 14 }}>{o.label}</AppText>
            </Pressable>
          );
        })}
      </View>
      {error ? <AppText style={styles.error}>{error}</AppText> : null}
    </View>
  );
}

export function FormChipSelect<T extends FieldValues, V extends string>({ control, name, label, options }: {
  control: Control<T>; name: FieldPath<T>; label?: string; options: Option<V>[];
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <ChipSelect label={label} options={options} value={value as V} onChange={onChange} error={error?.message} />
      )}
    />
  );
}

export function FormSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      {title ? <AppText variant="subtitle" style={{ marginBottom: spacing.sm }}>{title}</AppText> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.md, gap: 6 },
  input: {
    minHeight: MIN_TOUCH + 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: colors.text,
  },
  multiline: { minHeight: 96, paddingTop: spacing.md, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: 13 },
  switchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.md, minHeight: MIN_TOUCH },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: 1.5, borderColor: colors.primaryLight, backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: 16,
    minHeight: 40, justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
});
