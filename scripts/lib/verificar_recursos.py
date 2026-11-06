#!/usr/bin/env python3
"""
Verifica os recursos do computador (RAM, processador e disco) e calcula
quanto o pipeline pode usar sem deixar o PC travado.

Como usar (dentro da pasta do repositório):
    python3 scripts/lib/verificar_recursos.py

O que ele faz:
    1. Mostra núcleos físicos, threads, RAM total/livre e espaço em disco.
    2. Decide quantas threads e quanta memória o pipeline vai usar,
       sempre deixando uma folga para o Windows e para os seus programas.
    3. Grava a decisão em config/recursos.yaml (lido pelo Snakefile e pelo
       main.sh).
"""

import os
import platform
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

# ---------------------------------------------------------------------------
# Regras de segurança (ajuste aqui se quiser ser mais ou menos conservador)
# ---------------------------------------------------------------------------
GIB = 1024**3                    # 1 GiB em bytes
THREADS_RESERVADAS = 2           # threads deixadas livres para o sistema
FRACAO_RAM_PIPELINE = 0.5        # usa no máximo metade da RAM disponível
MEMORIA_MINIMA_GB = 2            # abaixo disso o GATK não funciona direito
MEMORIA_MAXIMA_GB = 8            # este exercício nunca precisa de mais que isso
RAM_RECOMENDADA_GB = 6           # abaixo disso, avisamos que pode ficar lento
                                 # (o WSL enxerga ~metade da RAM do Windows)
DISCO_RECOMENDADO_GB = 15        # imagem Docker + índices + resultados

PASTA_REPOSITORIO = Path(__file__).resolve().parents[2]
ARQUIVO_SAIDA = PASTA_REPOSITORIO / "config" / "recursos.yaml"


@dataclass
class Recursos:
    """Guarda as informações de hardware lidas do computador."""

    nucleos_fisicos: int
    threads_logicas: int
    ram_total_gb: float
    ram_disponivel_gb: float
    disco_livre_gb: float


@dataclass
class Plano:
    """Guarda quanto o pipeline vai usar de CPU e memória."""

    threads: int
    memoria_gb: int


def ler_memoria_do_linux() -> tuple[float, float]:
    """Lê RAM total e disponível em /proc/meminfo (usado se o psutil faltar)."""
    valores = {}
    with open("/proc/meminfo", encoding="utf-8") as arquivo:
        for linha in arquivo:
            chave, valor = linha.split(":", 1)
            valores[chave] = int(valor.split()[0]) * 1024  # kB -> bytes
    return valores["MemTotal"] / GIB, valores["MemAvailable"] / GIB


def ler_memoria_do_macos() -> tuple[float, float]:
    """Lê RAM total (sysctl) e livre (vm_stat) no macOS (usado se o psutil faltar)."""
    total = int(subprocess.run(["sysctl", "-n", "hw.memsize"], capture_output=True,
                               text=True, check=True).stdout)
    saida = subprocess.run(["vm_stat"], capture_output=True, text=True, check=True).stdout
    tamanho_pagina = int(saida.split("page size of")[1].split()[0])
    paginas = {}
    for linha in saida.splitlines()[1:]:
        chave, _, valor = linha.partition(":")
        if valor.strip().rstrip(".").isdigit():
            paginas[chave.strip()] = int(valor.strip().rstrip("."))
    livres = sum(paginas.get(nome, 0) for nome in
                 ("Pages free", "Pages inactive", "Pages speculative", "Pages purgeable"))
    return total / GIB, livres * tamanho_pagina / GIB


def estou_no_wsl() -> bool:
    """True se o Python estiver rodando dentro do WSL (Linux dentro do Windows)."""
    return "microsoft" in platform.release().lower()


def ler_recursos() -> Recursos:
    """Coleta núcleos, threads, RAM e disco. Usa psutil se estiver instalado."""
    threads = os.cpu_count() or 1
    disco_livre = shutil.disk_usage(PASTA_REPOSITORIO).free / GIB

    try:
        import psutil

        nucleos = psutil.cpu_count(logical=False) or threads
        memoria = psutil.virtual_memory()
        ram_total, ram_livre = memoria.total / GIB, memoria.available / GIB
    except ImportError:
        # Sem psutil não dá para saber os núcleos físicos com certeza.
        nucleos = threads
        if sys.platform == "darwin":
            ram_total, ram_livre = ler_memoria_do_macos()
        else:
            ram_total, ram_livre = ler_memoria_do_linux()

    return Recursos(nucleos, threads, ram_total, ram_livre, disco_livre)


def calcular_plano(recursos: Recursos) -> Plano:
    """Decide threads e memória do pipeline deixando folga para o sistema."""
    threads = max(1, recursos.threads_logicas - THREADS_RESERVADAS)
    memoria = int(recursos.ram_disponivel_gb * FRACAO_RAM_PIPELINE)
    memoria = max(MEMORIA_MINIMA_GB, min(memoria, MEMORIA_MAXIMA_GB))
    return Plano(threads, memoria)


def listar_avisos(recursos: Recursos, plano: Plano) -> list[str]:
    """Retorna avisos para situações em que o PC pode sofrer."""
    avisos = []
    if recursos.ram_total_gb < RAM_RECOMENDADA_GB:
        avisos.append(
            f"Seu sistema enxerga só {recursos.ram_total_gb:.1f} GB de RAM. "
            f"O recomendado é {RAM_RECOMENDADA_GB} GB. Feche o navegador e "
            "outros programas antes de rodar."
        )
    if recursos.ram_disponivel_gb < plano.memoria_gb + 1:
        avisos.append(
            "Pouca RAM livre agora. Feche programas pesados antes de rodar."
        )
    if recursos.disco_livre_gb < DISCO_RECOMENDADO_GB:
        avisos.append(
            f"Só {recursos.disco_livre_gb:.1f} GB livres em disco. "
            f"Recomendado: {DISCO_RECOMENDADO_GB} GB."
        )
    if recursos.threads_logicas <= THREADS_RESERVADAS:
        avisos.append("Processador com poucas threads: o pipeline vai demorar mais.")
    return avisos


def salvar_plano(plano: Plano) -> None:
    """Grava o plano em config/recursos.yaml para o pipeline usar."""
    ARQUIVO_SAIDA.parent.mkdir(parents=True, exist_ok=True)
    ARQUIVO_SAIDA.write_text(
        "# Gerado automaticamente por scripts/lib/verificar_recursos.py\n"
        "# Rode o script de novo se trocar de computador.\n"
        f"threads: {plano.threads}\n"
        f"memoria_gb: {plano.memoria_gb}\n",
        encoding="utf-8",
    )


def mostrar_relatorio(recursos: Recursos, plano: Plano, avisos: list[str]) -> None:
    """Imprime na tela um resumo fácil de ler."""
    onde = "vistos de dentro do WSL" if estou_no_wsl() else platform.system()
    print("=" * 60)
    print(f" Recursos do seu computador ({onde})")
    print("=" * 60)
    print(f" Núcleos físicos ........ {recursos.nucleos_fisicos}"
          + ("  (no WSL pode aparecer igual às threads)" if estou_no_wsl() else ""))
    print(f" Threads (lógicos) ...... {recursos.threads_logicas}")
    print(f" RAM total .............. {recursos.ram_total_gb:.1f} GB")
    print(f" RAM disponível agora ... {recursos.ram_disponivel_gb:.1f} GB")
    print(f" Disco livre ............ {recursos.disco_livre_gb:.1f} GB")
    print("-" * 60)
    print(" O pipeline vai usar:")
    print(f"   {plano.threads} thread(s) e até {plano.memoria_gb} GB de RAM")
    print(f"   (salvo em {ARQUIVO_SAIDA.relative_to(PASTA_REPOSITORIO)})")
    print("-" * 60)
    if avisos:
        print(" ATENÇÃO:")
        for aviso in avisos:
            print(f"   - {aviso}")
    else:
        print(" Tudo certo! Seu computador aguenta o pipeline tranquilo.")
    if estou_no_wsl():
        print("-" * 60)
        print(" Dica: o WSL usa no máximo metade da RAM do Windows. Para mudar isso,")
        print(" veja a seção 'Limitar a memória do WSL' no README.")


def main() -> int:
    """Ponto de entrada: lê o hardware, calcula o plano, salva e mostra."""
    recursos = ler_recursos()
    plano = calcular_plano(recursos)
    avisos = listar_avisos(recursos, plano)
    salvar_plano(plano)
    mostrar_relatorio(recursos, plano, avisos)
    return 0


if __name__ == "__main__":
    sys.exit(main())
