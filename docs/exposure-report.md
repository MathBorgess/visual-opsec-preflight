# Documento de exposição virtual

Contrato de produto de 2026-11-13. A implementação local usa `exposure-report/1.0`, definido em `src/lib/contracts.ts`. O exemplo de desenho continua sintético e não é análise real. Ver [exemplo](examples/exposure-report.synthetic.md), [requisitos](requirements.md) e [evidências locais](implementation-status.md).

## Propósito

Explicar quanto uma única foto permite conhecer sobre o ambiente e contexto de seu autor, mostrando a diferença entre o que foi visto, o que o arquivo declara, o que foi encontrado na web e o que foi inferido.

O documento é um material educativo de exposição, não prova pericial, confirmação de identidade ou certificação de segurança. Seu conteúdo pode ser mais sensível que a foto isolada por reunir sinais dispersos.

## Estrutura obrigatória

| Seção | Conteúdo |
| --- | --- |
| 1. Identificação e escopo | ID do caso, data da análise, versão do contrato/política, foto/derivada por referência, objetivo e autorizações; nenhum nome de arquivo pessoal no cabeçalho |
| 2. Resumo de exposição | Principais achados sustentados, limite mais importante e contexto que continua desconhecido; sem score global |
| 3. O que a foto mostra | Inventário de regiões/textos/objetos, leitura e limitações; separar informações fornecidas pelo usuário |
| 4. O que o arquivo registra | Metadados suportados presentes/ausentes/falhos, significado e ressalvas; valores sensíveis minimizados |
| 5. O que a web acrescentou | Sementes liberadas, perguntas, rodadas, fontes, trechos disponíveis, datas e estado de recuperação |
| 6. Achados e correlações | Cadeia de evidências, inferência, alternativas, estado epistemológico, prioridade e recomendação |
| 7. Redução de exposição | Ações específicas e verificáveis que o autor pode tomar; distinguir recomendação de ação efetivamente realizada |
| 8. Cobertura e limites | Perguntas selecionadas, regiões/tentativas, fontes inacessíveis, conflitos, motivo de parada, pendências, estado remoto, uso disponível e retenção/encerramento |

Se uma seção não tiver dados, mostrar o motivo: `not_present`, `not_supported`, `not_authorized`, `not_executed`, `failed` ou `unknown`. Se a pesquisa não foi autorizada, não preencher a seção com conhecimento genérico como se viesse de busca.

## Conteúdo de cada achado

| Campo | Significado |
| --- | --- |
| `id` | Identificador estável no caso |
| `title` e `category` | Exposição concreta e categoria: texto, ambiente, tecnologia, contexto público, metadados ou combinação |
| `statement` | Afirmação limitada ao que as evidências sustentam |
| `status` | `observed`, `corroborated`, `hypothesis`, `contradicted` ou `unknown` |
| `evidence_ids` | Observações/fontes usadas, sem IDs inventados |
| `explanation` | Justificativa breve que conecta os sinais; não é cadeia interna de raciocínio |
| `alternatives` e `limitations` | Explicações concorrentes e restrições de leitura/contexto |
| `priority` e `priority_reason` | Prioridade de revisão e critério que a sustenta |
| `recommendation` | Ação concreta para reduzir a exposição ou revisar a hipótese |
| `review` | `pending`, `accepted`, `rejected` ou `corrected`, distinguindo revisão do autor e saída original |

Uma afirmação externa exige o caminho `achado → fonte web → rodada/semente → evidência visual/metadado`. Informação introduzida pelo usuário fica identificada; não anunciar que o agente a descobriu na foto.

## Qualidade da conclusão

- `observed`: sinal visual mostrado ou campo extraído; conservar incerteza de leitura e possibilidade de alteração do arquivo.
- `corroborated`: associação sustentada por observação e fonte pertinente, com alternativas avaliadas; não implica certeza sobre a pessoa.
- `hypothesis`: explicação plausível ainda sem suporte suficiente; não entra como fato no resumo.
- `contradicted`: evidências conflitam; apresentar o conflito sem escolher silenciosamente uma versão.
- `unknown`: não há base para concluir.

Metadados podem ser editados; GPS registrado não comprova localização atual; horário sem fuso não fixa instante; ausência de dados não prova ausência de exposição. Fontes copiadas não são independentes. Um equipamento ou livro não determina profissão, renda, condição de saúde ou hábito.

## Prioridade de revisão

`high`: exposição direta de identificador privado, segredo ou localização precisa registrada; `medium`: associação contextual sustentada que reduz significativamente a ambiguidade do cenário; `low`: detalhe genérico de pouco poder de associação; `undetermined`: evidência insuficiente.

A prioridade é uma regra de curadoria declarada, não probabilidade calibrada de dano. Uma hipótese incerta não recebe prioridade alta apenas por soar preocupante. Nenhum percentual agregado de “foto segura”.

## Registro mínimo de evidência

Toda evidência possui ID, tipo, origem/versão, descrição mínima, sensibilidade e limitações. Visual: referência da imagem orientada/recorte e região quando disponível; metadado: grupo/campo e estado de extração; contexto do usuário: registro explícito de que foi fornecido.

Fonte web: semente/rodada de origem, URL canônica retornada, título, trecho efetivamente disponível, data de acesso, data de publicação se conhecida e estado `snippet_only`, `retrieved`, `unavailable` ou `fixture`. `fixture` só é admitido em exemplos/testes e deve ser rotulado sintético, nunca como consulta real.

Validar referências e limites das caixas em código na implementação. `schemas/finding.schema.json` é legado de candidatos visuais e não cobre esse contrato; não usá-lo como se já validasse o dossiê completo.

## Registro da parada

Acrescentar `stop_reason`, `closed_questions`, `unresolved_questions`, `blocked_branches`, `unexplored_signals`, `budget_used`, `coverage` e `remote_status` ao contrato. Usar os motivos e estados do [loop](exploration-loop.md). As perguntas e sementes de origem ficam ligadas aos achados/fontes; nenhuma inferência externa perde seu vínculo à foto.

Mostrar por que uma pista não foi aprofundada e que evidência faltou. Parada da exploração, síntese concluída e exclusão das sessões são resultados distintos. Um relatório pode ser parcial e conter turnos remotos ainda em cancelamento; não afirmar interrupção confirmada sem evidência do provedor.

## Formatos e compartilhamento

O JSON é o documento canônico versionado; HTML da interface e Markdown de download são apresentações dos mesmos dados validados. O schema formal e seu validador serão implementados a partir deste contrato, com fixture positiva e casos negativos.

O download padrão minimiza dados pessoais, não incorpora foto/miniaturas/base64, nomes de arquivo privados ou cookies. Uma exportação detalhada exige escolha explícita do autor e revisão dos valores; não é anexada à busca ou publicada automaticamente.

Marcar status de execução `completed`, `partial`, `failed` ou `cancelled`, sem equiparar conclusão do turno à qualidade da análise. Registrar modelo/configuração, versões dos extratores/prompts, limites, trabalho efetivo e uso/custo conhecido; desconhecido permanece nulo/indisponível.

A V1 recomenda cortes, cobertura e remoção de metadados, mas não modifica nem exporta uma nova foto. Não incluir “exposição removida” ou “imagem verificada” se só houve recomendação.

## Aceite do documento

Rejeitar referência inexistente, citação que não sustenta a frase, hipótese apresentada como fato, fonte fabricada e campo preenchido sem execução. Não rejeitar relatório parcial apenas por ter lacunas honestas. A aceitação exige cobrir as oito seções e distinguir resultado do agente, revisão humana e ação executada.
