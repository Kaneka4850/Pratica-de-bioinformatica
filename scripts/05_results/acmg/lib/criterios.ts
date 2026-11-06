// =============================================================================
// Critérios ACMG/AMP calculados automaticamente a partir da anotação.
//
// Base: Richards et al. 2015 + refinamentos ClinGen SVI:
//   - PVS1 em degraus (Abou Tayoun et al. 2018), versão simplificada;
//   - PM2 rebaixado para Supporting (SVI 2020);
//   - BA1 > 5% (Ghosh et al. 2018);
//   - PP3/BP4 calibrados pelo REVEL (Pejaver et al. 2022);
//   - SpliceAI para impacto em splicing (Walker et al. 2023);
//   - PP5 e BP6 aposentados (Biesecker & Harrison 2018): nunca aplicados.
// =============================================================================

import type { Config, Criterio, Forca, Limiares, Variante } from "./tipos.ts";

const NULAS = ["stop_gained", "frameshift_variant", "splice_donor_variant", "splice_acceptor_variant", "transcript_ablation"];
const EM_FASE = ["inframe_insertion", "inframe_deletion", "stop_lost"];

const tem = (variante: Variante, ...termos: string[]): boolean =>
  termos.some((t) => variante.consequencias.includes(t));

/** "5/11" -> { numero: 5, total: 11 }. */
export function lerExon(textoExon: string): { numero: number; total: number } | null {
  const partes = String(textoExon || "").match(/^(\d+)(?:-\d+)?\/(\d+)$/);
  return partes ? { numero: Number(partes[1]), total: Number(partes[2]) } : null;
}

function criterio(codigo: string, forca: Forca, motivo: string): Criterio {
  return { codigo, forca, origem: "automatico", motivo };
}

// ----------------------------------------------------------------------------- PVS1

/**
 * PVS1 em degraus (Abou Tayoun 2018), simplificado para o que a anotação permite saber:
 *  - só em genes com perda de função como mecanismo (lista ClinGen, genes_lof.tsv);
 *  - stop/frameshift fora do último exon: NMD previsto -> VeryStrong;
 *  - stop/frameshift no último exon ou em gene de exon único: escapa do NMD -> Strong;
 *  - splice canônico (±1,2): Strong (o desfecho do splicing não é conhecido sem RNA);
 *  - start_lost: Moderate;
 *  - transcript_ablation: VeryStrong.
 */
export function avaliarPvs1(
  variante: Variante,
  genesLof: Map<string, string>,
): { criterio: Criterio | null; naoAvaliado?: string } {
  const nula = tem(variante, ...NULAS);
  const inicio = tem(variante, "start_lost");
  if (!nula && !inicio) return { criterio: null };
  if (!genesLof.has(variante.gene)) {
    return {
      criterio: null,
      naoAvaliado: `PVS1: ${variante.gene || "sem gene"} não está na lista ClinGen de genes com LoF como mecanismo`,
    };
  }
  if (tem(variante, "transcript_ablation")) return { criterio: criterio("PVS1", "VeryStrong", "deleção do transcrito inteiro") };
  if (tem(variante, "stop_gained", "frameshift_variant")) {
    const exon = lerExon(variante.exon);
    if (!exon) return { criterio: criterio("PVS1", "Strong", "variante nula sem número de exon: NMD não avaliado") };
    if (exon.total === 1) return { criterio: criterio("PVS1", "Strong", "gene de exon único: escapa do NMD") };
    if (exon.numero === exon.total) return { criterio: criterio("PVS1", "Strong", `último exon (${variante.exon}): escapa do NMD`) };
    return { criterio: criterio("PVS1", "VeryStrong", `exon ${variante.exon}, antes do último: NMD previsto`) };
  }
  if (tem(variante, "splice_donor_variant", "splice_acceptor_variant")) {
    return { criterio: criterio("PVS1", "Strong", "sítio canônico de splice (±1,2)") };
  }
  return { criterio: criterio("PVS1", "Moderate", "perda do códon de início (start_lost)") };
}

// ----------------------------------------------------------------------------- Frequência

export function avaliarFrequencia(variante: Variante, config: Config): Criterio[] {
  const f = config.frequencia;
  const af = variante.grpmax;
  if (af === null) return [criterio("PM2", "Supporting", "ausente no gnomAD")];
  if (af > f.ba1_maior_que) return [criterio("BA1", "StandAlone", `gnomAD grpmax ${af} > ${f.ba1_maior_que}`)];
  if (af > f.bs1_maior_que) return [criterio("BS1", "Strong", `gnomAD grpmax ${af} > ${f.bs1_maior_que}`)];
  if (af < f.pm2_menor_que) return [criterio("PM2", "Supporting", `gnomAD grpmax ${af} < ${f.pm2_menor_que}`)];
  return [];
}

// ----------------------------------------------------------------------------- PM4

export function avaliarPm4(variante: Variante): Criterio | null {
  if (!tem(variante, ...EM_FASE)) return null;
  const tipo = tem(variante, "stop_lost") ? "perda do códon de parada" : "indel em fase";
  return criterio("PM4", "Moderate", `${tipo} (região repetitiva não avaliada)`);
}

// ----------------------------------------------------------------------------- PP3 / BP4 / BP7

function forcaPorLimiar(valor: number, limiares: Limiares, maiorIgual: boolean): Forca | null {
  const ordem: Forca[] = ["VeryStrong", "Strong", "Moderate", "Supporting"];
  for (const forca of ordem) {
    const limite = limiares[forca];
    if (limite === undefined) continue;
    if (maiorIgual ? valor >= limite : valor <= limite) return forca;
  }
  return null;
}

/**
 * Evidência computacional. Um preditor só por tipo de efeito:
 *  - missense: REVEL (proteína) e SpliceAI (splicing); vale o mais forte, sem somar;
 *  - demais variantes não nulas: SpliceAI;
 *  - sinônima com SpliceAI baixo: BP4 + BP7 (Walker 2023).
 * Variantes nulas (PVS1) não recebem PP3, para não contar a mesma evidência duas vezes.
 */
export function avaliarComputacional(
  variante: Variante,
  config: Config,
): { criterios: Criterio[]; naoAvaliados: string[] } {
  const resultado = { criterios: [] as Criterio[], naoAvaliados: [] as string[] };
  if (tem(variante, ...NULAS, "start_lost")) return resultado;

  const { revel, spliceai } = variante;
  const s = config.spliceai;
  const splicePatogenico = spliceai !== null && spliceai >= s.pp3_maior_ou_igual;
  const spliceBenigno = spliceai === null || spliceai <= s.bp4_menor_ou_igual;
  const pp3Splice = (): Criterio => criterio("PP3", "Supporting", `SpliceAI ${spliceai} ≥ ${s.pp3_maior_ou_igual}`);

  if (tem(variante, "missense_variant")) {
    if (revel === null) {
      resultado.naoAvaliados.push("PP3/BP4: missense sem escore REVEL");
      if (splicePatogenico) resultado.criterios.push(pp3Splice());
      return resultado;
    }
    const pp3 = forcaPorLimiar(revel, config.revel.pp3, true);
    const bp4 = forcaPorLimiar(revel, config.revel.bp4, false);
    if (pp3) {
      resultado.criterios.push(criterio("PP3", pp3, `REVEL ${revel}`));
    } else if (splicePatogenico) {
      resultado.criterios.push(pp3Splice());
    } else if (bp4 && spliceBenigno) {
      resultado.criterios.push(criterio("BP4", bp4, `REVEL ${revel} e SpliceAI ${spliceai ?? "ausente"}`));
    }
    return resultado;
  }

  if (splicePatogenico) {
    resultado.criterios.push(pp3Splice());
    return resultado;
  }

  if (spliceai === null) {
    resultado.naoAvaliados.push("PP3/BP4: sem escore SpliceAI");
    return resultado;
  }

  const semEfeitoNaProteina = tem(variante, "synonymous_variant", "intron_variant", "splice_region_variant",
    "splice_donor_region_variant", "splice_donor_5th_base_variant", "splice_polypyrimidine_tract_variant",
    "5_prime_UTR_variant", "3_prime_UTR_variant", "stop_retained_variant", "start_retained_variant");
  if (spliceBenigno && semEfeitoNaProteina) {
    resultado.criterios.push(criterio("BP4", "Supporting", `SpliceAI ${spliceai} ≤ ${s.bp4_menor_ou_igual}`));
    if (tem(variante, "synonymous_variant")) {
      resultado.criterios.push(criterio("BP7", "Supporting", "sinônima sem impacto previsto no splicing"));
    }
  }
  return resultado;
}

// ----------------------------------------------------------------------------- PP2 / BP1

export function avaliarGene(variante: Variante, config: Config): Criterio[] {
  if (!tem(variante, "missense_variant")) return [];
  const saida: Criterio[] = [];
  if (config.genes_pp2.lista.includes(variante.gene)) {
    saida.push(criterio("PP2", "Supporting", `missense em ${variante.gene} (lista PP2 do config)`));
  }
  if (config.genes_bp1.lista.includes(variante.gene)) {
    saida.push(criterio("BP1", "Supporting", `missense em ${variante.gene} (lista BP1 do config)`));
  }
  return saida;
}

// ----------------------------------------------------------------------------- Todos

/** Aplica todos os critérios automáticos a uma variante. */
export function criteriosAutomaticos(
  variante: Variante,
  config: Config,
  genesLof: Map<string, string>,
): { criterios: Criterio[]; naoAvaliados: string[] } {
  const criterios: Criterio[] = [];
  const naoAvaliados: string[] = [];

  const pvs1 = avaliarPvs1(variante, genesLof);
  if (pvs1.criterio) criterios.push(pvs1.criterio);
  if (pvs1.naoAvaliado) naoAvaliados.push(pvs1.naoAvaliado);

  criterios.push(...avaliarFrequencia(variante, config));

  const pm4 = avaliarPm4(variante);
  if (pm4 && !pvs1.criterio) criterios.push(pm4);

  const computacional = avaliarComputacional(variante, config);
  criterios.push(...computacional.criterios);
  naoAvaliados.push(...computacional.naoAvaliados);

  criterios.push(...avaliarGene(variante, config));
  return { criterios, naoAvaliados };
}
