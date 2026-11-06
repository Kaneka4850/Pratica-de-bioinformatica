# =============================================================================
# Snakefile: o mesmo pipeline do main.sh, orquestrado pelo Snakemake.
# -----------------------------------------------------------------------------
# PARTE PRONTA DO EXERCÍCIO. Não altere.
#
# Não rode o snakemake direto: use   bash main.sh --snakemake [--genoma hg19]
# (o main.sh prepara o Docker/conda e mede os recursos do computador).
#
# Cada regra chama "bash main.sh --modo conda --etapa NN", então as conferências
# do contrato de cada etapa são exatamente as mesmas do modo direto. A vantagem
# do Snakemake: ele sabe o que já está pronto e só refaz o que mudou.
#
# Útil:  snakemake -n --config genoma=hg38   (mostra o que seria feito, sem rodar)
# =============================================================================

configfile: "config/config.yaml"

GENOMA = str(config["genoma"]).lower()
AMOSTRA = config["amostra"]
REF = f"dados/00_reference/{GENOMA.upper()}/chr17.fa"
EXTRA = f"--evidencias {config['evidencias']}" if config.get("evidencias") else ""

if GENOMA not in ("hg19", "hg38"):
    raise ValueError(f"genoma inválido: {GENOMA!r}. Use hg19 ou hg38.")


def etapa(numero):
    """Comando que roda uma etapa pelo main.sh (com as mesmas conferências)."""
    return f"bash main.sh --modo conda --genoma {GENOMA} --etapa {numero} {EXTRA}"


rule todas:
    input:
        f"dados/05_results/{GENOMA}/{AMOSTRA}.acmg.tsv",


rule etapa_00:
    threads: workflow.cores  # usa a máquina toda: não roda junto com outra etapa
    output:
        REF + ".bwt",
        REF + ".fai",
        REF.removesuffix(".fa") + ".dict",
    shell:
        etapa("00")


rule etapa_01:
    input:
        config["fastq_r1"],
        config["fastq_r2"],
    output:
        "dados/06_quality_metrics/01_qc/.etapa_01.ok",
    shell:
        etapa("01")


rule etapa_02:
    threads: workflow.cores  # usa a máquina toda: não roda junto com outra etapa
    input:
        rules.etapa_00.output,
        rules.etapa_01.output,  # o QC pode gerar leituras aparadas usadas aqui
    output:
        f"dados/02_alignment/{GENOMA}/{AMOSTRA}.bam",
    shell:
        etapa("02")


rule etapa_03:
    threads: workflow.cores  # usa a máquina toda: não roda junto com outra etapa
    input:
        rules.etapa_02.output,
    output:
        f"dados/03_variant_calling/{GENOMA}/{AMOSTRA}.vcf.gz",
    shell:
        etapa("03")


rule etapa_06:
    input:
        rules.etapa_02.output,
        rules.etapa_03.output,
    output:
        f"dados/06_quality_metrics/{GENOMA}/.etapa_06.ok",
    shell:
        etapa("06")


rule etapa_04:
    input:
        rules.etapa_03.output,
    output:
        f"dados/04_annotate/{GENOMA}/{AMOSTRA}.vep.tsv",
    shell:
        etapa("04")


rule etapa_05:
    input:
        rules.etapa_04.output,
        rules.etapa_06.output,
    output:
        f"dados/05_results/{GENOMA}/{AMOSTRA}.acmg.tsv",
    shell:
        etapa("05")
