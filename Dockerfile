# =============================================================================
# Imagem Docker do exercício
# -----------------------------------------------------------------------------
# PARTE PRONTA DO EXERCÍCIO. Não altere.
#
# Tem tudo o que o pipeline precisa: Python 3.14, R e Bash para as etapas dos
# alunos; Node 24 (+ TypeScript para checar tipos) para o anotador e o
# classificador; Snakemake, FastQC, fastp, BWA, SAMtools, BCFtools, bedtools
# e GATK. O main.sh constrói esta imagem sozinho na primeira vez.
#
# Construir à mão:  docker build -t pratica-bioinfo .
# Mac com chip Apple, se faltar pacote ARM:  docker build --platform linux/amd64 -t pratica-bioinfo .
# =============================================================================

FROM mambaorg/micromamba:2.10.0

# Mesma lista de programas do ambiente conda: Docker e conda nunca divergem.
COPY --chown=$MAMBA_USER:$MAMBA_USER environment.yml /tmp/environment.yml
RUN micromamba install -y -n base -f /tmp/environment.yml && \
    micromamba clean --all --yes

ARG MAMBA_DOCKERFILE_ACTIVATE=1
ENV PATH=/opt/conda/bin:$PATH

# TypeScript (tsc, só para checar tipos do classificador) fixado no
# package-lock.json, instalado fora da pasta do projeto (que é montada por
# cima de /pipeline na hora de rodar).
USER root
COPY package.json package-lock.json /opt/pratica-node/
RUN cd /opt/pratica-node && npm ci --no-audit --no-fund && npm cache clean --force && \
    chmod -R a+rX /opt/pratica-node
ENV PATH=/opt/pratica-node/node_modules/.bin:$PATH \
    NODE_PATH=/opt/pratica-node/node_modules \
    PRATICA_NO_CONTAINER=1

USER $MAMBA_USER
WORKDIR /pipeline
