// Testes dos critérios automáticos e da classificação de variantes de exemplo.
import { test } from "node:test";
import assert from "node:assert/strict";

import { carregarConfig, carregarGenesLof, rotulo } from "../lib/comum.ts";
import { avaliarPvs1, avaliarFrequencia, avaliarComputacional, lerExon } from "../lib/criterios.ts";
import { classificarVariante } from "../classificar.ts";
import type { Evidencia, Resultado, Variante } from "../lib/tipos.ts";

const config = carregarConfig();
const genesLof = carregarGenesLof();

function variante(campos: Partial<Variante>): Variante {
  return {
    id: "17:1:A:G", cromossomo: "17", posicao: 1, ref: "A", alt: "G", genotipo: "0/1", filtro: "PASS",
    gene: "BRCA1", transcrito: "", mane: "", exon: "", intron: "", hgvs_c: "", hgvs_p: "",
    consequencias: [], impacto: "", grpmax: null, gnomad_af: null, revel: null, spliceai: null,
    clinvar: "", ids_conhecidos: "", ...campos,
  };
}
const rotulos = (r: Resultado) => r.criterios.map(rotulo).sort();

test("lerExon", () => {
  assert.deepEqual(lerExon("5/11"), { numero: 5, total: 11 });
  assert.deepEqual(lerExon("2-3/11"), { numero: 2, total: 11 });
  assert.equal(lerExon(""), null);
});

test("genes_lof.tsv tem os genes clássicos do chr17", () => {
  for (const gene of ["BRCA1", "TP53", "NF1"]) assert.ok(genesLof.has(gene), gene);
});

test("PVS1 em degraus", () => {
  const forca = (campos: Partial<Variante>) => avaliarPvs1(variante(campos), genesLof).criterio?.forca ?? null;
  assert.equal(forca({ consequencias: ["stop_gained"], exon: "10/24" }), "VeryStrong");
  assert.equal(forca({ consequencias: ["frameshift_variant"], exon: "24/24" }), "Strong");
  assert.equal(forca({ consequencias: ["stop_gained"], exon: "1/1" }), "Strong");
  assert.equal(forca({ consequencias: ["splice_donor_variant"] }), "Strong");
  assert.equal(forca({ consequencias: ["start_lost"], exon: "2/24" }), "Moderate");
  assert.equal(forca({ consequencias: ["missense_variant"], exon: "10/24" }), null);
  // Gene sem LoF como mecanismo: não aplica, e registra o motivo.
  const semLof = avaliarPvs1(variante({ gene: "GENEFICTICIO", consequencias: ["stop_gained"], exon: "2/5" }), genesLof);
  assert.equal(semLof.criterio, null);
  assert.match(semLof.naoAvaliado, /não está na lista/);
});

test("Frequência: BA1, BS1, PM2_Supporting", () => {
  const codigo = (af: number | null) => avaliarFrequencia(variante({ grpmax: af }), config).map(rotulo);
  assert.deepEqual(codigo(null), ["PM2"]); // PM2 já é Supporting por padrão (ClinGen SVI 2020)
  assert.deepEqual(codigo(0.00001), ["PM2"]);
  assert.deepEqual(codigo(0.0005), []);
  assert.deepEqual(codigo(0.02), ["BS1"]);
  assert.deepEqual(codigo(0.30), ["BA1"]);
  assert.deepEqual(codigo(0.05), ["BS1"]); // BA1 é estritamente maior que 5%
});

test("PP3/BP4 pelo REVEL (Pejaver 2022)", () => {
  const r = (revel: number, spliceai = 0) =>
    avaliarComputacional(variante({ consequencias: ["missense_variant"], revel, spliceai }), config).criterios.map(rotulo);
  assert.deepEqual(r(0.95), ["PP3_Strong"]);
  assert.deepEqual(r(0.932), ["PP3_Strong"]);
  assert.deepEqual(r(0.80), ["PP3_Moderate"]);
  assert.deepEqual(r(0.70), ["PP3"]);
  assert.deepEqual(r(0.50), []);
  assert.deepEqual(r(0.25), ["BP4"]);
  assert.deepEqual(r(0.10), ["BP4_Moderate"]);
  assert.deepEqual(r(0.01), ["BP4_Strong"]);
  // REVEL benigno, mas SpliceAI alto: vale o efeito no splicing.
  assert.deepEqual(r(0.10, 0.5), ["PP3"]);
});

test("Sinônima: BP4 + BP7 só com SpliceAI baixo", () => {
  const r = (spliceai: number) =>
    avaliarComputacional(variante({ consequencias: ["synonymous_variant"], spliceai }), config).criterios.map(rotulo);
  assert.deepEqual(r(0.0), ["BP4", "BP7"]);
  assert.deepEqual(r(0.3), ["PP3"]);
  assert.deepEqual(r(0.15), []);
});

test("Variante nula não recebe PP3 (evita contar duas vezes)", () => {
  const r = avaliarComputacional(variante({ consequencias: ["splice_donor_variant"], spliceai: 0.99 }), config);
  assert.deepEqual(r.criterios, []);
});

// ----------------------------------------------------------------------------- Exemplos completos

test("Exemplo: nonsense em BRCA1, ausente no gnomAD -> LP (PVS1 + PM2_Supporting = 9)", () => {
  const r = classificarVariante(
    variante({ consequencias: ["stop_gained"], exon: "10/23", hgvs_c: "c.1687C>T" }),
    { config, genesLof },
  );
  assert.deepEqual(rotulos(r), ["PM2", "PVS1"]);
  assert.equal(r.pontos, 9);
  assert.equal(r.classe, "LP");
  // Com o PM2 rebaixado para apoio, a Tabela 5 de 2015 fica com 1 PVS + 1 PP, que não fecha
  // nenhuma regra: VUS. Os pontos (9) dão LP. Essa diferença é esperada e discutida no README.
  assert.equal(r.classe2015, "VUS");
});

test("Exemplo: com PP4 informado (fenótipo) vira Patogênica", () => {
  const evidencias: Evidencia[] = [{ alvo: { tipo: "hgvs", chave: "BRCA1:c.1687C>T" }, codigo: "PP4", forca: "Supporting", justificativa: "fenótipo" }];
  const r = classificarVariante(
    variante({ consequencias: ["stop_gained"], exon: "10/23", hgvs_c: "c.1687C>T" }),
    { config, genesLof, evidencias },
  );
  assert.equal(r.pontos, 10);
  assert.equal(r.classe, "P");
});

test("Exemplo: TP53 p.Arg175His (REVEL 0.922, rara) -> VUS só com dados automáticos", () => {
  const r = classificarVariante(
    variante({ gene: "TP53", consequencias: ["missense_variant"], revel: 0.922, spliceai: 0.01, grpmax: 0.0000147 }),
    { config, genesLof },
  );
  assert.deepEqual(rotulos(r), ["PM2", "PP3_Moderate"]);
  assert.equal(r.pontos, 3);
  assert.equal(r.classe, "VUS");
});

test("Exemplo: BRCA1 c.2082C>T sinônima comum (grpmax 0.49) -> Benigna por BA1", () => {
  const r = classificarVariante(
    variante({ consequencias: ["synonymous_variant"], spliceai: 0, grpmax: 0.4993 }),
    { config, genesLof },
  );
  assert.ok(rotulos(r).includes("BA1"));
  assert.equal(r.classe, "B");
  assert.equal(r.classe2015, "B");
});

test("Exemplo: intrônica rara sem efeito em splice -> VUS (PM2 + BP4 = 0)", () => {
  const r = classificarVariante(variante({ consequencias: ["intron_variant"], spliceai: 0.02 }), { config, genesLof });
  assert.deepEqual(rotulos(r), ["BP4", "PM2"]);
  assert.equal(r.pontos, 0);
  assert.equal(r.classe, "VUS");
});

test("Exemplo: evidência informada substitui a automática de mesmo código", () => {
  const evidencias: Evidencia[] = [{ alvo: { tipo: "id", chave: "17:1:A:G" }, codigo: "PVS1", forca: "Moderate", justificativa: "revisão manual" }];
  const r = classificarVariante(variante({ consequencias: ["stop_gained"], exon: "10/23" }), { config, genesLof, evidencias });
  assert.equal(r.substituidos.length, 1);
  assert.deepEqual(rotulos(r), ["PM2", "PVS1_Moderate"]);
  assert.equal(r.pontos, 3);
});
