// Testes das regras de combinação: Tabela 5 do Richards 2015 e pontos de Tavtigian.
import { test } from "node:test";
import assert from "node:assert/strict";

import { classe2015, classePorPontos, somarPontos } from "../lib/combinar.ts";
import { carregarConfig } from "../lib/comum.ts";
import type { Criterio, Forca } from "../lib/tipos.ts";

const config = carregarConfig();

// "PVS1,PS3_Moderate,PM2" -> lista de critérios.
const DEFAULT: Record<string, Forca> = { PVS1: "VeryStrong", PS: "Strong", PM: "Moderate", PP: "Supporting", BA1: "StandAlone", BS: "Strong", BP: "Supporting" };
function c(texto: string): Criterio[] {
  if (!texto) return [];
  return texto.split(",").map((t) => {
    const [codigo = "", forca] = t.split("_");
    const padrao = (codigo === "PVS1" || codigo === "BA1" ? DEFAULT[codigo] : DEFAULT[codigo.slice(0, 2)]) as Forca;
    return { codigo, forca: (forca as Forca | undefined) ?? padrao, origem: "teste" };
  });
}

test("Richards 2015, Tabela 5: Patogênica", () => {
  const casos = [
    "PVS1,PS1", // (i)(a)
    "PVS1,PM1,PM4", // (i)(b)
    "PVS1,PM1,PP1", // (i)(c)
    "PVS1,PP1,PP4", // (i)(d)
    "PS1,PS3", // (ii)
    "PS1,PM1,PM4,PM5", // (iii)(a)
    "PS1,PM1,PM4,PP1,PP4", // (iii)(b)
    "PS1,PM1,PP1,PP2,PP3,PP4", // (iii)(c)
  ];
  for (const caso of casos) assert.equal(classe2015(c(caso)).classe, "P", caso);
});

test("Richards 2015, Tabela 5: Provavelmente patogênica", () => {
  const casos = [
    "PVS1,PM1", // (i)
    "PS1,PM1", // (ii) 1 PS + 1 PM
    "PS1,PM1,PM4", // (ii) 1 PS + 2 PM
    "PS1,PP1,PP4", // (iii)
    "PM1,PM4,PM5", // (iv)
    "PM1,PM4,PP1,PP4", // (v)
    "PM1,PP1,PP2,PP3,PP4", // (vi)
  ];
  for (const caso of casos) assert.equal(classe2015(c(caso)).classe, "LP", caso);
});

test("Richards 2015, Tabela 5: Benigna e Provavelmente benigna", () => {
  assert.equal(classe2015(c("BA1")).classe, "B");
  assert.equal(classe2015(c("BS1,BS2")).classe, "B");
  assert.equal(classe2015(c("BS1,BP4")).classe, "LB");
  assert.equal(classe2015(c("BP4,BP7")).classe, "LB");
});

test("Richards 2015: insuficiente ou contraditório vira VUS", () => {
  assert.equal(classe2015(c("")).classe, "VUS");
  assert.equal(classe2015(c("PVS1")).classe, "VUS");
  assert.equal(classe2015(c("PM2_Supporting,PP3")).classe, "VUS");
  assert.equal(classe2015(c("BS1")).classe, "VUS");
  const conflito = classe2015(c("PVS1,PS1,BS1,BP4"));
  assert.deepEqual(conflito, { classe: "VUS", conflito: true });
});

test("Richards 2015: força ajustada conta na nova categoria", () => {
  // PVS1_Strong conta como PS e PM2_Supporting como PP: 1 PS + 1 PP não fecha nenhuma regra.
  assert.equal(classe2015(c("PVS1_Strong,PM2_Supporting")).classe, "VUS");
  // 1 PS + 1 PM -> LP (ii).
  assert.equal(classe2015(c("PVS1_Strong,PM4")).classe, "LP");
  // PVS1 + PM2_Supporting + PP3 -> PVS1 + ≥2 PP -> P (i)(d).
  assert.equal(classe2015(c("PVS1,PM2_Supporting,PP3")).classe, "P");
  // BP4_Moderate não existe no 2015: conta como BP.
  assert.equal(classe2015(c("BP4_Moderate")).classe, "VUS");
});

test("Pontos: valor de cada força (Tavtigian 2020)", () => {
  assert.equal(somarPontos(c("PP1"), config), 1);
  assert.equal(somarPontos(c("PM1"), config), 2);
  assert.equal(somarPontos(c("PS1"), config), 4);
  assert.equal(somarPontos(c("PVS1"), config), 8);
  assert.equal(somarPontos(c("BP4"), config), -1);
  assert.equal(somarPontos(c("BS1"), config), -4);
  assert.equal(somarPontos(c("PVS1,PM2_Supporting,BP4"), config), 8);
});

test("Pontos: limites das classes", () => {
  const classe = (texto: string) => classePorPontos(c(texto), config).classe;
  assert.equal(classe("PVS1,PM1"), "P"); // 10
  assert.equal(classe("PVS1,PP1"), "LP"); // 9
  assert.equal(classe("PS1,PM1"), "LP"); // 6
  assert.equal(classe("PS1,PP1"), "VUS"); // 5
  assert.equal(classe(""), "VUS"); // 0
  assert.equal(classe("BP4"), "LB"); // -1
  assert.equal(classe("BS1,BP4,BP7"), "LB"); // -6
  assert.equal(classe("BS1,BS2"), "B"); // -8
  assert.equal(classe("BS1,BP4,BP7,BP1"), "B"); // -7
  assert.equal(classe("PS1,PS3,BP4"), "LP"); // 7
});

test("Pontos: BA1 é isolado e sempre dá Benigna", () => {
  const r = classePorPontos(c("BA1,PVS1,PS1"), config);
  assert.equal(r.classe, "B");
});
