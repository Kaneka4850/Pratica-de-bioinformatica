// =============================================================================
// Leitura da entrada do classificador: TSV de colunas fixas OU VCF anotado
// com o campo CSQ do VEP. As duas formas viram a mesma lista de variantes.
// =============================================================================

import { lerTexto, numero, idVariante } from "./comum.ts";
import type { Variante } from "./tipos.ts";

// Colunas que TODO TSV de entrada precisa ter (o anotador pronto já gera).
export const COLUNAS_OBRIGATORIAS = [
  "cromossomo", "posicao", "ref", "alt", "gene", "consequencia",
  "exon", "gnomad_grpmax_af", "revel", "spliceai_max",
];

// Colunas opcionais: se existirem, aparecem no relatório.
export const COLUNAS_OPCIONAIS = [
  "genotipo", "filtro", "transcrito", "mane", "intron", "hgvs_c", "hgvs_p",
  "impacto", "gnomad_af", "clinvar", "ids_conhecidos",
];

/** Campos de texto antes da padronização (vindos do TSV ou do CSQ). */
type Campos = Record<string, string | number | null | undefined>;

// Ordem de gravidade das consequências (da mais grave para a mais leve), igual à do Ensembl.
export const GRAVIDADE = [
  "transcript_ablation", "splice_acceptor_variant", "splice_donor_variant", "stop_gained",
  "frameshift_variant", "stop_lost", "start_lost", "transcript_amplification", "feature_elongation",
  "feature_truncation", "inframe_insertion", "inframe_deletion", "missense_variant",
  "protein_altering_variant", "splice_donor_5th_base_variant", "splice_region_variant",
  "splice_donor_region_variant", "splice_polypyrimidine_tract_variant", "incomplete_terminal_codon_variant",
  "start_retained_variant", "stop_retained_variant", "synonymous_variant", "coding_sequence_variant",
  "mature_miRNA_variant", "5_prime_UTR_variant", "3_prime_UTR_variant", "non_coding_transcript_exon_variant",
  "intron_variant", "NMD_transcript_variant", "non_coding_transcript_variant", "coding_transcript_variant",
  "upstream_gene_variant", "downstream_gene_variant", "TFBS_ablation", "TFBS_amplification",
  "TF_binding_site_variant", "regulatory_region_ablation", "regulatory_region_amplification",
  "regulatory_region_variant", "intergenic_variant", "sequence_variant",
];

export function gravidade(consequencias: string[]): number {
  const posicoes = consequencias.map((c) => GRAVIDADE.indexOf(c)).filter((i) => i >= 0);
  return posicoes.length ? Math.min(...posicoes) : GRAVIDADE.length;
}

/** Desfaz o escape do VEP no CSQ (%3D é "=", %3B é ";" etc.). */
function decodificar(valor: string | undefined): string {
  if (!valor) return "";
  try {
    return decodeURIComponent(valor);
  } catch {
    return valor;
  }
}

function separarConsequencias(texto: unknown): string[] {
  return String(texto ?? "").split(/[&,]/).map((c) => c.trim()).filter(Boolean);
}

/** Maior valor numérico de uma lista "0.1&0.5" ou de vários campos. */
function maximo(...valores: unknown[]): number | null {
  const numeros = valores
    .flatMap((v) => String(v ?? "").split("&"))
    .map(numero)
    .filter((n): n is number => n !== null);
  return numeros.length ? Math.max(...numeros) : null;
}

const texto = (v: unknown): string => (v === undefined || v === null ? "" : String(v));

/** Monta a variante padronizada usada pelos critérios. */
function montarVariante(c: Campos): Variante {
  return {
    id: idVariante(texto(c.cromossomo), texto(c.posicao), texto(c.ref), texto(c.alt)),
    cromossomo: texto(c.cromossomo),
    posicao: Number(c.posicao),
    ref: texto(c.ref),
    alt: texto(c.alt),
    genotipo: texto(c.genotipo),
    filtro: texto(c.filtro),
    gene: texto(c.gene),
    transcrito: texto(c.transcrito),
    mane: texto(c.mane),
    exon: texto(c.exon),
    intron: texto(c.intron),
    hgvs_c: texto(c.hgvs_c),
    hgvs_p: texto(c.hgvs_p),
    consequencias: separarConsequencias(c.consequencia),
    impacto: texto(c.impacto),
    grpmax: numero(c.gnomad_grpmax_af),
    gnomad_af: numero(c.gnomad_af),
    revel: maximo(c.revel),
    spliceai: maximo(c.spliceai_max),
    clinvar: texto(c.clinvar),
    ids_conhecidos: texto(c.ids_conhecidos),
  };
}

// ----------------------------------------------------------------------------- TSV

export function lerTsv(conteudo: string, origem = "TSV"): Variante[] {
  const linhas = conteudo.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("##"));
  const [primeira, ...dados] = linhas;
  if (primeira === undefined) throw new Error(`${origem}: arquivo vazio.`);
  const cabecalho = primeira.replace(/^#/, "").split("\t").map((c) => c.trim());
  const faltando = COLUNAS_OBRIGATORIAS.filter((c) => !cabecalho.includes(c));
  if (faltando.length) {
    throw new Error(
      `${origem}: faltam colunas obrigatórias: ${faltando.join(", ")}.\n` +
        `Colunas obrigatórias: ${COLUNAS_OBRIGATORIAS.join(", ")}.`,
    );
  }
  return dados.map((linha, i) => {
    const valores = linha.split("\t");
    const campos: Campos = Object.fromEntries(cabecalho.map((c, j) => [c, (valores[j] ?? "").trim()]));
    if (!campos.cromossomo || !campos.posicao || !campos.ref || !campos.alt) {
      throw new Error(`${origem}, linha ${i + 2}: cromossomo, posicao, ref e alt não podem ficar vazios.`);
    }
    return montarVariante(campos);
  });
}

// ----------------------------------------------------------------------------- VCF

type EntradaCsq = Record<string, string>;

/** Pega a lista de campos do CSQ no cabeçalho: ##INFO=<ID=CSQ,...Format: A|B|C">. */
function camposCsq(linhasCabecalho: string[]): string[] {
  const linha = linhasCabecalho.find((l) => l.startsWith("##INFO=<ID=CSQ"));
  if (!linha) {
    throw new Error("VCF sem o campo CSQ no cabeçalho. Use o VCF gerado pelo anotador (etapa 04).");
  }
  const formato = linha.match(/Format: ([^"]+)"/);
  if (!formato?.[1]) throw new Error("Não achei 'Format:' na definição do CSQ.");
  return formato[1].trim().split("|");
}

/** Escolhe a anotação do transcrito principal: MANE > canônico > PICK > mais grave. */
function escolherTranscrito(entradas: EntradaCsq[]): EntradaCsq | undefined {
  const nota = (e: EntradaCsq): number[] => [
    e.MANE_SELECT || e.MANE ? 0 : 1,
    e.CANONICAL === "YES" || e.CANONICAL === "1" ? 0 : 1,
    e.PICK === "1" ? 0 : 1,
    gravidade(separarConsequencias(e.Consequence)),
  ];
  return [...entradas].sort((a, b) => {
    const na = nota(a);
    const nb = nota(b);
    for (let i = 0; i < na.length; i++) {
      const diferenca = (na[i] ?? 0) - (nb[i] ?? 0);
      if (diferenca !== 0) return diferenca;
    }
    return 0;
  })[0];
}

/** Converte uma entrada do CSQ (nomes do VEP) para as colunas do TSV. */
function csqParaCampos(e: EntradaCsq): Campos {
  const pops = ["AFR", "AMR", "EAS", "NFE", "SAS"];
  const grpmax =
    numero(e.gnomAD_grpmax_AF) ??
    maximo(...pops.flatMap((p) => [e[`gnomADe_${p}_AF`], e[`gnomADg_${p}_AF`]])) ??
    numero(e.MAX_AF);
  const spliceai =
    numero(e.SpliceAI_max) ??
    maximo(e.SpliceAI_pred_DS_AG, e.SpliceAI_pred_DS_AL, e.SpliceAI_pred_DS_DG, e.SpliceAI_pred_DS_DL);
  return {
    gene: e.SYMBOL,
    transcrito: e.Feature,
    mane: e.MANE_SELECT || e.MANE || "",
    exon: e.EXON,
    intron: e.INTRON,
    hgvs_c: decodificar(e.HGVSc).split(":").pop(),
    hgvs_p: decodificar(e.HGVSp).split(":").pop(),
    consequencia: e.Consequence,
    impacto: e.IMPACT,
    gnomad_grpmax_af: grpmax,
    gnomad_af: e.gnomAD_AF ?? e.gnomADe_AF ?? e.gnomADg_AF ?? "",
    revel: e.REVEL ?? e.REVEL_score ?? "",
    spliceai_max: spliceai,
    clinvar: decodificar(e.CLIN_SIG).replace(/&/g, ","),
    ids_conhecidos: decodificar(e.Existing_variation).replace(/&/g, ","),
  };
}

export function lerVcf(conteudo: string): Variante[] {
  const linhas = conteudo.split(/\r?\n/);
  const campos = camposCsq(linhas.filter((l) => l.startsWith("##")));
  const variantes: Variante[] = [];

  for (const linha of linhas) {
    if (!linha || linha.startsWith("#")) continue;
    const [cromossomo = "", posicao = "", , ref = "", altTexto = "", , filtro = "", info = "", formato, amostra] =
      linha.split("\t");
    const csqBruto = info.split(";").find((c) => c.startsWith("CSQ="));
    const entradas: EntradaCsq[] = csqBruto
      ? csqBruto.slice(4).split(",").map((bloco) => {
          const valores = bloco.split("|");
          return Object.fromEntries(campos.map((c, i) => [c, valores[i] ?? ""]));
        })
      : [];

    let genotipo = "";
    if (formato && amostra) {
      const indiceGt = formato.split(":").indexOf("GT");
      if (indiceGt >= 0) genotipo = amostra.split(":")[indiceGt] ?? "";
    }

    const alts = altTexto.split(",");
    for (const alt of alts) {
      if (alt === "*" || alt === "<NON_REF>" || alt === ".") continue;
      // O VEP escreve o alelo sem a base de âncora nos indels; se não bater, usa todas.
      const doAlelo = entradas.filter((e) => e.Allele === alt);
      const candidatas = doAlelo.length ? doAlelo : alts.length === 1 ? entradas : [];
      const escolhida = escolherTranscrito(candidatas);
      variantes.push(
        montarVariante({
          cromossomo, posicao, ref, alt, genotipo, filtro, consequencia: "",
          ...(escolhida ? csqParaCampos(escolhida) : {}),
        }),
      );
    }
  }
  return variantes;
}

/** Decide pelo conteúdo se o arquivo é VCF ou TSV e devolve as variantes. */
export function lerEntrada(caminho: string): { formato: "VCF" | "TSV"; variantes: Variante[] } {
  const conteudo = lerTexto(caminho);
  if (conteudo.startsWith("##fileformat=VCF")) return { formato: "VCF", variantes: lerVcf(conteudo) };
  return { formato: "TSV", variantes: lerTsv(conteudo, caminho) };
}
