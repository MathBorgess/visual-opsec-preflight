# Requisitos da primeira versão

Especificação de 2026-11-13, autorizada para implementação local. Premissa: uso privado do autor para análise educativa de uma foto por caso. Veja a [matriz de evidências](implementation-status.md). Modelo ao vivo, custos, conta e proteção do deployment ainda não foram verificados.

## Resultado esperado

Entregar um documento de exposição virtual que responda: “O que esta foto e seu arquivo revelam diretamente, que contexto público isso permite encontrar, o que continua sendo hipótese e como reduzir a exposição?”.

## Requisitos funcionais

| ID | Comportamento | Critério de aceite |
| --- | --- | --- |
| RF-01 | Criar caso com uma foto própria/autorizada | Aceita JPEG/PNG estático dentro dos limites; rejeita formato, animação, arquivo corrompido ou excesso antes de chamar IA |
| RF-02 | Explicitar processamento remoto e autorizar | Autor vê destinos e classes de dados e registra duas autorizações obrigatórias: **ambiente** (foto, cenário e metadados, com derivada enviada à OpenAI) e **identificação** (pesquisa pública da identidade declarada, sem a foto). Sem ambas, nada é enviado; contexto opcional não é pré-requisito |
| RF-03 | Inventariar metadados | Mostra grupos/campos suportados e estado da extração; distingue ausente, presente e falha; não usa data de upload como data de captura |
| RF-04 | Normalizar a imagem | Orientação visual correta, derivada sem metadados copiados e vínculo ao original; original preservado no dispositivo |
| RF-05 | Analisar com Agents API | Produz observações e limitações ancoradas na foto/contexto; leitura visual não é apresentada como OCR validado |
| RF-06 | Explorar regiões da mesma foto | Até três recortes válidos, solicitados pelo agente e vinculados ao original; usuário também pode apontar uma região dentro do limite |
| RF-07 | Revisar sementes públicas | Autor pode aprovar/excluir sinais da foto e domínios antes da rodada web; as buscas da identidade aparecem fixas, cobertas pela autorização de identificação; decisão aparece no escopo do dossiê |
| RF-25 | Buscar de forma autônoma com rosto presente | A análise informa quantos rostos estão visíveis (contagem, nunca identificação). Com **exatamente um rosto**, nome informado e as duas autorizações, o nome refere-se a essa pessoa por declaração do autor (não por reconhecimento) e a pesquisa começa sozinha após contagem regressiva de 5 s com os sinais marcados; "Revisar antes de pesquisar" pausa e devolve a decisão ao autor. Com mais de um rosto, sem rosto ou sem contagem, a pesquisa aguarda confirmação e a identidade não é associada a nenhum rosto. O dossiê registra a condição em `scope.subjectLink`. Outras pessoas visíveis ficam fora do escopo e o dossiê registra isso |
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
| RF-20 | Preservar valores fornecidos | Transcrição em `verbatimText` exige região visual; `providedValue` contém GPS/autoria/data de campos suportados. Interface, JSON e Markdown mostram origem e limitações; credenciais continuam mascaradas |
| RF-21 | Priorizar exploração proativa | Agente inventaria sinais diversos, propõe até cinco perguntas com ganho esperado e explora recortes/contexto público; controlador mantém três recortes, duas rodadas e 180 segundos de trabalho ativo |
| RF-22 | Distinguir contexto profissional e pessoal | Nome/cargo legível é transcrição, sem atribuição a rosto. Pesquisa contextualiza organizações, eventos, locais públicos e produtos; não procura perfis de pessoas não declaradas nem infere residência, rotina ou deslocamentos |
| RF-23 | Pesquisar identidade autorizada no fluxo principal | Obrigatório na criação: o nome, com relação declarada (titular ou pessoa que autorizou) e autorização de identificação. A interface não pede profissão nem atividades: a pesquisa as descobre de forma proativa. A API aceita profissão e até três atividades como dicas opcionais para separar homônimos. Campos com e-mail, telefone, documento, número de processo ou link são recusados antes da IA (`IDENTITY_REQUIRED`, `IDENTITY_CONSENT_REQUIRED`, `IDENTITY_INVALID`). O backend deriva as sementes `PID*` e as evidências `UID*`, e inclui todas as `PID*` em cada pesquisa; o modelo não pode propor sementes de identidade e o cliente não pode inventá-las |
| RF-24 | Medir a exposição da identidade | A pesquisa descobre a partir do nome profissão, organização, formação, atividades e papéis públicos (`discovered`), cada um com fontes e atribuição; só descobertas sustentadas por fonte atribuída entram no dossiê, sem localização, contato, agenda, familiares ou atributos sensíveis. Fontes da identidade registram categoria, classes de dados visíveis e atribuição (`declared_identity` ou `possible_homonym`). O dossiê (seção 5.1) mostra onde a identidade aparece, que dados ficam alcançáveis, a cadeia semente → fonte → dados e uma amplitude observada com critério declarado; homônimos ficam fora da contagem e ausência de fonte não vira baixa exposição |

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
| RNF-12 | Limitar a trilha de identidade | Sem reconhecimento facial nem busca reversa; o rosto só é contado. LinkedIn, redes sociais públicas, Escavador e Jusbrasil são permitidos apenas para a identidade declarada; nos agregadores jurídicos registra-se só a menção ao nome, sem número de processo, partes ou natureza do caso. Outros buscadores de pessoas, busca facial e bases de vazamentos são proibidos no prompt e descartados por lista determinística curta; fontes com número de processo ou identificador pessoal no endereço são descartadas; telefones, endereços, CEP e números de processo são mascarados; familiares, colegas, coautores, partes e homônimos não viram alvos |

## Escopo que será implementado

Next.js/TypeScript, handlers Node.js na Vercel, processamento de imagem/metadados, cookie assinada de um caso, integração Agents API, exploração por recortes, web search nativo, validação do documento, revisão/exportação e controles descritos na [arquitetura](architecture.md).

Bibliotecas e versões estão fixadas em `package.json`/lockfile. O contrato executável do dossiê está em `src/lib/contracts.ts`; estes critérios continuam orientando a avaliação.

## Fora da primeira versão

GPT Image, GPT-Live/Realtime/voz, API de chat separada, Responses API separada, Tesseract, CLI offline, sandbox, MCP, time de agentes, crawler, busca reversa da imagem, processamento de vídeo/lotes, histórico permanente, banco/Blob, publicação de dossiê por link e sanitização/exportação de uma nova foto.

Abertura multiusuário requer nova decisão de escopo: login da aplicação, autorização por caso, armazenamento durável de vínculo/estado, cotas e retenção. Proteção do deployment e cookie de uma V1 privada não satisfazem esses requisitos.

## Contratos complementares

[Loop e parada](exploration-loop.md), [catálogo de fontes](source-catalog.md) e [dossiê](exposure-report.md) definem as regras operacionais de RF-17–19 e RNF-11. Os limites são escolhas iniciais de produto, ainda sem calibração ou benchmark.

## Critério para iniciar implementação

Desenho, requisitos, contrato, estratégia de Secret e fronteira de testes foram aprovados para implementação local. Credenciais, acesso real à API e deploy foram explicitamente reservados para a etapa final; o [guia de operação](local-operation.md) registra essa configuração.
