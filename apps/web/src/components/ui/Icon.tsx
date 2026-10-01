/** Set de íconos de trazo (24×24, 1.75 px), dibujados para el producto. */
const PATHS: Record<string, string> = {
  dashboard: 'M4 4h6v7H4zM14 4h6v4h-6zM14 12h6v8h-6zM4 15h6v5H4z',
  layers: 'M12 3 3 8l9 5 9-5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  shield: 'M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3zM9 12l2 2 4-4',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2zM10 20a2 2 0 0 0 4 0',
  file: 'M14 3H6v18h12V7l-4-4zM14 3v4h4M9 12h6M9 16h6',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  plus: 'M12 5v14M5 12h14',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v4h16v-4',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  satellite: 'M13 7 17 3l4 4-4 4M7 13l-4 4 4 4 4-4M9 9l6 6M8 16a4 4 0 0 1-4-4M10 20a8 8 0 0 1-8-8',
  check: 'M5 12l5 5L20 7',
  x: 'M6 6l12 12M18 6 6 18',
  chevronRight: 'M9 6l6 6-6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronDown: 'M6 9l6 6 6-6',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h0',
  warning: 'M12 4 2.5 20h19L12 4zM12 10v4M12 17h0',
  critical: 'M8 3h8l5 5v8l-5 5H8l-5-5V8l5-5zM12 8v5M12 16h0',
  pin: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  refresh: 'M20 11a8 8 0 0 0-14.5-4.5M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5M20 20v-4h-4',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  leaf: 'M5 19c9 0 14-5 14-15C9 4 5 9 5 15v4zM5 19l7-7',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  building: 'M4 21V7l8-4 8 4v14M9 21v-6h6v6M8 10h0M12 10h0M16 10h0',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  rfid: 'M4 8a12 12 0 0 1 16 0M7 11a8 8 0 0 1 10 0M10 14a4 4 0 0 1 4 0M12 18h0',
  document: 'M7 3h7l5 5v13H7zM14 3v5h5',
  scale: 'M12 4v16M5 8h14M5 8l-3 7a3 3 0 0 0 6 0L5 8zM19 8l-3 7a3 3 0 0 0 6 0l-3-7z',
  menu: 'M4 7h16M4 12h16M4 17h16',
};

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 18,
  className,
  title,
}: {
  name: IconName;
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path d={PATHS[name]} />
    </svg>
  );
}
