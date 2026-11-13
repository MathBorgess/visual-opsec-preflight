# Visual OpSec — especificação de produto e atividades

Especificação de 2026-11-13, sintetizada com a skill to-spec e posteriormente aprovada para implementação local. Base documental original: commit 16fc6f819323a456c8aee07c31498bca213dec7e, no [PR de arquitetura](https://github.com/MathBorgess/visual-opsec-preflight/pull/1).

Estado: implementação local autorizada, incluindo a fronteira de API proposta abaixo. A [matriz de entrega](implementation-status.md) registra evidências e pendências. Implantação Vercel, inclusão da chave e validação ao vivo foram reservadas pelo autor para a etapa final. Não há publicação no rastreador ou label ready-for-agent declarada.

## Problem Statement

Uma pessoa pode compartilhar uma foto sem perceber textos ao fundo, telas, documentos e metadados que expõem contexto sobre seu ambiente. A combinação desses sinais com fontes públicas pode revelar mais que cada detalhe isolado.

O autor precisa entender quais informações estão observáveis, quais correlações são sustentáveis, quais são apenas hipóteses e como reduzir a exposição. Precisa também enxergar onde a exploração terminou, sem receber uma biografia fabricada, uma promessa de varrer toda a internet ou um certificado de segurança.

Na elaboração desta spec, o repositório continha somente desenho e critérios de avaliação. A proposta inicial de CLI offline foi substituída por aplicação na Vercel com Agents API e web search nativo.

## Solution

Uma aplicação privada de curadoria educativa recebe uma foto própria/autorizada, inventaria metadados, analisa uma derivada orientada pela Agents API e explora regiões da mesma imagem. O autor revisa os sinais públicos que podem ser pesquisados; uma sessão isolada usa web search nativo para contextualizá-los.

O fluxo trabalha sobre perguntas finitas com critério de suficiência. Só aprofunda uma pista quando uma ação pode mudar a conclusão, resolver alternativa relevante ou modificar recomendação. Encerra por suficiência, ausência de ação útil, saturação, fronteira de escopo, orçamento, falha ou cancelamento.

O resultado é um dossiê com oito seções, evidências, fontes, alternativas, prioridades justificadas, recomendações, cobertura e motivo de parada. A interface permite revisão e download em Markdown e JSON; não publica automaticamente nem altera a foto.

Primeira versão privada para o autor preparar demonstrações é uma premissa de desenho revisável, não uma decisão confirmada para abertura multiusuário.

## User Stories

1. Como autor de uma foto, quero iniciar um caso com um único JPEG/PNG próprio ou autorizado, para analisar uma entrada bem definida. (US-01; RF-01)
2. Como autor, quero entender quais dados passam pela Vercel e pela OpenAI antes de enviar, para decidir sobre o processamento remoto. (US-02; RF-02)
3. Como autor, quero que formato enganoso, animação, corrupção e excesso de tamanho sejam rejeitados antes da IA, para evitar processamento inválido e custos desnecessários. (US-03; RF-01; RNF-04)
4. Como autor, quero diferenciar metadado ausente, não suportado e falha de extração, para não confundir falta de leitura com falta de exposição. (US-04; RF-03)
5. Como autor, quero ver as ressalvas de GPS, dispositivo e data de captura, para não tratar metadados editáveis ou sem fuso como prova de localização ou instante. (US-05; RF-03; RNF-10)
6. Como autor, quero que a orientação seja preservada na análise e nos recortes, para reconhecer corretamente os detalhes apresentados. (US-06; RF-04)
7. Como autor, quero preservar meu original e evitar armazenamento permanente da aplicação, para controlar a retenção da imagem e do dossiê. (US-07; RF-04; RNF-03)
8. Como autor, quero observações ancoradas na imagem com leitura incerta explicitada, para distinguir sinal visível e interpretação do modelo. (US-08; RF-05; RNF-10)
9. Como autor, quero que o contexto informado por mim seja identificado como fornecido, para avaliar o que o agente realmente encontrou na foto. (US-09; RF-05; RF-09)
10. Como autor, quero ver perguntas prioritárias e o que bastaria para respondê-las, para acompanhar uma exploração com finalidade clara. (US-10; RF-17)
11. Como autor, quero que o agente solicite recortes com pergunta e ganho esperado, para aprofundar detalhes que possam mudar o resultado. (US-11; RF-06; RF-17)
12. Como autor, quero indicar uma região que merece revisão, para incluir um detalhe que a primeira análise não priorizou. (US-12; RF-06)
13. Como autor, quero que recortes inválidos ou de outro arquivo sejam rejeitados, para manter a ligação da evidência com a mesma foto. (US-13; RF-06; RNF-04)
14. Como autor, quero poder selecionar novamente o mesmo arquivo quando necessário à retomada, para continuar a exploração sem publicação da foto em URL pública. (US-14; RF-06; RF-12; RNF-03)
15. Como autor, quero revisar termos e domínios antes da pesquisa web, para escolher quais sinais públicos podem sair para busca. (US-15; RF-07)
16. Como autor, quero que reformulações dentro do escopo liberado avancem sem perguntas repetidas, para acompanhar um fluxo autônomo limitado à minha decisão inicial. (US-16; RF-07; RF-08)
17. Como autor, quero que a sessão de pesquisa não receba a foto nem o inventário privado completo, para reduzir divulgação desnecessária. (US-17; RF-08; RNF-02)
18. Como autor, quero priorizar fontes primárias pertinentes, para apoiar correlações em conteúdo verificável. (US-18; RF-08; RF-09)
19. Como autor, quero distinguir snippet, página recuperada, fonte inacessível e orientação manual, para saber o que foi efetivamente consultado. (US-19; RF-09; RF-19)
20. Como autor, quero que o agente procure alternativas e contradições, para reduzir associações equivocadas por homônimos ou edições diferentes. (US-20; RF-09; RF-17)
21. Como autor, quero que uma pista com evidência suficiente seja encerrada, para evitar coleta sem benefício adicional. (US-21; RF-18)
22. Como autor, quero que tentativas repetidas sem ganho parem, para não prolongar indefinidamente uma hipótese inconclusiva. (US-22; RF-18)
23. Como autor, quero limites visíveis de perguntas, recortes, rodadas e tempo, para entender a cobertura e controlar o trabalho. (US-23; RF-18; RNF-05)
24. Como autor, quero que um segredo ou coordenada precisa seja tratado como exposição sem teste ou busca desse valor, para obter recomendação sem ampliar a divulgação. (US-24; RF-07; RF-18; RNF-02)
25. Como autor, quero que a pesquisa permaneça no contexto autorizado, para que familiares, contatos e participantes encontrados não se tornem novos alvos. (US-25; RF-17; RF-18; RNF-10)
26. Como autor, quero que o dossiê cubra suas oito seções, para compreender escopo, observações, metadados, pesquisa, correlações, recomendações e limites. (US-26; RF-10)
27. Como autor, quero distinguir observação, corroboração, hipótese, conflito e desconhecido, para avaliar a força de cada afirmação. (US-27; RF-10; RNF-10)
28. Como autor, quero seguir cada achado até sua evidência e fonte, para conferir a conclusão sem confiar apenas na redação do agente. (US-28; RF-09; RNF-04)
29. Como autor, quero prioridades de revisão com critério e justificativa, para escolher ações sem um percentual enganoso de segurança. (US-29; RF-10; RNF-10)
30. Como autor, quero aceitar, rejeitar ou corrigir achados preservando a distinção entre modelo e revisão humana, para produzir uma versão fiel ao que foi revisado. (US-30; RF-11)
31. Como autor, quero baixar Markdown e JSON coerentes e minimizados, para usar o material educativo sem publicar conteúdo privado automaticamente. (US-31; RF-11; RNF-07)
32. Como autor, quero um documento parcial com lacunas quando a busca falha ou não é autorizada, para aproveitar a análise sem inventar resultados. (US-32; RF-10; RF-15)
33. Como autor, quero acompanhar fase e pendências e retomar o turno existente, para não repetir cegamente operações pagas após uma desconexão. (US-33; RF-12; RNF-08)
34. Como autor, quero cancelar novas fases e conhecer o estado do cancelamento remoto, para interromper o trabalho sem uma falsa confirmação. (US-34; RF-13)
35. Como autor, quero exportar antes de encerrar e ver o resultado da exclusão das sessões, para administrar o material produzido e sua retenção. (US-35; RF-14; RNF-03)
36. Como responsável pela aplicação, quero manter a chave OpenAI apenas em Secret no backend, para autenticar a integração sem expô-la ao navegador, agente ou dossiê. (US-36; RNF-01)
37. Como responsável pela aplicação, quero separar produção, preview e desenvolvimento, para não disponibilizar a credencial de produção a código ou ambientes inadequados. (US-37; RNF-01)
38. Como responsável pela aplicação, quero proteger interface e APIs do deployment privado, para restringir execução e acesso ao conteúdo dos casos. (US-38; RF-16)
39. Como autor, quero que referências adulteradas ou expiradas não consultem sessões arbitrárias, para preservar o vínculo do meu caso. (US-39; RF-16; RNF-04)
40. Como responsável pela aplicação, quero logs e erros sanitizados e respostas sem cache público, para observar falhas sem registrar imagens, segredos e conteúdo privado. (US-40; RNF-07)
41. Como autor, quero operar upload, progresso, revisão e exportação por teclado com rótulos claros, para concluir a jornada com acessibilidade. (US-41; RNF-09)
42. Como responsável pela aplicação, quero validar comportamento com fixtures controladas e testes de falha, para avaliar correção e limites antes de demonstrar o produto. (US-42; RNF-04; RNF-06; RNF-10)
43. Como autor, quero ver uso e custo quando disponíveis, para avaliar o trabalho sem receber promessa de teto monetário não suportado. (US-43; RNF-05)
44. Como autor, quero saber por que a exploração parou e o que não foi explorado, para interpretar corretamente a cobertura do dossiê. (US-44; RF-19)
45. Como autor, quero recomendações e caminhos manuais de autoavaliação identificados como tais, para agir sobre a exposição sem confundi-los com consultas já executadas. (US-45; RF-19; RNF-10)
46. Como responsável pela aplicação, quero distinguir controles impostos pelo backend de instruções ao modelo e limitações do provedor, para não apresentar auditoria posterior como bloqueio prévio de toda consulta. (US-46; RNF-11)

## Implementation Decisions

### Decisões consolidadas

- Aplicação Next.js/TypeScript em um projeto Vercel, com backend Node.js em Functions; primeiro desenho privado e de uma foto por caso.
- Apenas Agents API e seu web search nativo. A capacidade multimodal do modelo faz análise visual; não há integração separada com Responses API ou geração de imagem.
- Execução sem sandbox. A chave autentica o backend e não é fornecida ao contexto do agente.
- Duas sessões isoladas: visual sem web para análise e síntese; pesquisa com somente sementes públicas revisadas. Não copiar foto, inventário privado ou histórico visual para a pesquisa.
- Módulos de ingestão e metadados; processamento de imagem e recortes; controlador de caso e política; adaptador Agents API; validação do dossiê; revisão/exportação; controle de acesso e observabilidade.
- Interfaces da aplicação cobrem criação, consulta, avanço de fase, envio de região, cancelamento e encerramento. Apenas referências vinculadas ao caso são aceitas.
- Original preservado no dispositivo e transiente na Function. Derivada orientada sem metadados copiados; contexto sensível só acompanha a análise quando selecionado. Leitura de texto pela visão continua sujeita a erro.
- Sem banco, Blob ou histórico permanente da aplicação. Sessões remotas guardam o trabalho enviado; cookie assinada guarda IDs opacos, vínculo e estado necessário. Expirar a cookie não exclui sessões.
- OPENAI_API_KEY como Secret do projeto Vercel; credenciais distintas por ambiente quando necessárias. CASE_SIGNING_SECRET separado da chave OpenAI. Nenhum valor é provisionado nesta etapa.
- Acesso privado com proteção da interface e APIs na Vercel, a verificar em todas as URLs utilizadas. Esse mecanismo não substitui autorização multiusuário.
- Dossiê canônico versionado em JSON e apresentações HTML/Markdown. O contrato visual legado não é reutilizado como se cobrisse o dossiê completo.
- O contrato inclui evidências visuais, metadados, contexto fornecido e fontes web; achados e prioridades; revisão humana; perguntas, cobertura, orçamento, motivo de parada e estado remoto.
- Só é aceita referência a evidência existente; correlação externa mantém o caminho da foto até a semente, rodada e fonte. Schema não prova veracidade: pertinência continua sujeita a avaliação.
- Fila de até cinco perguntas prioritárias, cada uma com critério de suficiência. Propostas de ação declaram pergunta, origem, ganho esperado, dados divulgados e orçamento.
- Limites iniciais: até três recortes e duas rodadas web; correlação limitada a dois elos semânticos; alvo de 180 segundos de trabalho ativo. Não são benchmark, contagem de consultas internas ou garantia de interrupção instantânea.
- Ganho significa mudança sustentada na pergunta, alternativa ou recomendação. Ramo suficiente encerra; tentativa direcionada adicional sem ganho conclui o ramo como inconclusivo; duas ações consecutivas do controlador sem ganho encerram exploração global.
- Um limite de modalidade não impede ação útil em outra modalidade ainda elegível. Parada da exploração, síntese e exclusão remota são resultados distintos.
- Respostas remotas concluídas, falhas, canceladas e pendentes são reconciliadas antes de retomar. Não prometer exactly-once nem cotas globais rígidas sem armazenamento persistente.
- Dados de pixels, metadados e páginas não autorizam novas ferramentas, divulgação, comandos ou mudança de política. Valores privados não viram sementes porque estão legíveis.
- Fontes automáticas da V1 são foto/metadados e páginas públicas pertinentes recuperáveis pelo web search. Serviços de autoavaliação como Google e HIBP permanecem caminhos manuais identificados; não adicionar APIs por consequência do catálogo.
- Decisões dependentes da implementação permanecem explícitas: bibliotecas/versões, modelo e acesso real, proteção do projeto/time Vercel, custos, limites reais e comportamento de exclusão. Não escolher secret nem executar live check nesta etapa.

### Mapa de atividades

Atividades são unidades de entrega, sem declaração de tickets criados. O estado atual está em [Entrega local e evidências](implementation-status.md). RF-01–19 e RNF-01–11 são os requisitos identificados nos documentos do projeto. Cada atividade incorpora seus testes de comportamento.

| ID | Entrega e requisitos cobertos | Dependências | Evidência de conclusão futura |
| --- | --- | --- | --- |
| AT-01 | Contratos de caso, política, pergunta, evidência, achado e dossiê; RF-09, RF-10, RF-17, RF-19; RNF-04, RNF-10, RNF-11 | Nenhuma | Fixture canônica cobre oito seções; referências inválidas, hipóteses tratadas como fatos e estados incoerentes são rejeitados |
| AT-02 | Base web privada, configuração server-only e estratégia de Secret por ambiente; RF-16; RNF-01, RNF-07, RNF-09 | AT-01 | Build executável; configuração de acesso e fronteira servidor/cliente definidas; credenciais ausentes produzem erro sanitizado; nenhum segredo no cliente. Proteção efetiva do deployment é conferida em AT-11 |
| AT-03 | Seleção/envio, validação, inventário e derivada orientada; RF-01, RF-02, RF-03, RF-04; RNF-03, RNF-04 | AT-01, AT-02 | Imagens de orientação/metadados conhecidos funcionam; animações, corrupção e excessos são rejeitados antes de chamada paga |
| AT-04 | Controlador de caso e adaptador Agents API com sessão visual; RF-05, RF-12, RF-16; RNF-01, RNF-08 | AT-01, AT-02, AT-03 | Caso retorna progresso e resultado estruturado; IDs inválidos não consultam sessões; desconexão reconcilia trabalho existente |
| AT-05 | Perguntas, recortes, ganho e parada por ramo/global; RF-06, RF-17, RF-18; RNF-04, RNF-05, RNF-11 | AT-04 | Recortes vinculados ao mesmo original; limites aplicados; suficiência, saturação e dúvida inconclusiva produzem estados e motivos corretos |
| AT-06 | Revisão de sementes e pesquisa isolada com web search nativo; RF-07, RF-08, RF-09, RF-19; RNF-02, RNF-05, RNF-06 | AT-04, AT-05 | Só dados liberados chegam à pesquisa; fontes reais/indisponíveis e manuais são distinguidas; recusa de pesquisa não gera resultados inventados |
| AT-07 | Síntese, proveniência e prioridades justificadas no documento; RF-09, RF-10, RF-15, RF-19; RNF-04, RNF-10 | AT-01, AT-05, AT-06 | As oito seções são produzidas; conflito e insuficiência ficam explícitos; cada correlação aponta à cadeia de evidência |
| AT-08 | Revisão, acessibilidade e downloads minimizados/coerentes; RF-11; RNF-07, RNF-09 | AT-07 | Autor revisa por teclado e baixa Markdown/JSON sem publicação, credenciais ou imagem embutida por padrão |
| AT-09 | Cancelamento, encerramento, retenção e reconciliação de falhas; RF-12, RF-13, RF-14, RF-15; RNF-03, RNF-08 | AT-04, AT-06, AT-07 | Novas fases param; resultado remoto pendente não vira confirmação; exportação antecede exclusão; falhas preservam dossiê parcial |
| AT-10 | Suíte integrada na fronteira de teste proposta, fixtures e adversariais; RF-01–19; RNF-01–11 | AT-03, AT-04, AT-05, AT-06, AT-07, AT-08, AT-09 | Jornada feliz e falhas críticas verificam comportamento externo, isolamento, parada, renderização e ausência de dados privados nos destinos proibidos |
| AT-11 | Preview privado Vercel e checagem real limitada/autorizada; RF-05, RF-08, RF-11, RF-14, RF-16; RNF-01, RNF-02, RNF-07, RNF-08 | AT-02, AT-10 | Proteção, contrato real de imagem/busca, fontes, artefatos, uso e encerramento verificados; teste de navegador sobre preview |
| AT-12 | Preparação da produção privada e demonstração educativa; RF-10, RF-11, RF-16, RF-19; RNF-01, RNF-05, RNF-10 | AT-11 | Deployment testado e alvo verificado; segredo corretamente separado; demonstração reproduzível com limitações, sem dados de terceiros |

Não há responsáveis, prazos ou estimativas acordados no rastreador. Publicar a spec não executa atividades. A implementação local foi autorizada depois do desenho; deploy e secrets permanecem na etapa final.

## Testing Decisions

### Fronteira principal aceita para implementação local

Usar a API da aplicação como principal fronteira de teste: iniciar caso → acompanhar estado → fornecer região da mesma foto → revisar sementes → pesquisar → obter dossiê → cancelar/encerrar. Exercitar os módulos reais da aplicação juntos, com o transporte OpenAI substituído por um serviço controlado que representa entradas, estados e respostas do provedor.

Não simular cada helper interno. Manter imagem e parser reais sobre fixtures sintéticas, verificar respostas do caso, dossiê/exportação e payloads enviados ao serviço externo. Isso permite cobrir regras e isolamento sem depender de resultados variáveis ou custos de busca em cada teste.

Esta fronteira foi aceita pelo autor ao solicitar a implementação local completa. Os testes de API mantêm parser e imagem reais, com o serviço externo controlado; o SDK também tem testes próprios de transporte HTTP.

### Complementos e comportamento verificável

- Um teste de navegador do fluxo principal verifica upload, acessibilidade básica, revisão, progresso e downloads; não duplicar toda a matriz de regras no browser.
- Verificar entradas inválidas, orientação e metadados ausentes/falhos; nenhuma chamada paga antes de ingestão válida.
- Verificar mesmo original, caixas e limite de recortes, perguntas/ganho e parada por ramo/global. Contradição útil conta como ganho; duplicação de fonte não conta.
- Verificar sessão visual sem web e sessão de pesquisa sem foto/inventário privado, além de credencial fora do payload do agente.
- Verificar estados parcial, pendente, falho, cancelado e exclusão recusada; desconexão não implica repetir criação/envio de resultado desconhecido.
- Verificar referências e oito seções do documento, estados epistemológicos, recomendações, motivos de parada e fontes efetivamente acessadas.
- Usar fixtures de prompt injection e HTML malicioso para avaliar comportamento externo e renderização. Não chamar aprovação em testes finitos de garantia contra toda injeção.
- Inspecionar bundle, respostas e logs sintéticos para segredos e dados proibidos. Proteção real Vercel exige checagem no deployment, não apenas no servidor local.
- Quando a implementação for solicitada, validar contrato OpenAI e executar checagem real limitada com foto sintética/autorizada, fontes abertas e uso registrado. Mocks não comprovam acesso à API nem qualidade da pesquisa ao vivo.
- Avaliar qualidade semântica separadamente: observações corretas, omissões, correlações indevidas, pertinência das citações e ganho sobre análise sem web; medir latência/uso com amostra e versões explícitas.

Um bom teste observa o que o autor recebe, o que sai para cada destino e quando o trabalho para. Não espelha a implementação nem afirma valor de métrica sem medição.

### Estado atual e prior art

Na elaboração da spec existiam apenas validações documentais e um schema legado. Agora há aplicação, endpoints, testes de API/imagem/SDK, jornada de navegador e workflow de CI preparado. A [matriz de evidências](implementation-status.md) distingue esses resultados das verificações ao vivo ainda pendentes.

As fixtures e exemplos de desenho já preparados são pontos de partida para dados de teste, sem serem resultados reais. Usar uma fronteira principal e só acrescentar outra se uma classe de comportamento não puder ser observada adequadamente nela.

## Out of Scope

- Código, credenciais provisionadas, execução de foto real, integração live ou deploy durante esta etapa de especificação.
- Reconhecimento facial, identificação de desconhecidos, investigação de familiares/contatos, inferência de residência/rotina ou atributos pessoais sensíveis.
- Testar credenciais, recuperar senhas, consultar material roubado ou explorar/varrer sistemas.
- GPT Image, GPT-Live/Realtime/voz, chat como API separada, Responses API separada, Agents SDK, Tesseract, CLI offline, sandbox, MCP e time de agentes.
- Crawler, busca reversa de imagem, lotes/vídeo, conta externa autenticada ou nova API apenas por ter sido citada como fonte.
- Banco/Blob, histórico permanente próprio, conclusão durável de todas as fases com navegador fechado e publicação do dossiê por link.
- Edição/sanitização e exportação de uma nova foto; recomendações não significam correção executada.
- Uso público multiusuário sem uma nova decisão sobre identidade, autorização por caso, armazenamento, cotas e retenção.
- Prometer exaustividade, identificação, segurança certificada, teto financeiro rígido, exactly-once, apagamento instantâneo ou interceptação de toda consulta interna do web search.

## Further Notes

Vocabulário adotado: caso é a análise de uma foto; pergunta é uma dúvida finita ligada à evidência; semente é sinal público revisado para busca; rodada é uma execução de pesquisa pedida pela aplicação, podendo envolver várias consultas internas; achado é uma afirmação com suporte e estado epistemológico; dossiê é o documento canônico revisável.

A especificação consolida 19 requisitos funcionais e 11 não funcionais, com 46 histórias e 12 atividades. Os documentos de arquitetura, loop, fontes e contrato continuam sendo o detalhamento de referência do PR; esta síntese não os substitui silenciosamente.

A fronteira principal de testes deve ser conferida com o usuário antes de concluir o fluxo to-spec. O projeto também não declara ainda rastreador e vocabulário de triagem da skill; o setup recomendado é /setup-matt-pocock-skills. Até resolver esses pontos, este documento é rascunho e não recebe ready-for-agent.

A publicação futura deve usar a spec revisada no rastreador configurado e a label exigida pela skill, sem inventar responsáveis, datas ou estado de execução. Nenhum ticket de implementação foi criado neste rascunho.

Método: [to-spec de Matt Pocock](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/to-spec/SKILL.md). A leitura desta skill foi feita diretamente na revisão identificada; ela não estava instalada nos catálogos desta sessão.
