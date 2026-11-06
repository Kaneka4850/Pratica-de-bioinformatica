#!/usr/bin/env bash
# =============================================================================
# main.sh: roda o pipeline inteiro, do FASTQ à classificação ACMG.
# -----------------------------------------------------------------------------
# PARTE PRONTA DO EXERCÍCIO. Não altere.
#
# Uso:
#   bash main.sh                          # usa o genoma do config/config.yaml, no Docker
#   bash main.sh --genoma hg19            # escolhe o build
#   bash main.sh --modo conda             # usa o ambiente conda ativo, sem Docker
#   bash main.sh --snakemake              # mesma coisa, orquestrada pelo Snakefile
#   bash main.sh --etapa 03               # roda só uma etapa
#   bash main.sh --a-partir-de 03         # roda da etapa 03 em diante
#   bash main.sh --evidencias ev.tsv      # evidências manuais para o classificador
#   bash main.sh --ajuda
#
# Etapas, nesta ordem (as do grupo estão marcadas com *):
#   00  referência (pronta)              scripts/00_reference/preparar_referencia.sh
#   01* controle de qualidade            scripts/01_qc/run.*
#   02* alinhamento                      scripts/02_alignment/run.*
#   03* chamada de variantes             scripts/03_variant_calling/run.*
#   06* métricas pós-alinhamento         scripts/06_quality_metrics/run.*
#   04  anotação VEP (pronta)            scripts/04_annotate/anotar_vep.mjs
#   05  classificação ACMG (pronta)      scripts/05_results/acmg/classificar.ts
#       + comparação hg19 x hg38 quando os dois builds já foram rodados
# =============================================================================

set -euo pipefail

cd "$(dirname "$0")"

IMAGEM="pratica-bioinfo"
ORDEM=(00 01 02 03 06 04 05)
nome_etapa() {
    case "$1" in
        00) echo "Referência" ;; 01) echo "Controle de qualidade" ;; 02) echo "Alinhamento" ;;
        03) echo "Chamada de variantes" ;; 06) echo "Métricas pós-alinhamento" ;;
        04) echo "Anotação (VEP)" ;; 05) echo "Classificação ACMG" ;;
    esac
}
maiusculas() { echo "$1" | tr '[:lower:]' '[:upper:]'; }
minusculas() { echo "$1" | tr '[:upper:]' '[:lower:]'; }

informar() { echo -e "\n\033[1m>>> $*\033[0m"; }
erro() { echo -e "\n\033[31mERRO: $*\033[0m" >&2; exit 1; }
aviso() { echo -e "\033[33mAVISO: $*\033[0m" >&2; }

# Lê "chave: valor" do config/config.yaml (sem precisar de Python).
ler_config() {
    awk -v chave="$1" -F': *' '$1 == chave { sub(/^[^:]*: */, ""); gsub(/^"|"$/, ""); sub(/ *#.*/, ""); print; exit }' config/config.yaml
}

ler_recurso() {
    awk -v chave="$1" -F': *' '$1 == chave { print $2; exit }' config/recursos.yaml 2>/dev/null
}

# ----------------------------------------------------------------------------- Argumentos

GENOMA=""
MODO="docker"
USAR_SNAKEMAKE=0
SO_ETAPA=""
A_PARTIR_DE=""
EVIDENCIAS=""
ARGS_ORIGINAIS=("$@")
[[ $# -gt 0 ]] || ARGS_ORIGINAIS=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        --genoma) GENOMA="${2:-}"; shift 2 ;;
        --modo) MODO="${2:-}"; shift 2 ;;
        --snakemake) USAR_SNAKEMAKE=1; shift ;;
        --etapa) SO_ETAPA="${2:-}"; shift 2 ;;
        --a-partir-de) A_PARTIR_DE="${2:-}"; shift 2 ;;
        --evidencias) EVIDENCIAS="${2:-}"; shift 2 ;;
        -h|--ajuda) sed -n '2,28p' "$0"; exit 0 ;;
        *) erro "opção desconhecida: $1 (veja bash main.sh --ajuda)" ;;
    esac
done

GENOMA="${GENOMA:-$(ler_config genoma)}"
GENOMA="$(minusculas "$GENOMA")"
[[ "$GENOMA" == "hg19" || "$GENOMA" == "hg38" ]] || erro "genoma inválido: '$GENOMA'. Use --genoma hg19 ou --genoma hg38."
[[ "$MODO" == "docker" || "$MODO" == "conda" ]] || erro "modo inválido: '$MODO'. Use --modo docker ou --modo conda."
for e in "$SO_ETAPA" "$A_PARTIR_DE"; do
    [[ -z "$e" || " ${ORDEM[*]} " == *" $e "* ]] || erro "etapa inválida: '$e'. Etapas: ${ORDEM[*]}."
done
EVIDENCIAS="${EVIDENCIAS:-$(ler_config evidencias)}"
[[ -z "$EVIDENCIAS" || -f "$EVIDENCIAS" ]] || erro "arquivo de evidências não encontrado: $EVIDENCIAS"

AMOSTRA="$(ler_config amostra)"
R1="$(ler_config fastq_r1)"
R2="$(ler_config fastq_r2)"
REFERENCIA="dados/00_reference/$(maiusculas "$GENOMA")/chr17.fa"

# ----------------------------------------------------------------------------- Docker

conferir_docker() {
    command -v docker > /dev/null 2>&1 || erro "Docker não instalado. Instale o Docker (README) ou use --modo conda."
    if ! docker info > /dev/null 2>&1; then
        erro "o Docker está instalado mas não está ligado (ou sem permissão).
  Docker Desktop: abra o aplicativo e espere ficar verde.
  WSL: Settings > Resources > WSL integration > ligue a sua distribuição Ubuntu.
  Docker Engine no Linux: sudo service docker start"
    fi
}

medir_recursos() {
    if command -v python3 > /dev/null 2>&1; then
        python3 scripts/lib/verificar_recursos.py || true
    fi
    if [[ ! -s config/recursos.yaml ]]; then
        aviso "não consegui medir o computador; usando 2 threads e 4 GB."
        printf 'threads: 2\nmemoria_gb: 4\n' > config/recursos.yaml
    fi
}

rodar_no_docker() {
    local plataforma=()
    [[ -n "${PLATAFORMA_DOCKER:-}" ]] && plataforma=(--platform "$PLATAFORMA_DOCKER")

    informar "Construindo a imagem Docker '$IMAGEM' (na primeira vez demora de 5 a 20 minutos)"
    if ! docker build ${plataforma[@]+"${plataforma[@]}"} -t "$IMAGEM" .; then
        [[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" ]] &&
            echo "Mac Apple: tente  PLATAFORMA_DOCKER=linux/amd64 bash main.sh" >&2
        erro "a imagem Docker não foi construída. Confira a internet e o espaço em disco."
    fi

    # Git Bash no Windows: o Docker precisa do caminho do Windows (C:/...) e
    # o Git Bash não pode reescrever /pipeline e /tmp nos argumentos.
    local pasta="$PWD"
    if pwd -W > /dev/null 2>&1; then
        pasta="$(pwd -W)"
        export MSYS_NO_PATHCONV=1
    fi

    local threads memoria
    threads="$(ler_recurso threads)"
    memoria="$(ler_recurso memoria_gb)"
    informar "Entrando no container com $threads thread(s) e até ${memoria} GB de RAM"
    # Usuário do aluno (arquivos não ficam do root); HOME em /tmp porque esse
    # usuário não existe dentro do container.
    docker run --rm ${plataforma[@]+"${plataforma[@]}"} \
        --cpus "$threads" --memory "${memoria}g" \
        --user "$(id -u):$(id -g)" \
        --env HOME=/tmp --env JAVA_TOOL_OPTIONS=-Duser.home=/tmp \
        --volume "$pasta":/pipeline --workdir /pipeline \
        "$IMAGEM" bash main.sh ${ARGS_ORIGINAIS[@]+"${ARGS_ORIGINAIS[@]}"} --modo conda
}

# ----------------------------------------------------------------------------- Conferências

exigir_ferramentas() {
    local faltando=()
    for p in bwa samtools bcftools gatk node python3; do
        command -v "$p" > /dev/null 2>&1 || faltando+=("$p")
    done
    [[ ${#faltando[@]} -eq 0 ]] || erro "faltam programas: ${faltando[*]}.
  Ative o ambiente (conda activate bioinfo-pratica) ou rode sem --modo conda (Docker)."
}

exigir_arquivo() {
    local etapa="$1"; shift
    for f in "$@"; do
        [[ -s "$f" ]] || erro "a etapa $etapa ($(nome_etapa "$etapa")) terminou mas não gerou '$f'.
  Confira o contrato da etapa no README e em scripts/*/LEIA-ME.md."
    done
}

exigir_pasta_com_arquivos() {
    local etapa="$1" pasta="$2"
    [[ -n "$(find "$pasta" -type f ! -name '.gitkeep' ! -name '.etapa_*' 2>/dev/null | head -1)" ]] ||
        erro "a etapa $etapa ($(nome_etapa "$etapa")) não gravou nenhum arquivo em '$pasta'."
}

# Primeiro alinhamento disponível: o índice pode ser .bam.bai ou .bai.
indice_bam() {
    local bam="$1"
    if [[ -s "$bam.bai" ]]; then echo "$bam.bai"; elif [[ -s "${bam%.bam}.bai" ]]; then echo "${bam%.bam}.bai"; fi
}

conferir_bam() {
    local bam="$1"
    exigir_arquivo 02 "$bam"
    [[ -n "$(indice_bam "$bam")" ]] || erro "a etapa 02 não gerou o índice do BAM ($bam.bai)."
    samtools quickcheck "$bam" || erro "o BAM $bam está corrompido ou incompleto (samtools quickcheck)."
    local cabecalho
    cabecalho="$(samtools view -H "$bam")"
    grep -q "SO:coordinate" <<< "$cabecalho" || erro "o BAM não está ordenado por posição (falta SO:coordinate no cabeçalho)."
    grep -q "^@RG" <<< "$cabecalho" || erro "o BAM não tem read group (@RG). O GATK exige."
}

conferir_vcf() {
    local vcf="$1"
    exigir_arquivo 03 "$vcf"
    [[ -s "$vcf.tbi" || -s "$vcf.csi" ]] || erro "a etapa 03 não gerou o índice do VCF ($vcf.tbi)."
    bcftools view -h "$vcf" > /dev/null 2>&1 || erro "o VCF $vcf não pôde ser lido pelo bcftools (precisa ser bgzip)."
    local n
    n="$(bcftools view -H "$vcf" | wc -l | tr -d ' ')"
    [[ "$n" -gt 0 ]] || aviso "o VCF $vcf não tem nenhuma variante."
    echo "VCF com $n variante(s)."
}

marcar() { mkdir -p "$(dirname "$1")"; date -u +"%Y-%m-%dT%H:%M:%SZ" > "$1"; }

# ----------------------------------------------------------------------------- Etapas

THREADS=2
MEMORIA=4
BAM="dados/02_alignment/$GENOMA/$AMOSTRA.bam"
VCF="dados/03_variant_calling/$GENOMA/$AMOSTRA.vcf.gz"
QC_DIR="dados/06_quality_metrics/01_qc"
METRICAS_DIR="dados/06_quality_metrics/$GENOMA"
ANOTACAO_DIR="dados/04_annotate/$GENOMA"
RESULTADOS_DIR="dados/05_results/$GENOMA"

ARGS_COMUNS=()
definir_args_comuns() {
    ARGS_COMUNS=(--amostra "$AMOSTRA" --genoma "$GENOMA" --threads "$THREADS" --memoria "$MEMORIA")
}

leituras_para_alinhar() {
    local t1="dados/01_raw_data/trimmed/R1.fastq.gz" t2="dados/01_raw_data/trimmed/R2.fastq.gz"
    if [[ -s "$t1" && -s "$t2" ]]; then echo "$t1 $t2"; else echo "$R1 $R2"; fi
}

etapa_00() {
    if [[ -s "$REFERENCIA.bwt" && -s "$REFERENCIA.fai" && -s "${REFERENCIA%.fa}.dict" ]]; then
        echo "Referência $GENOMA já está pronta."
    else
        bash scripts/00_reference/preparar_referencia.sh --genoma "$GENOMA"
    fi
}

etapa_01() {
    mkdir -p "$QC_DIR" dados/01_raw_data/trimmed
    bash scripts/lib/rodar_etapa.sh 01_qc --r1 "$R1" --r2 "$R2" --saida "$QC_DIR" \
        --trimmed dados/01_raw_data/trimmed "${ARGS_COMUNS[@]}"
    exigir_pasta_com_arquivos 01 "$QC_DIR"
    marcar "$QC_DIR/.etapa_01.ok"
}

etapa_02() {
    local leituras
    read -r -a leituras <<< "$(leituras_para_alinhar)"
    [[ "${leituras[0]}" == *trimmed* ]] && echo "Usando as leituras aparadas de dados/01_raw_data/trimmed/."
    mkdir -p "$(dirname "$BAM")"
    bash scripts/lib/rodar_etapa.sh 02_alignment --r1 "${leituras[0]}" --r2 "${leituras[1]}" \
        --referencia "$REFERENCIA" --saida "$(dirname "$BAM")" --bam "$BAM" "${ARGS_COMUNS[@]}"
    conferir_bam "$BAM"
}

etapa_03() {
    conferir_bam "$BAM"
    mkdir -p "$(dirname "$VCF")"
    bash scripts/lib/rodar_etapa.sh 03_variant_calling --bam "$BAM" --referencia "$REFERENCIA" \
        --saida "$(dirname "$VCF")" --vcf "$VCF" "${ARGS_COMUNS[@]}"
    conferir_vcf "$VCF"
}

etapa_06() {
    mkdir -p "$METRICAS_DIR"
    bash scripts/lib/rodar_etapa.sh 06_quality_metrics --bam "$BAM" --vcf "$VCF" \
        --referencia "$REFERENCIA" --saida "$METRICAS_DIR" "${ARGS_COMUNS[@]}"
    exigir_pasta_com_arquivos 06 "$METRICAS_DIR"
    marcar "$METRICAS_DIR/.etapa_06.ok"
}

etapa_04() {
    conferir_vcf "$VCF"
    node scripts/04_annotate/anotar_vep.mjs --vcf "$VCF" --genoma "$GENOMA" --saida "$ANOTACAO_DIR" --amostra "$AMOSTRA"
    exigir_arquivo 04 "$ANOTACAO_DIR/$AMOSTRA.vep.tsv"
}

etapa_05() {
    local extra=()
    [[ -n "$EVIDENCIAS" ]] && extra=(--evidencias "$EVIDENCIAS")
    exigir_arquivo 04 "$ANOTACAO_DIR/$AMOSTRA.vep.tsv"
    bash scripts/lib/conferir_integridade.sh "$RESULTADOS_DIR/integridade.txt"
    node scripts/05_results/acmg/classificar.ts --entrada "$ANOTACAO_DIR/$AMOSTRA.vep.tsv" \
        --saida "$RESULTADOS_DIR" --amostra "$AMOSTRA" --genoma "$GENOMA" ${extra[@]+"${extra[@]}"}
    exigir_arquivo 05 "$RESULTADOS_DIR/$AMOSTRA.acmg.tsv"

    local a19="dados/05_results/hg19/$AMOSTRA.acmg.tsv" a38="dados/05_results/hg38/$AMOSTRA.acmg.tsv"
    if [[ -s "$a19" && -s "$a38" ]]; then
        informar "Os dois builds já foram rodados: comparando hg19 x hg38"
        node scripts/05_results/comparar_builds.mjs --hg19 "$a19" --hg38 "$a38" \
            --saida dados/05_results/comparacao --amostra "$AMOSTRA"
    fi
}

# ----------------------------------------------------------------------------- Execução

etapas_escolhidas() {
    if [[ -n "$SO_ETAPA" ]]; then echo "$SO_ETAPA"; return; fi
    local ligado=0
    [[ -z "$A_PARTIR_DE" ]] && ligado=1
    for e in "${ORDEM[@]}"; do
        [[ "$e" == "$A_PARTIR_DE" ]] && ligado=1
        [[ $ligado -eq 1 ]] && echo "$e"
    done
}

rodar_direto() {
    local etapas=() e
    while read -r e; do etapas+=("$e"); done < <(etapas_escolhidas)
    local total=${#etapas[@]} i=0
    for e in "${etapas[@]}"; do
        i=$((i + 1))
        informar "[$i/$total] Etapa $e: $(nome_etapa "$e") ($GENOMA)"
        "etapa_$e"
    done
}

rodar_snakemake() {
    local alvo="todas"
    [[ -n "$SO_ETAPA" ]] && alvo="etapa_$SO_ETAPA"
    [[ -n "$A_PARTIR_DE" ]] && aviso "--a-partir-de é ignorado com --snakemake: o Snakemake decide sozinho o que refazer."
    snakemake --cores "$THREADS" --printshellcmds \
        --config genoma="$GENOMA" evidencias="$EVIDENCIAS" -- "$alvo"
}

main() {
    if [[ "$MODO" == "docker" && -z "${PRATICA_NO_CONTAINER:-}" ]]; then
        informar "Modo Docker"
        conferir_docker
        medir_recursos
        rodar_no_docker
        exit $?
    fi

    exigir_ferramentas
    [[ -s config/recursos.yaml ]] || medir_recursos
    THREADS="$(ler_recurso threads)"; THREADS="${THREADS:-2}"
    MEMORIA="$(ler_recurso memoria_gb)"; MEMORIA="${MEMORIA:-4}"
    definir_args_comuns

    if [[ $USAR_SNAKEMAKE -eq 1 ]]; then
        informar "Rodando pelo Snakemake ($GENOMA, $THREADS threads, ${MEMORIA} GB)"
        rodar_snakemake
    else
        rodar_direto
    fi

    if [[ -z "$SO_ETAPA" || "$SO_ETAPA" == "05" ]] && [[ -s "$RESULTADOS_DIR/$AMOSTRA.acmg.tsv" ]]; then
        informar "Pronto! Resultados em $RESULTADOS_DIR/ ($AMOSTRA.acmg.tsv, .resumo.csv, .relatorio.md)"
    fi
}

main
