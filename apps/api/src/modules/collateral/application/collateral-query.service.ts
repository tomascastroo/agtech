import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NotFoundError } from '../../../common/domain/errors.js';
import { OfficialDataProvider } from '../../external-data/domain/official-data.provider.js';
import {
  EVIDENCE_METHOD_LABELS,
  PRODUCTION_TYPE_LABELS,
  PRODUCTION_TYPES,
  STATE_LABELS,
  type CollateralState,
  type OfficialSourceCode,
  type OfficialSourceStatus,
} from '../domain/collateral.types.js';
import { COMPONENT_LABELS } from '../domain/score.js';
import { PRODUCTION_STRATEGIES } from '../domain/policy.js';
import { CollateralService } from './collateral.service.js';

type Row = Record<string, unknown>;

export interface ListFilters {
  state?: string;
  risk?: string;
  production?: string;
  q?: string;
  includeDemo?: boolean;
}

/** Estado en el idioma del productor (sin score ni alertas internas de la entidad). */
const PRODUCER_STATUS: Record<CollateralState, { key: string; title: string; text: string }> = {
  VERIFICADA: {
    key: 'AL_DIA',
    title: 'Tu garantía está al día',
    text: 'No tenés que hacer nada hasta la próxima verificación.',
  },
  EN_MONITOREO: {
    key: 'AL_DIA',
    title: 'Tu garantía está al día',
    text: 'Se acerca la próxima verificación: preparate para hacerla.',
  },
  REQUIERE_EVIDENCIA: {
    key: 'ENVIAR_EVIDENCIA',
    title: 'Tenés que enviar evidencia nueva',
    text: 'La última evidencia ya venció. Hacé el conteo con la app.',
  },
  NO_DETERMINABLE: {
    key: 'ENVIAR_EVIDENCIA',
    title: 'Hace falta un conteo completo',
    text: 'Con lo enviado no se pudo contar todo el rodeo. Pasá los animales por la manga o un paso controlado con el escáner.',
  },
  REQUIERE_REVISION: {
    key: 'EN_REVISION',
    title: 'La entidad está revisando un dato',
    text: 'Puede que te pida información. Si hubo ventas, muertes o traslados, avisalos con su DT-e.',
  },
  REQUIERE_INSPECCION: {
    key: 'INSPECCION',
    title: 'Se va a coordinar una inspección',
    text: 'Un inspector va a visitar el establecimiento para contar los animales.',
  },
  PENDIENTE_DECLARACION: {
    key: 'DECLARAR',
    title: 'Completá tu declaración',
    text: 'Declará el establecimiento, el rodeo y enviá.',
  },
  PENDIENTE_VERIFICACION: {
    key: 'EN_VERIFICACION',
    title: 'Estamos verificando tu declaración',
    text: 'Te avisamos si hace falta algo más.',
  },
  VENCIDA: { key: 'FINALIZADA', title: 'La garantía venció', text: 'No hay acciones pendientes.' },
  FINALIZADA: {
    key: 'FINALIZADA',
    title: 'La garantía finalizó',
    text: 'No hay acciones pendientes.',
  },
};

/** Cómo hacer cada método, explicado al productor. */
const METHOD_FOR_PRODUCER: Record<string, { label: string; howTo: string }> = {
  ESCANER_FIJO: {
    label: 'Escáner de paso',
    howTo:
      'Abrí el escáner, apoyá el celular fijo y hacé pasar los animales de a uno por la manga o una tranquera.',
  },
  MANGA_RFID: {
    label: 'Manga + RFID',
    howTo:
      'En el próximo trabajo de manga, usá el modo Manga + RFID: cada animal se cuenta y se lee su caravana.',
  },
  VIDEO: {
    label: 'Barrido o corral',
    howTo: 'Con el escáner, recorré el potrero o el corral desde un punto alto.',
  },
  FOTO: { label: 'Fotos', howTo: 'Sacá fotos desde la app con la cámara (no de la galería).' },
  INSPECCION: {
    label: 'Inspección presencial',
    howTo: 'La entidad va a coordinar la visita de un inspector.',
  },
};

/** Respuesta a "¿Puedo confiar hoy en esta garantía?" según el estado. */
const TRUST: Record<CollateralState, { verdict: string; text: string }> = {
  VERIFICADA: {
    verdict: 'SI',
    text: 'Sí. La evidencia vigente cierra con lo declarado y los movimientos.',
  },
  EN_MONITOREO: {
    verdict: 'SI_EN_MONITOREO',
    text: 'Sí, en monitoreo: sin problemas detectados; la próxima verificación está programada.',
  },
  REQUIERE_EVIDENCIA: {
    verdict: 'CON_RESERVAS',
    text: 'Con reservas: la evidencia física está vencida y hay que renovarla.',
  },
  REQUIERE_REVISION: {
    verdict: 'CON_RESERVAS',
    text: 'Con reservas: hay una inconsistencia que una persona debe revisar.',
  },
  REQUIERE_INSPECCION: {
    verdict: 'NO',
    text: 'No sin inspección: hay una diferencia no explicada o un riesgo que exige ir al campo.',
  },
  NO_DETERMINABLE: {
    verdict: 'NO_DETERMINABLE',
    text: 'No se puede determinar con la evidencia disponible.',
  },
  PENDIENTE_DECLARACION: {
    verdict: 'TODAVIA_NO',
    text: 'Todavía no: el productor no envió su declaración.',
  },
  PENDIENTE_VERIFICACION: {
    verdict: 'TODAVIA_NO',
    text: 'Todavía no: falta la verificación inicial.',
  },
  VENCIDA: { verdict: 'NO_APLICA', text: 'La garantía está vencida.' },
  FINALIZADA: { verdict: 'NO_APLICA', text: 'La garantía fue finalizada.' },
};

/** Lectura del Asset Passport, dashboard e historial. No modifica nada. */
@Injectable()
export class CollateralQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly core: CollateralService,
    private readonly official: OfficialDataProvider,
  ) {}

  private q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.dataSource.query(sql, params) as Promise<T[]>;
  }

  /** Frecuencias efectivas (organización o globales) por tipo de producción y riesgo. */
  async policies(organizationId: string) {
    const out: Record<string, unknown> = {};
    for (const p of PRODUCTION_TYPES) out[p] = await this.core.policyFor(organizationId, p);
    return out;
  }

  // ------------------------------------------------------------------ dashboard
  async dashboard(organizationId: string, filters: ListFilters) {
    const where = ['g.organization_id = $1'];
    const params: unknown[] = [organizationId];
    if (!filters.includeDemo) where.push(`g.data_source = 'REAL'`);
    if (filters.state) {
      params.push(filters.state);
      where.push(`g.state = $${params.length}`);
    }
    if (filters.risk) {
      params.push(filters.risk);
      where.push(`g.risk_level = $${params.length}`);
    }
    if (filters.production) {
      params.push(filters.production);
      where.push(`g.production_type = $${params.length}`);
    }
    if (filters.q?.trim()) {
      params.push(`%${filters.q.trim().toLowerCase()}%`);
      where.push(
        `(lower(g.code) LIKE $${params.length} OR lower(g.producer_name) LIKE $${params.length} OR lower(coalesce(e.name,'')) LIKE $${params.length} OR g.producer_tax_id LIKE $${params.length})`,
      );
    }
    const items = await this.q(
      `SELECT g.id, g.code, g.producer_name AS "producerName", g.producer_tax_id AS "producerTaxId",
              e.name AS "establishmentName", e.renspa, g.production_type AS "productionType",
              g.state, g.state_reason AS "stateReason", g.score, g.risk_level AS "riskLevel",
              g.amount::float AS amount, g.debt_amount::float AS "debtAmount", g.currency,
              g.coverage_status AS "coverageStatus", g.coverage_ratio::float AS "coverageRatio",
              g.verifiable_value::float AS "verifiableValue", g.expected_heads AS "expectedHeads",
              g.verifiable_heads AS "verifiableHeads",
              (SELECT d.heads FROM collateral_declarations d WHERE d.guarantee_id = g.id ORDER BY version DESC LIMIT 1) AS "declaredHeads",
              g.last_verification_at AS "lastVerificationAt", g.next_verification_at AS "nextVerificationAt",
              g.last_evidence_at AS "lastEvidenceAt", g.data_source AS "dataSource", g.guarantee_request_id AS "requestId",
              (SELECT count(*)::int FROM alerts a WHERE a.bovine_guarantee_id = g.id AND a.status NOT IN ('RESOLVED','DISMISSED')) AS "openAlerts"
         FROM bovine_guarantees g LEFT JOIN establishments e ON e.id = g.establishment_id
        WHERE ${where.join(' AND ')}
        ORDER BY CASE g.state WHEN 'REQUIERE_INSPECCION' THEN 0 WHEN 'NO_DETERMINABLE' THEN 1
                 WHEN 'REQUIERE_REVISION' THEN 2 WHEN 'REQUIERE_EVIDENCIA' THEN 3 ELSE 4 END,
                 g.next_verification_at NULLS LAST, g.created_at DESC
        LIMIT 500`,
      params,
    );
    // KPIs: solo datos REALES (las demostraciones se informan aparte).
    const [k] = await this.q<Record<string, number | null>>(
      `SELECT count(*) FILTER (WHERE finalized_at IS NULL)::int AS active,
              count(*) FILTER (WHERE state = 'VERIFICADA')::int AS verified,
              count(*) FILTER (WHERE state IN ('REQUIERE_INSPECCION','NO_DETERMINABLE','REQUIERE_REVISION')
                               OR risk_level IN ('ALTO','CRITICO'))::int AS "atRisk",
              count(*) FILTER (WHERE state = 'REQUIERE_EVIDENCIA')::int AS "expiredEvidence",
              round(avg(score))::int AS "averageScore"
         FROM bovine_guarantees WHERE organization_id = $1 AND data_source = 'REAL' AND finalized_at IS NULL`,
      [organizationId],
    );
    const byCurrency = await this.q(
      `SELECT currency, sum(amount)::float AS guaranteed, sum(verifiable_value)::float AS verifiable,
              sum(amount) FILTER (WHERE coverage_status = 'DETERMINADA')::float AS "guaranteedWithCoverage",
              count(*) FILTER (WHERE coverage_status = 'DETERMINADA')::int AS determinable,
              count(*)::int AS total
         FROM bovine_guarantees WHERE organization_id = $1 AND data_source = 'REAL' AND finalized_at IS NULL
        GROUP BY currency ORDER BY currency`,
      [organizationId],
    );
    const [ops] = await this.q<{ pendingInspections: number; openAlerts: number; demo: number }>(
      `SELECT (SELECT count(*)::int FROM collateral_inspections i JOIN bovine_guarantees g ON g.id = i.guarantee_id
                WHERE g.organization_id = $1 AND g.data_source = 'REAL' AND i.status = 'SOLICITADA') AS "pendingInspections",
              (SELECT count(*)::int FROM alerts a JOIN bovine_guarantees g ON g.id = a.bovine_guarantee_id
                WHERE g.organization_id = $1 AND g.data_source = 'REAL' AND a.status NOT IN ('RESOLVED','DISMISSED')) AS "openAlerts",
              (SELECT count(*)::int FROM bovine_guarantees WHERE organization_id = $1 AND data_source = 'DEMO') AS demo`,
      [organizationId],
    );
    return {
      kpis: {
        activeGuarantees: k?.active ?? 0,
        verified: k?.verified ?? 0,
        atRisk: k?.atRisk ?? 0,
        expiredEvidence: k?.expiredEvidence ?? 0,
        averageScore: k?.averageScore ?? null,
        pendingInspections: ops?.pendingInspections ?? 0,
        openAlerts: ops?.openAlerts ?? 0,
        byCurrency: byCurrency.map((c) => ({
          ...c,
          // Cobertura agregada: solo sobre las garantías con cobertura determinable.
          coverageRatio:
            c.guaranteedWithCoverage && c.verifiable
              ? Math.round(
                  ((c.verifiable as number) / (c.guaranteedWithCoverage as number)) * 100,
                ) / 100
              : null,
        })),
      },
      demoGuarantees: ops?.demo ?? 0,
      items: items.map((i) => ({ ...i, stateLabel: STATE_LABELS[i.state as CollateralState] })),
    };
  }

  // ------------------------------------------------------------------ passport
  async summary(organizationId: string, id: string) {
    const [g] = await this.q(
      `SELECT g.*, e.name AS establishment_name, e.renspa, e.province, e.locality, e.holder_name,
              a.name AS asset_name, s.evaluated_at AS snapshot_at
         FROM bovine_guarantees g
         LEFT JOIN establishments e ON e.id = g.establishment_id
         LEFT JOIN assets a ON a.id = g.asset_id
         LEFT JOIN collateral_score_snapshots s ON s.id = g.last_snapshot_id
        WHERE g.id = $1 AND g.organization_id = $2`,
      [id, organizationId],
    );
    if (!g) throw new NotFoundError('Garantía bovina', id);
    const state = g.state as CollateralState;
    return {
      id: g.id as string,
      code: g.code as string,
      state,
      stateLabel: STATE_LABELS[state],
      stateReason: g.state_reason,
      trust: TRUST[state],
      score: g.score,
      riskLevel: g.risk_level,
      coverage: {
        status: g.coverage_status ?? 'NO_DETERMINABLE',
        ratio: g.coverage_ratio === null ? null : Number(g.coverage_ratio),
        verifiableValue: g.verifiable_value === null ? null : Number(g.verifiable_value),
        currency: g.currency,
      },
      lastVerificationAt: g.last_verification_at,
      nextVerificationAt: g.next_verification_at,
      lastEvidenceAt: g.last_evidence_at,
      evaluatedAt: g.snapshot_at,
      dataSource: g.data_source,
      requestId: g.guarantee_request_id,
      assetId: g.asset_id,
      raw: g,
    };
  }

  async passport(organizationId: string, id: string) {
    const head = await this.summary(organizationId, id);
    const g = head.raw;
    const [snapshot] = g.last_snapshot_id
      ? await this.q(`SELECT * FROM collateral_score_snapshots WHERE id = $1`, [g.last_snapshot_id])
      : [];
    const declarations = await this.q(
      `SELECT d.id, d.version, d.heads, d.categories, d.production_type AS "productionType", d.establishment,
              d.source, d.declared_by_label AS "declaredBy", d.declared_at AS "declaredAt", d.reason,
              d.supersedes_id AS "supersedesId"
         FROM collateral_declarations d WHERE d.guarantee_id = $1 ORDER BY version DESC`,
      [id],
    );
    const [
      movements,
      verifications,
      inspections,
      alerts,
      timeline,
      evidence,
      rfid,
      documents,
      scoreHistory,
      schedule,
    ] = await Promise.all([
      this.movements(organizationId, id),
      this.verifications(organizationId, id),
      this.inspections(organizationId, id),
      this.alerts(organizationId, id),
      this.timeline(organizationId, id),
      this.evidence(g.asset_id as string | null),
      this.rfid(g.asset_id as string | null),
      this.documents(g.asset_id as string | null, g.establishment_id as string | null),
      this.q(
        `SELECT evaluated_at AS "evaluatedAt", score, state, risk_level AS "riskLevel", trigger
             FROM collateral_score_snapshots WHERE guarantee_id = $1 ORDER BY evaluated_at DESC LIMIT 30`,
        [id],
      ),
      this.core.schedule(id),
    ]);
    const legalMissing = [
      ['legal_instrument', 'NO_INFORMADO', 'instrumento (prenda / warrant)'],
      ['legal_identifier', null, 'número de inscripción'],
      ['legal_status', 'NO_INFORMADO', 'estado registral'],
      ['immobilization_status', 'NO_INFORMADA', 'inmovilización en SENASA'],
      ['granted_at', null, 'fecha de otorgamiento'],
      ['expires_at', null, 'vencimiento'],
    ]
      .filter(([col, empty]) => g[col as string] === empty)
      .map(([, , label]) => label);
    const production = g.production_type as keyof typeof PRODUCTION_TYPE_LABELS;
    const reconciliation = (snapshot?.reconciliation ?? null) as Row | null;
    const inputs = (snapshot?.inputs ?? {}) as Row;
    return {
      header: { ...head, raw: undefined },
      identity: {
        producerName: g.producer_name,
        producerTaxId: g.producer_tax_id,
        establishment: g.establishment_id
          ? {
              id: g.establishment_id,
              name: g.establishment_name,
              renspa: g.renspa,
              province: g.province,
              locality: g.locality,
              holderName: g.holder_name,
            }
          : null,
        asset: g.asset_id ? { id: g.asset_id, name: g.asset_name } : null,
        productionType: production,
        productionLabel: PRODUCTION_TYPE_LABELS[production],
        strategy: PRODUCTION_STRATEGIES[production],
      },
      legal: {
        instrument: g.legal_instrument,
        identifier: g.legal_identifier,
        status: g.legal_status,
        lienPriority: g.lien_priority,
        immobilizationStatus: g.immobilization_status,
        immobilizationReference: g.immobilization_reference,
        amount: g.amount === null ? null : Number(g.amount),
        debtAmount: g.debt_amount === null ? null : Number(g.debt_amount),
        currency: g.currency,
        grantedAt: g.granted_at,
        expiresAt: g.expires_at,
        notInformed: legalMissing,
        note: 'Datos legales informados por la entidad. AgroGarantías no los consulta en registros: no se presentan como verificados.',
      },
      valuation: {
        averageWeightKg: g.average_weight_kg === null ? null : Number(g.average_weight_kg),
        weightSource: g.weight_source,
        pricePerKg: g.price_per_kg === null ? null : Number(g.price_per_kg),
        priceCurrency: g.price_currency,
        priceSource: g.price_source,
        priceDate: g.price_date,
        qualityFactor: g.quality_factor === null ? null : Number(g.quality_factor),
      },
      declaration: {
        immutable: true,
        current: declarations[0] ?? null,
        versions: declarations,
      },
      bovines: {
        declared: reconciliation?.declared ?? declarations[0]?.heads ?? null,
        exits: reconciliation?.exits ?? 0,
        entries: reconciliation?.entries ?? 0,
        expected: reconciliation?.expected ?? null,
        observed: reconciliation?.observed ?? null,
        observedBasis: reconciliation?.observedBasis ?? null,
        observedMethod: reconciliation?.observedMethod ?? null,
        verifiable: reconciliation?.verifiable ?? null,
        unexplainedDifference: reconciliation?.unexplainedDifference ?? null,
        consistency: reconciliation?.status ?? null,
        narrative: reconciliation?.narrative ?? [],
        observationChoice: inputs.chosenWhy ?? null,
        candidates: inputs.candidates ?? [],
      },
      evidence,
      rfid,
      officialSources: this.officialSources(documents),
      movements,
      documents,
      verifications,
      score: snapshot
        ? {
            value: snapshot.score,
            weighted: snapshot.weighted_score,
            components: snapshot.components,
            componentLabels: COMPONENT_LABELS,
            gates: snapshot.gates,
            engineVersion: snapshot.engine_version,
            evaluatedAt: snapshot.evaluated_at,
            history: scoreHistory,
          }
        : null,
      coverage: snapshot?.coverage ?? null,
      risk: snapshot
        ? {
            level: snapshot.risk_level,
            points: snapshot.risk_points,
            factors: snapshot.risk_factors,
          }
        : null,
      schedule: schedule
        ? {
            riskLevel: schedule.riskLevel,
            frequencyDays: schedule.frequencyDays,
            maxEvidenceAgeDays: schedule.maxEvidenceAgeDays,
            recommendedMethod: schedule.recommendedMethod,
            requiresInspection: schedule.requiresInspection,
            lastVerificationAt: schedule.lastVerificationAt,
            nextVerificationAt: schedule.nextVerificationAt,
            explanation: schedule.explanation,
            recommendedMethodLabel:
              EVIDENCE_METHOD_LABELS[
                schedule.recommendedMethod as keyof typeof EVIDENCE_METHOD_LABELS
              ],
          }
        : null,
      alerts,
      inspections,
      history: timeline,
      limitations: this.limitations(head.dataSource as string),
    };
  }

  private limitations(dataSource: string): string[] {
    return [
      ...(dataSource === 'DEMO'
        ? ['DATOS DE DEMOSTRACIÓN: esta garantía es ficticia y no tiene valor como respaldo.']
        : []),
      'Ninguna fuente oficial (SENASA/SIGSA, DT-e, TRAZA) está conectada: los documentos oficiales son copias aportadas y se leen con OCR; no equivalen a una consulta a la fuente.',
      'Los conteos por foto, video o corral muestran una parte del rodeo (cota inferior); solo el paso controlado (escáner fijo, manga) o una inspección con conteo completo se comparan con el total.',
      'Los datos legales (prenda, warrant, inmovilización) los informa la entidad; no se verifican en registros.',
      'La cobertura usa el peso, precio y factor de calidad que informa la entidad; si falta alguno, no se calcula.',
      'El score es determinista y explicable (reglas y compuertas), no un modelo estadístico: no está calibrado con historia de pérdidas.',
      'La precisión del conteo por visión computacional no fue validada en campo con ganado real a escala.',
    ];
  }

  private officialSources(documents: Row[]) {
    const info = this.official.info();
    const connected = info.status === 'CONNECTED';
    const def: {
      code: OfficialSourceCode;
      name: string;
      docTypes: string[];
      scope: string;
      unavailable?: string;
    }[] = [
      {
        code: 'RENSPA',
        name: 'RENSPA (SENASA)',
        docTypes: ['RENSPA'],
        scope: 'Establecimiento y titular',
      },
      {
        code: 'SIGSA',
        name: 'SIGSA — existencias (SENASA)',
        docTypes: ['STOCK_CERTIFICATE'],
        scope: 'Stock bovino por categoría',
      },
      {
        code: 'DTE',
        name: 'DT-e (Documento de Tránsito electrónico)',
        docTypes: ['DTE'],
        scope: 'Egresos e ingresos de animales',
      },
      {
        code: 'TRAZA',
        name: 'TRAZA (ganado prendado / en warrant)',
        docTypes: ['TRAZA_REPORT'],
        scope: 'Animales prendados o disponibles para garantía',
        unavailable:
          'En implementación por la autoridad: no hay consulta disponible para terceros.',
      },
    ];
    return def.map((s) => {
      const docs = documents.filter((d) => s.docTypes.includes(d.type as string));
      let status: OfficialSourceStatus;
      let detail: string;
      if (connected && s.code !== 'TRAZA') {
        status = 'CONECTADA';
        detail = 'Consulta oficial disponible.';
      } else if (docs.length) {
        status = 'DOCUMENTO_CARGADO';
        detail =
          'Hay un documento oficial cargado (copia aportada, leída con OCR). No es una consulta en línea.';
      } else if (s.unavailable) {
        status = 'NO_DISPONIBLE';
        detail = s.unavailable;
      } else {
        status = 'SIN_CONEXION';
        detail = `Sin conexión: ${info.reason}`;
      }
      return {
        code: s.code,
        name: s.name,
        scope: s.scope,
        status,
        statusLabel: {
          CONECTADA: 'Conectada',
          SIN_CONEXION: 'Sin conexión',
          DOCUMENTO_CARGADO: 'Documento cargado',
          NO_DISPONIBLE: 'No disponible',
          ERROR: 'Error',
        }[status],
        detail,
        documentTypes: s.docTypes,
        documents: docs.map((d) => ({
          id: d.id,
          title: d.title,
          uploadedAt: d.createdAt,
          analysis: d.analysisStatus,
        })),
        action: status === 'CONECTADA' ? null : 'SUBIR DOCUMENTO OFICIAL',
      };
    });
  }

  // ------------------------------------------------------------------ secciones
  async movements(organizationId: string, id: string) {
    return this.q(
      `SELECT m.id, m.direction, m.kind, m.heads, m.category, m.animal_refs AS "animalRefs", m.origin,
              m.destination, m.occurred_at AS "occurredAt", m.source_level AS "sourceLevel",
              m.source_label AS "sourceLabel", m.document_id AS "documentId", m.dte_number AS "dteNumber",
              m.verification_state AS "verificationState", m.notes, u.full_name AS "recordedBy", m.created_at AS "createdAt"
         FROM collateral_movements m LEFT JOIN users u ON u.id = m.recorded_by
        WHERE m.guarantee_id = $1 AND m.organization_id = $2 ORDER BY m.occurred_at DESC`,
      [id, organizationId],
    );
  }

  async verifications(organizationId: string, id: string) {
    return this.q(
      `SELECT v.id, v.verified_at AS "verifiedAt", v.method, v.verification_run_id AS "verificationRunId",
              v.inspection_id AS "inspectionId", v.declared_heads AS declared, v.expected_heads AS expected,
              v.observed_heads AS observed, v.verified_heads AS verified, v.count_basis AS "countBasis",
              v.quality, v.quality_reasons AS "qualityReasons", v.capture_origin AS "captureOrigin",
              v.result_state AS "resultState", v.score, v.risk_level AS "riskLevel", v.evidence_ids AS "evidenceIds",
              v.actor_label AS actor, v.explanation
         FROM collateral_verifications v WHERE v.guarantee_id = $1 AND v.organization_id = $2
        ORDER BY v.verified_at DESC`,
      [id, organizationId],
    );
  }

  async inspections(organizationId: string, id: string) {
    return this.q(
      `SELECT i.id, i.status, i.reason, i.requested_at AS "requestedAt", i.due_at AS "dueAt",
              i.inspector_name AS "inspectorName", i.performed_at AS "performedAt",
              CASE WHEN i.location IS NULL THEN NULL ELSE json_build_object('latitude', ST_Y(i.location), 'longitude', ST_X(i.location)) END AS location,
              i.observed_heads AS "observedHeads", i.full_count AS "fullCount", i.rfid_read AS "rfidRead",
              i.evidence_ids AS "evidenceIds", i.observations, i.discrepancies, i.result,
              i.signature_name AS "signatureName", i.signature_hash AS "signatureHash", i.signed_at AS "signedAt",
              u.full_name AS "requestedBy"
         FROM collateral_inspections i LEFT JOIN users u ON u.id = i.requested_by
        WHERE i.guarantee_id = $1 AND i.organization_id = $2 ORDER BY i.requested_at DESC`,
      [id, organizationId],
    );
  }

  async alerts(organizationId: string, id: string) {
    return this.q(
      `SELECT a.id, a.type, a.severity, a.status, a.title, a.description, a.context,
              a.recommended_action AS "recommendedAction", a.owner_user_id AS "ownerUserId",
              o.full_name AS "ownerName", a.created_at AS "createdAt", a.resolved_at AS "resolvedAt",
              a.dismissed_at AS "dismissedAt", a.resolution_note AS "resolutionNote"
         FROM alerts a LEFT JOIN users o ON o.id = a.owner_user_id
        WHERE a.bovine_guarantee_id = $1 AND a.organization_id = $2
        ORDER BY CASE WHEN a.status IN ('RESOLVED','DISMISSED') THEN 1 ELSE 0 END, a.created_at DESC`,
      [id, organizationId],
    );
  }

  async timeline(organizationId: string, id: string) {
    return this.q(
      `SELECT e.id, e.type, e.occurred_at AS "occurredAt", e.source, e.actor_label AS actor, e.method,
              e.evidence, e.result, e.previous_state AS "previousState", e.new_state AS "newState", e.summary
         FROM collateral_events e WHERE e.guarantee_id = $1 AND e.organization_id = $2
        ORDER BY e.occurred_at DESC, e.created_at DESC LIMIT 300`,
      [id, organizationId],
    );
  }

  async snapshot(organizationId: string, id: string) {
    const head = await this.summary(organizationId, id);
    const [s] = head.raw.last_snapshot_id
      ? await this.q(`SELECT * FROM collateral_score_snapshots WHERE id = $1`, [
          head.raw.last_snapshot_id,
        ])
      : [];
    return s ?? null;
  }

  /** Evidencia física del rodeo con metadatos completos (origen, GPS, hash, dispositivo, calidad). */
  private async evidence(assetId: string | null) {
    if (!assetId) return [];
    return this.q(
      `SELECT e.id, e.type, e.captured_at AS "capturedAt", e.received_at AS "receivedAt", e.sha256,
              e.device_id AS "deviceId", d.serial_number AS "deviceName", u.full_name AS "uploadedBy",
              CASE WHEN e.location IS NULL THEN NULL ELSE json_build_object('latitude', ST_Y(e.location), 'longitude', ST_X(e.location)) END AS location,
              e.metadata->>'locationSource' AS "locationSource", (e.metadata->>'locationAccuracyM')::float AS "accuracyM",
              CASE WHEN e.type = 'SCAN' THEN 'CAPTURA_EN_CAMPO' WHEN e.device_id IS NOT NULL THEN 'DISPOSITIVO_FIJO'
                   ELSE coalesce(e.metadata->>'captureOrigin', 'DESCONOCIDO') END AS "captureOrigin",
              e.metadata->>'mode' AS "scanMode", e.metadata->>'evidenceStatus' AS "evidenceStatus",
              e.metadata->>'challengeCode' AS "challengeCode", s.name AS "sourceName", s.is_simulated AS simulated,
              (SELECT ve.detected_count FROM verification_evidence ve WHERE ve.evidence_id = e.id ORDER BY ve.created_at DESC LIMIT 1) AS "detectedCount",
              (SELECT (ve.analysis->>'qualityScore')::float FROM verification_evidence ve WHERE ve.evidence_id = e.id ORDER BY ve.created_at DESC LIMIT 1) AS "qualityScore"
         FROM evidence e JOIN evidence_sources s ON s.id = e.source_id
         LEFT JOIN devices d ON d.id = e.device_id LEFT JOIN users u ON u.id = e.uploaded_by
        WHERE e.asset_id = $1 AND e.type IN ('IMAGE','SCAN')
        ORDER BY e.captured_at DESC LIMIT 40`,
      [assetId],
    );
  }

  private async rfid(assetId: string | null) {
    if (!assetId)
      return { identified: 0, ambiguous: 0, insufficient: 0, captures: [], simulatedExcluded: 0 };
    const [c] = await this.q<Record<string, number>>(
      `SELECT count(DISTINCT electronic_id) FILTER (WHERE status = 'CONFIRMED' AND rfid_source <> 'SIMULATED')::int AS identified,
              count(*) FILTER (WHERE status = 'AMBIGUOUS' AND rfid_source <> 'SIMULATED')::int AS ambiguous,
              count(*) FILTER (WHERE status = 'INSUFFICIENT_EVIDENCE' AND rfid_source <> 'SIMULATED')::int AS insufficient,
              count(*) FILTER (WHERE rfid_source = 'SIMULATED')::int AS "simulatedExcluded"
         FROM chute_captures WHERE asset_id = $1`,
      [assetId],
    );
    const captures = await this.q(
      `SELECT c.id, c.status, c.electronic_id AS "electronicId", c.reason, c.rfid_source AS "rfidSource",
              c.processed_at AS "processedAt", c.evidence_id AS "evidenceId", b.internal_code AS "internalCode"
         FROM chute_captures c LEFT JOIN bovine_individuals b ON b.id = c.individual_id
        WHERE c.asset_id = $1 ORDER BY c.created_at DESC LIMIT 50`,
      [assetId],
    );
    return { ...c, captures };
  }

  private async documents(assetId: string | null, establishmentId: string | null) {
    if (!assetId && !establishmentId) return [];
    return this.q(
      `SELECT d.id, d.type, d.title, d.status, d.sha256, d.issued_at AS "issuedAt", d.expires_at AS "expiresAt",
              d.created_at AS "createdAt", d.data_source AS "dataSource",
              (SELECT a.status FROM document_analyses a WHERE a.document_id = d.id ORDER BY a.created_at DESC LIMIT 1) AS "analysisStatus"
         FROM documents d
        WHERE d.deleted_at IS NULL AND (d.asset_id = $1 OR (d.asset_id IS NULL AND d.establishment_id = $2))
        ORDER BY d.created_at DESC`,
      [assetId, establishmentId],
    );
  }

  /**
   * Monitoreo visto por el PRODUCTOR: qué tiene que hacer y cuándo, en su idioma. No ve el score,
   * el riesgo, la cobertura ni las alertas internas de la entidad.
   */
  async producerMonitoring(userId: string, requestId: string) {
    const [g] = await this.q(
      `SELECT g.id, g.code, g.state, g.next_verification_at AS "nextVerificationAt",
              g.last_verification_at AS "lastVerificationAt", g.production_type AS "productionType",
              g.data_source AS "dataSource", s.recommended_method AS "recommendedMethod",
              s.max_evidence_age_days AS "maxEvidenceAgeDays"
         FROM bovine_guarantees g
         JOIN guarantee_requests r ON r.id = g.guarantee_request_id
         LEFT JOIN monitoring_schedules s ON s.guarantee_id = g.id
        WHERE r.id = $1 AND r.producer_user_id = $2`,
      [requestId, userId],
    );
    if (!g) return null;
    const state = g.state as CollateralState;
    const status = PRODUCER_STATUS[state];
    const method = (g.recommendedMethod as string | null) ?? null;
    const next = g.nextVerificationAt ? new Date(g.nextVerificationAt as string) : null;
    const now = Date.now();
    const [declarations, movements, inspections] = await Promise.all([
      this.q(
        `SELECT version, heads, source, declared_by_label AS "declaredBy", declared_at AS "declaredAt", reason
           FROM collateral_declarations WHERE guarantee_id = $1 ORDER BY version DESC`,
        [g.id],
      ),
      this.q(
        `SELECT id, direction, kind, heads, category, destination, origin, occurred_at AS "occurredAt",
                source_level AS "sourceLevel", dte_number AS "dteNumber",
                verification_state AS "verificationState", reported_by_role AS "reportedBy"
           FROM collateral_movements WHERE guarantee_id = $1 ORDER BY occurred_at DESC`,
        [g.id],
      ),
      this.q(
        `SELECT id, status, due_at AS "dueAt", requested_at AS "requestedAt", performed_at AS "performedAt"
           FROM collateral_inspections WHERE guarantee_id = $1 ORDER BY requested_at DESC`,
        [g.id],
      ),
    ]);
    return {
      code: g.code,
      dataSource: g.dataSource,
      frozen: declarations.length > 0,
      status: { key: status.key, title: status.title, text: status.text },
      nextVerification: next
        ? {
            at: next,
            overdue: next.getTime() < now,
            daysLeft: Math.ceil((next.getTime() - now) / 86_400_000),
            method,
            methodLabel: method ? (METHOD_FOR_PRODUCER[method]?.label ?? method) : null,
            instructions: method ? (METHOD_FOR_PRODUCER[method]?.howTo ?? null) : null,
          }
        : null,
      declarations,
      movements,
      inspections: inspections.map((i) => ({
        id: i.id,
        status: i.status,
        dueAt: i.dueAt,
        requestedAt: i.requestedAt,
        performedAt: i.performedAt,
      })),
    };
  }

  /** Vista del productor: estado de su declaración (sin score ni datos de la entidad). */
  async producerView(userId: string, requestId: string) {
    const [g] = await this.q(
      `SELECT g.id, g.code, g.current_declaration_version AS "currentVersion"
         FROM bovine_guarantees g JOIN guarantee_requests r ON r.id = g.guarantee_request_id
        WHERE r.id = $1 AND r.producer_user_id = $2`,
      [requestId, userId],
    );
    if (!g) return null;
    const declarations = await this.q(
      `SELECT version, heads, categories, source, declared_by_label AS "declaredBy", declared_at AS "declaredAt", reason
         FROM collateral_declarations WHERE guarantee_id = $1 ORDER BY version DESC`,
      [g.id],
    );
    return { code: g.code, frozen: declarations.length > 0, declarations };
  }
}
