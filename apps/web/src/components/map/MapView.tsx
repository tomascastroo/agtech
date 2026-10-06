'use client';

import { COLORS } from '@/lib/design/tokens';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { GeoJSONSource, Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';
import type { GeoMultiPolygon } from '@/lib/api/types';
import styles from './map.module.css';

export interface MapPoint {
  id: string;
  coordinates: [number, number];
  color: string;
  label?: string;
  selected?: boolean;
}

export interface MapPolygon {
  id: string;
  geometry: GeoMultiPolygon | { type: 'Polygon'; coordinates: [number, number][][] };
  color: string;
  dashed?: boolean;
}

/** Worker de MapLibre servido desde public/ (scripts/copy-maplibre-worker.mjs). */
const WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';

/** Estilo base: OpenStreetMap raster (con atribución) o el estilo configurado por entorno. */
function baseStyle(): StyleSpecification | string {
  // Configurable en tiempo de ejecución (MAP_STYLE_URL, expuesto por el layout raíz).
  const custom = typeof document !== 'undefined' ? document.body.dataset.mapStyle : undefined;
  if (custom) return custom;
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© colaboradores de OpenStreetMap',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': COLORS.mapBackground } },
      {
        id: 'osm',
        type: 'raster',
        source: 'osm',
        paint: { 'raster-saturation': -0.35, 'raster-opacity': 0.9 },
      },
    ],
  };
}

function boundsOf(
  points: MapPoint[],
  polygons: MapPolygon[],
): [[number, number], [number, number]] | null {
  const coords: [number, number][] = [
    ...points.map((p) => p.coordinates),
    ...polygons.flatMap(
      (p) =>
        (p.geometry.type === 'Polygon' ? [p.geometry.coordinates] : p.geometry.coordinates).flat(
          2,
        ) as unknown as [number, number][],
    ),
  ];
  if (coords.length === 0) return null;
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

/** Vuelca puntos y polígonos a las fuentes GeoJSON del mapa y, opcionalmente, encuadra. */
function renderData(
  map: MapLibreMap,
  points: MapPoint[],
  polygons: MapPolygon[],
  fit: boolean,
  maxZoom: number,
) {
  (map.getSource('points') as GeoJSONSource | undefined)?.setData({
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: p.coordinates },
      properties: { id: p.id, color: p.color, selected: Boolean(p.selected) },
    })),
  });
  (map.getSource('polygons') as GeoJSONSource | undefined)?.setData({
    type: 'FeatureCollection',
    features: polygons.map((p) => ({
      type: 'Feature',
      geometry: p.geometry,
      properties: { id: p.id, color: p.color, dashed: Boolean(p.dashed) },
    })),
  });
  const bounds = boundsOf(points, polygons);
  if (fit && bounds) map.fitBounds(bounds, { padding: 48, maxZoom, duration: 0 });
}

export function MapView({
  points = [],
  polygons = [],
  height = 360,
  onSelect,
  onMapClick,
  children,
  maxZoom = 13,
  refitOnChange = true,
  label,
}: {
  points?: MapPoint[];
  polygons?: MapPolygon[];
  height?: number;
  onSelect?: (id: string) => void;
  onMapClick?: (coordinates: [number, number]) => void;
  children?: ReactNode;
  maxZoom?: number;
  /** Reencuadrar cuando cambian las geometrías (desactivado al dibujar). */
  refitOnChange?: boolean;
  label: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const lastBounds = useRef<string | null>(null);
  const handlers = useRef({ onSelect, onMapClick });
  // Si las imágenes del mapa base no cargan (sin internet o proveedor caído) se avisa:
  // los puntos y polígonos se siguen dibujando sobre un fondo liso.
  const [baseUnavailable, setBaseUnavailable] = useState(false);
  const data = useRef({ points, polygons, maxZoom });
  useEffect(() => {
    handlers.current = { onSelect, onMapClick };
    data.current = { points, polygons, maxZoom };
  });

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    void import('maplibre-gl').then((maplibregl) => {
      if (cancelled || !container.current) return;
      maplibregl.setWorkerUrl(WORKER_URL);
      const instance = new maplibregl.Map({
        container: container.current,
        style: baseStyle(),
        center: [-61, -35],
        zoom: 4,
        attributionControl: { compact: true },
        cooperativeGestures: false,
      });
      map = instance;
      instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      instance.on('error', (event) => {
        const sourceId = (event as { sourceId?: string }).sourceId;
        if (sourceId && sourceId !== 'polygons' && sourceId !== 'points') setBaseUnavailable(true);
      });
      // Se dibuja apenas está el estilo ('style.load'), sin esperar las imágenes del mapa base:
      // si el proveedor de teselas no responde, 'load' puede no llegar nunca.
      let ready = false;
      const setup = () => {
        if (ready || cancelled) return;
        ready = true;
        const map = instance;
        map.addSource('polygons', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addSource('points', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: 'polygons-fill',
          type: 'fill',
          source: 'polygons',
          paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.16 },
        });
        map.addLayer({
          id: 'polygons-line',
          type: 'line',
          source: 'polygons',
          filter: ['!=', ['get', 'dashed'], true],
          paint: { 'line-color': ['get', 'color'], 'line-width': 2 },
        });
        map.addLayer({
          id: 'polygons-dashed',
          type: 'line',
          source: 'polygons',
          filter: ['==', ['get', 'dashed'], true],
          paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-dasharray': [3, 2] },
        });
        map.addLayer({
          id: 'points-halo',
          type: 'circle',
          source: 'points',
          filter: ['==', ['get', 'selected'], true],
          paint: { 'circle-radius': 14, 'circle-color': ['get', 'color'], 'circle-opacity': 0.22 },
        });
        map.addLayer({
          id: 'points',
          type: 'circle',
          source: 'points',
          paint: {
            'circle-radius': 7,
            'circle-color': ['get', 'color'],
            'circle-stroke-color': COLORS.markerRing,
            'circle-stroke-width': 2,
          },
        });
        map.on('click', 'points', (event) => {
          const id = event.features?.[0]?.properties?.id as string | undefined;
          if (id) handlers.current.onSelect?.(id);
        });
        map.on('mouseenter', 'points', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'points', () => {
          map.getCanvas().style.cursor = '';
        });
        map.on('click', (event) => {
          const hits = map.queryRenderedFeatures(event.point, { layers: ['points'] });
          if (hits.length === 0)
            handlers.current.onMapClick?.([event.lngLat.lng, event.lngLat.lat]);
        });
        mapRef.current = map;
        lastBounds.current = JSON.stringify(boundsOf(data.current.points, data.current.polygons));
        renderData(map, data.current.points, data.current.polygons, true, data.current.maxZoom);
      };
      instance.on('style.load', setup);
      instance.on('load', setup);
      if (instance.isStyleLoaded()) setup();
    });
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // Las geometrías llegan como objetos nuevos en cada render: se compara su contenido.
  const signature = JSON.stringify([points, polygons]);
  const boundsSignature = JSON.stringify(boundsOf(points, polygons));
  useEffect(() => {
    if (!mapRef.current) return;
    const changed = lastBounds.current !== boundsSignature;
    const fit = changed && (refitOnChange || lastBounds.current === 'null');
    lastBounds.current = boundsSignature;
    renderData(mapRef.current, points, polygons, fit, maxZoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se re-renderiza sólo si cambia el contenido
  }, [signature, boundsSignature, maxZoom, refitOnChange]);

  return (
    <div className={styles.map} style={{ height }} role="region" aria-label={label}>
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      {baseUnavailable ? (
        <div className={styles.baseUnavailable} role="status">
          <Icon name="info" size="xs" />
          Mapa base sin conexión: las ubicaciones se muestran igual.
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function MapLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className={styles.legend}>
      {items.map((item) => (
        <span key={item.label} className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: item.color }} aria-hidden />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export function MapHint({ children }: { children: ReactNode }) {
  return <div className={styles.hint}>{children}</div>;
}

export function MapToolbar({ children }: { children: ReactNode }) {
  return <div className={styles.toolbar}>{children}</div>;
}

export const STATE_COLORS: Record<string, string> = {
  OK: COLORS.success,
  ALERTA: COLORS.danger,
  EN_REVISION: COLORS.info,
  OBSERVADO: COLORS.warning,
};
