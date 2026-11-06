# Etapa 03: chamada de variantes (do grupo)

Encontre os SNVs e indels da amostra e entregue um VCF pronto para a anotação.

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
| `--referencia` | `dados/00_reference/HG38/chr17.fa` | FASTA indexado |
| `--saida` | `dados/03_variant_calling/hg38` | Pasta da etapa |
| `--vcf` | `dados/03_variant_calling/hg38/cap_ngse_a_2020.vcf.gz` | **Caminho exato do VCF final** |

## O que o main.sh confere

- O arquivo `--vcf` existe, é **bgzip** (o `bcftools` consegue ler) e tem índice `.tbi` ou `.csi`.
- Avisa se o VCF não tiver nenhuma variante.

O anotador (etapa 04) envia cada linha do VCF para o VEP. Pense em como o grupo vai representar as variantes para que elas batam com os bancos de dados (multialélicas, indels, filtros de qualidade).

## Para testar só esta etapa

```bash
bash main.sh --etapa 03           # no Docker
bash main.sh --modo conda --etapa 03   # no conda
```

Se o seu script terminar com erro (código de saída diferente de 0), o `main.sh` para e mostra a mensagem.
