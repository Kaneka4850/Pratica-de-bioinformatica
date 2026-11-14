#!/usr/bin/env node
// =============================================================================
// Anota um VCF pela API REST do Ensembl VEP (sem cache local).
// A anotação usa exclusivamente a API REST pública do Ensembl VEP; o script foi
// escrito para esta atividade didática.
// -----------------------------------------------------------------------------
// PARTE PRONTA DO EXERCÍCIO: validada pelo professor. Não altere.
//
// Como usar:
//   node scripts/04_annotate/anotar_vep.mjs --vcf dados/03_variant_calling/hg38/amostra.vcf.gz \
//       --genoma hg38 --saida dados/04_annotate/hg38 --amostra amostra
//
// Gera em --saida:
//   <amostra>.vep.tsv     tabela de colunas fixas (entrada do classificador)
//   <amostra>.vep.vcf.gz  o mesmo VCF com o campo INFO/CSQ (também aceito pelo classificador)
//   <amostra>.vep.json    resposta completa da API, para explorar
//
// Para cada variante pedimos ao VEP: HGVS, número do exon, transcrito canônico e MANE
// (MANE só existe no GRCh38), frequências do gnomAD (ou do 1000 Genomes, se o gnomAD
// faltar; coluna fonte_frequencia), REVEL, SpliceAI e ClinVar.
//
// PRIVACIDADE: as variantes são enviadas aos servidores do Ensembl. Use só dados públicos.
// Documentação: https://rest.ensembl.org/documentation/info/vep_region_post
// =============================================================================

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { parseArgs } from "node:util";

const SERVIDORES = {
  hg19: { url: "https://grch37.rest.ensembl.org/vep/homo_sapiens/region", assembly: "GRCh37", mane: false },
  hg38: { url: "https://rest.ensembl.org/vep/homo_sapiens/region", assembly: "GRCh38", mane: true },
};
const VARIANTES_POR_PEDIDO = 200; // limite da API
const TENTATIVAS = 6;
const TEMPO_LIMITE_MS = 180_000;
const PAUSA_MS = 400; // a API aceita até 15 pedidos por segundo
const POPULACOES_GRPMAX = ["afr", "amr", "eas", "nfe", "sas"]; // mesmas do gnomAD grpmax
const POPULACOES_1000G = ["afr", "amr", "eas", "eur", "sas"]; // usadas só se faltar o gnomAD

export const COLUNAS_TSV = [
  "cromossomo", "posicao", "ref", "alt", "genotipo", "filtro", "gene", "transcrito", "mane",
  "exon", "intron", "hgvs_c", "hgvs_p", "consequencia", "impacto", "gnomad_af",
  "gnomad_grpmax_af", "fonte_frequencia", "revel", "spliceai_max", "clinvar", "ids_conhecidos",
];

// Campos do CSQ no VCF de saída (nomes iguais aos do VEP de linha de comando).
const CAMPOS_CSQ = [
  ["Allele", "alt"], ["Consequence", "consequencia"], ["IMPACT", "impacto"], ["SYMBOL", "gene"],
  ["Feature", "transcrito"], ["MANE_SELECT", "mane"], ["EXON", "exon"], ["INTRON", "intron"],
  ["HGVSc", "hgvs_c"], ["HGVSp", "hgvs_p"], ["gnomAD_AF", "gnomad_af"],
  ["gnomAD_grpmax_AF", "gnomad_grpmax_af"], ["Frequency_source", "fonte_frequencia"], ["REVEL", "revel"], ["SpliceAI_max", "spliceai_max"],
  ["CLIN_SIG", "clinvar"], ["Existing_variation", "ids_conhecidos"],
];

const GRAVIDADE = [
  "transcript_ablation", "splice_acceptor_variant", "splice_donor_variant", "stop_gained",
  "frameshift_variant", "stop_lost", "start_lost", "transcript_amplification", "feature_elongation",
  "feature_truncation", "inframe_insertion", "inframe_deletion", "missense_variant",
  "protein_altering_variant", "splice_donor_5th_base_variant", "splice_region_variant",
  "splice_donor_region_variant", "splice_polypyrimidine_tract_variant", "incomplete_terminal_codon_variant",
  "start_retained_variant", "stop_retained_variant", "synonymous_variant", "coding_sequence_variant",
  "mature_miRNA_variant", "5_prime_UTR_variant", "3_prime_UTR_variant", "non_coding_transcript_exon_variant",
  "intron_variant", "NMD_transcript_variant", "non_coding_transcript_variant", "upstream_gene_variant",
  "downstream_gene_variant", "intergenic_variant",
];
const gravidade = (termos = []) =>
  Math.min(GRAVIDADE.length, ...termos.map((t) => GRAVIDADE.indexOf(t)).filter((i) => i >= 0));

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ----------------------------------------------------------------------------- Leitura do VCF

function lerTexto(caminho) {
  const bruto = readFileSync(caminho);
  return (bruto[0] === 0x1f && bruto[1] === 0x8b ? gunzipSync(bruto) : bruto).toString("utf8");
}

/** Lê o VCF e devolve o cabeçalho e uma entrada por ALT (variantes multialélicas são separadas). */
export function lerVcf(texto) {
  const cabecalho = [];
  const registros = [];
  for (const linha of texto.split(/\r?\n/)) {
    if (!linha) continue;
    if (linha.startsWith("#")) {
      cabecalho.push(linha);
      continue;
    }
    const colunas = linha.split("\t");
    const [cromossomo, posicao, id, ref, altTexto, , filtro, , formato, amostra] = colunas;
    let genotipo = "";
    if (formato && amostra) {
      const i = formato.split(":").indexOf("GT");
      if (i >= 0) genotipo = amostra.split(":")[i] ?? "";
    }
    const alts = altTexto.split(",").filter((a) => a !== "*" && a !== "." && !a.startsWith("<"));
    const entradas = alts.map((alt) => ({
      cromossomo, posicao, id, ref, alt, genotipo, filtro,
      // Formato aceito pela API: "17 7675088 . C T . . ." (sem o "chr").
      entradaVep: `${cromossomo.replace(/^chr/i, "")} ${posicao} . ${ref} ${alt} . . .`,
    }));
    registros.push({ colunas, entradas });
  }
  return { cabecalho, registros };
}

// ----------------------------------------------------------------------------- API do VEP

async function pedir(servidor, lote) {
  const corpo = {
    variants: lote,
    hgvs: 1, numbers: 1, canonical: 1, variant_class: 1, REVEL: 1, SpliceAI: 1,
    ...(servidor.mane ? { mane: 1 } : {}),
  };
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    let resposta;
    try {
      resposta = await fetch(servidor.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
    } catch (erro) {
      const espera = 2 ** tentativa;
      console.log(`  Falha de conexão (${erro.message}). Tentando de novo em ${espera}s...`);
      await esperar(espera * 1000);
      continue;
    }
    if (resposta.ok) return { ok: true, dados: await resposta.json() };
    if (resposta.status === 429 || resposta.status >= 500) {
      const espera = Number(resposta.headers.get("Retry-After")) || 2 ** tentativa;
      console.log(`  API ocupada (erro ${resposta.status}). Esperando ${espera}s...`);
      await esperar(espera * 1000);
      continue;
    }
    return { ok: false, status: resposta.status, mensagem: await resposta.text() };
  }
  throw new Error("A API do VEP não respondeu depois de várias tentativas. Confira a internet e rode de novo.");
}

/** Consulta um lote; se a API recusar o lote (erro 400), tenta variante por variante. */
async function consultarLote(servidor, lote) {
  const resposta = await pedir(servidor, lote);
  if (resposta.ok) return resposta.dados;
  if (resposta.status === 400 && lote.length > 1) {
    console.log("  A API recusou o lote (erro 400). Consultando uma variante de cada vez...");
    const dados = [];
    for (const entrada of lote) {
      const uma = await pedir(servidor, [entrada]);
      if (uma.ok) dados.push(...uma.dados);
      else console.log(`  AVISO: o VEP não anotou "${entrada}": ${uma.mensagem.slice(0, 200)}`);
      await esperar(PAUSA_MS);
    }
    return dados;
  }
  if (resposta.status === 400) {
    console.log(`  AVISO: o VEP não anotou "${lote[0]}": ${resposta.mensagem.slice(0, 200)}`);
    return [];
  }
  throw new Error(`Erro ${resposta.status} da API do VEP: ${resposta.mensagem.slice(0, 300)}`);
}

// ----------------------------------------------------------------------------- Resumo de cada variante

function escolherTranscrito(anotacao) {
  const transcritos = anotacao.transcript_consequences ?? [];
  const nota = (t) => [t.mane_select ? 0 : 1, t.canonical ? 0 : 1, t.biotype === "protein_coding" ? 0 : 1, gravidade(t.consequence_terms)];
  return [...transcritos].sort((a, b) => {
    const [na, nb] = [nota(a), nota(b)];
    for (let i = 0; i < na.length; i++) if (na[i] !== nb[i]) return na[i] - nb[i];
    return 0;
  })[0];
}

function maximoSpliceAi(transcrito) {
  const s = transcrito?.spliceai;
  if (!s) return null;
  const valores = ["DS_AG", "DS_AL", "DS_DG", "DS_DL"].map((k) => s[k]).filter((v) => typeof v === "number");
  return valores.length ? Math.max(...valores) : null;
}

/**
 * Frequências do alelo alternativo. Usa o gnomAD (exomas "gnomade_" e genomas "gnomadg_").
 * Se o VEP não trouxer gnomAD para a variante (acontece, por exemplo, em sítios onde a
 * referência hg19 tem o alelo raro), usa as populações continentais do 1000 Genomes.
 */
function frequencias(anotacao, alelo) {
  let global = null;
  let grpmax = null;
  let global1000g = null;
  let max1000g = null;
  for (const conhecida of anotacao.colocated_variants ?? []) {
    const f = conhecida.frequencies?.[alelo];
    if (!f) continue;
    for (const [chave, valor] of Object.entries(f)) {
      if (typeof valor !== "number") continue;
      if (chave === "gnomade" || chave === "gnomadg") global = Math.max(global ?? 0, valor);
      const pop = chave.match(/^gnomad[eg]_(\w+)$/)?.[1];
      if (pop && POPULACOES_GRPMAX.includes(pop)) grpmax = Math.max(grpmax ?? 0, valor);
      if (chave === "af") global1000g = Math.max(global1000g ?? 0, valor);
      if (POPULACOES_1000G.includes(chave)) max1000g = Math.max(max1000g ?? 0, valor);
    }
  }
  if (grpmax !== null || global !== null) return { global, grpmax, fonte: "gnomAD" };
  if (max1000g !== null || global1000g !== null) {
    return { global: global1000g, grpmax: max1000g ?? global1000g, fonte: "1000G" };
  }
  return { global: null, grpmax: null, fonte: "" };
}

/** Significância clínica do ClinVar para o alelo alternativo (ex.: "pathogenic,likely_pathogenic"). */
function clinvar(anotacao, alelo) {
  const termos = new Set();
  for (const conhecida of anotacao.colocated_variants ?? []) {
    if (conhecida.clin_sig_allele) {
      for (const par of conhecida.clin_sig_allele.split(";")) {
        const [a, termo] = par.split(":");
        if (a === alelo && termo) termo.split("/").forEach((t) => termos.add(t));
      }
    }
  }
  return [...termos].sort().join(",");
}

export function resumir(entrada, anotacao) {
  const base = {
    cromossomo: entrada.cromossomo, posicao: entrada.posicao, ref: entrada.ref, alt: entrada.alt,
    genotipo: entrada.genotipo, filtro: entrada.filtro,
  };
  if (!anotacao) return { ...base, consequencia: "nao_anotada" };

  // O VEP reescreve o alelo dos indels sem a base de âncora ("AG>A" vira "G/-").
  const alelo = (anotacao.allele_string ?? "/").split("/").pop();
  const t = escolherTranscrito(anotacao) ?? {};
  const spliceai = maximoSpliceAi(t) ??
    Math.max(-1, ...(anotacao.transcript_consequences ?? []).map(maximoSpliceAi).filter((v) => v !== null));
  const { global, grpmax, fonte } = frequencias(anotacao, alelo);
  const ids = (anotacao.colocated_variants ?? []).map((c) => c.id).filter((id) => /^rs\d+/.test(id ?? ""));

  return {
    ...base,
    gene: t.gene_symbol ?? "",
    transcrito: t.transcript_id ?? "",
    mane: t.mane_select ?? "",
    exon: t.exon ?? "",
    intron: t.intron ?? "",
    hgvs_c: (t.hgvsc ?? "").split(":").pop(),
    hgvs_p: (t.hgvsp ?? "").split(":").pop(),
    consequencia: (t.consequence_terms ?? [anotacao.most_severe_consequence ?? ""]).join(","),
    impacto: t.impact ?? "",
    gnomad_af: global ?? "",
    gnomad_grpmax_af: grpmax ?? "",
    fonte_frequencia: fonte,
    revel: t.revel ?? "",
    spliceai_max: spliceai >= 0 ? spliceai : "",
    clinvar: clinvar(anotacao, alelo),
    ids_conhecidos: [...new Set(ids)].join(","),
  };
}

// ----------------------------------------------------------------------------- Saídas

const limpar = (v) => String(v ?? "").replace(/[\t\r\n]/g, " ");
// Escape usado pelo VEP dentro do CSQ: estes caracteres quebrariam o VCF.
const escaparCsq = (v) => String(v ?? "").replace(/[%;=, |]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);

function csq(linha) {
  return CAMPOS_CSQ.map(([, coluna]) => {
    const valor = linha[coluna];
    if (coluna === "consequencia" || coluna === "clinvar" || coluna === "ids_conhecidos") {
      return String(valor ?? "").split(",").filter(Boolean).map(escaparCsq).join("&");
    }
    return escaparCsq(valor);
  }).join("|");
}

function gravarVcf(cabecalho, registros, linhasPorEntrada, caminhoGz) {
  const saida = [];
  const definicao = `##INFO=<ID=CSQ,Number=.,Type=String,Description="Anotacao Ensembl VEP (API REST) pelo anotar_vep.mjs. Format: ${CAMPOS_CSQ.map(([c]) => c).join("|")}">`;
  for (const linha of cabecalho) {
    if (linha.startsWith("##INFO=<ID=CSQ")) continue;
    if (linha.startsWith("#CHROM")) saida.push(definicao, "##anotar_vep=scripts/04_annotate/anotar_vep.mjs");
    saida.push(linha);
  }
  for (const { colunas, entradas } of registros) {
    const blocos = entradas.map((e) => csq(linhasPorEntrada.get(e))).filter(Boolean);
    const copia = [...colunas];
    if (blocos.length) {
      const info = copia[7] === "." ? [] : copia[7].split(";").filter((c) => !c.startsWith("CSQ="));
      copia[7] = [...info, `CSQ=${blocos.join(",")}`].join(";");
    }
    saida.push(copia.join("\t"));
  }
  const texto = saida.join("\n") + "\n";
  const semGz = caminhoGz.replace(/\.gz$/, "");
  writeFileSync(semGz, texto);
  // bgzip + tabix quando existirem (Docker/conda); senão, gzip comum do Node.
  const bgzip = spawnSync("bgzip", ["-f", semGz], { stdio: "ignore" });
  if (bgzip.status === 0) {
    spawnSync("tabix", ["-f", "-p", "vcf", caminhoGz], { stdio: "ignore" });
  } else {
    writeFileSync(caminhoGz, gzipSync(texto));
    if (existsSync(semGz)) rmSync(semGz);
  }
}

// ----------------------------------------------------------------------------- Principal

async function main() {
  const { values: a } = parseArgs({
    options: {
      vcf: { type: "string" },
      genoma: { type: "string" },
      saida: { type: "string" },
      amostra: { type: "string", default: "amostra" },
      ajuda: { type: "boolean", short: "h" },
    },
  });
  if (a.ajuda || !a.vcf || !a.saida || !SERVIDORES[a.genoma]) {
    console.log("Uso: node anotar_vep.mjs --vcf <arquivo.vcf.gz> --genoma hg19|hg38 --saida <pasta> [--amostra nome]");
    process.exit(a.ajuda ? 0 : 2);
  }
  const servidor = SERVIDORES[a.genoma];
  const { cabecalho, registros } = lerVcf(lerTexto(a.vcf));
  const entradas = registros.flatMap((r) => r.entradas);
  console.log(`${entradas.length} variante(s) no VCF. Anotando no ${servidor.assembly} (${servidor.url}).`);

  const respostas = new Map();
  const unicas = [...new Set(entradas.map((e) => e.entradaVep))];
  const totalLotes = Math.ceil(unicas.length / VARIANTES_POR_PEDIDO);
  for (let i = 0; i < unicas.length; i += VARIANTES_POR_PEDIDO) {
    const lote = unicas.slice(i, i + VARIANTES_POR_PEDIDO);
    console.log(`Consultando o VEP: lote ${i / VARIANTES_POR_PEDIDO + 1}/${totalLotes} (${lote.length} variantes)`);
    for (const anotacao of await consultarLote(servidor, lote)) respostas.set(anotacao.input, anotacao);
    await esperar(PAUSA_MS);
  }

  const linhasPorEntrada = new Map(entradas.map((e) => [e, resumir(e, respostas.get(e.entradaVep))]));
  const semAnotacao = entradas.filter((e) => !respostas.has(e.entradaVep)).length;

  mkdirSync(a.saida, { recursive: true });
  const base = join(a.saida, a.amostra);
  const tsv = [COLUNAS_TSV.join("\t"), ...entradas.map((e) => COLUNAS_TSV.map((c) => limpar(linhasPorEntrada.get(e)[c])).join("\t"))];
  writeFileSync(`${base}.vep.tsv`, tsv.join("\n") + "\n");
  writeFileSync(`${base}.vep.json`, JSON.stringify([...respostas.values()], null, 2));
  gravarVcf(cabecalho, registros, linhasPorEntrada, `${base}.vep.vcf.gz`);

  console.log(`Anotação salva em ${base}.vep.tsv, .vep.vcf.gz e .vep.json`);
  if (semAnotacao) console.log(`AVISO: ${semAnotacao} variante(s) ficaram sem anotação (consequencia = nao_anotada).`);
}

if (process.argv[1]?.endsWith("anotar_vep.mjs")) {
  main().catch((erro) => {
    console.error(`ERRO no anotador: ${erro.message}`);
    process.exit(1);
  });
}
