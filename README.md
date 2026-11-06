# Atividade prática: do FASTQ ao VCF (e à classificação ACMG)

Nesta atividade, cada grupo **constrói o próprio pipeline de bioinformática**, do arquivo bruto do
sequenciador (FASTQ) até o arquivo de variantes (VCF). O resto já está pronto: ambiente, genomas de
referência, anotação e um classificador ACMG automático. Assim o grupo se concentra nas decisões
que importam: quais ferramentas usar, em que ordem, com quais parâmetros e como verificar se o
resultado está bom.

No fim, os grupos que usaram o genoma **HG19** e os que usaram o **HG38** comparam as
classificações e discutem por que elas mudam (ou não).

> **Dados:** amostra de proficiência do CAP (NGS-A 2020), leituras Illumina paired-end
> (158.081 pares de 150 pb) **só do cromossomo 17**, onde ficam genes como *BRCA1*, *TP53* e
> *NF1*. São dados públicos de teste, não de paciente.

---

## Sumário

1. [A proposta](#1-a-proposta)
2. [O que está pronto e o que é do grupo](#2-o-que-está-pronto-e-o-que-é-do-grupo)
3. [Grupos HG19 e HG38](#3-grupos-hg19-e-hg38)
4. [Arquitetura de pastas](#4-arquitetura-de-pastas)
5. [Contrato das etapas](#5-contrato-das-etapas)
6. [Ambiente: Docker ou conda](#6-ambiente-docker-ou-conda)
7. [Referências HG19 e HG38](#7-referências-hg19-e-hg38)
8. [Rodando o pipeline: `main.sh`](#8-rodando-o-pipeline-mainsh)
9. [Anotação (pronta)](#9-anotação-pronta)
10. [Classificador ACMG (pronto)](#10-classificador-acmg-pronto)
11. [Comparação hg19 x hg38 (pronta)](#11-comparação-hg19-x-hg38-pronta)
12. [Conceitos para consultar](#12-conceitos-para-consultar)
13. [Git: todos os comandos do grupo](#13-git-todos-os-comandos-do-grupo)
14. [Usando o Claude (e outros assistentes)](#14-usando-o-claude-e-outros-assistentes)
15. [Entrega e avaliação](#15-entrega-e-avaliação)
16. [Problemas comuns](#16-problemas-comuns)
17. [Referências](#17-referências)

---

## 1. A proposta

### O problema

Um laboratório recebeu a amostra do CAP e precisa responder: **quais variantes essa amostra tem
no cromossomo 17 e o que cada uma significa clinicamente?** O seu grupo é a equipe de
bioinformática. O caminho até a resposta tem várias etapas:

```
FASTQ (R1, R2)
   │
   ├─► 01 Controle de qualidade ──────────────► relatórios (06_quality_metrics/01_qc)
   │        (e, se o grupo decidir, trimming)
   ▼
02 Alinhamento ao chr17 (HG19 ou HG38) ───────► BAM ordenado + índice
   ▼
03 Chamada de variantes ──────────────────────► VCF.gz + índice
   │
   ├─► 06 Métricas pós-alinhamento ───────────► métricas (06_quality_metrics/<genoma>)
   ▼
04 Anotação pelo VEP (PRONTA) ────────────────► TSV e VCF anotados
   ▼
05 Classificação ACMG (PRONTA) ───────────────► classe de cada variante + relatório
   ▼
   Comparação hg19 x hg38 (PRONTA, quando os dois builds existem)
```

### O que o grupo vai aprender

- Transformar leituras brutas em variantes, entendendo **cada formato** (FASTQ, SAM/BAM, VCF).
- **Tomar e justificar decisões de arquitetura**: ferramenta, linguagem, parâmetros, organização
  do código, como testar.
- Medir a **qualidade** de cada etapa e reconhecer quando algo deu errado.
- Ver como o **build do genoma** (HG19 x HG38) afeta posições, transcritos e classificação.
- Ler uma classificação **ACMG/AMP** e entender de onde vem cada critério.
- Trabalhar com **Git** em equipe.

### Regras do jogo

1. O grupo escreve as etapas **01, 02, 03 e 06** em **Python, Bash ou R** (pode misturar: uma
   etapa em cada linguagem, se quiser).
2. Cada etapa respeita o [contrato](#5-contrato-das-etapas): recebe argumentos fixos e grava as
   saídas nos caminhos combinados.
3. As **partes prontas não podem ser alteradas** (o `main.sh` confere a integridade delas por
   SHA-256 e registra o resultado na pasta de resultados).
4. Toda decisão importante vai para o arquivo `DECISOES.md` do grupo (veja a
   [entrega](#15-entrega-e-avaliação)), com as opções consideradas e o motivo da escolha.

---

## 2. O que está pronto e o que é do grupo

| Parte | Situação | Onde |
|---|---|---|
| Ambiente Docker e conda (Python 3.14, R, Node 24, ferramentas) | **Pronto** | `Dockerfile`, `environment.yml`, `package.json` |
| Download e indexação do chr17 HG19 e HG38 | **Pronto** | `scripts/00_reference/` |
| Orquestração (`main.sh` e `Snakefile`) | **Pronto** | raiz do projeto |
| 01 Controle de qualidade | **Do grupo** | `scripts/01_qc/` |
| 02 Alinhamento | **Do grupo** | `scripts/02_alignment/` |
| 03 Chamada de variantes | **Do grupo** | `scripts/03_variant_calling/` |
| 06 Métricas pós-alinhamento | **Do grupo** | `scripts/06_quality_metrics/` |
| 04 Anotação VEP (API REST), em JavaScript | **Pronto** | `scripts/04_annotate/` |
| 05 Classificador ACMG automático, em TypeScript | **Pronto** | `scripts/05_results/acmg/` |
| Comparação hg19 x hg38 | **Pronto** | `scripts/05_results/comparar_builds.mjs` |
| Regras do assistente de IA | **Pronto** | `CLAUDE.md` |

**Por que JavaScript e TypeScript nas partes prontas?** O anotador (JavaScript) e o classificador
(TypeScript) são a "engine" que roda igual em qualquer máquina e em servidor: o Node é rápido,
leve na memória e não depende de pacotes externos aqui. O TypeScript ainda confere os tipos de cada
dado do classificador antes de rodar, o que evita erros silenciosos numa parte que precisa estar
validada. Os grupos trabalham em Python, Bash e R; podem (e devem) **ler** o anotador e o
classificador para entender o que eles fazem, mas não alterá-los.

---

## 3. Grupos HG19 e HG38

Cada grupo recebe um build: **HG19** (também chamado GRCh37, de 2009) ou **HG38** (GRCh38, de 2013,
o recomendado hoje para projetos novos). O grupo grava o seu em `config/config.yaml`:

```yaml
genoma: "hg19"   # ou "hg38"
```

Todos os resultados ficam separados por build (`dados/02_alignment/hg19/`,
`dados/02_alignment/hg38/` etc.), então dá para rodar os dois na mesma cópia do projeto. Quando os
dois existem, o `main.sh` gera a [comparação](#11-comparação-hg19-x-hg38-pronta) sozinho.

Perguntas que a turma vai responder juntando os grupos:

- As **mesmas variantes** foram encontradas nos dois builds? Se não, por quê?
- As **posições** mudaram? E o nome HGVS no gene (`c.`)?
- O **transcrito** usado foi o mesmo? (No hg38 o anotador usa o **MANE Select**; no hg19, o
  transcrito **canônico** do Ensembl, porque o MANE não existe para o GRCh37.)
- Alguma variante mudou de **classe ACMG**? Qual critério mudou?

---

## 4. Arquitetura de pastas

```
projeto/
├── README.md                      # este arquivo
├── CLAUDE.md                      # regras do assistente de IA (pronto)
├── main.sh                        # roda tudo (pronto)
├── Snakefile                      # o mesmo pipeline pelo Snakemake (pronto)
├── Dockerfile  .dockerignore      # imagem com todas as ferramentas (pronto)
├── environment.yml                # ambiente conda bioinfo-pratica (pronto)
├── requirements.txt               # bibliotecas Python, para quem usar .venv (pronto)
├── package.json  package-lock.json  tsconfig.json  .node-version   # Node 24 + TypeScript (pronto)
├── config/
│   └── config.yaml                # genoma do grupo, amostra, FASTQs, evidências
├── Artigos/                       # ACMG 2015, Tavtigian 2018, ACMG 2020 (CNV) e REFERENCIAS.md
├── dados/
│   ├── 00_reference/{HG19,HG38}/  # chr17.fa + índices (gerados pelo script pronto)
│   ├── 01_raw_data/               # FASTQs do CAP (+ trimmed/, se o grupo aparar)
│   ├── 02_alignment/{hg19,hg38}/  # BAM do grupo
│   ├── 03_variant_calling/{hg19,hg38}/  # VCF do grupo
│   ├── 04_annotate/{hg19,hg38}/   # saída do anotador
│   ├── 05_results/{hg19,hg38,comparacao}/  # classificação ACMG e comparação
│   └── 06_quality_metrics/{01_qc,hg19,hg38}/  # relatórios de qualidade do grupo
└── scripts/
    ├── 00_reference/              # PRONTO: preparar_referencia.sh
    ├── 01_qc/                     # GRUPO: run.py | run.sh | run.R
    ├── 02_alignment/              # GRUPO
    ├── 03_variant_calling/        # GRUPO
    ├── 04_annotate/               # PRONTO: anotar_vep.mjs (JavaScript)
    ├── 05_results/                # PRONTO: acmg/ (classificador TypeScript + testes) e comparar_builds.mjs
    ├── 06_quality_metrics/        # GRUPO
    └── lib/                       # PRONTO: rodar_etapa.sh, conferir_integridade.sh, ...
```

Dentro de cada pasta do grupo há um `LEIA-ME.md` com o contrato daquela etapa. O grupo pode criar
quantos arquivos quiser dentro da pasta da etapa (módulos, funções, testes, configurações).

---

## 5. Contrato das etapas

O contrato é o "combinado" entre o `main.sh` e os scripts do grupo. **É o que permite que o
pipeline rode igual para todos os grupos, mesmo com códigos totalmente diferentes.**

### 5.1 Como o `main.sh` encontra e roda o seu script

Em cada pasta de etapa do grupo deve existir **um, e só um,** arquivo de entrada:

| Arquivo | Executado com |
|---|---|
| `run.py` | `python3` (Python 3.14) |
| `run.sh` | `bash` |
| `run.R` | `Rscript --vanilla` |

Se não houver nenhum, ou houver mais de um, o `main.sh` para com uma mensagem explicando.

### 5.2 Argumentos

Todos os argumentos chegam como `--nome valor`. **O script recebe todos os argumentos da etapa,
mesmo os que não usar, e precisa aceitá-los sem dar erro.**

Toda etapa recebe:

| Argumento | Exemplo | Significado |
|---|---|---|
| `--amostra` | `cap_ngse_a_2020` | Nome da amostra |
| `--genoma` | `hg38` | Build do grupo |
| `--threads` | `6` | Threads que o script pode usar |
| `--memoria` | `4` | GB de RAM que o script pode usar |

Argumentos e saídas de cada etapa:

| Etapa | Argumentos específicos | O `main.sh` exige |
|---|---|---|
| **01** QC | `--r1` `--r2` (FASTQs), `--saida` (`dados/06_quality_metrics/01_qc`), `--trimmed` (`dados/01_raw_data/trimmed`) | Pelo menos um arquivo em `--saida`. **Opcional:** `<trimmed>/R1.fastq.gz` e `<trimmed>/R2.fastq.gz`; se existirem, a etapa 02 usa essas leituras |
| **02** Alinhamento | `--r1` `--r2`, `--referencia` (`dados/00_reference/HG38/chr17.fa`), `--saida` (pasta), `--bam` (caminho do BAM final) | `--bam` válido (`samtools quickcheck`), índice `.bai`, ordenado por posição (`SO:coordinate`) e com read group (`@RG`) |
| **03** Chamada | `--bam` (entrada), `--referencia`, `--saida` (pasta), `--vcf` (caminho do VCF final) | `--vcf` compactado com **bgzip**, legível pelo `bcftools`, com índice `.tbi` ou `.csi` |
| **06** Métricas | `--bam`, `--vcf` (entradas), `--referencia`, `--saida` (`dados/06_quality_metrics/<genoma>`) | Pelo menos um arquivo em `--saida` |

Os nomes finais seguem o padrão `<amostra>.bam` e `<amostra>.vcf.gz`, já passados prontos em
`--bam` e `--vcf`.

### 5.3 Exemplo de "esqueleto" que só lê os argumentos

Não é uma solução, é só para mostrar como receber os argumentos em cada linguagem:

```python
# scripts/02_alignment/run.py
import argparse
p = argparse.ArgumentParser()
for nome in ["r1", "r2", "referencia", "saida", "bam", "amostra", "genoma", "threads", "memoria"]:
    p.add_argument(f"--{nome}")
args, _ = p.parse_known_args()   # parse_known_args: não quebra com argumentos extras
print(args)
```

```bash
# scripts/02_alignment/run.sh
while [[ $# -gt 0 ]]; do
    case "$1" in
        --bam) BAM="$2" ;;
        --referencia) REFERENCIA="$2" ;;
        # ... os outros argumentos
    esac
    shift 2
done
```

```r
# scripts/02_alignment/run.R
args <- commandArgs(trailingOnly = TRUE)
valores <- setNames(args[c(FALSE, TRUE)], sub("^--", "", args[c(TRUE, FALSE)]))
print(valores[["bam"]])
```

Para chamar programas externos (bwa, samtools...) a partir de Python ou R, procure `subprocess`
(Python) e `system2` (R).

---

## 6. Ambiente: Docker ou conda

O grupo **não precisa instalar ferramenta nenhuma**: tudo está na imagem Docker e no ambiente
conda, com as mesmas versões.

| | Python | R | Node (engine) | Ferramentas |
|---|---|---|---|---|
| Docker e conda | 3.14 | 4.4 ou mais novo (+ optparse, data.table) | 24 LTS (+ TypeScript) | Snakemake, FastQC, fastp, BWA, SAMtools, BCFtools, htslib (bgzip/tabix), bedtools, GATK4 |

Pré-requisitos no computador: **Git** e **Docker** (Windows com WSL 2 + Ubuntu, ou macOS). Se
ainda não tem, siga o tutorial de instalação usado na disciplina.

> **Windows:** trabalhe sempre **dentro do Ubuntu (WSL)**, numa pasta como `~/projeto`, e não em
> `/mnt/c/...`. No Docker Desktop, ligue **Settings > Resources > WSL integration > Ubuntu**.

### Forma A: Docker (padrão)

Não precisa fazer nada além de ter o Docker ligado. Na primeira vez, o `main.sh` constrói a imagem
`pratica-bioinfo` (de 5 a 20 minutos, cerca de 3 GB). Para abrir um terminal **dentro** do
container e testar comandos à mão:

```bash
docker run --rm -it --user "$(id -u):$(id -g)" -e HOME=/tmp \
    -v "$PWD":/pipeline -w /pipeline pratica-bioinfo bash
# para sair: exit
```

### Forma B: conda

```bash
bash scripts/lib/criar_conda.sh        # cria o ambiente bioinfo-pratica (uma vez)
conda activate bioinfo-pratica          # em todo terminal novo
bash main.sh --modo conda               # roda sem Docker
```

---

## 7. Referências HG19 e HG38

O script pronto baixa o **cromossomo 17** da UCSC, confere o **MD5** publicado pela UCSC e cria os
índices de BWA, SAMtools e GATK:

```bash
bash main.sh --etapa 00                                    # o build do config.yaml, no Docker
bash scripts/00_reference/preparar_referencia.sh --genoma ambos   # dentro do container/conda
```

| Build | Origem | Resultado |
|---|---|---|
| HG19 | `hgdownload.soe.ucsc.edu/goldenPath/hg19/chromosomes/chr17.fa.gz` | `dados/00_reference/HG19/chr17.fa` + `.amb .ann .bwt .pac .sa .fai` + `chr17.dict` |
| HG38 | `hgdownload.soe.ucsc.edu/goldenPath/hg38/chromosomes/chr17.fa.gz` | `dados/00_reference/HG38/chr17.fa` + índices |

Por que só o chr17? Porque as leituras do CAP são só desse cromossomo. Indexar o genoma inteiro
levaria horas e uns 5 GB de RAM. **Ponto para discutir no `DECISOES.md`:** o que muda ao alinhar
contra um cromossomo só, e não contra o genoma todo? (Pense em leituras de regiões parecidas em
outros cromossomos.)

O `main.sh` roda a etapa 00 sozinho se a referência ainda não existir.

---

## 8. Rodando o pipeline: `main.sh`

```bash
bash main.sh                          # todas as etapas, build do config.yaml, no Docker
bash main.sh --genoma hg19            # escolhe o build na hora
bash main.sh --etapa 02               # só uma etapa (útil enquanto desenvolve)
bash main.sh --a-partir-de 03         # da etapa 03 em diante
bash main.sh --modo conda             # sem Docker, com o conda ativo
bash main.sh --snakemake              # mesma coisa, orquestrada pelo Snakemake
bash main.sh --evidencias ev.tsv      # evidências manuais para o classificador
bash main.sh --ajuda
```

Ordem das etapas: **00 → 01 → 02 → 03 → 06 → 04 → 05**. Antes de cada etapa do grupo, o
`main.sh` confere se a anterior gerou o que devia (BAM ordenado, índice, read group, VCF bgzip...).
Se algo faltar, ele para e diz o quê.

O `main.sh` mede o computador (`scripts/lib/verificar_recursos.py`) e usa todas as threads menos 2
e no máximo metade da RAM livre (até 8 GB), para o PC não travar. Esses números chegam ao seu
script em `--threads` e `--memoria`.

### Com Snakemake

`bash main.sh --snakemake` roda o mesmo pipeline pelo `Snakefile` pronto (o Snakemake já está no
ambiente, não precisa instalar). Cada regra chama `main.sh --etapa NN`, então as conferências são
as mesmas. A diferença: o Snakemake **só refaz o que mudou**. Para ver o que ele faria sem rodar,
dentro do container ou do conda:

```bash
snakemake -n --config genoma=hg38
```

---

## 9. Anotação (pronta)

`scripts/04_annotate/anotar_vep.mjs` lê o VCF do grupo e consulta a **API REST do Ensembl VEP**
(sem baixar os caches de dezenas de GB):

| Build | Servidor |
|---|---|
| hg19 | `https://grch37.rest.ensembl.org` |
| hg38 | `https://rest.ensembl.org` |

Para cada variante (multialélicas são separadas, uma linha por alelo) o VEP devolve gene,
transcrito, consequência, exon, HGVS `c.` e `p.`, frequências do **gnomAD**, escore **REVEL**,
escore **SpliceAI** e significância no **ClinVar**. Saídas em `dados/04_annotate/<genoma>/`:

| Arquivo | Conteúdo |
|---|---|
| `<amostra>.vep.tsv` | Tabela de colunas fixas (a entrada do classificador) |
| `<amostra>.vep.vcf.gz` | O VCF do grupo com o campo `INFO/CSQ` (também aceito pelo classificador) |
| `<amostra>.vep.json` | Resposta completa da API, para explorar |

Colunas do TSV: `cromossomo posicao ref alt genotipo filtro gene transcrito mane exon intron
hgvs_c hgvs_p consequencia impacto gnomad_af gnomad_grpmax_af fonte_frequencia revel spliceai_max
clinvar ids_conhecidos`.

Quando a API não traz o gnomAD para uma variante, o anotador usa a maior frequência entre as
populações continentais do **1000 Genomes** e escreve `1000G` na coluna `fonte_frequencia`. Isso
acontece, por exemplo, em posições onde a própria referência hg19 tem o alelo raro: a amostra
aparece homozigota "alternativa" para um alelo que está em quase 100% das pessoas.

> **Privacidade:** a anotação envia as variantes para os servidores do Ensembl. Use só dados
> públicos, como os desta atividade. Nunca use dados de pacientes.

---

## 10. Classificador ACMG (pronto)

`scripts/05_results/acmg/classificar.ts` (TypeScript, executado direto pelo Node 24) classifica
cada variante **germinativa** (SNV ou indel pequeno) em 5 classes: **Patogênica, Provavelmente patogênica, VUS, Provavelmente benigna,
Benigna**.

### 10.1 Base

- **Richards et al. 2015** (ACMG/AMP): os 28 critérios e a Tabela 5 de combinação.
- **Pontos de Tavtigian et al. 2018/2020**: cada força vale pontos, e a soma decide a classe.
- **Refinamentos da ClinGen**: PVS1 em degraus (Abou Tayoun 2018), PM2 rebaixado para apoio,
  PP5 e BP6 aposentados, PP3/BP4 calibrados pelo REVEL (Pejaver 2022), SpliceAI para splicing
  (Walker 2023), BA1 > 5%.

O artigo **ACMG 2020** da pasta `Artigos` (Riggs et al.) é o padrão para **CNVs**, que usa um
sistema de pontos parecido. Ele fica como leitura complementar: o classificador trata SNVs e
indels pequenos.

### 10.2 Pesos (pontos)

| Força | Patogênico | Benigno |
|---|---:|---:|
| Supporting (apoio) | +1 | −1 |
| Moderate (moderada) | +2 | −2 |
| Strong (forte) | +4 | −4 |
| Very Strong (muito forte) | +8 | |
| Stand-alone (BA1) | | classe Benigna direto |

| Soma | Classe |
|---|---|
| ≥ 10 | Patogênica |
| 6 a 9 | Provavelmente patogênica |
| 0 a 5 | VUS |
| −1 a −6 | Provavelmente benigna |
| ≤ −7 | Benigna |

A **classe final** é a dos pontos. A coluna `classe_2015` mostra, ao lado, a classe pela Tabela 5
do Richards 2015, para comparação. As duas podem discordar. Exemplo: um stop num gene com perda de
função como mecanismo, ausente do gnomAD, recebe PVS1 + PM2_Supporting. São 9 pontos
(**provavelmente patogênica**), mas na Tabela 5 de 2015 isso é "1 muito forte + 1 de apoio", que
não fecha nenhuma regra (**VUS**), porque em 2015 o PM2 ainda era moderado.

### 10.3 Critérios calculados sozinhos

| Critério | Regra no classificador | Força |
|---|---|---|
| **PVS1** | stop, frameshift, splice ±1/2, start_lost ou deleção do transcrito, **só** em gene com perda de função como mecanismo na ClinGen (`genes_lof.tsv`: escores 3 e 30) | stop/frameshift antes do último exon: Very Strong; no último exon ou em gene de exon único: Strong; splice canônico: Strong; start_lost: Moderate |
| **BA1** | gnomAD grpmax > 5% | Stand-alone |
| **BS1** | gnomAD grpmax > 1% | Strong |
| **PM2** | ausente do gnomAD ou grpmax < 0,01% | Supporting |
| **PM4** | indel em fase ou stop_lost (sem PVS1) | Moderate |
| **PP3** (missense) | REVEL ≥ 0,644 / ≥ 0,773 / ≥ 0,932, ou SpliceAI ≥ 0,2 | Supporting / Moderate / Strong |
| **BP4** (missense) | REVEL ≤ 0,290 / ≤ 0,183 / ≤ 0,016, com SpliceAI ≤ 0,1 | Supporting / Moderate / Strong |
| **PP3** (outras) | SpliceAI ≥ 0,2 (variantes não nulas) | Supporting |
| **BP4** (outras) | SpliceAI ≤ 0,1 (sinônimas, intrônicas, UTR, região de splice) | Supporting |
| **BP7** | sinônima com SpliceAI ≤ 0,1 | Supporting |
| **PP2 / BP1** | missense em genes listados no `config.json` (listas vazias por padrão) | Supporting |

Uma variante com PVS1 não recebe PP3, para não contar duas vezes a mesma evidência. O **ClinVar**
aparece só como coluna de comparação: não vira critério (PP5/BP6 foram aposentados).
"gnomAD grpmax" aqui é a maior frequência entre as populações africana, americana, leste-asiática,
europeia não finlandesa e sul-asiática, em exomas e genomas.

### 10.4 Critérios que dependem de vocês: arquivo de evidências

PS1, PS2, PS3, PS4, PM1, PM3, PM5, PM6, PP1, PP4, BS2, BS3, BS4, BP2, BP3 e BP5 precisam de
informação que o VCF não tem (família, estudos funcionais, literatura, fenótipo). O grupo pode
informá-los num **TSV opcional**:

```
variante	criterio	forca	justificativa
17:43057062:G:A	PS3		Estudo funcional de Fulano et al. 2020 mostra perda de função
chr17-7675088-C-T	PP4	apoio	Fenótipo muito específico
BRCA1:c.5123C>A	PM1_Moderate		Domínio BRCT
```

- `variante`: `cromossomo:posição:ref:alt` (com ou sem `chr`, separado por `:` `-` ou `_`) ou
  `GENE:c.HGVS`.
- `criterio`: o código (`PS3`) ou o código com a força (`PS3_Moderate`).
- `forca`: opcional. `Supporting`, `Moderate`, `Strong`, `VeryStrong`, ou `apoio`, `moderado`,
  `forte`, `muito_forte`. Vazio = força padrão do critério.
- Um critério informado **substitui** o automático de mesmo código (fica registrado no relatório).
- PP5 e BP6 são recusados.

```bash
bash main.sh --a-partir-de 05 --evidencias minhas_evidencias.tsv
# ou deixe o caminho no campo "evidencias" do config/config.yaml
```

### 10.5 Saídas (`dados/05_results/<genoma>/`)

| Arquivo | Conteúdo |
|---|---|
| `<amostra>.acmg.tsv` | Uma linha por variante: critérios (automáticos e informados), pontos, `classe`, `classe_2015`, ClinVar, o que não foi avaliado e o motivo de cada critério |
| `<amostra>.resumo.csv` | Contagem por classe (pontos e regras de 2015) |
| `<amostra>.relatorio.md` | Relatório legível, com as P/LP/VUS em tabela |
| `integridade.txt` | Resultado da conferência das partes prontas |

### 10.6 Limitações (leia antes de discutir os resultados)

- O PVS1 é **simplificado**: sem a regra dos 50 nucleotídeos antes da última junção entre exons,
  sem avaliar se o exon é crítico ou se há códons de início alternativos.
- O grpmax é aproximado pela maior frequência entre as populações (o gnomAD oficial usa o
  limite inferior do intervalo de confiança, a "filtering AF").
- BA1, BS1 e PM2 usam limites **genéricos**. Na prática, o limite depende da prevalência e da
  penetrância de cada doença.
- Não aplica as regras específicas de genes dos painéis de especialistas (VCEPs), como as do
  ENIGMA para *BRCA1*/*BRCA2* ou as do TP53 VCEP. **Para pensar:** o que mudaria na sua
  classificação de uma variante de *BRCA1* se você aplicasse a regra do ENIGMA?
- "Ausente do gnomAD" pode ser só "não coberto pelo gnomAD".
- **É um classificador para ensino. Não use para laudo.**

### 10.7 Testes

```bash
node --test scripts/05_results/acmg/tests/*.test.ts   # testes
npx tsc -p tsconfig.json                              # checagem de tipos (precisa do npm ci)
```

Os testes cobrem cada linha da Tabela 5 do Richards 2015, os limites de pontos, cada critério
automático, a leitura de TSV e VCF e o arquivo de evidências. Ler os testes é um bom jeito de
entender o classificador.

---

## 11. Comparação hg19 x hg38 (pronta)

Quando existem `dados/05_results/hg19/<amostra>.acmg.tsv` **e** `dados/05_results/hg38/<amostra>.acmg.tsv`,
o `main.sh` roda `scripts/05_results/comparar_builds.mjs` e grava em `dados/05_results/comparacao/`.
Como as posições mudam entre os builds, as variantes são pareadas pelo **rsID do dbSNP + alelo**;
sem rsID, pelo nome no gene (`GENE:c.HGVS`); e, por último, pela posição.

- `<amostra>.comparacao.tsv`: cada variante, com a situação `mesma_classe`, `classe_diferente`,
  `so_hg19` ou `so_hg38`, as posições, o nome HGVS e a classe em cada build;
- `<amostra>.comparacao.md`: resumo e a lista das que mudaram de classe.

Para juntar os resultados de dois grupos, copie a pasta `dados/05_results/<genoma>/` do outro
grupo para a sua cópia do projeto e rode `bash main.sh --etapa 05`.

---

## 12. Conceitos para consultar

| Formato | O que guarda | Coordenadas |
|---|---|---|
| **FASTA** (`.fa`) | Sequência de referência | — |
| **FASTQ** (`.fastq.gz`) | Leituras + qualidade de cada base (Phred+33) | — |
| **SAM / BAM / CRAM** | Leituras alinhadas (texto / binário / binário contra a referência) | começa em 1 |
| **BED** | Regiões (cromossomo, início, fim) | começa em 0, fim não incluído |
| **VCF** (`.vcf.gz`) | Variantes, com genótipo e qualidade | começa em 1 |

Termos que o grupo vai encontrar: Phred e Q30, adaptadores e trimming, paired-end, read group,
MAPQ, CIGAR, FLAG, duplicatas de PCR, cobertura, genótipo (GT, AD, DP, GQ), normalização de
indels, variantes multialélicas, Ti/Tv, MANE Select, HGVS, NMD.

Documentação: [SAM/BAM](https://samtools.github.io/hts-specs/SAMv1.pdf) ·
[VCF](https://samtools.github.io/hts-specs/VCFv4.2.pdf) ·
[BED](https://samtools.github.io/hts-specs/BEDv1.pdf) ·
[FastQC](https://www.bioinformatics.babraham.ac.uk/projects/fastqc/) ·
[fastp](https://github.com/OpenGene/fastp) · [BWA](https://github.com/lh3/bwa) ·
[SAMtools/BCFtools](https://www.htslib.org/doc/) · [bedtools](https://bedtools.readthedocs.io/) ·
[GATK](https://gatk.broadinstitute.org/hc/en-us/articles/360036194592) ·
[VEP REST](https://rest.ensembl.org/documentation/info/vep_region_post) ·
[Snakemake](https://snakemake.readthedocs.io/)

---

## 13. Git: todos os comandos do grupo

Cada grupo trabalha num **fork** (uma cópia do repositório da disciplina na conta do GitHub de um
integrante). Assim um grupo não vê o código do outro até a entrega.

```
 Repositório da disciplina (upstream) ──fork──► Fork do grupo (origin) ──clone──► Computador de cada integrante
            ▲                                          │
            └──────────── Pull Request (entrega) ◄─────┘
```

### 13.1 Configuração (uma vez por computador)

```bash
git config --global user.name "Seu Nome"
git config --global user.email "seu.email@exemplo.com"
git config --global init.defaultBranch main
git config --global pull.rebase false        # "git pull" faz merge (mais simples para começar)
git config --global core.autocrlf input      # evita fim de linha do Windows nos scripts
```

Para o GitHub aceitar seus `push`, use uma chave SSH:

```bash
ssh-keygen -t ed25519 -C "seu.email@exemplo.com"   # aperte Enter nas perguntas
cat ~/.ssh/id_ed25519.pub                          # copie e cole em GitHub > Settings > SSH and GPG keys
ssh -T git@github.com                              # deve responder "Hi <seu usuário>!"
```

### 13.2 Fork e clone (uma pessoa faz o fork, todas clonam)

1. Um integrante abre o repositório da disciplina no GitHub e clica em **Fork**.
2. Em **Settings > Collaborators** do fork, adiciona os colegas do grupo.
3. Cada integrante clona o fork:

```bash
cd ~
git clone git@github.com:USUARIO_DO_FORK/NOME_DO_REPOSITORIO.git projeto
cd projeto

# Liga o repositório da disciplina como "upstream", para receber atualizações do professor
git remote add upstream git@github.com:USUARIO_DO_PROFESSOR/NOME_DO_REPOSITORIO.git
git remote -v        # origin = fork do grupo, upstream = repositório da disciplina
```

### 13.3 O dia a dia

```bash
git status                      # o que mudou?
git pull                        # pega o que os colegas já enviaram (sempre antes de começar)

git switch -c alinhamento-bwa   # cria uma branch para a tarefa (opcional, mas organiza)

# ... edita os scripts ...

git diff                        # mostra o que mudou, linha a linha
git add scripts/02_alignment/run.py
git commit -m "Etapa 02: alinhamento com read group e índice"
git push -u origin alinhamento-bwa   # na primeira vez da branch; depois só "git push"
```

Juntar a branch na `main` do grupo (pelo GitHub, abrindo um Pull Request **dentro do fork**, ou
pelo terminal):

```bash
git switch main
git pull
git merge alinhamento-bwa
git push
git branch -d alinhamento-bwa   # apaga a branch local que já foi juntada
```

### 13.4 Conflitos

Se dois integrantes mudarem as mesmas linhas, o `git pull` ou o `git merge` avisa `CONFLICT`:

```bash
git status                      # mostra os arquivos em conflito
# abra o arquivo, procure <<<<<<< ======= >>>>>>>, deixe a versão certa e apague as marcas
git add arquivo_resolvido
git commit                      # finaliza o merge
```

### 13.5 Receber atualizações do professor

```bash
git fetch upstream
git switch main
git merge upstream/main
git push
```

### 13.6 Ver o histórico e desfazer

```bash
git log --oneline --graph --all   # histórico resumido
git show HEAD                     # o último commit
git restore arquivo               # descarta mudanças NÃO commitadas do arquivo
git restore --staged arquivo      # tira o arquivo do "git add"
git revert <hash>                 # cria um commit que desfaz outro (seguro, não apaga histórico)
```

### 13.7 O que o Git não guarda

O `.gitignore` já impede o envio de arquivos grandes ou gerados: referências e índices
(`dados/00_reference/`), BAM, VCF e todos os resultados (`dados/02_*` a `dados/06_*`),
`node_modules/`, `.snakemake/` e `config/recursos.yaml`. **Não force** (`git add -f`) esses
arquivos: o GitHub recusa arquivos acima de 100 MB, e os resultados são regenerados com
`bash main.sh`. Os FASTQs do CAP já fazem parte do repositório.

### 13.8 Entrega

```bash
git switch main
git pull
git tag -a entrega-v1 -m "Entrega do grupo X (hg38)"
git push origin entrega-v1
```

Depois, no GitHub do fork: **Contribute > Open pull request** para o repositório da disciplina,
com o título `Grupo X - hg38`. O professor avalia o código pelo PR e roda `bash main.sh` na tag.

---

## 14. Usando o Claude (e outros assistentes)

O arquivo `CLAUDE.md` configura o **Claude Code** para esta atividade:

- a cada decisão, ele apresenta **várias opções com prós e contras, sem dizer qual é a
  recomendada**: a escolha (e a justificativa no `DECISOES.md`) é do grupo;
- depois que o grupo escolhe, ele pode escrever o código, explicando cada parte;
- ele não altera as partes prontas (o `.claude/settings.json` também bloqueia);
- ele só escreve código das etapas em Python, Bash ou R.

Se usar outro assistente (Antigravity, OpenCode, Copilot...), cole o conteúdo do `CLAUDE.md` nas
instruções dele. Nunca cole dados de pacientes nem senhas em assistentes de IA.

---

## 15. Entrega e avaliação

O grupo entrega pelo Pull Request (seção 13.8):

1. **Código** das etapas 01, 02, 03 e 06, rodando com `bash main.sh` do zero numa cópia limpa.
2. **`DECISOES.md`** na raiz do projeto, uma seção por etapa:
   - quais opções o grupo considerou;
   - qual escolheu e **por quê** (com referência, quando houver);
   - como verificou que funcionou (métricas, comandos, arquivos).
3. **Apresentação curta** com: métricas de qualidade (QC, alinhamento, VCF), número de variantes,
   as variantes P/LP/VUS e a comparação com o grupo do outro build.

Checklist antes de entregar:

- [ ] `bash main.sh` roda do início ao fim numa cópia recém-clonada.
- [ ] Cada pasta de etapa tem um único `run.*`.
- [ ] `dados/05_results/<genoma>/integridade.txt` diz "OK".
- [ ] `DECISOES.md` completo.
- [ ] Nenhum arquivo grande ou gerado foi commitado (`git status` limpo depois de rodar).
- [ ] Tag `entrega-v1` enviada e PR aberto.

---

## 16. Problemas comuns

| Problema | O que fazer |
|---|---|
| `Docker não instalado` / `não está ligado` | Abra o Docker Desktop e espere ficar verde. No WSL: Settings > Resources > WSL integration > Ubuntu. Ou use `--modo conda`. |
| `permission denied ... docker.sock` | `sudo usermod -aG docker $USER`, feche e abra o terminal. |
| `nenhum script de entrada em scripts/02_alignment/` | Crie o `run.py`, `run.sh` ou `run.R` da etapa. |
| `mais de um script de entrada` | Deixe só um `run.*` na pasta (os auxiliares podem ter qualquer outro nome). |
| `a etapa 02 ... não gerou` | O script terminou sem gravar a saída no caminho de `--bam`/`--vcf`. Confira o contrato. |
| `o BAM não está ordenado` / `não tem read group` | Veja o `LEIA-ME.md` da etapa 02. |
| `o VCF ... não pôde ser lido` | O VCF precisa ser compactado com **bgzip** (não `gzip`) e indexado. |
| `error: unrecognized arguments` (Python) | Use `parse_known_args()` em vez de `parse_args()`. |
| Erro 429 ou de conexão no VEP | A API está ocupada: o anotador espera e tenta de novo. Se falhar, rode `bash main.sh --a-partir-de 04` depois. |
| `bash\r: No such file or directory` | Fim de linha do Windows: `sed -i 's/\r$//' arquivo.sh` (e configure `core.autocrlf input`). |
| Mac Apple: imagem não constrói | `PLATAFORMA_DOCKER=linux/amd64 bash main.sh` |
| Snakemake: `LockException` | Dentro do container/conda: `snakemake --unlock`. |
| PC travando | Feche o navegador e outros programas; o `main.sh` mede o PC de novo a cada execução. |

---

## 17. Referências

As referências completas, com links e o que cada artigo contribui para o classificador, estão em
[`Artigos/REFERENCIAS.md`](Artigos/REFERENCIAS.md).

- Richards S, et al. *Genet Med*. 2015;17:405-424. [doi:10.1038/gim.2015.30](https://doi.org/10.1038/gim.2015.30)
- Tavtigian SV, et al. *Genet Med*. 2018;20:1054-1060. [doi:10.1038/gim.2017.210](https://doi.org/10.1038/gim.2017.210)
- Tavtigian SV, et al. *Hum Mutat*. 2020;41:1734-1737. [doi:10.1002/humu.24088](https://doi.org/10.1002/humu.24088)
- Abou Tayoun AN, et al. *Hum Mutat*. 2018;39:1517-1524. [doi:10.1002/humu.23626](https://doi.org/10.1002/humu.23626)
- Pejaver V, et al. *Am J Hum Genet*. 2022;109:2163-2177. [doi:10.1016/j.ajhg.2022.10.013](https://doi.org/10.1016/j.ajhg.2022.10.013)
- Walker LC, et al. *Am J Hum Genet*. 2023;110:1046-1067. [doi:10.1016/j.ajhg.2023.06.002](https://doi.org/10.1016/j.ajhg.2023.06.002)
- Riggs ER, et al. *Genet Med*. 2020;22:245-257. [doi:10.1038/s41436-019-0686-8](https://doi.org/10.1038/s41436-019-0686-8)
