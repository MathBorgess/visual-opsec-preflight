# Agente de curadoria de exposição virtual

Desenho de 2026-11-13, alinhado à [arquitetura Vercel](architecture.md). Substitui o agente sobre núcleo Python/offline e adaptador de Responses do desenho anterior.

## Objetivo

Explorar o que uma única foto própria/autorizada permite observar ou correlacionar sobre o ambiente e contexto do autor. O resultado educativo demonstra o caminho da evidência à inferência, com alternativas e limites, sem fabricar uma biografia.

Categorias de curadoria: textos/identificadores visíveis; telas/documentos; ambiente e objetos; tecnologia observável; contexto público pesquisável; metadados do arquivo; combinação dos sinais. A presença de equipamento, crachá ou livro não prova profissão, propriedade, rotina ou preferência estável.

Não identificar desconhecidos por rosto, inferir residência/rotina, fazer rastreamento, classificar atributos pessoais sensíveis ou procurar credenciais vazadas. Transcrições e valores fornecidos no arquivo são exibidos com origem e ressalvas, sem usá-los como pivô público; credenciais permanecem mascaradas.

## Identidade autorizada

Para mostrar quanto uma foto e uma identidade revelam juntas, todo caso declara nome, profissão e até três atividades de quem aparece na foto: a própria identidade ou a de alguém que autorizou expressamente a pesquisa educativa. A identidade é contexto fornecido (`UID*`, `user_context`), nunca reconhecida pelo rosto.

| Passo | Controle |
| --- | --- |
| Criação | Autorizações obrigatórias de ambiente e de identificação; nome obrigatório; campos sem e-mail, telefone, documento ou link; validação no navegador e no backend antes de qualquer chamada |
| Análise visual | Recebe `declaredIdentity` e pode apontar quando texto/objetos da foto coincidem com a identidade; não pode propor sementes de identidade (`IDENTITY_SEED_FROM_MODEL`) |
| Revisão | O backend deriva `PID1` (`"nome" profissão`) e `PID2..` (`"nome" atividade`); elas aparecem fixas e entram em toda pesquisa pela autorização de identificação, enquanto o autor escolhe os sinais da foto |
| Pesquisa | Sessão web recebe somente as sementes liberadas, `identityScope` e perguntas de cruzamento escritas pelo backend para os sinais da foto liberados; sem foto, contexto ou inventário |
| Validação | Fontes de agregadores excluídos são descartadas com achados dependentes; fonte de identidade sem classificação conta como possível homônimo |
| Síntese e dossiê | `identityExposure`, calculado de forma determinística, orienta o resumo e a seção 5.1 |

A cadeia de uma corroboração sobre a identidade é `achado → fonte web → semente PID → evidência UID`. Uma menção em programação de evento ou página institucional mostra como foto e identidade se reforçam; não comprova presença, vínculo atual, localização ou rotina.

## Exploração proativa e dados fornecidos

Inventariar sinais complementares, priorizar perguntas pelo ganho verificável e escolher a próxima ação: recorte para texto ambíguo, pesquisa de contexto público para uma semente revisada ou conclusão com limitação. Procurar alternativas e contradições, em vez de acumular páginas. A automação executa recortes elegíveis e rodadas úteis dentro do orçamento; a revisão de sementes delimita a sessão web.

O dossiê preserva nomes/cargos literalmente escritos e valores dos campos de GPS/autoria/data do arquivo, com origem e ressalvas. Não vincula nome a rosto nem transforma cargo escrito em profissão confirmada. Cena, vestuário, equipamento e agenda de evento não comprovam emprego, rotina ou deslocamentos. Pessoas na foto compõem observações do material, sem se tornarem alvos de busca.

`public_place` permite contextualizar local público reconhecível, como museu ou monumento, após revisão da semente. Não libera endereço residencial ou coordenadas. O backend reconstrói perguntas por categoria: edição/organizador de evento, atividade de organização, finalidade de domínio, denominação de local e documentação de produto. Não encaminha propósito livre nem transcrição pessoal à sessão web. Proibições de reconhecimento de rosto e inferências pessoais são instruções ao modelo; não são garantia determinística sobre toda resposta.

## Passagens do mesmo fluxo

| Passagem | Sessão e acesso | Entrega |
| --- | --- | --- |
| Inventário | Código da aplicação na Vercel | Formato, dimensões, orientação, metadados e identidade do original |
| Análise | Sessão visual Agents API, sem web | Observações, incertezas, regiões que merecem nova leitura e sementes candidatas |
| Exploração | Mesma sessão visual, até três recortes da mesma foto | Observações refinadas, com vínculo ao pedido e transformação de coordenadas |
| Pesquisa | Sessão Agents API separada, somente web search | Fontes públicas, suporte, conflitos e perguntas ainda abertas |
| Síntese | Sessão visual, com web desabilitado | Documento estruturado que combina observações e pesquisa |

As passagens não usam APIs de geração de imagem nem exigem outros agentes. Pedidos de recorte são dados estruturados que o controlador valida e executa por processamento determinístico, não shell ou comandos gerados.

Se a foto deixou de estar disponível no navegador, pedir a seleção do mesmo arquivo; não inventar que uma nova exploração ocorreu. Se o limite for atingido, a lacuna entra no dossiê.

## Política do caso

Antes da primeira análise, informar: cópia da foto transita pela Vercel, uma derivada será enviada à OpenAI, metadados selecionados acompanharão o caso e sinais liberados podem ser usados em buscas. O autor concede duas autorizações: ambiente (a foto é própria/autorizada e pode ter imagem, cenário e metadados analisados) e identificação (a identidade declarada é sua ou de quem autorizou, e pode ser pesquisada em fontes públicas sem a foto).

Antes da pesquisa, apresentar sementes propostas, pergunta e contexto. O autor pode excluir termos e domínios e liberar o conjunto uma vez. Reformulações dentro desse escopo não pedem autorização repetida; novos dados privados não são acrescentados automaticamente.

A sessão web recebe nova entrada construída pelo backend, não uma cópia do histórico visual. Não enviar pixels, EXIF bruto, GPS preciso, e-mail pessoal, documentos, tokens, caminhos internos ou texto privado integral. Não preencher localização de busca a partir do GPS automaticamente. Nome legível na foto não é prova de que o dado já é público.

Sementes adequadas: nome de evento público, marca/modelo de objeto, domínio público autorizado, nome de estabelecimento/contexto público revisado. Datas amplas e cidade só quando liberadas e relevantes à pergunta. Não ampliar para busca de pessoas.

## Contrato do loop

O [loop detalhado](exploration-loop.md) define fila de perguntas, ação útil, ganho de informação, profundidade e motivo de parada. O [catálogo inicial](source-catalog.md) distingue fontes da V1 de autoavaliação manual. Fonte conhecida não significa integração disponível.

## Seleção e exploração

O agente prioriza regiões que podem mudar a conclusão: texto ambíguo, tela com identificador, detalhe de evento ou objeto de contexto. Cada pedido inclui caixa na imagem orientada, observação de origem, pergunta e ganho esperado.

O controlador rejeita caixas fora de [0,1], largura/altura não positivas, `x+w > 1`, `y+h > 1`, pedidos repetidos sem nova pergunta e fonte de imagem diferente. Uma ampliação não recupera detalhe ausente. Sem Tesseract na V1, leitura de texto é interpretação do modelo e exige indicação de incerteza.

A pesquisa deve testar hipóteses e alternativas. Para um nome de evento, verificar edição e período; para um produto, distinguir modelos semelhantes; para um local público, descrever associação plausível sem atribuir presença de uma pessoa.

## Ferramenta externa escolhida

Usar `web_search` nativo da Agents API, em modo `live`, na sessão de pesquisa em fontes públicas, que continua privada. A [documentação](https://developers.openai.com/api/docs/guides/agents-api/tools/web-search) descreve modo, contexto e domínios permitidos. Não introduzir navegador da aplicação, crawler, busca reversa de imagem ou integração separada com Responses.

O serviço hospedado pode formular várias consultas e consultar fontes internamente. A aplicação limita rodadas e dados liberados, mas não deve alegar interceptação de cada consulta ou limite exato de buscas internas. Se uma política exigir aprovação literal por consulta, esse requisito excede o contrato desta V1.

Salvar URLs e referências realmente retornadas. Diferenciar snippet, conteúdo recuperado e fonte não acessível; não afirmar que a página foi lida quando só há trecho do buscador. Citações não comprovam automaticamente todas as afirmações de um parágrafo.

## Evidência e síntese

Tipos de evidência: `metadata`, `visual`, `user_context` e `web`. O que o usuário informou deve permanecer distinguível do que a foto revelou. Cada achado referencia IDs de evidência e contém justificativa breve, alternativas, limitação e recomendação.

Estados: `observed` para sinal mostrado/extrato do arquivo, `corroborated` para correlação com suporte, `hypothesis` para inferência pendente, `contradicted` para conflito e `unknown` para insuficiência de dados. Observação visual conserva os limites do modelo; não representa uma medição infalível.

Nenhuma pontuação OCR ou autoconfiança do modelo vira probabilidade de dano. Prioridade de revisão usa critérios explícitos do [dossiê](exposure-report.md). Conteúdo duplicado não conta como múltiplas fontes independentes. Não encontrar resultado não prova ausência de exposição.

Texto nos pixels, EXIF, páginas, snippets e saídas do modelo são conteúdo não confiável. Não podem alterar política, fornecer credenciais, autorizar upload, habilitar ferramentas ou instruir execução. O backend valida saídas estruturadas e referências antes de apresentá-las.

## Paradas e lacunas

Até três recortes e duas rodadas web, com prazo-alvo de 180 segundos de trabalho ativo do caso. São limites de desenho, sem benchmark. Limitar antes de iniciar novas fases; registrar quando uma chamada em curso exceder o alvo e tentar cancelá-la. Custo real pode chegar com atraso: não prometer teto financeiro exato por prompt.

Propor até cinco perguntas prioritárias e limitar a dois elos semânticos a correlação foto → entidade pública visível → contexto dessa entidade. Encerrar ramo resolvido ou sem ganho após uma tentativa direcionada adicional; encerrar exploração global após duas ações consecutivas do controlador sem ganho. Os limites não contam cliques ou consultas internas do provedor.

Encerrar quando as perguntas selecionadas estiverem tratadas, não houver ação útil/permitida, houver falha, cancelamento ou orçamento esgotado para todas as ações restantes. Um limite de recortes não impede pesquisa web útil ainda permitida. Emitir resultado parcial quando existir conteúdo aproveitável. Registrar motivo de parada, perguntas pendentes, ramos bloqueados, sinais não explorados e estado remoto, conforme o contrato do loop.

Justificativas do dossiê descrevem evidência e regra de conclusão; não expõem cadeia de raciocínio interna do modelo. O documento deve mostrar como vários sinais podem estreitar contexto sem transformar isso em certeza sobre a pessoa.
