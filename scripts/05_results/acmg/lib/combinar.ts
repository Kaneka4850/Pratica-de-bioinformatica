// =============================================================================
// Combinação dos critérios em uma classe, de duas formas:
//   1. Pontos (Tavtigian 2018/2020): a classe FINAL do classificador.
//   2. Regras da Tabela 5 do Richards 2015: mostrada ao lado, para comparação.
// =============================================================================

import { ladoDe } from "./comum.ts";
import type { Classe, Config, Criterio } from "./tipos.ts";

// ----------------------------------------------------------------------------- Pontos

export function somarPontos(criterios: Criterio[], config: Config): number {
  const valores = config.pontos.forca;
  return criterios.reduce((soma, c) => {
    const sinal = ladoDe(c.codigo) === "P" ? 1 : -1;
    return soma + sinal * valores[c.forca];
  }, 0);
}

/**
 * Pontos -> classe. BA1 é isolado: basta ele para "Benigna" (Tavtigian 2020).
 * >=10 P | 6..9 LP | 0..5 VUS | -1..-6 LB | <=-7 B
 */
export function classePorPontos(criterios: Criterio[], config: Config): { pontos: number; classe: Classe } {
  const pontos = somarPontos(criterios, config);
  const p = config.pontos;
  if (criterios.some((c) => c.codigo === "BA1")) return { pontos, classe: "B" };
  if (pontos >= p.patogenica_minimo) return { pontos, classe: "P" };
  if (pontos >= p.provavelmente_patogenica_minimo) return { pontos, classe: "LP" };
  if (pontos >= p.vus_minimo) return { pontos, classe: "VUS" };
  if (pontos >= p.provavelmente_benigna_minimo) return { pontos, classe: "LB" };
  return { pontos, classe: "B" };
}

// ----------------------------------------------------------------------------- Richards 2015

export interface Contagem {
  PVS: number; PS: number; PM: number; PP: number; BA: number; BS: number; BP: number;
}

/**
 * Conta os critérios pela força com que foram aplicados (ex.: PVS1_Strong conta
 * como forte; PM2_Supporting conta como de apoio), como o próprio Richards 2015
 * permite ao ajustar a força de um critério.
 */
export function contarForcas(criterios: Criterio[]): Contagem {
  const n: Contagem = { PVS: 0, PS: 0, PM: 0, PP: 0, BA: 0, BS: 0, BP: 0 };
  for (const c of criterios) {
    if (ladoDe(c.codigo) === "P") {
      if (c.forca === "VeryStrong") n.PVS++;
      else if (c.forca === "Strong") n.PS++;
      else if (c.forca === "Moderate") n.PM++;
      else n.PP++;
    } else if (c.forca === "StandAlone") n.BA++;
    else if (c.forca === "Strong" || c.forca === "VeryStrong") n.BS++;
    else n.BP++; // BP4_Moderate conta como BP: o Richards 2015 não tem "benigno moderado"
  }
  return n;
}

/** Tabela 5 do Richards 2015 (regras de combinação). */
export function classe2015(criterios: Criterio[]): { classe: Classe; conflito: boolean } {
  const n = contarForcas(criterios);

  const patogenica =
    (n.PVS >= 1 && (n.PS >= 1 || n.PM >= 2 || (n.PM === 1 && n.PP === 1) || n.PP >= 2)) ||
    n.PS >= 2 ||
    (n.PS === 1 && (n.PM >= 3 || (n.PM === 2 && n.PP >= 2) || (n.PM === 1 && n.PP >= 4)));

  const provavelmentePatogenica =
    (n.PVS === 1 && n.PM === 1) ||
    (n.PS === 1 && (n.PM === 1 || n.PM === 2)) ||
    (n.PS === 1 && n.PP >= 2) ||
    n.PM >= 3 ||
    (n.PM === 2 && n.PP >= 2) ||
    (n.PM === 1 && n.PP >= 4);

  const benigna = n.BA >= 1 || n.BS >= 2;
  const provavelmenteBenigna = (n.BS === 1 && n.BP >= 1) || n.BP >= 2;

  // Evidências contraditórias -> VUS (Richards 2015, nota da Tabela 5).
  if ((patogenica || provavelmentePatogenica) && (benigna || provavelmenteBenigna)) {
    return { classe: "VUS", conflito: true };
  }
  if (patogenica) return { classe: "P", conflito: false };
  if (provavelmentePatogenica) return { classe: "LP", conflito: false };
  if (benigna) return { classe: "B", conflito: false };
  if (provavelmenteBenigna) return { classe: "LB", conflito: false };
  return { classe: "VUS", conflito: false };
}
