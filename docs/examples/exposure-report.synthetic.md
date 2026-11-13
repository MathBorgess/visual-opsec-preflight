# Exemplo sintético: uma foto de mesa de trabalho

> **Fixture textual de desenho.** A foto descrita, metadados e página web abaixo são fictícios. Não há arquivo de imagem anexado, execução de agente ou busca real. Os estados demonstram a apresentação pretendida, não resultados medidos.

## 1. Identificação e escopo

- Caso: `demo-aurora-001`; contrato: `exposure-report/1.0-draft`.
- Objetivo: explicar como detalhes de fundo permitem buscar contexto público.
- Entrada prevista: uma foto encenada de teclado, notebook e etiqueta de evento.
- Modelo/latência/custo: não executado; indisponíveis.
- Autorização simulada: análise da foto e pesquisa de “Encontro Aurora”; nenhum nome pessoal, e-mail ou GPS liberado.
- Estado: `partial` simulado, pois a edição do evento não foi resolvida.

## 2. Resumo de exposição

A etiqueta permite pesquisar um evento público. O arquivo contém, no cenário fictício, tags de coordenadas que merecem remoção antes de compartilhar. A edição do evento e a presença do autor no local continuam desconhecidas.

## 3. O que a foto mostra

| Evidência | Observação simulada | Limite |
| --- | --- | --- |
| E-V01 | Região de etiqueta contém “Encontro Aurora” | Última linha pequena; ano ilegível |
| E-V02 | Há notebook e teclado na mesa | Não determina profissão, propriedade ou rotina |
| E-V03 | Recorte da etiqueta mantém o ano ambíguo | Nova leitura não recupera detalhe ausente |

As três observações seriam associadas à mesma imagem e coordenadas em uma implementação real.

## 4. O que o arquivo registra

E-M01: grupo GPS presente no inventário fictício; valor omitido. Isso descreve dados que o arquivo registra, não localização atual de uma pessoa. Tags ausentes ou não suportadas seriam listadas com seu estado, sem inventar valores.

## 5. O que a web acrescentou

Semente S-01: “Encontro Aurora”; origem E-V01; autorização simulada para essa pesquisa.

Fonte W-01, fixture: `https://evento-aurora.invalid/programacao`. Título fictício: “Programação do Encontro Aurora”. Trecho simulado: “Consulte a programação de cada edição anual”. Estado: `fixture`; data real de acesso: não aplicável. O domínio .invalid não representa página recuperada.

A fixture associa o nome a uma série de eventos, mas não resolve qual edição aparece na etiqueta.

## 6. Achados e correlações

**F-01 — Nome de evento pesquisável.** Estado `corroborated` apenas dentro do cenário simulado. Cadeia: E-V01 → S-01 → W-01. O texto cria um caminho para buscar contexto do evento. Alternativas: etiqueta antiga, material emprestado ou edição diferente. Não comprova presença pessoal. Prioridade `medium`, pela associação contextual. Revisão: `pending`.

**F-02 — Coordenadas embutidas no arquivo.** Estado `observed` apenas no inventário fictício E-M01. Prioridade `high`, por exposição direta de coordenadas precisas registradas. Não foram pesquisadas nem interpretadas como residência. Revisão: `pending`.

**F-03 — Profissão do autor.** Estado `unknown`; E-V02 não é suporte suficiente. Prioridade `undetermined`. Não incluir uma profissão no resumo.

## 7. Redução de exposição

Para F-01: revisar/cortar ou cobrir a etiqueta antes de publicar. Para F-02: remover metadados de uma cópia e inspecioná-la novamente. Nenhuma dessas ações foi executada; a V1 entrega recomendações e documento.

## 8. Cobertura e limites

Exploração simulada: foto geral e um recorte; um sinal liberado para web; uma fonte fictícia; sem pesquisa de pessoas. Trabalho não feito: leitura confiável do ano, validação de uma página real, modificação da foto e verificação pós-exportação.

Este exemplo não demonstra acerto, tempo, custo, geolocalização ou capacidade real de identificação. Em uma execução do produto, seriam exibidos os limites utilizados, fontes reais, metadados do método e estado do encerramento/exclusão das sessões.
