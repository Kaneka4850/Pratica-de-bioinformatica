#!/usr/bin/env node
// =============================================================================
// Compara as classificações ACMG do mesmo FASTQ alinhado em hg19 e em hg38.
// -----------------------------------------------------------------------------
// PARTE PRONTA DO EXERCÍCIO: validada pelo professor. Não altere.
//
// As posições mudam entre os builds, então a comparação pareia as variantes por:
//   1. rsID do dbSNP + alelo alternativo (ex.: rs1799949:A), que é igual nos dois builds;
//   2. se não houver rsID: gene + HGVS c. (ex.: BRCA1:c.2082C>T);
//   3. por último, a posição (que muda entre os builds: a variante aparece como "só em um").
//
// Como usar:
//   node scripts/05_results/comparar_builds.mjs --hg19 dados/05_results/hg19/amostra.acmg.tsv \
//       --hg38 dados/05_results/hg38/amostra.acmg.tsv --saida dados/05_results/comparacao --amostra amostra
// =============================================================================

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

function lerTabela(caminho) {
  const [cabecalho, ...linhas] = readFileSync(caminho, "utf8").trim().split(/\r?\n/);
  const colunas = cabecalho.split("\t");
  return linhas.filter(Boolean).map((l) => Object.fromEntries(l.split("\t").map((v, i) => [colunas[i], v])));
}

export function chave(v) {
  const alt = String(v.id ?? "").split(":")[3] ?? "";
  const rs = String(v.ids_conhecidos ?? "").split(",").find((id) => /^rs\d+$/.test(id));
  if (rs) return `${rs}:${alt}`;
  if (v.gene && v.hgvs_c) return `${v.gene}:${v.hgvs_c}`;
  return `posicao:${v.id}`;
}

const nome = (v) => (v ? [v.gene, v.hgvs_c || v.hgvs_p].filter(Boolean).join(":") : "");

export function comparar(hg19, hg38) {
  const mapa19 = new Map(hg19.map((v) => [chave(v), v]));
  const mapa38 = new Map(hg38.map((v) => [chave(v), v]));
  const chaves = [...new Set([...mapa19.keys(), ...mapa38.keys()])].sort();
  return chaves.map((k) => {
    const a = mapa19.get(k);
    const b = mapa38.get(k);
    let situacao;
    if (a && b) situacao = a.classe === b.classe ? "mesma_classe" : "classe_diferente";
    else situacao = a ? "so_hg19" : "so_hg38";
    return {
      variante: k,
      nome_hg19: nome(a), nome_hg38: nome(b),
      situacao,
      id_hg19: a?.id ?? "", id_hg38: b?.id ?? "",
      transcrito_hg19: a?.transcrito ?? "", transcrito_hg38: b?.transcrito ?? "",
      classe_hg19: a?.classe ?? "", classe_hg38: b?.classe ?? "",
      pontos_hg19: a?.pontos ?? "", pontos_hg38: b?.pontos ?? "",
      criterios_hg19: a?.criterios ?? "", criterios_hg38: b?.criterios ?? "",
      grpmax_hg19: a?.gnomad_grpmax_af ?? "", grpmax_hg38: b?.gnomad_grpmax_af ?? "",
    };
  });
}

function main() {
  const { values: a } = parseArgs({
    options: { hg19: { type: "string" }, hg38: { type: "string" }, saida: { type: "string" }, amostra: { type: "string", default: "amostra" } },
  });
  if (!a.hg19 || !a.hg38 || !a.saida) {
    console.log("Uso: node comparar_builds.mjs --hg19 <acmg.tsv> --hg38 <acmg.tsv> --saida <pasta> [--amostra nome]");
    process.exit(2);
  }
  const linhas = comparar(lerTabela(a.hg19), lerTabela(a.hg38));
  const colunas = Object.keys(linhas[0] ?? { variante: "", situacao: "" });
  mkdirSync(a.saida, { recursive: true });
  const base = join(a.saida, a.amostra);
  writeFileSync(`${base}.comparacao.tsv`, [colunas.join("\t"), ...linhas.map((l) => colunas.map((c) => l[c]).join("\t"))].join("\n") + "\n");

  const conta = (s) => linhas.filter((l) => l.situacao === s).length;
  const diferentes = linhas.filter((l) => l.situacao === "classe_diferente");
  const md = [
    `# Comparação hg19 x hg38: ${a.amostra}`,
    "",
    "| Situação | Variantes |",
    "|---|---:|",
    `| Nos dois builds, mesma classe | ${conta("mesma_classe")} |`,
    `| Nos dois builds, classe diferente | ${conta("classe_diferente")} |`,
    `| Só no hg19 | ${conta("so_hg19")} |`,
    `| Só no hg38 | ${conta("so_hg38")} |`,
    `| Total | ${linhas.length} |`,
    "",
    "## Classes diferentes",
    "",
    ...(diferentes.length
      ? ["| Variante | hg19 | hg38 | Critérios hg19 | Critérios hg38 |", "|---|---|---|---|---|",
         ...diferentes.map((l) => `| ${l.variante} | ${l.classe_hg19} | ${l.classe_hg38} | ${l.criterios_hg19} | ${l.criterios_hg38} |`)]
      : ["Nenhuma."]),
    "",
    "Perguntas para o grupo: por que algumas variantes aparecem só em um build? O transcrito",
    "usado foi o mesmo (MANE Select no hg38, canônico do Ensembl no hg19)? Alguma leitura",
    "alinhou em outro lugar por causa de diferenças na sequência de referência?",
    "",
  ];
  writeFileSync(`${base}.comparacao.md`, md.join("\n"));
  console.log(`Comparação salva em ${base}.comparacao.tsv e .comparacao.md`);
}

if (process.argv[1]?.endsWith("comparar_builds.mjs")) main();
