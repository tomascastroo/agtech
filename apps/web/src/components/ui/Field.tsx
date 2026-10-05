import {
  useId,
  type ComponentProps,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Icon } from './Icon';
import styles from './field.module.css';

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: (props: {
    id: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
  }) => ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {required ? (
          <span className={styles.required} aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {error ? (
        <span className={styles.error} id={`${id}-error`} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className={styles.hint} id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export const Input = (props: ComponentProps<'input'>) => (
  <input {...props} className={styles.control} />
);

export const Select = ({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} className={styles.control}>
    {children}
  </select>
);

export const Textarea = (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...props} className={styles.control} />
);

export function Checkbox({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={styles.checkbox}>
      <input type="checkbox" {...props} />
      {label}
    </label>
  );
}

export function SearchInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={styles.search}>
      <Icon name="search" size="sm" />
      <input type="search" {...props} className={styles.control} />
    </div>
  );
}

export function FormRow({ columns = 2, children }: { columns?: 1 | 2 | 3; children: ReactNode }) {
  return (
    <div
      className={`${styles.row} ${columns === 2 ? styles.row2 : columns === 3 ? styles.row3 : ''}`}
    >
      {children}
    </div>
  );
}
