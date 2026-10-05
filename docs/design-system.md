# Design system de AgroGarantías

**Lenguaje visual**

- Paneles blancos sobre un fondo cálido muy claro.
- Verde bosque para acciones y estados positivos; salvia, oliva y crema como acentos.
- Gris cálido para el texto y los bordes.
- Radios generosos, bordes casi invisibles y sombras muy suaves.
- Una sola familia de íconos lineales.

Toda la UI está en español.

## Dónde vive

| Pieza | Archivo |
|---|---|
| Tokens (colores, tipografía, espaciado, radios, bordes, sombras, íconos, controles, cards) | `apps/web/src/app/globals.css` |
| Paleta para JS (mapas, canvas del escáner, `theme-color`) | `apps/web/src/lib/design/tokens.ts` (espeja `globals.css`) |
| Íconos (Lucide, trazo 1.75) | `apps/web/src/components/ui/Icon.tsx` |
| Botones, badges, cards, inputs, tabs, tablas, modales, métricas, callouts, empty states, skeletons | `apps/web/src/components/ui/*` |
| Movimientos (ícono por tipo) | `apps/web/src/components/domain/MovementKind.tsx` |

**Regla:** los componentes usan solo tokens.

- Nunca escriben un HEX directo, un radio arbitrario ni una sombra propia.
- Las pantallas nunca importan Lucide directamente: usan `<Icon name=… size="xs|sm|md|lg|xl" />`.

## Paleta

| Rol | Token | Valor |
|---|---|---|
| Primario (verde bosque) | `--color-primary` / `-hover` / `-soft` | `#2a5239` / `#21412f` / `#e9f0e1` |
| Secundario (verde medio) | `--color-secondary` | `#3a6b4a` |
| Acento (oliva) y chip lima | `--color-accent` / `--color-accent-soft` | `#858f52` / `#eef2d6` |
| Crema | `--color-cream` | `#f6f1e4` |
| Fondo de página (gris cálido) | `--color-background` | `#f6f5f1` |
| Superficie / superficie suave | `--color-surface` / `--color-surface-muted` | `#ffffff` / `#faf8f2` |
| Bordes | `--color-border-subtle` / `--color-border` / `--color-border-strong` | `#efede7` / `#e6e3dc` / `#d6d2c8` |
| Texto (carbón) / secundario / tenue | `--color-text` / `--color-text-secondary` / `--color-text-muted` | `#262622` / `#5f5b53` / `#7e796f` |
| Éxito | `--color-success` (+ `-soft`, `-text`, `-border`) | `#3f7f55` |
| Advertencia (ocre) | `--color-warning` (+ …) | `#cf9a2a` |
| Peligro (arcilla) | `--color-danger` (+ …) | `#b4443a` |
| Informativo (salvia grisáceo) | `--color-info` (+ …) | `#6f8a82` |
| Tooltips y overlays sobre imagen | `--color-inverse` | `#1b3527` |

**Cómo se eligieron los estados**

- Éxito, advertencia y peligro se validaron como conjunto con el validador de paletas: separación con daltonismo ΔE ≥ 14,9 y visión normal ΔE ≥ 22.
- La advertencia tiene contraste bajo sobre blanco, así que siempre va con texto e ícono, nunca como único indicador.
- No se usan azul corporativo, violeta, cian, gradientes llamativos ni neón.

## Tipografía

- Fuente: Inter (variable, autoalojada con `@fontsource-variable/inter`, sin CDN).
- Escala (`font` shorthand):

| Token | Uso |
|---|---|
| `--type-display` (34/600) | Número héroe (score del panel) |
| `--type-h1` (22/600) | Título de página |
| `--type-h2` (16/600) | Título de card y modal |
| `--type-h3` (14/600) | Subtítulos, empty states |
| `--type-body` (14/400) | Texto |
| `--type-body-sm` (13/400) | Texto secundario |
| `--type-caption` (12/400) | Ayudas, metadatos |
| `--type-label` (12/500) | Labels de métricas y formularios |
| `--type-numeric` (28/600, tabular) | Métricas |

- Sin títulos gigantes ni mayúsculas permanentes. La única excepción son las etiquetas de sección del sidebar (CARTERA, EVIDENCIA, ORGANIZACIÓN).

## Radios, bordes y sombras

- Radios:
  - `--radius-xs` 6;
  - `--radius-sm` 8 (inputs);
  - `--radius-md` 12 (callouts, items);
  - `--radius-lg` 16 (cards);
  - `--radius-xl` 20 (modales, paneles del login);
  - `--radius-pill` (botones, badges, tabs).
- Bordes:
  - `--border-hairline` (1 px `--color-border-subtle`) para cards y divisores;
  - `--color-border` para inputs.
- Sombras:
  - `--shadow-sm` (cards);
  - `--shadow-md`;
  - `--shadow-lg` (modales, drawer del menú, tooltips).
- Foco: `--focus-ring` verde.

## Componentes

- **Botones.**
  - `primary`: verde bosque con texto blanco.
  - `secondary`: blanco con borde sutil.
  - `ghost`: terciario, sin borde, texto verde.
  - `danger`: solo cuando hace falta.
  - Todos en forma de píldora; tamaños `sm` (32), `md` (38) y `lg` (46). Un botón con solo ícono es circular.
- **Badges.** Píldora de 24 px, fondo muy suave, texto oscuro, punto o ícono chico. Tonos: `success`, `warning`, `critical`, `info`, `neutral`, `outline`.
- **Cards.** `Panel` (MEDIUM, padding 20) y `Stat` (métrica editorial: label chico, número grande, unidad tenue como "35 /100", contexto). Las cards chicas y grandes usan `--card-padding-sm` y `--card-padding-lg`.
- **Inputs.**
  - Altura 38 y fondo crema muy suave; pasan a blanco con anillo verde al enfocar.
  - El placeholder es gris cálido.
  - El `select` lleva una flecha propia.
  - La búsqueda tiene forma de píldora.
- **Tabs.** Texto mediano e indicador verde redondeado bajo la activa. Se desplazan horizontalmente con un fundido que indica que hay más.
- **Tablas.** Encabezado suave sin mayúsculas, filas espaciosas, divisores casi invisibles y hover verde muy tenue.
- **Callouts.** Tarjeta limpia con el ícono en un círculo del tono y título coloreado. No son cajas de color gigantes.
- **Estados vacíos y carga.**
  - Empty state: ícono lineal en un círculo verde suave, texto corto y una acción.
  - Carga: esqueletos, no spinners.
- **Movimientos.** Ícono por tipo:
  - ingreso;
  - egreso;
  - traslado;
  - venta/faena;
  - muerte.

  Cada uno va en un círculo del tono, con la dirección y el motivo al lado.
- **Escáner.**
  - Mantiene el fondo oscuro, porque es una pantalla de cámara.
  - Usa los tokens `--color-camera-*` (misma familia verde), la tipografía, los íconos y los botones píldora del sistema.
  - El overlay del video usa `SCANNER_OVERLAY` de `tokens.ts`.
