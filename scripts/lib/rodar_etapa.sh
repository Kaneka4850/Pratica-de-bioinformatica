#!/usr/bin/env bash
# =============================================================================
# Executa o script de uma etapa escrito pelo grupo, em qualquer linguagem aceita.
# -----------------------------------------------------------------------------
# PARTE PRONTA DO EXERCÍCIO. Não altere.
#
# Uso:   bash scripts/lib/rodar_etapa.sh <pasta_da_etapa> [argumentos para o script...]
# Ex.:   bash scripts/lib/rodar_etapa.sh 02_alignment --r1 a.fq.gz --r2 b.fq.gz ...
#
# Na pasta scripts/<etapa>/ deve existir UM (e só um) arquivo de entrada:
#     run.py  -> python3 (3.14)
#     run.sh  -> bash
#     run.R   -> Rscript
# (JavaScript e TypeScript ficam reservados às partes prontas: anotador e classificador.)
# O script pode chamar outros arquivos da mesma pasta (módulos, funções etc.).
# =============================================================================

set -euo pipefail

cd "$(dirname "$0")/../.."

ETAPA="${1:?informe a pasta da etapa, ex.: 02_alignment}"
shift
PASTA="scripts/$ETAPA"

[[ -d "$PASTA" ]] || { echo "ERRO: a pasta $PASTA não existe." >&2; exit 1; }

candidatos=()
for nome in run.py run.sh run.R; do
    [[ -f "$PASTA/$nome" ]] && candidatos+=("$PASTA/$nome")
done

if [[ ${#candidatos[@]} -eq 0 ]]; then
    echo "ERRO: nenhum script de entrada em $PASTA/." >&2
    echo "Crie UM destes arquivos: run.py, run.sh ou run.R (veja $PASTA/LEIA-ME.md)." >&2
    exit 1
fi
if [[ ${#candidatos[@]} -gt 1 ]]; then
    echo "ERRO: mais de um script de entrada em $PASTA/: ${candidatos[*]}" >&2
    echo "Deixe só um run.* por etapa (os outros arquivos podem ter qualquer outro nome)." >&2
    exit 1
fi

SCRIPT="${candidatos[0]}"

echo ">>> Etapa $ETAPA: $SCRIPT $*"
case "$SCRIPT" in
    *.py) python3 "$SCRIPT" "$@" ;;
    *.sh) bash "$SCRIPT" "$@" ;;
    *.R) Rscript --vanilla "$SCRIPT" "$@" ;;
esac
