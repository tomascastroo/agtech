import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import styles from './button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Common {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  block?: boolean;
  children?: ReactNode;
}

const classes = ({ variant = 'secondary', size = 'md', block }: Common, extra?: string) =>
  [
    styles.button,
    styles[variant],
    size !== 'md' ? styles[size] : '',
    block ? styles.block : '',
    extra ?? '',
  ]
    .filter(Boolean)
    .join(' ');

export function Button({
  variant,
  size,
  icon,
  block,
  loading,
  children,
  className,
  disabled,
  type = 'button',
  ...rest
}: Common & ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      type={type}
      className={classes({ variant, size, block }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span className={styles.spinner} aria-hidden />
      ) : icon ? (
        <Icon name={icon} size={16} />
      ) : null}
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant,
  size,
  icon,
  block,
  children,
  external,
}: Common & { href: string; external?: boolean }) {
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={classes({ variant, size, block })}
      >
        {icon ? <Icon name={icon} size={16} /> : null}
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes({ variant, size, block })}>
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </Link>
  );
}
