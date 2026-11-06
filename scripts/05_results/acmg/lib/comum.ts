// =============================================================================
// Definições comuns do classificador: códigos ACMG, forças, classes e leitura
// de arquivos de texto (comuns ou .gz).
// =============================================================================

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import type { Classe, Config, Criterio, Forca, Lado } from "./tipos.ts";

export const PASTA_ACMG = join(dirname(fileURLToPath(import.meta.url)), "..");

export const FORCAS: Forca[] = ["Supporting", "Moderate", "Strong", "VeryStrong", "StandAlone"];

// Nomes aceitos no arquivo de evidências (em inglês ou português).
export const SINONIMOS_FORCA: Record<string, Forca> = {
  supporting: "Supporting", apoio: "Supporting", suporte: "Supporting",
  moderate: "Moderate", moderada: "Moderate", moderado: "Moderate",
  strong: "Strong", forte: "Strong",
  verystrong: "VeryStrong", very_strong: "VeryStrong", muito_forte: "VeryStrong", muitoforte: "VeryStrong",
  standalone: "StandAlone", stand_alone: "StandAlone", isolada: "StandAlone",
};

// Os 28 critérios do Richards 2015, com o lado e a força padrão.
export const CRITERIOS: Record<string, { lado: Lado; forca: Forca }> = {
  PVS1: { lado: "P", forca: "VeryStrong" },
  PS1: { lado: "P", forca: "Strong" }, PS2: { lado: "P", forca: "Strong" },
  PS3: { lado: "P", forca: "Strong" }, PS4: { lado: "P", forca: "Strong" },
  PM1: { lado: "P", forca: "Moderate" }, PM2: { lado: "P", forca: "Supporting" }, // PM2 rebaixado (ClinGen SVI 2020)
  PM3: { lado: "P", forca: "Moderate" }, PM4: { lado: "P", forca: "Moderate" },
  PM5: { lado: "P", forca: "Moderate" }, PM6: { lado: "P", forca: "Moderate" },
  PP1: { lado: "P", forca: "Supporting" }, PP2: { lado: "P", forca: "Supporting" },
  PP3: { lado: "P", forca: "Supporting" }, PP4: { lado: "P", forca: "Supporting" },
  BA1: { lado: "B", forca: "StandAlone" },
  BS1: { lado: "B", forca: "Strong" }, BS2: { lado: "B", forca: "Strong" },
  BS3: { lado: "B", forca: "Strong" }, BS4: { lado: "B", forca: "Strong" },
  BP1: { lado: "B", forca: "Supporting" }, BP2: { lado: "B", forca: "Supporting" },
  BP3: { lado: "B", forca: "Supporting" }, BP4: { lado: "B", forca: "Supporting" },
  BP5: { lado: "B", forca: "Supporting" }, BP7: { lado: "B", forca: "Supporting" },
};

// Aposentados pela ClinGen SVI (Biesecker & Harrison 2018): não são aceitos.
export const CRITERIOS_APOSENTADOS = ["PP5", "BP6"];

// Critérios que o classificador calcula sozinho a partir da anotação.
export const CRITERIOS_AUTOMATICOS = ["PVS1", "PM2", "PM4", "PP2", "PP3", "BA1", "BS1", "BP1", "BP4", "BP7"];

// Critérios que dependem de dados fora do VCF (família, função, literatura...).
export const CRITERIOS_MANUAIS = Object.keys(CRITERIOS).filter((c) => !CRITERIOS_AUTOMATICOS.includes(c));

export const CLASSES: Record<Classe, string> = {
  P: "Patogênica",
  LP: "Provavelmente patogênica",
  VUS: "VUS (significado incerto)",
  LB: "Provavelmente benigna",
  B: "Benigna",
};
export const ORDEM_CLASSES: Classe[] = ["P", "LP", "VUS", "LB", "B"];

export function ladoDe(codigo: string): Lado {
  const definicao = CRITERIOS[codigo];
  if (!definicao) throw new Error(`Critério desconhecido: ${codigo}`);
  return definicao.lado;
}

/** Escreve o critério com a força quando ela difere da padrão: "PVS1_Strong". */
export function rotulo(criterio: Criterio): string {
  const padrao = CRITERIOS[criterio.codigo]?.forca;
  return criterio.forca === padrao ? criterio.codigo : `${criterio.codigo}_${criterio.forca}`;
}

/** Lê um arquivo de texto, descompactando se for .gz (aceita BGZF de vários blocos). */
export function lerTexto(caminho: string): string {
  const bruto = readFileSync(caminho);
  const compactado = bruto.length > 2 && bruto[0] === 0x1f && bruto[1] === 0x8b;
  return (compactado ? gunzipSync(bruto) : bruto).toString("utf8");
}

/** Converte texto em número; vazio, "." ou "NA" viram null. */
export function numero(valor: unknown): number | null {
  if (valor === undefined || valor === null) return null;
  const texto = String(valor).trim();
  if (texto === "" || texto === "." || texto.toUpperCase() === "NA") return null;
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

/** Identificador padrão de variante: "17:43045712:G:A" (sem o prefixo chr). */
export function idVariante(cromossomo: string, posicao: string | number, ref: string, alt: string): string {
  return `${String(cromossomo).replace(/^chr/i, "")}:${posicao}:${ref}:${alt}`;
}

export function carregarConfig(caminho: string = join(PASTA_ACMG, "config.json")): Config {
  return JSON.parse(readFileSync(caminho, "utf8")) as Config;
}

/** Lê genes_lof.tsv e devolve um Map gene -> escore de haploinsuficiência da ClinGen. */
export function carregarGenesLof(caminho: string = join(PASTA_ACMG, "genes_lof.tsv")): Map<string, string> {
  const genes = new Map<string, string>();
  for (const linha of readFileSync(caminho, "utf8").split(/\r?\n/)) {
    if (!linha || linha.startsWith("#") || linha.startsWith("gene\t")) continue;
    const [gene, escore = ""] = linha.split("\t");
    if (gene) genes.set(gene, escore);
  }
  return genes;
}
