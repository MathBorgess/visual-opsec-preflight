# Agente de curadoria de exposição virtual

Desenho de 2026-11-13, alinhado à [arquitetura Vercel](architecture.md). Substitui o agente sobre núcleo Python/offline e adaptador de Responses do desenho anterior.

## Objetivo

Explorar o que uma única foto própria/autorizada permite observar ou correlacionar sobre o ambiente e contexto do autor. O resultado educativo demonstra o caminho da evidência à inferência, com alternativas e limites, sem fabricar uma biografia.

Categorias de curadoria: textos/identificadores visíveis; telas/documentos; ambiente e objetos; tecnologia observável; contexto público pesquisável; metadados do arquivo; combinação dos sinais. A presença de equipamento, crachá ou livro não prova profissão, propriedade, rotina ou preferência estável.

Não identificar desconhecidos por rosto, inferir residência/rotina, fazer rastreamento, classificar atributos pessoais sensíveis ou procurar credenciais vazadas. Dados sensíveis visíveis podem ser registrados como exposição com valor minimizado, sem usá-los como pivô público.

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

Antes da primeira análise, informar: cópia da foto transita pela Vercel, uma derivada será enviada à OpenAI, metadados selecionados acompanharão o caso e sinais liberados podem ser usados em buscas. O autor informa que a foto é própria/autorizada.

Antes da pesquisa, apresentar sementes propostas, pergunta e contexto. O autor pode excluir termos e domínios e liberar o conjunto uma vez. Reformulações dentro desse escopo não pedem autorização repetida; novos dados privados não são acrescentados automaticamente.

A sessão web recebe nova entrada construída pelo backend, não uma cópia do histórico visual. Não enviar pixels, EXIF bruto, GPS preciso, e-mail pessoal, documentos, tokens, caminhos internos ou texto privado integral. Não preencher localização de busca a partir do GPS automaticamente. Nome legível na foto não é prova de que o dado já é público.

Sementes adequadas: nome de evento público, marca/modelo de objeto, domínio público autorizado, nome de estabelecimento/contexto público revisado. Datas amplas e cidade só quando liberadas e relevantes à pergunta. Não ampliar para busca de pessoas.

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

Encerrar quando as perguntas estiverem respondidas com evidência suficiente, não houver exploração útil/permitida, houver falha, cancelamento ou limite. Emitir resultado parcial quando existir conteúdo aproveitável. Mostrar fontes ausentes, ambiguidade, qualidade insuficiente e cobertura não executada.

Justificativas do dossiê descrevem evidência e regra de conclusão; não expõem cadeia de raciocínio interna do modelo. O documento deve mostrar como vários sinais podem estreitar contexto sem transformar isso em certeza sobre a pessoa.
