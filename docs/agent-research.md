# Agente de pesquisa e documento de exposição

Proposta de arquitetura em 2026-11-12. Nenhum agente, pesquisa web ou resultado de exposição está implementado ou validado.

## Objetivo e modos

Partir de uma imagem própria/autorizada e seus metadados para identificar exposição observável, explorar regiões ambíguas e contextualizar sinais em fontes públicas. Web search é o principal instrumento de enriquecimento externo. A saída é um documento rastreável; um relatório maior não significa uma investigação mais correta.

- `offline`: coleta, OCR, revisão e sanitização locais; sem chamadas OpenAI ou web.
- `connected_research`: agente OpenAI e pesquisa web com projeções autorizadas de dados; original local.
- `connected_vision`: acrescenta análise remota de recortes selecionados sem metadados. Autorizar pesquisa textual não autoriza envio de pixels, áudio ou imagem completa.

A política é definida uma vez por caso: objetivo, imagem autorizada, entidades/termos públicos em escopo, destinos, limites e retenção. Consultas compatíveis avançam autonomamente. O agente pede esclarecimento quando uma ambiguidade material impede a interpretação e pede revisão apenas se precisar ampliar o escopo ou os dados enviados.

Não há identificação facial, perfil pessoal, inferência de residência/rotina ou busca de localização exata de pessoas. Contextualização de um evento público ou organização serve para explicar exposição; não comprova presença ou vínculo de alguém.

## Coleta inicial

O agente solicita `collect_initial(asset_id)`; o serviço local executa validação, inventário de metadados, orientação e OCR. Coleta confiável é trabalho das ferramentas, sem depender de leitura livre do modelo.

1. Inventariar EXIF/XMP/IPTC, comentários e miniaturas antes de reencodificar; separar presença de tags e valores.
2. Aplicar orientação aos pixels e registrar dimensões e identidade da versão normalizada.
3. Executar Tesseract com configuração/versionamento conhecidos; retornar palavras, linhas, caixas e pontuações. Decodificação de QR, se adicionada, usa detector próprio.
4. Criar observações locais: texto, grupos de metadados, candidatos de cena e limites de leitura.
5. Aplicar política e minimização antes de disponibilizar qualquer observação ao planejador remoto.

Sem GPS não significa sem exposição geográfica. Timestamp sem fuso não determina horário preciso. Pontuação OCR não mede probabilidade de dano; uma descrição de visão não equivale a fato observado.

## Ciclo de investigação

`collect → plan → explore_image | research_web → reconcile → report → human_review`

Cada ação proposta informa evidências de origem, pergunta a resolver, resultado esperado e custo estimado. O controlador valida o pedido fora do modelo. Explorações independentes podem ser executadas como tarefas de ferramentas; não é necessário um sistema de múltiplos agentes.

O agente escolhe entre:
- explorar novamente uma região, variando rotação, contraste ou segmentação dentro de limites;
- pedir visão de um recorte autorizado para contextualizar a cena;
- pesquisar um sinal público suficientemente legível;
- ler fontes recuperadas, confrontar datas/edições e procurar evidência contraditória;
- pedir contexto ao usuário ou encerrar com hipótese não resolvida.

Transformações de recortes devem voltar às coordenadas da imagem normalizada. Ampliar não recupera informação inexistente. Nenhuma nova leitura pode editar o original ou substituir sua evidência.

## Ferramentas propostas

Nomes abaixo são contratos da aplicação, não métodos de um SDK OpenAI.

| Ferramenta | Entrada essencial | Saída e fronteira |
| --- | --- | --- |
| `collect_initial` | `asset_id` do caso | Observações locais, versão do extrator e limitações; projeção separada para o agente |
| `explore_region` | `observation_ids`, caixa normalizada, transformação e pergunta | Novas observações, transformação inversa e vínculo ao original; limites de pixels/tentativas |
| `analyze_crop` | Recorte e pergunta autorizados | Hipóteses estruturadas; sem ferramentas de busca ou shell; remoto somente em `connected_vision` |
| `propose_search` | Evidências, pergunta, termos públicos e finalidade | `SearchPlan` sem executar rede |
| `research_web` | ID de plano validado e projeção web | Resultados/fontes e metadados de execução; nenhum acesso ao caso privado completo |
| `read_source` | ID de fonte retornada e pergunta vinculada | Trecho, URL canônica, data de acesso, estado e limitações; acesso público somente |
| `request_context` | Ambiguidade ou alteração concreta de escopo | Resposta do usuário ou ação pendente; não inventar autorização |
| `compose_report` | IDs de evidências/afirmações e estado do caso | Documento local validado, sem rede; conclusão sem suporte é rejeitada ou marcada hipótese |

Sanitização e exportação continuam serviços locais com regiões revisadas, fora da autonomia de pesquisa. Credenciais ficam no controlador, nunca no texto de ferramentas ou relatório.

## Pesquisa web a partir da imagem

| Sinal de entrada | Próxima exploração | Conclusão possível |
| --- | --- | --- |
| Nome legível de evento público | Buscar organização, edição e programação oficial | O texto pode permitir associar a foto a um evento; não prova presença pessoal |
| Nome/domínio público de organização | Consultar páginas oficiais e contexto publicado | O detalhe permite reconhecer uma organização, sem atribuir vínculo à pessoa |
| Modelo/software em metadados | Consultar documentação oficial de campos/exportação | Explicar o que o arquivo registra; não inferir vulnerabilidade do dispositivo |
| GPS ou data embutidos | Inventário local; contexto amplo apenas se autorizado | Descrever precisão/limites do sinal e recomendar remoção |
| Texto ambíguo em tela/etiqueta | Nova leitura local antes de pesquisar | Resolver leitura ou manter desconhecido; não tratar primeira grafia como identidade |

Pesquisa textual derivada de sinais não é busca reversa de imagens. Upload do original a serviços de busca visual não faz parte desta proposta. Referências visuais públicas eventualmente recuperadas continuam fontes secundárias, sem identificação de pessoas.

Uma consulta exata também é divulgação ao provedor, mesmo sem upload da foto. Excluir segredos, tokens, e-mails pessoais, nomes privados, números de documento, endereços residenciais, coordenadas precisas, caminhos internos e OCR integral dos payloads padrão. A existência de um termo na imagem não o torna público.

Para cada destino, construir uma projeção distinta: `E_local` contém o inventário privado; `E_model` contém os dados liberados à OpenAI; `E_web` contém somente os termos/contexto públicos liberados à pesquisa. IDs são locais e opacos; não transmitir o inventário inteiro para pedir que o modelo o filtre. Remover precisão geográfica reduz dados, mas não garante anonimização.

O adaptador web não recebe pixels, EXIF bruto, histórico privado, valores ocultados ou credenciais. Fontes retornadas não podem ampliar esse conjunto. O planejador pode revisar uma proposta dentro do escopo; dados novos passam pelo controlador antes de sair.

## Contratos e proveniência

Manter `schemas/finding.schema.json` como contrato de candidato visual. Não mudar seu significado nem inventar uma caixa para GPS ou página web. A implementação futura deve versionar os contratos abaixo e validar referências entre objetos.

| Objeto | Campos mínimos propostos |
| --- | --- |
| `CasePolicy` | ID/versão, objetivo, modos autorizados, termos e classes de dados por destino, domínios, orçamento, retenção e registro de autorização |
| `Observation` | ID, asset/versão, tipo (`ocr`, `metadata`, `vision`, `human`), região ou campo, evidência local mínima, extrator/versão, incerteza e sensibilidade |
| `SearchPlan` | ID, `observation_ids`, pergunta, consulta proposta minimizada, destinos/domínios, política/versão, decisão do controlador e orçamento |
| `WebSource` | ID, plano, URL canônica, título, trecho disponível, data de acesso e data de publicação quando conhecida, estado da recuperação e referências retornadas pelo provedor |
| `Claim` | ID, texto, `observation_ids`, fontes de suporte/contradição, justificativa, estado epistemológico e recomendação |
| `ActionRecord` | ID da ação, caso, plano, estado, IDs remotos quando houver, tentativas, timestamps e uso/custo disponível; sem payload sensível no log operacional |
| `ExposureReport` | Caso/política/versão, cobertura, observações, afirmações, fontes, recomendações, lacunas, estado de execução e verificação da cópia se realizada |

Para uma afirmação externa, validar o encadeamento `Claim → WebSource → SearchPlan → Observation → asset`. Uma afirmação puramente local não exige fonte web. Referências faltantes invalidam a alegação de rastreabilidade.

Estados de afirmação: `observed` para extração local com evidência, `corroborated` para correlação sustentada, `hypothesis` para inferência pendente, `contradicted` para conflito e `unknown` para insuficiência de dados. Manter limites do detector mesmo em `observed`. Não converter esses estados em porcentagem de segurança.

Um snippet ou nome parecido é candidato, não confirmação. Registrar se a página foi efetivamente recuperada; URL inacessível limita a alegação. Fontes que reproduzem o mesmo conteúdo contam como uma origem. Procurar evidência que diferencie homônimos e edições; contradição ou falta de independência impede corroboração forte. Resultados ausentes não provam inexistência de exposição.

## Execução, orçamento e persistência

Proposta inicial configurável por caso, ainda sem benchmark: até 6 explorações locais, 5 requisições ao adaptador de pesquisa, 10 leituras de fonte e 120 segundos de trabalho ativo, além de teto financeiro obrigatório no modo conectado. Esses números são limites de partida, não desempenho demonstrado.

O limite de requisições da aplicação não garante o mesmo número de buscas internas de um provedor hospedado. Registrar uso real quando exposto; verificar orçamento antes de novas chamadas e aplicar limites de tokens/tempo disponíveis. Não prometer teto financeiro rígido quando o provedor não o permite.

Parar por conclusão sustentada, duas ações consecutivas sem nova evidência, ausência de ações permitidas, limite, cancelamento ou falha. Usar estado final `complete`, `partial`, `failed` ou `cancelled`, motivo e lacunas. `complete` significa plano concluído, sem certificar imagem segura.

Controlador mantém IDs de sessão/turno/requisição e histórico de ações. Reconcilia chamadas pendentes antes de retomar; não repetir automaticamente uma ação paga cujo resultado é desconhecido. Idempotência só onde o provedor documentar suporte. Cancelamento impede novos pedidos e tenta cancelar o trabalho remoto; uma interrupção da voz, sozinha, não é cancelamento da pesquisa.

Por padrão, valores privados vivem em memória e temporários privados com descarte ao encerrar. Retomada persistente é opção por caso, com armazenamento protegido e prazo explícito. Documento final é salvo localmente por decisão do usuário. Logs/traces operacionais usam IDs, estados e métricas, sem OCR, consultas sensíveis ou valores de metadados. Retenção remota deve ser verificada e exposta separadamente; descarte local não apaga automaticamente sessões nos provedores.

## Fronteiras de confiança

Política e orçamento são código/configuração do controlador, nunca texto alterável pelo modelo. Metadados, pixels, nomes de arquivos, resultados e páginas são conteúdo não confiável.

- Nenhum shell, navegador genérico, upload, envio de mensagens ou acesso autenticado a sites é ferramenta do pesquisador.
- Fetch próprio aceita apenas fontes públicas HTTP(S) conforme política, preferindo HTTPS; bloqueia IPs privados, loopback, link-local e serviços internos, revalidando DNS e cada redirecionamento. Limitar tamanho, tipo e tempo da resposta.
- Não executar scripts ou baixar documentos executáveis de fontes. URL de QR/OCR não é aberta automaticamente; validar protocolo, host e parâmetros, incluindo segredos em query string.
- Um serviço hospedado pode reformular consultas ou seguir fontes internamente. Se não expuser o controle necessário para a política estrita, o adaptador deve declarar a limitação e não executar nesse perfil. Não alegar que uma instrução no prompt garante controle de rede.
- A síntese só recebe dados autorizados ao seu destino; relatório completo não é reenviado à nuvem por conveniência.

## Documento de exposição

O documento deve explicar: objetivo/escopo; o que a imagem e o arquivo revelam; o que fontes públicas acrescentam; como as evidências se conectam; contradições e alternativas; ações sugeridas; limites/cobertura; consultas/fontes e datas; resultado da cópia tratada, se houver. Trechos sensíveis aparecem minimizados por padrão, com detalhe acessível na revisão local.

Exemplo fictício, sem busca real: uma etiqueta contém “Encontro Aurora 2026”. O agente pede nova leitura da edição, propõe consulta pelo nome público autorizado e confronta fontes simuladas. Se edições diferentes continuam plausíveis, relata “texto permite procurar o evento, mas a edição permanece incerta”. GPS presente é um achado local independente. A recomendação pode combinar cobertura da etiqueta e remoção de metadados, sem atribuir presença ou localização à pessoa.

## Critério de entrega

Primeiro demonstrar a cadeia completa com fixtures e pesquisa simulada. Depois validar um caso conectado limitado: observar os payloads realmente enviados, conferir fontes/citações, medir ganho sobre o OCR, testar interrupção e emitir relatório parcial quando necessário. Ver [Avaliação](evaluation.md).
