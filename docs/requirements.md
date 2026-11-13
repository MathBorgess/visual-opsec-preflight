# Requisitos da primeira versão

Especificação proposta em 2026-11-13 para revisão antes de implementar. Premissa: uso privado do autor para análise educativa de uma foto por caso. Modelo, custos, conta e proteção do deployment ainda não foram verificados.

## Resultado esperado

Entregar um documento de exposição virtual que responda: “O que esta foto e seu arquivo revelam diretamente, que contexto público isso permite encontrar, o que continua sendo hipótese e como reduzir a exposição?”.

## Requisitos funcionais

| ID | Comportamento | Critério de aceite |
| --- | --- | --- |
| RF-01 | Criar caso com uma foto própria/autorizada | Aceita JPEG/PNG estático dentro dos limites; rejeita formato, animação, arquivo corrompido ou excesso antes de chamar IA |
| RF-02 | Explicitar processamento remoto | Autor vê destinos e classes de dados e registra autorização do caso; contexto opcional não é pré-requisito para iniciar |
| RF-03 | Inventariar metadados | Mostra grupos/campos suportados e estado da extração; distingue ausente, presente e falha; não usa data de upload como data de captura |
| RF-04 | Normalizar a imagem | Orientação visual correta, derivada sem metadados copiados e vínculo ao original; original preservado no dispositivo |
| RF-05 | Analisar com Agents API | Produz observações e limitações ancoradas na foto/contexto; leitura visual não é apresentada como OCR validado |
| RF-06 | Explorar regiões da mesma foto | Até três recortes válidos, solicitados pelo agente e vinculados ao original; usuário também pode apontar uma região dentro do limite |
| RF-07 | Revisar sementes públicas | Autor pode aprovar/excluir termos e domínios antes da rodada web; decisão aparece no escopo do dossiê |
| RF-08 | Enriquecer com web search nativo | Até duas rodadas na sessão separada; somente dados autorizados, fontes e estados reais; sem buscar se nenhum termo for liberado |
| RF-09 | Manter proveniência | Cada achado aponta a evidências existentes; inferência externa liga sinal inicial, semente, rodada e fonte |
| RF-10 | Produzir o dossiê | Todas as seções do contrato aparecem, inclusive vazias com motivo; distingue observação, corroboração, hipótese, conflito e desconhecido |
| RF-11 | Revisar e exportar | Permite descartar/corrigir achado como revisão do autor, mantendo original/estado do modelo; exporta Markdown e JSON, sem link público automático |
| RF-12 | Mostrar progresso e retomar | Exibe fase/erro/pendência; consulta o turno existente em reconexão, sem repetir cegamente operações pagas |
| RF-13 | Cancelar | Impede novas fases e tenta cancelar turnos em curso; informa se o cancelamento remoto ainda não foi confirmado |
| RF-14 | Encerrar e excluir trabalho remoto | Tenta excluir as sessões vinculadas e informa sucesso, pendência ou falha; exportação é oferecida antes do encerramento |
| RF-15 | Entregar documento parcial | Falha de busca, falta de fonte ou limite não vira “sem exposição”; entrega o que foi analisado e lista o que não foi |
| RF-16 | Restringir execução | UI e APIs exigem acesso ao deployment; referência de caso inválida/expirada não permite consultar sessões arbitrárias |
| RF-17 | Planejar perguntas e ações | Até cinco perguntas, cada uma ligada a evidências e critério de suficiência; proposta declara ganho esperado e dados divulgados |
| RF-18 | Aplicar parada por ramo e global | Ramo suficiente encerra; tentativa adicional sem ganho conclui inconclusivo; duas ações consecutivas sem ganho param a exploração; limites seguem o contrato do loop |
| RF-19 | Explicar encerramento e fontes | Dossiê registra motivo de parada, cobertura, pendências e estado remoto; fontes manuais não são apresentadas como consultadas automaticamente |

## Requisitos não funcionais

| ID | Requisito | Evidência de aceite futura |
| --- | --- | --- |
| RNF-01 | Chave somente no backend, como Secret Vercel | Inspeção de bundle/respostas/logs não encontra a chave; módulo servidor não é importado pelo cliente |
| RNF-02 | Separar análise privada e pesquisa pública | Captura de payloads sintéticos comprova que foto/inventário privado não entram na sessão web |
| RNF-03 | Não persistir fotos/dossiês na aplicação | Sem banco/Blob/publicação; memória/temporários não usados como armazenamento durável; retenção OpenAI documentada separadamente |
| RNF-04 | Validar entradas e saídas | Dimensões/bytes, caixas, contrato do dossiê, IDs e URLs exibidos passam validação determinística |
| RNF-05 | Limitar trabalho e custo | Backend valida fases/limites; métricas de uso quando disponíveis, sem prometer controle de buscas internas ou teto monetário rígido |
| RNF-06 | Tratar conteúdo como não confiável | Injeção em foto/metadados/fontes não altera ferramentas, segredos ou escopo; HTML/Markdown é renderizado sem execução de conteúdo |
| RNF-07 | Evitar vazamento operacional | APIs sem cache; logs/traces sem imagem, texto privado, headers ou cookies; erros sanitizados |
| RNF-08 | Funcionar com requisições curtas | Progresso consultável sem conexão HTTP única durante toda a análise; reentrada reconcilia estado remoto |
| RNF-09 | Ser utilizável | Upload, progresso, evidência e exportação por teclado, labels claros e texto de estado acessível |
| RNF-10 | Manter alegações honestas | Nenhuma promessa de exaustividade, identidade, residência, segurança certificada ou precisão não medida |
| RNF-11 | Distinguir garantias e instruções | Testes comprovam controles externos ao modelo; prompt e auditoria posterior não são anunciados como bloqueio de cada consulta interna |

## Escopo que será implementado

Next.js/TypeScript, handlers Node.js na Vercel, processamento de imagem/metadados, cookie assinada de um caso, integração Agents API, exploração por recortes, web search nativo, validação do documento, revisão/exportação e controles descritos na [arquitetura](architecture.md).

A escolha concreta de bibliotecas/versões será validada na implementação. O contrato do documento e os critérios de aceitação são parte deste desenho, sem código executável.

## Fora da primeira versão

GPT Image, GPT-Live/Realtime/voz, API de chat separada, Responses API separada, Tesseract, CLI offline, sandbox, MCP, time de agentes, crawler, busca reversa da imagem, processamento de vídeo/lotes, histórico permanente, banco/Blob, publicação de dossiê por link e sanitização/exportação de uma nova foto.

Abertura multiusuário requer nova decisão de escopo: login da aplicação, autorização por caso, armazenamento durável de vínculo/estado, cotas e retenção. Proteção do deployment e cookie de uma V1 privada não satisfazem esses requisitos.

## Contratos complementares

[Loop e parada](exploration-loop.md), [catálogo de fontes](source-catalog.md) e [dossiê](exposure-report.md) definem as regras operacionais de RF-17–19 e RNF-11. Os limites são escolhas iniciais de produto, ainda sem calibração ou benchmark.

## Critério para iniciar implementação

Desenho revisável consistente, requisitos numerados, contrato e exemplo do dossiê, estratégia de Secret e critérios de avaliação disponíveis no PR. A etapa atual termina nesses artefatos; credenciais, acesso real à API e deploy serão tratados na etapa de implementação.
