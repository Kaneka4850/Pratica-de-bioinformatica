// Testes da leitura de TSV, VCF anotado e arquivo de evidências, e da linha de comando.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { lerTsv, lerVcf, lerEntrada } from "../lib/entrada.ts";
import { lerEvidencias } from "../lib/evidencias.ts";

const AQUI = dirname(fileURLToPath(import.meta.url));
const DADOS = join(AQUI, "dados");
const CLASSIFICADOR = join(AQUI, "..", "classificar.ts");

test("TSV: lê o exemplo e converte números", () => {
  const variantes = lerTsv(readFileSync(join(DADOS, "exemplo.vep.tsv"), "utf8"));
  assert.equal(variantes.length, 5);
  const tp53 = variantes.find((v) => v.gene === "TP53");
  assert.ok(tp53);
  assert.equal(tp53.id, "17:7675088:C:T");
  assert.equal(tp53.revel, 0.922);
  assert.deepEqual(tp53.consequencias, ["missense_variant"]);
  const ausente = variantes.find((v) => v.gene === "BRCA1" && v.consequencias.includes("stop_gained"));
  assert.ok(ausente);
  assert.equal(ausente.grpmax, null);
});

test("TSV: recusa arquivo sem coluna obrigatória", () => {
  assert.throws(() => lerTsv("cromossomo\tposicao\tref\talt\n17\t1\tA\tG\n"), /faltam colunas obrigatórias: gene/);
});

test("VCF: lê o CSQ do anotador e escolhe o transcrito MANE", () => {
  const variantes = lerVcf(readFileSync(join(DADOS, "exemplo.vep.vcf"), "utf8"));
  assert.equal(variantes.length, 3);
  const [tp53, sinonima, nula] = variantes;
  assert.ok(tp53 && sinonima && nula);
  assert.equal(tp53.transcrito, "ENST00000269305");
  assert.equal(tp53.revel, 0.922);
  assert.equal(sinonima.hgvs_p, "p.Ser694=");
  assert.equal(sinonima.grpmax, 0.4993);
  assert.equal(nula.genotipo, "0/1");
});

test("VCF: entende os campos do VEP de linha de comando (gnomADe_*_AF, SpliceAI_pred_DS_*)", () => {
  const vcf = [
    "##fileformat=VCFv4.2",
    '##INFO=<ID=CSQ,Number=.,Type=String,Description="Consequence annotations from Ensembl VEP. Format: Allele|Consequence|IMPACT|SYMBOL|Feature|EXON|HGVSc|HGVSp|CANONICAL|MANE_SELECT|gnomADe_AFR_AF|gnomADe_NFE_AF|REVEL|SpliceAI_pred_DS_AG|SpliceAI_pred_DS_DL">',
    "#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO",
    "chr17\t100\t.\tA\tG\t50\tPASS\tCSQ=G|missense_variant|MODERATE|GENEX|ENST1|3/9|ENST1.1:c.10A>G|ENSP1.1:p.Lys4Glu|YES|NM_1.1|0.001|0.003|0.5|0.01|0.3",
  ].join("\n");
  const [v] = lerVcf(vcf);
  assert.ok(v);
  assert.equal(v.grpmax, 0.003);
  assert.equal(v.spliceai, 0.3);
  assert.equal(v.hgvs_c, "c.10A>G");
});

test("Entrada: detecta VCF compactado em .gz", () => {
  const pasta = mkdtempSync(join(tmpdir(), "acmg-"));
  try {
    const caminho = join(pasta, "x.vcf.gz");
    writeFileSync(caminho, gzipSync(readFileSync(join(DADOS, "exemplo.vep.vcf"))));
    const { formato, variantes } = lerEntrada(caminho);
    assert.equal(formato, "VCF");
    assert.equal(variantes.length, 3);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("Evidências: lê, aceita sinônimos e recusa PP5/BP6", () => {
  const evidencias = lerEvidencias(join(DADOS, "evidencias.tsv"));
  assert.equal(evidencias.length, 3);
  assert.deepEqual(evidencias.map((e) => `${e.codigo}_${e.forca}`), ["PS3_Strong", "PP4_Supporting", "PS2_VeryStrong"]);

  const pasta = mkdtempSync(join(tmpdir(), "acmg-"));
  try {
    const ruim = join(pasta, "ruim.tsv");
    writeFileSync(ruim, "variante\tcriterio\tforca\tjustificativa\n17:1:A:G\tPP5\t\tClinVar diz\n");
    assert.throws(() => lerEvidencias(ruim), /aposentado/);
    writeFileSync(ruim, "variante\tcriterio\tforca\tjustificativa\n17:1:A:G\tXX9\t\t\n");
    assert.throws(() => lerEvidencias(ruim), /não existe/);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test("Linha de comando: gera as três saídas com a classe esperada", () => {
  const pasta = mkdtempSync(join(tmpdir(), "acmg-"));
  try {
    execFileSync(process.execPath, [
      CLASSIFICADOR, "--entrada", join(DADOS, "exemplo.vep.tsv"), "--saida", pasta,
      "--amostra", "teste", "--genoma", "hg38", "--evidencias", join(DADOS, "evidencias.tsv"),
    ], { stdio: "pipe" });
    const [primeira = "", ...resto] = readFileSync(join(pasta, "teste.acmg.tsv"), "utf8").trim().split("\n");
    const cabecalho = primeira.split("\t");
    const linhas = resto.map((l) => Object.fromEntries(l.split("\t").map((v, i) => [cabecalho[i] ?? "", v])));
    const porId = new Map(linhas.map((l) => [l.id ?? "", l]));
    const coluna = (id: string, nome: string): string | undefined => porId.get(id)?.[nome];

    assert.equal(coluna("17:43057062:G:A", "classe"), "Patogênica"); // PVS1 + PM2 + PS3 informado = 13
    assert.equal(coluna("17:43057062:G:A", "criterios_informados"), "PS3");
    assert.equal(coluna("17:43071077:T:C", "classe"), "Benigna"); // BA1
    assert.equal(coluna("17:7675088:C:T", "classe"), "VUS (significado incerto)");
    assert.ok(readFileSync(join(pasta, "teste.resumo.csv"), "utf8").startsWith("classe,"));
    assert.match(readFileSync(join(pasta, "teste.relatorio.md"), "utf8"), /Classificação ACMG: teste \(hg38\)/);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});
