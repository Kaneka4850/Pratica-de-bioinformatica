// =============================================================================
// Tipos do classificador ACMG.
// =============================================================================

/** Forças de evidência, da mais fraca para a mais forte. "StandAlone" só existe no BA1. */
export type Forca = "Supporting" | "Moderate" | "Strong" | "VeryStrong" | "StandAlone";

/** Lado da evidência: patogênico (P) ou benigno (B). */
export type Lado = "P" | "B";

/** Classes ACMG: patogênica, provavelmente patogênica, VUS, provavelmente benigna, benigna. */
export type Classe = "P" | "LP" | "VUS" | "LB" | "B";

export type Origem = "automatico" | "informado" | "teste";

/** Um critério aplicado a uma variante (ex.: PVS1 com força Strong). */
export interface Criterio {
  codigo: string;
  forca: Forca;
  origem: Origem;
  motivo?: string;
}

/** Variante já padronizada, igual para entrada TSV ou VCF. */
export interface Variante {
  id: string;
  cromossomo: string;
  posicao: number;
  ref: string;
  alt: string;
  genotipo: string;
  filtro: string;
  gene: string;
  transcrito: string;
  mane: string;
  exon: string;
  intron: string;
  hgvs_c: string;
  hgvs_p: string;
  consequencias: string[];
  impacto: string;
  /** Maior frequência populacional no gnomAD; null = ausente do gnomAD. */
  grpmax: number | null;
  gnomad_af: number | null;
  revel: number | null;
  spliceai: number | null;
  clinvar: string;
  ids_conhecidos: string;
}

/** Limiares por força (ex.: { Strong: 0.932, Moderate: 0.773 }). */
export type Limiares = Partial<Record<Forca, number>>;

/** Conteúdo do config.json. */
export interface Config {
  versao: string;
  frequencia: {
    ba1_maior_que: number;
    bs1_maior_que: number;
    pm2_menor_que: number;
  };
  revel: { pp3: Limiares; bp4: Limiares };
  spliceai: { pp3_maior_ou_igual: number; bp4_menor_ou_igual: number };
  pontos: {
    forca: Record<Forca, number>;
    patogenica_minimo: number;
    provavelmente_patogenica_minimo: number;
    vus_minimo: number;
    provavelmente_benigna_minimo: number;
  };
  genes_pp2: { lista: string[] };
  genes_bp1: { lista: string[] };
}

/** Uma linha do arquivo de evidências manuais, já validada. */
export interface Evidencia {
  alvo: { tipo: "id" | "hgvs"; chave: string };
  codigo: string;
  forca: Forca;
  justificativa: string;
}

/** Tudo o que a classificação de uma variante precisa. */
export interface Contexto {
  config: Config;
  genesLof: Map<string, string>;
  evidencias?: Evidencia[];
}

export interface Resultado {
  variante: Variante;
  criterios: Criterio[];
  substituidos: Criterio[];
  naoAvaliados: string[];
  pontos: number;
  classe: Classe;
  classe2015: Classe;
  conflito2015: boolean;
}
