#!/usr/bin/env bash
# =============================================================================
# Baixa e indexa o cromossomo 17 do genoma humano em HG19 e/ou HG38.
# -----------------------------------------------------------------------------
# PARTE PRONTA DO EXERCÍCIO: validada pelo professor. Não altere.
#
# Como usar (na pasta principal do projeto):
#     bash scripts/00_reference/preparar_referencia.sh --genoma hg19
#     bash scripts/00_reference/preparar_referencia.sh --genoma hg38
#     bash scripts/00_reference/preparar_referencia.sh --genoma ambos
#
# Para cada build:
#   1. Baixa chr17.fa.gz da UCSC (cerca de 25 MB)
#   2. Confere o MD5 com o md5sum.txt publicado pela UCSC
#   3. Descompacta em dados/00_reference/HG19/chr17.fa (ou HG38)
#   4. bwa index ..................... índice do BWA (.amb .ann .bwt .pac .sa)
#   5. samtools faidx ................ índice .fai
#   6. gatk CreateSequenceDictionary . dicionário .dict exigido pelo GATK
#
# Cada passo é pulado se o resultado já existir: pode rodar quantas vezes quiser.
# Por que só o chr17? O FASTQ do exercício (CAP NGS-A 2020) tem leituras só do
# cromossomo 17. Indexar o genoma inteiro levaria horas e ~5 GB de RAM.
# =============================================================================

set -euo pipefail

cd "$(dirname "$0")/../.."

URL_UCSC="https://hgdownload.soe.ucsc.edu/goldenPath"
CROMOSSOMO="chr17"

informar() { echo -e "\n>>> $*"; }
erro() { echo "ERRO: $*" >&2; exit 1; }

exigir_programa() {
    command -v "$1" > /dev/null 2>&1 || erro "o programa '$1' não foi encontrado. Use 'bash main.sh' (Docker) ou ative o conda: conda activate bioinfo-pratica"
}

baixar() {
    local url="$1" destino="$2"
    if command -v curl > /dev/null 2>&1; then
        curl -fL --retry 3 --progress-bar -o "$destino" "$url"
    else
        wget -q --show-progress -O "$destino" "$url"
    fi
}

md5_de() {
    if command -v md5sum > /dev/null 2>&1; then md5sum "$1" | awk '{print $1}'; else md5 -q "$1"; fi
}

preparar() {
    local genoma="$1"
    local pasta
    pasta="dados/00_reference/$(echo "$genoma" | tr '[:lower:]' '[:upper:]')"
    local gz="$pasta/$CROMOSSOMO.fa.gz"
    local fasta="$pasta/$CROMOSSOMO.fa"
    local dicionario="$pasta/$CROMOSSOMO.dict"
    mkdir -p "$pasta"

    informar "[$genoma] 1/5 Download de $CROMOSSOMO.fa.gz"
    if [[ -s "$fasta" ]]; then
        echo "Já existe $fasta"
    else
        if [[ ! -s "$gz" ]]; then
            baixar "$URL_UCSC/$genoma/chromosomes/$CROMOSSOMO.fa.gz" "$gz.parcial"
            mv "$gz.parcial" "$gz"
        fi
        informar "[$genoma] 2/5 Conferindo o MD5"
        local esperado obtido
        esperado="$(baixar "$URL_UCSC/$genoma/chromosomes/md5sum.txt" /dev/stdout | awk -v a="$CROMOSSOMO.fa.gz" '$2==a {print $1}')"
        obtido="$(md5_de "$gz")"
        if [[ -z "$esperado" || "$esperado" != "$obtido" ]]; then
            rm -f "$gz"
            erro "MD5 diferente do publicado pela UCSC (esperado '$esperado', obtido '$obtido'). O arquivo foi apagado: rode de novo."
        fi
        echo "MD5 confere: $obtido"
        informar "[$genoma] 3/5 Descompactando"
        gunzip -c "$gz" > "$fasta.parcial" && mv "$fasta.parcial" "$fasta"
    fi

    informar "[$genoma] 4/5 Índice do BWA (de 3 a 8 minutos)"
    if [[ -s "$fasta.bwt" ]]; then echo "Já existe"; else bwa index "$fasta"; fi

    informar "[$genoma] 5/5 Índice .fai e dicionário .dict"
    [[ -s "$fasta.fai" ]] || samtools faidx "$fasta"
    [[ -s "$dicionario" ]] || gatk CreateSequenceDictionary -R "$fasta" -O "$dicionario" --QUIET true

    informar "[$genoma] Referência pronta em $fasta"
}

main() {
    local genoma=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --genoma) genoma="${2:-}"; shift 2 ;;
            -h|--ajuda) sed -n '2,25p' "$0"; exit 0 ;;
            *) erro "opção desconhecida: $1 (use --genoma hg19|hg38|ambos)" ;;
        esac
    done
    for programa in gunzip bwa samtools gatk; do exigir_programa "$programa"; done
    case "$genoma" in
        hg19|hg38) preparar "$genoma" ;;
        ambos) preparar hg19; preparar hg38 ;;
        *) erro "informe --genoma hg19, hg38 ou ambos" ;;
    esac
}

main "$@"
