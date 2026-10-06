'use client';

import styles from './tabs.module.css';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export function Tabs({
  items,
  active,
  onChange,
  variant = 'underline',
}: {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
  /** `pills`: para muchas secciones; se acomodan en varias filas en vez de desplazarse. */
  variant?: 'underline' | 'pills';
}) {
  return (
    <div className={`${styles.tabs} ${variant === 'pills' ? styles.pills : ''}`} role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          role="tab"
          type="button"
          aria-selected={item.id === active}
          className={`${styles.tab} ${item.id === active ? styles.active : ''}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
          {item.count !== undefined ? <span className={styles.count}>{item.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
