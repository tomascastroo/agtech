import type { EntityManager } from 'typeorm';
import { PERMISSION_DESCRIPTIONS, ROLE_DEFINITIONS } from '../../common/auth/permissions.js';
import { AlertRuleEntity } from '../../modules/alerts/infrastructure/alert-rule.entity.js';
import { EVIDENCE_GUIDANCE } from '../../modules/assets/domain/evidence-guidance.js';
import { AssetTypeEntity } from '../../modules/assets/infrastructure/asset-type.entity.js';
import { AiModelVersionEntity } from '../../modules/computer-vision/infrastructure/ai-model-version.entity.js';
import { AiModelEntity } from '../../modules/computer-vision/infrastructure/ai-model.entity.js';
import { EvidenceSourceEntity } from '../../modules/evidence/infrastructure/evidence-source.entity.js';
import { PermissionEntity } from '../../modules/users/infrastructure/permission.entity.js';
import { RoleEntity } from '../../modules/users/infrastructure/role.entity.js';
import { AI_MODELS, ALERT_RULES, ASSET_TYPES, EVIDENCE_SOURCES } from './catalog.js';

/**
 * Catálogo base del sistema: permisos, roles, tipos de activo, fuentes de evidencia, modelos de
 * IA y reglas de alerta globales. Lo necesita cualquier instalación, con o sin datos demo.
 */
export interface CatalogMaps {
  types: Map<string, AssetTypeEntity>;
  sources: Map<string, EvidenceSourceEntity>;
  /** `${code}@${version}` → id de la versión del modelo. */
  models: Map<string, string>;
}

async function seedCatalog(m: EntityManager, releasedAt: Date): Promise<CatalogMaps> {
  const maps: CatalogMaps = { types: new Map(), sources: new Map(), models: new Map() };
  const permissions = new Map<string, PermissionEntity>();
  for (const [code, description] of Object.entries(PERMISSION_DESCRIPTIONS)) {
    permissions.set(code, await m.save(m.create(PermissionEntity, { code, description })));
  }
  for (const [code, def] of Object.entries(ROLE_DEFINITIONS)) {
    await m.save(
      m.create(RoleEntity, {
        code,
        name: def.name,
        description: def.description,
        permissions: def.permissions.map((p) => permissions.get(p)!),
      }),
    );
  }
  for (const [index, type] of ASSET_TYPES.entries()) {
    maps.types.set(
      type.code,
      await m.save(
        m.create(AssetTypeEntity, {
          ...type,
          evidenceGuidance: EVIDENCE_GUIDANCE[type.code] ?? null,
          sortOrder: index,
          isActive: true,
        }),
      ),
    );
  }
  for (const source of EVIDENCE_SOURCES) {
    maps.sources.set(source.code, await m.save(m.create(EvidenceSourceEntity, source)));
  }
  for (const model of AI_MODELS) {
    const entity = await m.save(
      m.create(AiModelEntity, {
        code: model.code,
        name: model.name,
        task: model.task,
        provider: model.provider,
        description: model.description,
      }),
    );
    const version = await m.save(
      m.create(AiModelVersionEntity, {
        modelId: entity.id,
        version: model.version,
        isSimulated: model.isSimulated,
        status: 'ACTIVE',
        metrics: model.metrics,
        releasedAt,
      }),
    );
    maps.models.set(`${model.code}@${model.version}`, version.id);
  }
  for (const rule of ALERT_RULES) {
    await m.save(m.create(AlertRuleEntity, { ...rule, organizationId: null, enabled: true }));
  }
  return maps;
}

async function loadCatalog(m: EntityManager): Promise<CatalogMaps> {
  const maps: CatalogMaps = { types: new Map(), sources: new Map(), models: new Map() };
  for (const type of await m.find(AssetTypeEntity)) maps.types.set(type.code, type);
  for (const source of await m.find(EvidenceSourceEntity)) maps.sources.set(source.code, source);
  const models = await m.find(AiModelEntity);
  for (const version of await m.find(AiModelVersionEntity)) {
    const model = models.find((x) => x.id === version.modelId);
    if (model) maps.models.set(`${model.code}@${version.version}`, version.id);
  }
  return maps;
}

/** Idempotente: si el catálogo ya existe lo lee; si no, lo crea. */
export async function ensureCatalog(
  m: EntityManager,
  releasedAt: Date = new Date(),
): Promise<CatalogMaps & { created: boolean }> {
  const roles = await m.count(RoleEntity);
  if (roles > 0) return { ...(await loadCatalog(m)), created: false };
  return { ...(await seedCatalog(m, releasedAt)), created: true };
}
