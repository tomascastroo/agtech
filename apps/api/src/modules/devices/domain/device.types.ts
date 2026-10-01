export const DEVICE_TYPES = [
  'FIXED_CAMERA',
  'SOLAR_CAMERA',
  'RFID_READER',
  'SENSOR',
  'GATEWAY',
] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export const CONNECTIVITY_TYPES = ['LTE_4G', 'WIFI', 'SATELLITE', 'LORA'] as const;
export type Connectivity = (typeof CONNECTIVITY_TYPES)[number];

export const POWER_SOURCES = ['SOLAR', 'GRID', 'BATTERY'] as const;
export type PowerSource = (typeof POWER_SOURCES)[number];

export type DeviceStatus = 'PENDING' | 'ONLINE' | 'OFFLINE' | 'MAINTENANCE' | 'DECOMMISSIONED';
export type InstallationRequestType = 'KIT_REQUEST' | 'SELF_INSTALLED';
export type InstallationStatus = 'REQUESTED' | 'SHIPPED' | 'INSTALLED' | 'ACTIVE' | 'REMOVED';

export const CAMERA_DEVICE_TYPES: readonly DeviceType[] = ['FIXED_CAMERA', 'SOLAR_CAMERA'];

export interface KitSpec {
  cameras: number;
  connectivity: Connectivity;
  solarPower: boolean;
  rfidReader: boolean;
}
