import type { Metadata } from 'next';
import { Icon } from '@/components/ui/Icon';
import { LoginForm } from './LoginForm';
import styles from './login.module.css';

export const metadata: Metadata = { title: 'Iniciar sesión' };
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const showDemo = process.env.SHOW_DEMO_CREDENTIALS !== 'false';
  return (
    <div className={styles.page}>
      <section className={styles.brandPanel} aria-label="AgroGarantías">
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            <Icon name="leaf" size={18} />
          </span>
          AGROGARANTÍAS
        </div>
        <div className={styles.statement}>
          <h1>Verificación remota y recurrente de activos agropecuarios en garantía.</h1>
          <p>
            Imágenes satelitales, cámaras en campo y visión computacional para conocer en todo
            momento el estado de cada garantía, con evidencia trazable.
          </p>
        </div>
        <div className={styles.facts}>
          <div className={styles.fact}>
            <strong>Evidencia trazable</strong>
            <span>Cada resultado vinculado a su imagen, fuente y modelo.</span>
          </div>
          <div className={styles.fact}>
            <strong>Score explicable</strong>
            <span>Componentes, pesos y versión auditables.</span>
          </div>
          <div className={styles.fact}>
            <strong>Monitoreo continuo</strong>
            <span>Alertas ante cambios en la garantía.</span>
          </div>
        </div>
        <svg
          className={styles.contour}
          viewBox="0 0 400 400"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.2"
          aria-hidden
        >
          {Array.from({ length: 9 }, (_, i) => (
            <path
              key={i}
              d={`M${20 + i * 8} ${200 + i * 6} C ${120 + i * 10} ${60 + i * 14}, ${260 - i * 6} ${80 + i * 12}, ${380 - i * 10} ${190 + i * 8}`}
            />
          ))}
        </svg>
      </section>
      <section className={styles.formPanel}>
        <LoginForm showDemo={showDemo} />
      </section>
    </div>
  );
}
