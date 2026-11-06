// =============================================================================
// Classificador ACMG/AMP automático (germinativo, SNVs e indels pequenos).
// -----------------------------------------------------------------------------
// PARTE PRONTA DO EXERCÍCIO: validada pelo professor. Não altere.
// Escrito em TypeScript; o Node 24 executa direto (apaga os tipos), sem compilar.
//
// Como usar:
//   node scripts/05_results/acmg/classificar.ts \
//       --entrada dados/04_annotate/hg38/amostra.vep.tsv   (ou .vep.vcf.gz) \
//       --saida   dados/05_results/hg38 \
//       --amostra amostra --genoma hg38 \
//       [--evidencias minhas_evidencias.tsv]
//
// Gera em --saida:
//   <amostra>.acmg.tsv     uma linha por variante, com critérios, pontos e classe
//   <amostra>.resumo.csv   contagem por classe (pontos e regras de 2015)
//   <amostra>.relatorio.md relatório legível
// =============================================================================

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { CLASSES, ORDEM_CLASSES, CRITERIOS_MANUAIS, carregarConfig, carregarGenesLof, rotulo } from "./lib/comum.ts";
import { lerEntrada } from "./lib/entrada.ts";
import { criteriosAutomaticos } from "./lib/criterios.ts";
import { classePorPontos, classe2015 } from "./lib/combinar.ts";
import { lerEvidencias, evidenciasDaVariante, juntarCriterios } from "./lib/evidencias.ts";
import type { Classe, Contexto, Criterio, Origem, Resultado, Variante } from "./lib/tipos.ts";

// Genótipos que não têm o alelo alternativo: não há o que classificar.
const SEM_ALELO_ALT = new Set(["0/0", "0|0", "./.", ".|.", "."]);

// Ordem de exibição: patogênicos do mais forte ao mais fraco, depois benignos.
const PREFIXOS = ["PVS1", "PS", "PM", "PP", "BA1", "BS", "BP"];
const ordemCriterio = (c: Criterio): number => PREFIXOS.findIndex((p) => c.codigo.startsWith(p));

/** Classifica uma variante. Exportada para os testes. */
export function classificarVariante(variante: Variante, contexto: Contexto): Resultado {
  const { config, genesLof, evidencias = [] } = contexto;
  const automaticos = criteriosAutomaticos(variante, config, genesLof);
  const informados = evidenciasDaVariante(variante, evidencias);
  const { criterios, substituidos } = juntarCriterios(automaticos.criterios, informados);
  criterios.sort((a, b) => ordemCriterio(a) - ordemCriterio(b) || a.codigo.localeCompare(b.codigo));

  const { pontos, classe } = classePorPontos(criterios, config);
  const regras2015 = classe2015(criterios);
  return {
    variante,
    criterios,
    substituidos,
    naoAvaliados: automaticos.naoAvaliados,
    pontos,
    classe,
    classe2015: regras2015.classe,
    conflito2015: regras2015.conflito,
  };
}

/** Classifica todas as variantes e devolve também as que foram puladas. */
export function classificarTodas(
  variantes: Variante[],
  contexto: Contexto,
): { resultados: Resultado[]; puladas: { id: string; motivo: string }[] } {
  const resultados: Resultado[] = [];
  const puladas: { id: string; motivo: string }[] = [];
  for (const v of variantes) {
    if (v.genotipo && SEM_ALELO_ALT.has(v.genotipo)) {
      puladas.push({ id: v.id, motivo: `genótipo ${v.genotipo} sem o alelo alternativo` });
      continue;
    }
    resultados.push(classificarVariante(v, contexto));
  }
  return { resultados, puladas };
}

// ----------------------------------------------------------------------------- Saídas

const COLUNAS_SAIDA = [
  "id", "gene", "transcrito", "hgvs_c", "hgvs_p", "consequencia", "genotipo", "filtro",
  "gnomad_grpmax_af", "revel", "spliceai_max", "criterios", "criterios_automaticos",
  "criterios_informados", "pontos", "classe", "classe_2015", "conflito_2015",
  "clinvar", "ids_conhecidos", "nao_avaliados", "detalhes",
] as const;

function linhaTsv(r: Resultado): string {
  const v = r.variante;
  const fmt = (x: number | null): string => (x === null ? "" : String(x));
  const lista = (origem: Origem): string => r.criterios.filter((c) => c.origem === origem).map(rotulo).join(",");
  const detalhes = [
    ...r.criterios.map((c) => `${rotulo(c)}: ${c.motivo || c.origem}`),
    ...r.substituidos.map((c) => `${rotulo(c)} automático substituído pelo informado`),
  ].join("; ");
  const valores: Record<(typeof COLUNAS_SAIDA)[number], string | number> = {
    id: v.id, gene: v.gene, transcrito: v.transcrito, hgvs_c: v.hgvs_c, hgvs_p: v.hgvs_p,
    consequencia: v.consequencias.join(","), genotipo: v.genotipo, filtro: v.filtro,
    gnomad_grpmax_af: fmt(v.grpmax), revel: fmt(v.revel), spliceai_max: fmt(v.spliceai),
    criterios: r.criterios.map(rotulo).join(","),
    criterios_automaticos: lista("automatico"),
    criterios_informados: lista("informado"),
    pontos: r.pontos, classe: CLASSES[r.classe], classe_2015: CLASSES[r.classe2015],
    conflito_2015: r.conflito2015 ? "sim" : "não",
    clinvar: v.clinvar, ids_conhecidos: v.ids_conhecidos, nao_avaliados: r.naoAvaliados.join("; "), detalhes,
  };
  return COLUNAS_SAIDA.map((c) => String(valores[c]).replace(/[\t\n]/g, " ")).join("\t");
}

function contar(resultados: Resultado[], campo: "classe" | "classe2015"): Record<Classe, number> {
  const n: Record<Classe, number> = { P: 0, LP: 0, VUS: 0, LB: 0, B: 0 };
  for (const r of resultados) n[r[campo]]++;
  return n;
}

function textoResumoCsv(resultados: Resultado[]): string {
  const pontos = contar(resultados, "classe");
  const regras = contar(resultados, "classe2015");
  const total = resultados.length || 1;
  const linhas = ["classe,variantes_pontos,percentual_pontos,variantes_regras_2015"];
  for (const c of ORDEM_CLASSES) {
    linhas.push(`${CLASSES[c]},${pontos[c]},${((100 * pontos[c]) / total).toFixed(1)}%,${regras[c]}`);
  }
  linhas.push(`Total,${resultados.length},100%,${resultados.length}`);
  return linhas.join("\n") + "\n";
}

interface InfoRelatorio {
  amostra: string;
  genoma: string;
  entrada: string;
  evidencias?: string;
  formato: string;
  versao: string;
}

function textoRelatorio(resultados: Resultado[], puladas: { id: string; motivo: string }[], info: InfoRelatorio): string {
  const pontos = contar(resultados, "classe");
  const regras = contar(resultados, "classe2015");
  const relevantes = resultados.filter((r) => r.classe === "P" || r.classe === "LP" || r.classe === "VUS");
  const linhas = [
    `# Classificação ACMG: ${info.amostra} (${info.genoma})`,
    "",
    `- Entrada: \`${info.entrada}\` (${info.formato})`,
    `- Evidências manuais: ${info.evidencias ? `\`${info.evidencias}\`` : "nenhuma"}`,
    `- Classificador: versão ${info.versao} (Richards 2015 + pontos Tavtigian 2020 + ClinGen SVI)`,
    `- Variantes classificadas: ${resultados.length} (puladas: ${puladas.length})`,
    "",
    "## Contagem",
    "",
    "| Classe | Pontos (final) | Regras 2015 |",
    "|---|---:|---:|",
    ...ORDEM_CLASSES.map((c) => `| ${CLASSES[c]} | ${pontos[c]} | ${regras[c]} |`),
    "",
    "## Variantes patogênicas, provavelmente patogênicas e VUS",
    "",
  ];
  if (!relevantes.length) {
    linhas.push("Nenhuma.", "");
  } else {
    linhas.push("| Variante | Gene | HGVS | Critérios | Pontos | Classe | 2015 | ClinVar |", "|---|---|---|---|---:|---|---|---|");
    for (const r of relevantes) {
      const v = r.variante;
      const hgvs = [v.hgvs_c, v.hgvs_p].filter(Boolean).join(" ");
      linhas.push(
        `| ${v.id} | ${v.gene} | ${hgvs} | ${r.criterios.map(rotulo).join(", ")} | ${r.pontos} | ${CLASSES[r.classe]} | ${CLASSES[r.classe2015]} | ${v.clinvar || "-"} |`,
      );
    }
    linhas.push("");
  }
  linhas.push(
    "## Critérios que este classificador não calcula sozinho",
    "",
    `${CRITERIOS_MANUAIS.join(", ")}. Informe-os com --evidencias (veja o README).`,
    "PP5 e BP6 foram aposentados pela ClinGen e não são usados. O ClinVar aparece só para comparação.",
    "",
  );
  if (puladas.length) linhas.push("## Variantes puladas", "", ...puladas.map((p) => `- ${p.id}: ${p.motivo}`), "");
  linhas.push("> Classificação automática para ensino. Não use para laudo clínico.", "");
  return linhas.join("\n");
}

function imprimirTabela(resultados: Resultado[]): void {
  const n = contar(resultados, "classe");
  const total = resultados.length || 1;
  console.log(`\n${"Classificação ACMG (pontos)".padEnd(32)}${"Variantes".padStart(10)}${"%".padStart(8)}`);
  console.log("-".repeat(50));
  for (const c of ORDEM_CLASSES) {
    console.log(`${CLASSES[c].padEnd(32)}${String(n[c]).padStart(10)}${((100 * n[c]) / total).toFixed(1).padStart(7)}%`);
  }
  console.log("-".repeat(50));
  console.log(`${"Total".padEnd(32)}${String(resultados.length).padStart(10)}\n`);
}

// ----------------------------------------------------------------------------- CLI

function main(): void {
  const { values: a } = parseArgs({
    options: {
      entrada: { type: "string" },
      saida: { type: "string" },
      amostra: { type: "string", default: "amostra" },
      genoma: { type: "string", default: "" },
      evidencias: { type: "string" },
      ajuda: { type: "boolean", short: "h" },
    },
  });
  if (a.ajuda || !a.entrada || !a.saida) {
    console.log("Uso: node classificar.ts --entrada <tsv|vcf> --saida <pasta> [--amostra nome] [--genoma hg19|hg38] [--evidencias arquivo.tsv]");
    process.exit(a.ajuda ? 0 : 2);
  }

  const config = carregarConfig();
  const genesLof = carregarGenesLof();
  const { formato, variantes } = lerEntrada(a.entrada);
  const evidencias = a.evidencias ? lerEvidencias(a.evidencias) : [];
  console.log(`Entrada ${formato}: ${variantes.length} variante(s). Evidências manuais: ${evidencias.length}.`);

  const { resultados, puladas } = classificarTodas(variantes, { config, genesLof, evidencias });

  mkdirSync(a.saida, { recursive: true });
  const base = join(a.saida, a.amostra);
  writeFileSync(`${base}.acmg.tsv`, [COLUNAS_SAIDA.join("\t"), ...resultados.map(linhaTsv)].join("\n") + "\n");
  writeFileSync(`${base}.resumo.csv`, textoResumoCsv(resultados));
  const info: InfoRelatorio = { amostra: a.amostra, genoma: a.genoma, entrada: a.entrada, formato, versao: config.versao };
  if (a.evidencias) info.evidencias = a.evidencias;
  writeFileSync(`${base}.relatorio.md`, textoRelatorio(resultados, puladas, info));
  imprimirTabela(resultados);
  console.log(`Resultados em ${a.saida}/ (${a.amostra}.acmg.tsv, .resumo.csv, .relatorio.md)`);
}

// Só roda a linha de comando quando chamado diretamente (não nos testes).
if (process.argv[1]?.endsWith("classificar.ts")) {
  try {
    main();
  } catch (erro) {
    console.error(`ERRO no classificador: ${erro instanceof Error ? erro.message : String(erro)}`);
    process.exit(1);
  }
}
