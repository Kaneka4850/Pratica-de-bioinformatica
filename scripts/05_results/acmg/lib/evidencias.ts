// =============================================================================
// Arquivo OPCIONAL de evidências manuais (critérios que o VCF não responde:
// de novo, estudos funcionais, segregação, fenótipo, literatura...).
//
// Formato (TSV, com cabeçalho):
//   variante	criterio	forca	justificativa
//   17:43057062:T:C	PS3	Moderate	Ensaio funcional de Fulano et al. 2020
//   BRCA1:c.5123C>A	PM1		Domínio BRCT
//
// - "variante": "cromossomo:posicao:ref:alt" (com ou sem "chr") ou "GENE:c.HGVS".
// - "criterio": código ACMG (PS3) ou código com força (PS3_Moderate).
// - "forca": opcional. Supporting/Moderate/Strong/VeryStrong ou apoio/moderado/forte/muito_forte.
// - Um critério informado SUBSTITUI o mesmo critério automático (fica registrado no relatório).
// =============================================================================

import { CRITERIOS, CRITERIOS_APOSENTADOS, FORCAS, SINONIMOS_FORCA, lerTexto } from "./comum.ts";
import type { Criterio, Evidencia, Forca, Variante } from "./tipos.ts";

function normalizarForca(textoForca: string, linha: number): Forca {
  const chave = textoForca.trim().toLowerCase().replace(/[\s-]/g, "_");
  const forca = SINONIMOS_FORCA[chave] ?? SINONIMOS_FORCA[chave.replace(/_/g, "")];
  if (!forca) throw new Error(`Evidências, linha ${linha}: força desconhecida "${textoForca}". Use ${FORCAS.join(", ")}.`);
  return forca;
}

function normalizarVariante(textoVariante: string): Evidencia["alvo"] | null {
  const t = textoVariante.trim();
  const genomica = t.match(/^(?:chr)?([0-9XYM]+)[:\-_](\d+)[:\-_]([ACGTN]+)[:\->_]([ACGTN]+)$/i);
  if (genomica) {
    const [, c = "", p = "", r = "", a = ""] = genomica;
    return { tipo: "id", chave: `${c}:${p}:${r.toUpperCase()}:${a.toUpperCase()}` };
  }
  const hgvs = t.match(/^([A-Za-z0-9\-]+):(c\..+)$/);
  if (hgvs) return { tipo: "hgvs", chave: `${(hgvs[1] ?? "").toUpperCase()}:${hgvs[2]}` };
  return null;
}

/** Lê e valida o arquivo de evidências. */
export function lerEvidencias(caminho: string): Evidencia[] {
  const evidencias: Evidencia[] = [];
  let cabecalhoVisto = false;

  lerTexto(caminho).split(/\r?\n/).forEach((bruta, i) => {
    const numeroLinha = i + 1;
    if (!bruta.trim() || bruta.startsWith("#")) return;
    const [variante = "", criterioTexto = "", forcaTexto = "", ...resto] = bruta.split("\t");
    if (!cabecalhoVisto && variante.trim().toLowerCase() === "variante") {
      cabecalhoVisto = true;
      return;
    }

    const alvo = normalizarVariante(variante);
    if (!alvo) {
      throw new Error(`Evidências, linha ${numeroLinha}: variante "${variante}" inválida. Use 17:43045712:G:A ou BRCA1:c.123A>G.`);
    }

    const textoCriterio = criterioTexto.trim();
    const separador = textoCriterio.indexOf("_");
    const codigo = (separador < 0 ? textoCriterio : textoCriterio.slice(0, separador)).toUpperCase();
    const forcaNoCodigo = separador < 0 ? "" : textoCriterio.slice(separador + 1);

    if (CRITERIOS_APOSENTADOS.includes(codigo)) {
      throw new Error(`Evidências, linha ${numeroLinha}: ${codigo} foi aposentado pela ClinGen (Biesecker & Harrison 2018) e não é aceito.`);
    }
    const definicao = CRITERIOS[codigo];
    if (!definicao) {
      throw new Error(`Evidências, linha ${numeroLinha}: critério "${criterioTexto}" não existe no ACMG 2015.`);
    }

    const textoForca = forcaTexto.trim() || forcaNoCodigo;
    const forca = textoForca ? normalizarForca(textoForca, numeroLinha) : definicao.forca;
    if (forca === "StandAlone" && codigo !== "BA1") {
      throw new Error(`Evidências, linha ${numeroLinha}: só o BA1 pode ser StandAlone.`);
    }
    if (codigo === "BA1" && forca !== "StandAlone") {
      throw new Error(`Evidências, linha ${numeroLinha}: o BA1 é sempre StandAlone.`);
    }

    evidencias.push({ alvo, codigo, forca, justificativa: resto.join(" ").trim() });
  });
  return evidencias;
}

/** Evidências que valem para esta variante (por id genômico ou gene + HGVS c.). */
export function evidenciasDaVariante(variante: Variante, evidencias: Evidencia[]): Evidencia[] {
  const chaveHgvs = variante.gene && variante.hgvs_c ? `${variante.gene.toUpperCase()}:${variante.hgvs_c}` : null;
  return evidencias.filter(
    (e) => (e.alvo.tipo === "id" && e.alvo.chave === variante.id) || (e.alvo.tipo === "hgvs" && e.alvo.chave === chaveHgvs),
  );
}

/** Junta automáticos e informados; o informado substitui o automático de mesmo código. */
export function juntarCriterios(
  automaticos: Criterio[],
  informados: Evidencia[],
): { criterios: Criterio[]; substituidos: Criterio[] } {
  const codigosInformados = new Set(informados.map((e) => e.codigo));
  return {
    criterios: [
      ...automaticos.filter((c) => !codigosInformados.has(c.codigo)),
      ...informados.map((e): Criterio => ({ codigo: e.codigo, forca: e.forca, origem: "informado", motivo: e.justificativa })),
    ],
    substituidos: automaticos.filter((c) => codigosInformados.has(c.codigo)),
  };
}
