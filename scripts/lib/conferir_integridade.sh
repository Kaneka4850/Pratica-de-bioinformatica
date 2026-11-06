#!/usr/bin/env bash
# =============================================================================
# Confere se as partes prontas do exercício continuam iguais às do professor.
# -----------------------------------------------------------------------------
# PARTE PRONTA DO EXERCÍCIO. Não altere.
#
# Uso:   bash scripts/lib/conferir_integridade.sh [arquivo_de_registro]
#
# Compara o SHA-256 de cada arquivo pronto com scripts/lib/CHECKSUMS.sha256.
# Não bloqueia o pipeline: mostra um aviso e, se receber um arquivo de registro,
# grava nele o resultado (o main.sh grava em dados/05_results/<genoma>/integridade.txt,
# que o professor confere na correção).
# =============================================================================

set -uo pipefail

cd "$(dirname "$0")/../.."

LISTA="scripts/lib/CHECKSUMS.sha256"
REGISTRO="${1:-}"

if command -v sha256sum > /dev/null 2>&1; then
    conferir() { sha256sum -c "$LISTA" 2>/dev/null; }
else
    conferir() { shasum -a 256 -c "$LISTA" 2>/dev/null; }
fi

if [[ ! -f "$LISTA" ]]; then
    resultado="AVISO: $LISTA não encontrado; integridade não conferida."
else
    alterados="$(conferir | grep -v ': OK$' || true)"
    if [[ -z "$alterados" ]]; then
        resultado="OK: todas as partes prontas estão iguais às do professor."
    else
        resultado="ATENÇÃO: arquivos prontos foram alterados ou removidos:
$alterados"
    fi
fi

echo "$resultado"
if [[ -n "$REGISTRO" ]]; then
    mkdir -p "$(dirname "$REGISTRO")"
    { date -u +"%Y-%m-%dT%H:%M:%SZ"; echo "$resultado"; } > "$REGISTRO"
fi
exit 0
