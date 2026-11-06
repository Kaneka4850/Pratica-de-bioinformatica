#!/usr/bin/env bash
# =============================================================================
# Cria (ou atualiza) o ambiente conda "bioinfo-pratica" com todas as ferramentas.
# -----------------------------------------------------------------------------
# PARTE PRONTA DO EXERCÍCIO. Não altere.
#
# Uso (na pasta principal do projeto, com o conda/Miniconda instalado):
#     bash scripts/lib/criar_conda.sh
#     conda activate bioinfo-pratica
#     bash main.sh --modo conda --genoma hg38
#
# O ambiente tem Python 3.14, R, Node 24, Snakemake, FastQC, fastp, BWA,
# SAMtools, BCFtools, bedtools e GATK (lista em environment.yml). Depois, instala
# o TypeScript (só para checar os tipos do classificador) em node_modules/.
# =============================================================================

set -euo pipefail

cd "$(dirname "$0")/../.."

NOME="bioinfo-pratica"

if command -v mamba > /dev/null 2>&1; then GERENCIADOR=mamba
elif command -v conda > /dev/null 2>&1; then GERENCIADOR=conda
else
    echo "ERRO: conda não encontrado. Instale o Miniconda (veja o README) ou use o Docker: bash main.sh" >&2
    exit 1
fi

# Mac com chip Apple: alguns pacotes de bioinformática só existem para Intel.
if [[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" ]]; then
    export CONDA_SUBDIR=osx-64
    echo ">>> Mac Apple: usando pacotes Intel (Rosetta 2)."
fi

if "$GERENCIADOR" env list | awk '{print $1}' | grep -qx "$NOME"; then
    echo ">>> Atualizando o ambiente $NOME"
    "$GERENCIADOR" env update -n "$NOME" -f environment.yml --prune
else
    echo ">>> Criando o ambiente $NOME (de 5 a 20 minutos)"
    "$GERENCIADOR" env create -n "$NOME" -f environment.yml
fi

echo ">>> Instalando o TypeScript (checagem de tipos) em node_modules/"
"$GERENCIADOR" run -n "$NOME" npm ci --no-audit --no-fund

echo
echo "Pronto! Ative com:  conda activate $NOME"
