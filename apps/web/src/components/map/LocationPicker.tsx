'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, FormRow, Input } from '@/components/ui/Field';
import { formatNumber } from '@/lib/format';
import { MapHint, MapToolbar, MapView, type MapPolygon } from './MapView';

export interface PickedLocation {
  latitude: number;
  longitude: number;
}

/** Superficie aproximada (ha) de un anillo lon/lat por proyección equirectangular local. */
export function approximateHectares(ring: [number, number][]): number {
  if (ring.length < 3) return 0;
  const lat0 = (ring.reduce((acc, p) => acc + p[1], 0) / ring.length) * (Math.PI / 180);
  const project = ([lon, lat]: [number, number]) => [lon * 111_320 * Math.cos(lat0), lat * 110_574];
  const points = ring.map(project);
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[(i + 1) % points.length]!;
    area += x1! * y2! - x2! * y1!;
  }
  return Math.abs(area / 2) / 10_000;
}

/**
 * Selección de ubicación (clic en el mapa o coordenadas) y, opcionalmente, dibujo del
 * polígono de la superficie (clic sucesivos; mínimo 3 vértices).
 */
export function LocationPicker({
  value,
  onChange,
  polygon,
  onPolygonChange,
  allowPolygon,
  context,
}: {
  value: PickedLocation | null;
  onChange: (value: PickedLocation) => void;
  polygon?: [number, number][] | null;
  onPolygonChange?: (ring: [number, number][] | null) => void;
  allowPolygon?: boolean;
  context?: MapPolygon[];
}) {
  const [mode, setMode] = useState<'point' | 'polygon'>('point');
  const [draft, setDraft] = useState<[number, number][]>([]);
  const ring = useMemo(
    () => (mode === 'polygon' ? draft : (polygon ?? [])),
    [mode, draft, polygon],
  );

  const polygons = useMemo<MapPolygon[]>(() => {
    const list = [...(context ?? [])];
    if (ring.length >= 3) {
      list.push({
        id: 'drawn',
        color: '#2e7d4f',
        geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]!]] },
      });
    }
    return list;
  }, [ring, context]);

  const points = [
    ...(value
      ? [
          {
            id: 'location',
            coordinates: [value.longitude, value.latitude] as [number, number],
            color: '#0f2a3d',
            selected: true,
          },
        ]
      : []),
    ...(mode === 'polygon'
      ? draft.map((c, i) => ({ id: `v${i}`, coordinates: c, color: '#2e7d4f' }))
      : []),
  ];

  const onMapClick = ([longitude, latitude]: [number, number]) => {
    if (mode === 'polygon') setDraft((current) => [...current, [longitude, latitude]]);
    else
      onChange({ latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)) });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <MapView
        points={points}
        polygons={polygons}
        height={340}
        onMapClick={onMapClick}
        maxZoom={14}
        refitOnChange={false}
        label="Mapa para seleccionar ubicación"
      >
        {allowPolygon ? (
          <MapToolbar>
            <Button
              size="sm"
              variant={mode === 'point' ? 'primary' : 'secondary'}
              icon="pin"
              onClick={() => setMode('point')}
            >
              Ubicación
            </Button>
            <Button
              size="sm"
              variant={mode === 'polygon' ? 'primary' : 'secondary'}
              icon="map"
              onClick={() => {
                setMode('polygon');
                setDraft([]);
              }}
            >
              Dibujar superficie
            </Button>
            {mode === 'polygon' ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  icon="check"
                  disabled={draft.length < 3}
                  onClick={() => {
                    onPolygonChange?.(draft);
                    setMode('point');
                  }}
                >
                  Cerrar polígono
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDraft((d) => d.slice(0, -1))}
                  disabled={draft.length === 0}
                >
                  Deshacer
                </Button>
              </>
            ) : null}
          </MapToolbar>
        ) : null}
        <MapHint>
          {mode === 'polygon'
            ? `Hacé clic para agregar vértices (${draft.length}). Mínimo 3.`
            : 'Hacé clic en el mapa para fijar la ubicación.'}
        </MapHint>
      </MapView>
      <FormRow columns={allowPolygon ? 3 : 2}>
        <Field label="Latitud" required>
          {(props) => (
            <Input
              {...props}
              type="number"
              step="0.000001"
              value={value?.latitude ?? ''}
              onChange={(e) =>
                onChange({ latitude: Number(e.target.value), longitude: value?.longitude ?? 0 })
              }
            />
          )}
        </Field>
        <Field label="Longitud" required>
          {(props) => (
            <Input
              {...props}
              type="number"
              step="0.000001"
              value={value?.longitude ?? ''}
              onChange={(e) =>
                onChange({ latitude: value?.latitude ?? 0, longitude: Number(e.target.value) })
              }
            />
          )}
        </Field>
        {allowPolygon ? (
          <Field
            label="Superficie dibujada"
            hint="Cálculo aproximado; la API calcula la superficie geodésica."
          >
            {(props) => (
              <Input
                {...props}
                readOnly
                value={
                  polygon && polygon.length >= 3
                    ? `${formatNumber(approximateHectares(polygon), 1)} ha`
                    : 'Sin polígono'
                }
              />
            )}
          </Field>
        ) : null}
      </FormRow>
    </div>
  );
}
