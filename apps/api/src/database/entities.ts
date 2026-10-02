import { AlertRuleEntity } from '../modules/alerts/infrastructure/alert-rule.entity.js';
import { AlertEntity } from '../modules/alerts/infrastructure/alert.entity.js';
import { AnimalIdentificationEntity } from '../modules/animals/infrastructure/animal-identification.entity.js';
import { AnimalObservationEntity } from '../modules/animals/infrastructure/animal-observation.entity.js';
import { ScanFrameEntity } from '../modules/scans/infrastructure/scan-frame.entity.js';
import { ChuteCaptureEntity } from '../modules/scans/infrastructure/chute-capture.entity.js';
import { BovineIndividualEntity } from '../modules/animals/infrastructure/bovine-individual.entity.js';
import { ScanSessionEntity } from '../modules/scans/infrastructure/scan-session.entity.js';
import { RfidObservationEntity } from '../modules/animals/infrastructure/rfid-observation.entity.js';
import { AnimalEntity } from '../modules/animals/infrastructure/animal.entity.js';
import { AssetMetadataEntity } from '../modules/assets/infrastructure/asset-metadata.entity.js';
import { AssetTypeEntity } from '../modules/assets/infrastructure/asset-type.entity.js';
import { AssetEntity } from '../modules/assets/infrastructure/asset.entity.js';
import { GuaranteeEntity } from '../modules/assets/infrastructure/guarantee.entity.js';
import { AuditLogEntity } from '../modules/audit/infrastructure/audit-log.entity.js';
import { RefreshTokenEntity } from '../modules/auth/infrastructure/refresh-token.entity.js';
import { AiModelVersionEntity } from '../modules/computer-vision/infrastructure/ai-model-version.entity.js';
import { AiModelEntity } from '../modules/computer-vision/infrastructure/ai-model.entity.js';
import { DeviceInstallationEntity } from '../modules/devices/infrastructure/device-installation.entity.js';
import { DeviceEntity } from '../modules/devices/infrastructure/device.entity.js';
import { DocumentAnalysisEntity } from '../modules/documents/infrastructure/document-analysis.entity.js';
import { DocumentEntity } from '../modules/documents/infrastructure/document.entity.js';
import { EstablishmentLocationEntity } from '../modules/establishments/infrastructure/establishment-location.entity.js';
import { EstablishmentEntity } from '../modules/establishments/infrastructure/establishment.entity.js';
import { EvidenceSourceEntity } from '../modules/evidence/infrastructure/evidence-source.entity.js';
import { GuaranteeRequestRequirementEntity } from '../modules/guarantee-requests/infrastructure/guarantee-request-requirement.entity.js';
import { InformationRequestEntity } from '../modules/guarantee-requests/infrastructure/information-request.entity.js';
import { GuaranteeRequestEntity } from '../modules/guarantee-requests/infrastructure/guarantee-request.entity.js';
import { EvidenceEntity } from '../modules/evidence/infrastructure/evidence.entity.js';
import { ExternalDataSnapshotEntity } from '../modules/external-data/infrastructure/external-data-snapshot.entity.js';
import { MonitoringConfigurationEntity } from '../modules/monitoring/infrastructure/monitoring-configuration.entity.js';
import { MonitoringEventEntity } from '../modules/monitoring/infrastructure/monitoring-event.entity.js';
import { OrganizationEntity } from '../modules/organizations/infrastructure/organization.entity.js';
import { ReportDocumentEntity } from '../modules/reports/infrastructure/report-document.entity.js';
import { ReportEntity } from '../modules/reports/infrastructure/report.entity.js';
import { SatelliteImageEntity } from '../modules/satellite/infrastructure/satellite-image.entity.js';
import { SatelliteObservationEntity } from '../modules/satellite/infrastructure/satellite-observation.entity.js';
import { PermissionEntity } from '../modules/users/infrastructure/permission.entity.js';
import { RoleEntity } from '../modules/users/infrastructure/role.entity.js';
import { UserEntity } from '../modules/users/infrastructure/user.entity.js';
import { VerificationEvidenceEntity } from '../modules/verification/infrastructure/verification-evidence.entity.js';
import { VerificationMetricEntity } from '../modules/verification/infrastructure/verification-metric.entity.js';
import { VerificationResultEntity } from '../modules/verification/infrastructure/verification-result.entity.js';
import { VerificationRunEntity } from '../modules/verification/infrastructure/verification-run.entity.js';

export const ENTITIES = [
  GuaranteeRequestEntity,
  InformationRequestEntity,
  GuaranteeRequestRequirementEntity,
  OrganizationEntity,
  PermissionEntity,
  RoleEntity,
  UserEntity,
  RefreshTokenEntity,
  EstablishmentEntity,
  EstablishmentLocationEntity,
  AssetTypeEntity,
  AssetEntity,
  AssetMetadataEntity,
  GuaranteeEntity,
  DocumentEntity,
  DocumentAnalysisEntity,
  DeviceEntity,
  DeviceInstallationEntity,
  AiModelEntity,
  AiModelVersionEntity,
  SatelliteImageEntity,
  SatelliteObservationEntity,
  EvidenceSourceEntity,
  EvidenceEntity,
  VerificationRunEntity,
  VerificationResultEntity,
  VerificationMetricEntity,
  VerificationEvidenceEntity,
  MonitoringConfigurationEntity,
  MonitoringEventEntity,
  AlertRuleEntity,
  AlertEntity,
  ReportEntity,
  ReportDocumentEntity,
  AnimalEntity,
  AnimalIdentificationEntity,
  AnimalObservationEntity,
  RfidObservationEntity,
  ScanSessionEntity,
  ScanFrameEntity,
  ChuteCaptureEntity,
  BovineIndividualEntity,
  ExternalDataSnapshotEntity,
  AuditLogEntity,
];
