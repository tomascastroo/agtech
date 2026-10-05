import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Bell,
  Building2,
  CalendarClock,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Download,
  ExternalLink,
  File,
  FileText,
  Inbox,
  Info,
  Layers,
  LayoutGrid,
  Leaf,
  LogOut,
  Map,
  MapPin,
  Menu,
  Nfc,
  OctagonAlert,
  Plus,
  RefreshCw,
  Satellite,
  Scale,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  Truck,
  Upload,
  User,
  X,
  type LucideIcon,
} from 'lucide-react';

/**
 * Sistema de íconos: UNA sola familia (Lucide), trazo lineal de 1.75 px y escala fija.
 * Las pantallas nunca importan Lucide directamente: usan <Icon name=… />, así el trazo,
 * el tamaño y la accesibilidad son iguales en toda la aplicación.
 */
const ICONS = {
  dashboard: LayoutGrid,
  layers: Layers,
  shield: ShieldCheck,
  map: Map,
  bell: Bell,
  file: FileText,
  sliders: SlidersHorizontal,
  plus: Plus,
  upload: Upload,
  download: Download,
  camera: Camera,
  satellite: Satellite,
  check: Check,
  x: X,
  chevronRight: ChevronRight,
  chevronLeft: ChevronLeft,
  chevronDown: ChevronDown,
  search: Search,
  logout: LogOut,
  info: Info,
  warning: TriangleAlert,
  critical: OctagonAlert,
  pin: MapPin,
  refresh: RefreshCw,
  external: ExternalLink,
  leaf: Leaf,
  clock: Clock,
  building: Building2,
  user: User,
  rfid: Nfc,
  document: File,
  scale: Scale,
  menu: Menu,
  inbox: Inbox,
  calendar: CalendarClock,
  inspection: ClipboardCheck,
  movementIn: ArrowDownLeft,
  movementOut: ArrowUpRight,
  transfer: ArrowRightLeft,
  truck: Truck,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

/** Escala de íconos (px). Coincide con --icon-xs … --icon-xl de globals.css. */
export const ICON_SIZE = { xs: 14, sm: 16, md: 18, lg: 20, xl: 24 } as const;
export const ICON_STROKE = 1.75;

export function Icon({
  name,
  size = ICON_SIZE.md,
  className,
  title,
}: {
  name: IconName;
  size?: number | keyof typeof ICON_SIZE;
  className?: string;
  title?: string;
}) {
  const Component = ICONS[name];
  const px = typeof size === 'number' ? size : ICON_SIZE[size];
  return (
    <Component
      size={px}
      strokeWidth={ICON_STROKE}
      absoluteStrokeWidth={false}
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
      focusable="false"
    />
  );
}
