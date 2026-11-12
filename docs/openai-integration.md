# Integração OpenAI (proposta)

Direção de arquitetura em 2026-11-12, baseada na documentação pública consultada nesta data. Não há código, credencial criada, sessão, acesso de API, custo ou benchmark verificado. IDs de modelos, disponibilidade e parâmetros precisam ser confirmados antes da implementação; selecionar por capacidade e avaliação do projeto.

## Divisão de responsabilidades

| Recurso | Papel proposto no Visual OpSec | Dados enviados |
| --- | --- | --- |
| Agents API | Sessão do agente de pesquisa, progresso e chamadas das ferramentas da aplicação | Projeção `E_model` autorizada, nunca inventário privado inteiro por padrão |
| Responses API + `web_search` | Adaptador isolado para pesquisa pública e retorno de fontes | Plano de busca e projeção `E_web` |
| Modelo com visão | Interpretar uma região e sugerir explorações complementares ao Tesseract | Recorte autorizado, reencodificado sem metadados |
| Chat de revisão | Explicar achados e receber ajustes de escopo/regiões | Contexto permitido pela política; edição local pode funcionar sem nuvem |
| GPT-Live | Conversa por voz enquanto o backend pesquisa | Áudio/contexto autorizado; resultados minimizados |
| GPT Image | Criar cenários fictícios para demonstração e ilustrações educativas | Prompts sintéticos; sem originais privados por padrão |

OCR, inventário, política, transformações de coordenadas, máscaras, exportação e verificação permanecem em Python local. Um único agente coordena o trabalho; os adaptadores não precisam ser agentes independentes.

## Agente e execução

A [Agents API](https://developers.openai.com/api/docs/guides/agents-api/overview) oferece sessões e orquestração gerenciadas. Para esta aplicação com arquivos locais e ferramentas restritas, propor `environment.type = none`: o agente pede funções ao controlador, sem sandbox de comandos. Essa opção é descrita no [quickstart](https://developers.openai.com/api/docs/guides/agents-api/quickstart).

Sandbox `openai_hosted` é alternativa futura para execução remota expressamente escolhida; não migrar fotos para ele automaticamente. Self-hosted também não significa que a inferência é offline.

O controlador atende chamadas tipadas, aplica política antes de retornar dados à sessão e salva IDs/estados para retomada. Streams servem à interface; desconectar a interface não deve ser tratado como cancelamento do trabalho. Finalizar somente após verificar estado do turno e das ferramentas.

Agents SDK é alternativa se o projeto optar por controlar o loop na aplicação; não é sinônimo de Agents API nem dependência obrigatória dela. Antes de implementar, confirmar acesso e versões do SDK pela documentação, sem inventar métodos ou misturar contratos.

## Pesquisa pública isolada

Propor função `research_web(search_plan_id)` no agente principal. O serviço resolve somente o plano autorizado e faz uma chamada separada à Responses API com `web_search`. Não habilitar busca irrestrita no mesmo contexto que contém dados privados.

A [documentação de web search](https://developers.openai.com/api/docs/guides/tools-web-search) descreve citações, lista de fontes e filtros de domínio. Preservar referências estruturadas do retorno e vínculos com o plano; URL citada não equivale a evidência suficiente para toda frase. Uma nova integração deve usar o contrato atual de `web_search`, sem copiar exemplos legados de preview.

Respostas hospedadas podem envolver reformulações e navegação internas. Validar controles disponíveis no endpoint/modelo escolhido; não supor que o controlador intercepta cada busca. O adaptador recebe somente dados já liberados para o contexto público. Se for necessário aprovar literalmente cada consulta ou cada destino de rede e a API não oferecer isso, esse perfil exige outro adaptador compatível ou pesquisa manual.

Filtros de domínio ajudam a restringir fontes, mas não substituem a política de dados nem garantem corroboração. Falhas e fontes indisponíveis voltam como limitações; não gerar URLs ou resultados fictícios.

## Visão e GPT Image

[Visão](https://developers.openai.com/api/docs/guides/images-vision) analisa entradas de imagem. Usá-la para contexto, como “esta região parece uma etiqueta?”, com saída estruturada e incerteza. Para cobertura de máscaras, usar caixas locais e revisão humana; não confiar em coordenadas aproximadas do modelo como prova de cobertura.

[GPT Image](https://developers.openai.com/api/docs/guides/image-generation) gera/edita imagens. Pode criar uma mesa fictícia para demonstrar exposição, mas qualquer conteúdo gerado deve ser marcado como sintético. Etiquetas e gabaritos de teste devem ser inseridos/controlados deterministicamente; texto gerado não é um ground truth confiável por si só.

Não reconstruir conteúdo ilegível para tratá-lo como evidência. Não usar inpainting ou “limpeza” generativa como padrão de remoção segura. Original, derivados de análise, cópia sanitizada e material sintético mantêm identidades distintas.

## Chat, GPT-Live e Realtime

“Chat” descreve a interface de revisão; não obriga uso de Chat Completions. Para este desenho, a conversa pode continuar a sessão do agente, mostrando evidências e controles de revisão.

[GPT-Live](https://developers.openai.com/api/docs/guides/live) permite conversa por voz enquanto um backend delegado trabalha. Propor client delegation para conectar o mesmo controlador do caso: o usuário pode dizer “explore a etiqueta” ou pedir o progresso enquanto a pesquisa continua. A instrução passa pela política vigente; fala transcrita não amplia permissões automaticamente.

A [Realtime API](https://developers.openai.com/api/docs/guides/realtime) é outra opção para interação de voz e ferramentas. GPT-Live e Realtime não são nomes intercambiáveis. A escolha da interface de voz pode esperar o fluxo textual funcionar.

Áudio adiciona um novo destino de dados: desativado por padrão e autorizado separadamente. Captura contínua de câmera/vídeo não está incluída; compartilhamento de uma imagem não autoriza transmitir a câmera. Manter chave de projeto no backend confiável; autenticação efêmera no cliente quando suportada pelo fluxo escolhido.

## Dados, operação e entrega

Separar autorização para nuvem/modelo, busca web e áudio; informar os dados de cada um antes de ativar o modo. Não anunciar análise local/offline quando qualquer chamada remota estiver habilitada. Configurar retenção, histórico e tracing conforme o contrato do serviço; não prometer retenção zero sem verificação.

Primeira integração: coleta local → projeção autorizada → agente → pesquisa isolada → documento com fontes verificadas. Depois acrescentar visão de recortes, chat e voz conforme ganho medido. GPT Image fica no ramo de demonstração. Critérios de custo, cancelamento, privacidade e fidelidade das citações estão em [Avaliação](evaluation.md) e no [contrato do agente](agent-research.md).
