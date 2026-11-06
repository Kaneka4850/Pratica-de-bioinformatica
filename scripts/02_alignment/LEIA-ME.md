# Etapa 02: alinhamento (do grupo)

Alinhe as leituras paired-end ao chr17 do seu build e entregue um BAM pronto para a chamada de variantes.

## Como o seu script é chamado

O `main.sh` procura nesta pasta **um único** arquivo de entrada e escolhe o interpretador pela extensão:

| Arquivo | Roda com |
|---|---|
| `run.py` | `python3` (3.14) |
| `run.sh` | `bash` |
| `run.R` | `Rscript` |

Você pode criar outros arquivos nesta pasta (módulos, funções, configurações) e importá-los a partir do `run.*`.

Todos os argumentos chegam no formato `--nome valor`. **Seu script recebe todos os argumentos da tabela abaixo, mesmo os que não usar.** Aceite todos sem dar erro (em Python, `argparse` com `parse_known_args`; em R, `optparse` ou `commandArgs`; em Bash, um laço `while`).

Argumentos que toda etapa recebe:

| Argumento | Exemplo | O que é |
|---|---|---|
| `--amostra` | `cap_ngse_a_2020` | Nome da amostra (use nos nomes dos arquivos e no read group) |
| `--genoma` | `hg38` | Build do grupo: `hg19` ou `hg38` |
| `--threads` | `6` | Quantas threads você pode usar |
| `--memoria` | `4` | Quantos GB de RAM você pode usar (ex.: no Java, `-Xmx3g`) |

Argumentos específicos desta etapa:

| Argumento | Exemplo | O que é |
|---|---|---|
| `--r1`, `--r2` | `dados/01_raw_data/...fastq.gz` | Leituras (ou as aparadas da etapa 01) |
| `--referencia` | `dados/00_reference/HG38/chr17.fa` | FASTA já indexado (BWA, .fai e .dict prontos) |
| `--saida` | `dados/02_alignment/hg38` | Pasta da etapa (arquivos intermediários podem ficar aqui) |
| `--bam` | `dados/02_alignment/hg38/cap_ngse_a_2020.bam` | **Caminho exato do BAM final** |

## O que o main.sh confere

- O arquivo `--bam` existe e passa no `samtools quickcheck`.
- Existe o índice `<bam>.bai` (ou `.bai` no lugar de `.bam`).
- O BAM está **ordenado por posição** (`SO:coordinate` no cabeçalho).
- O BAM tem **read group** (`@RG`), exigido pelo GATK.

Pense também (não é conferido, mas conta na discussão): duplicatas de PCR, qualidade de mapeamento, métricas do alinhamento.

## Para testar só esta etapa

```bash
bash main.sh --etapa 02           # no Docker
bash main.sh --modo conda --etapa 02   # no conda
```

Se o seu script terminar com erro (código de saída diferente de 0), o `main.sh` para e mostra a mensagem.
