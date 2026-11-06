# Etapa 01: controle de qualidade (do grupo)

Avalie a qualidade das leituras do FASTQ. Aparar (*trimming*) é opcional: o grupo decide se precisa.

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
| `--r1` | `dados/01_raw_data/...R1_001.fastq.gz` | Leituras de ida |
| `--r2` | `dados/01_raw_data/...R2_001.fastq.gz` | Leituras de volta |
| `--saida` | `dados/06_quality_metrics/01_qc` | Pasta onde gravar os relatórios |
| `--trimmed` | `dados/01_raw_data/trimmed` | Pasta para as leituras aparadas, se o grupo aparar |

## O que o main.sh confere

- Pelo menos um arquivo de relatório em `--saida`.
- **Opcional:** se existirem `<trimmed>/R1.fastq.gz` **e** `<trimmed>/R2.fastq.gz`, a etapa 02 usa essas leituras no lugar das originais. Se não aparar, não crie esses arquivos.

## Para testar só esta etapa

```bash
bash main.sh --etapa 01           # no Docker
bash main.sh --modo conda --etapa 01   # no conda
```

Se o seu script terminar com erro (código de saída diferente de 0), o `main.sh` para e mostra a mensagem.
