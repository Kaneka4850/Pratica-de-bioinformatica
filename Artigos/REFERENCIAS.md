# Artigos da atividade

## Nesta pasta

| Arquivo | Artigo | Para que serve aqui |
|---|---|---|
| `ACMG 2015.pdf` | Richards S, et al. Standards and guidelines for the interpretation of sequence variants. *Genet Med*. 2015;17:405-424. [doi:10.1038/gim.2015.30](https://doi.org/10.1038/gim.2015.30) | **Base do classificador**: os 28 critérios e a Tabela 5 (regras de combinação) |
| `ACMG_CLINGEN_2020.pdf` | Tavtigian SV, et al. Modeling the ACMG/AMP variant classification guidelines as a Bayesian classification framework. *Genet Med*. 2018;20:1054-1060. [doi:10.1038/gim.2017.210](https://doi.org/10.1038/gim.2017.210) | **Base dos pesos**: transforma as forças de evidência em OddsPath (o sistema de pontos de 2020 é a versão "arredondada" deste modelo). Apesar do nome do arquivo, é o artigo de 2018 |
| `ACMG 2020.pdf` | Riggs ER, et al. Technical standards for the interpretation and reporting of constitutional copy-number variants. *Genet Med*. 2020;22:245-257. [doi:10.1038/s41436-019-0686-8](https://doi.org/10.1038/s41436-019-0686-8) | Leitura complementar: o mesmo raciocínio de pontos aplicado a **CNVs** (deleções e duplicações grandes). Não é usado pelo classificador, que trata SNVs e indels pequenos |

## Refinamentos ClinGen usados no classificador (leia pelos links)

| Artigo | O que o classificador usa | Acesso |
|---|---|---|
| Tavtigian SV, et al. Modeling the ACMG/AMP variant classification guidelines as a Bayesian classification framework. *Genet Med*. 2018;20:1054-1060. [doi:10.1038/gim.2017.210](https://doi.org/10.1038/gim.2017.210) | Força de cada nível de evidência (OddsPath) | Aberto: [PMC6336098](https://pmc.ncbi.nlm.nih.gov/articles/PMC6336098/) |
| Tavtigian SV, et al. Fitting a naturally scaled point system to the ACMG/AMP variant classification guidelines. *Hum Mutat*. 2020;41:1734-1737. [doi:10.1002/humu.24088](https://doi.org/10.1002/humu.24088) | **Pontos** (1, 2, 4, 8) e limites das classes | Manuscrito: [PMC8011844](https://pmc.ncbi.nlm.nih.gov/articles/PMC8011844/) |
| Abou Tayoun AN, et al. Recommendations for interpreting the loss of function PVS1 ACMG/AMP variant criterion. *Hum Mutat*. 2018;39:1517-1524. [doi:10.1002/humu.23626](https://doi.org/10.1002/humu.23626) | **PVS1 em degraus** (NMD, último exon, splice, start_lost) | Manuscrito: [PMC6185798](https://pmc.ncbi.nlm.nih.gov/articles/PMC6185798/) |
| Pejaver V, et al. Calibration of computational tools for missense variant pathogenicity classification and ClinGen recommendations for PP3/BP4 criteria. *Am J Hum Genet*. 2022;109:2163-2177. [doi:10.1016/j.ajhg.2022.10.013](https://doi.org/10.1016/j.ajhg.2022.10.013) | Limiares do **REVEL** para PP3/BP4 (Tabela 2) | Aberto: [PMC9748256](https://pmc.ncbi.nlm.nih.gov/articles/PMC9748256/) |
| Walker LC, et al. Using the ACMG/AMP framework to capture evidence related to predicted and observed impact on splicing. *Am J Hum Genet*. 2023;110:1046-1067. [doi:10.1016/j.ajhg.2023.06.002](https://doi.org/10.1016/j.ajhg.2023.06.002) | **SpliceAI** (≥ 0,2 para PP3; ≤ 0,1 para BP4) e BP7 | Manuscrito: [PMC10357475](https://pmc.ncbi.nlm.nih.gov/articles/PMC10357475/) |
| Biesecker LG, Harrison SM. The ACMG/AMP reputable source criteria for the interpretation of sequence variants. *Genet Med*. 2018;20:1687-1688. [doi:10.1038/gim.2018.42](https://doi.org/10.1038/gim.2018.42) | **PP5 e BP6 aposentados** | Manuscrito: [PMC6709533](https://pmc.ncbi.nlm.nih.gov/articles/PMC6709533/) |
| Ghosh R, et al. Updated recommendation for the benign stand-alone ACMG/AMP criterion. *Hum Mutat*. 2018;39:1525-1530. [doi:10.1002/humu.23642](https://doi.org/10.1002/humu.23642) | **BA1** acima de 5% | Manuscrito no PMC |
| ClinGen SVI. Recommendation for absence/rarity (PM2) v1.0, 2020. [clinicalgenome.org](https://clinicalgenome.org/working-groups/sequence-variant-interpretation/) | **PM2 rebaixado** para Supporting | Aberto |
| ClinGen Dosage Sensitivity Curation. [ftp.clinicalgenome.org](https://ftp.clinicalgenome.org/ClinGen_gene_curation_list_GRCh38.tsv) | Lista de genes com perda de função como mecanismo (`scripts/05_results/acmg/genes_lof.tsv`, baixada em 06/11/2026) | Aberto |

"Aberto" = artigo com licença aberta. "Manuscrito" = versão do autor no PubMed Central, de
leitura gratuita.
