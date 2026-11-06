# Etapa 06: métricas pós-alinhamento (do grupo)

Meça a qualidade do alinhamento e do VCF. Roda depois da etapa 03 e antes da anotação.

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
| `--bam` | `dados/02_alignment/hg38/cap_ngse_a_2020.bam` | BAM da etapa 02 (entrada) |
| `--vcf` | `dados/03_variant_calling/hg38/cap_ngse_a_2020.vcf.gz` | VCF da etapa 03 (entrada) |
| `--referencia` | `dados/00_reference/HG38/chr17.fa` | FASTA indexado |
| `--saida` | `dados/06_quality_metrics/hg38` | Pasta onde gravar as métricas |

## O que o main.sh confere

- Pelo menos um arquivo em `--saida`.

Que métricas o grupo escolheu e por quê? Elas entram na apresentação final (veja o README).

## Para testar só esta etapa

```bash
bash main.sh --etapa 06           # no Docker
bash main.sh --modo conda --etapa 06   # no conda
```

Se o seu script terminar com erro (código de saída diferente de 0), o `main.sh` para e mostra a mensagem.
