# Catálogo inicial de fontes e elegibilidade

Proposta de 2026-11-13. Fontes conhecidas não são integrações prontas nem garantem acesso por web search. O único mecanismo externo automático da V1 continua sendo web search nativo da Agents API.

## Aquisição e consulta

| ID | Informação desejada | Fonte inicial | Uso e limite na V1 |
| --- | --- | --- | --- |
| SRC-01 | Texto, objetos, telas, detalhes e relações espaciais | Pixels da foto e recortes do mesmo arquivo | Análise multimodal com incerteza; sem reconstruir texto inexistente |
| SRC-02 | Orientação, dimensões, datas, dispositivo/software, GPS presente | Metadados suportados do arquivo recebido | Extração pelo backend; valor bruto privado não vira termo de busca; arquivo pode ter sido alterado |
| SRC-03 | Objetivo e contexto voluntário | Autor da foto | Campo opcional, marcado como fornecido; não atribuir esse dado à capacidade do agente |
| SRC-04 | Identificação de modelo e significado de características públicas | Site/documentação oficial do fabricante, como suporte Apple/Microsoft ou fabricante identificado | Pesquisar somente marca/modelo legível autorizado; aparência não prova versão instalada ou vulnerabilidade |
| SRC-05 | Nome, edição, período e contexto de evento público | Site do organizador e programação oficial | Página contextualiza o texto; não confirma presença do autor nem autoriza pesquisar participantes |
| SRC-06 | Organização ou local público associado a sinal visível | Site oficial da organização/local e páginas institucionais públicas | Correlacionar contexto revisado; sem atribuir emprego, residência ou localização atual |
| SRC-07 | Existência/contexto de domínio próprio/autorizado | Página pública do domínio e registros oficiais, como [RDAP Registro.br](https://registro.br/rdap/) | Web pode não recuperar interfaces/API; resultado inacessível permanece desconhecido. Sem consulta técnica direta, varredura ou coleta de dados pessoais de registrantes |
| SRC-08 | Orientações de privacidade, compartilhamento e vazamentos | [Cartilha CERT.br](https://cartilha.cert.br/fasciculos/) | Fonte educativa de mitigação; não é evidência sobre a pessoa da foto |

A primeira consulta deve procurar a fonte primária que responde à pergunta, não escolher um site por parecer popular. Domínios específicos de fabricantes, eventos e instituições são definidos por caso; logotipo ou aparência não validam um domínio arbitrário.

O [Registro.br descreve RDAP](https://beta.registro.br/rdap/) como consulta de registros de recursos Internet. Isso não significa que nosso web search executa a API RDAP nem que o serviço oferece dados completos de identidade. A página principal pode exigir JavaScript e não ser recuperável pela ferramenta.

## Como lidar com resultados do buscador

O buscador é mecanismo de descoberta. Uma fonte encontrada ainda precisa ter origem, trecho, data, pertinência e estado de acesso registrados. Priorizar fonte primária; usar imprensa especializada ou página secundária para contexto/contraponto, identificando sua natureza.

Não prometer acesso a páginas privadas, conteúdo atrás de login, bases pagas, sites não indexados, páginas removidas ou todo o histórico da internet. A V1 não adiciona contas, cookies de terceiros, crawler, cache de arquivos privados ou ferramenta de busca reversa.

Para cada fonte candidata registrar: `source_class`, `domain`, `access_mode` (`native_web` ou `manual`), `eligibility` e `retrieval_state`. `declared` significa fonte conhecida; só execução com resultado permite marcar `snippet_only` ou `retrieved`. Falha de acesso não vira ausência do dado.

Fontes podem conter informações pessoais mesmo sendo públicas. Coletar só o necessário à pergunta; contatos, participantes, autores e relacionamentos encontrados não passam a ser novos pivôs automaticamente.

## Caminhos manuais de autoavaliação, fora da automação V1

| ID | Caminho | Finalidade e condição |
| --- | --- | --- |
| SRC-09 | [Privacidade nos resultados sobre você, Google](https://support.google.com/websearch/answer/12719076?hl=pt-BR) | O próprio titular verifica exposição de informações e elegibilidade de remoção; disponibilidade varia. Não automatizar envio de nome/endereço pelo agente |
| SRC-10 | [Have I Been Pwned](https://haveibeenpwned.com/) e sua [documentação](https://haveibeenpwned.com/API/v3) | Autoavaliação de conta pelo titular; integração/API, assinaturas e verificações próprias não fazem parte da V1 |
| SRC-11 | Exportação e revisão das próprias contas e URLs públicas indicadas pelo autor | Ver o que foi publicado e ajustar visibilidade no serviço original; não descobrir perfis por rosto ou nome inferido |

Remover um resultado de busca não apaga a página original. Conforme a [ajuda Google](https://support.google.com/websearch/answer/12719076?hl=pt-BR), a remoção se refere aos resultados do buscador; tratar exclusão na origem separadamente.

HIBP e similares não são catálogos completos de todos os vazamentos. Não encontrar correspondência não demonstra ausência de comprometimento. Não enviar senha, token ou e-mail privado ao web search para “ver se vazou”; nenhum dump, pasta de vazamento, credencial roubada ou stealer log é adquirido pelo produto.

## Trilha de identidade autorizada

| ID | Informação desejada | Fonte | Uso e limite |
| --- | --- | --- | --- |
| SRC-12 | Quanto a identidade declarada aparece publicamente | Páginas institucionais, perfis profissionais/acadêmicos públicos, publicações, programações de eventos, imprensa, portfólios e perfis públicos em redes, via web search nativo | Somente com nome, profissão e atividades declarados pelo titular ou por pessoa que autorizou expressamente, sob a autorização de identificação do caso. Registra categoria e classes de dados, sem copiar contato, endereço, documento ou agenda. Homônimos são marcados e não contam |

A autorização de ambiente não se estende à identidade: a identificação tem autorização própria, obrigatória em todo caso, e relação declarada. A trilha não descobre quem está na foto, não usa o rosto e não amplia para familiares, colegas, contatos ou homônimos. O controlador descarta fontes de uma lista curta e não exaustiva de buscadores de pessoas, agregadores de processos e bases de vazamentos (`EXCLUDED_SOURCE_HOSTS` em `src/lib/policy.ts`); a instrução ao modelo continua sendo a primeira barreira.

## Fontes e ações excluídas

Bases de people search/data brokers, pacotes de dados vazados, busca de pessoa por face, inferência de residência/rotina, dados sensíveis inferidos da aparência, contas privadas e informação obtida contornando autenticação/CAPTCHA.

Também fora do escopo: testar credenciais, recuperar senhas, enumerar usuários, varrer portas/serviços, explorar vulnerabilidades ou interagir com pessoas. Documentação pública de um software não prova que um dispositivo visto na foto é vulnerável.

## Referências de controle técnico

[Web search Agents API](https://developers.openai.com/api/docs/guides/agents-api/tools/web-search) para os controles realmente disponíveis; [OWASP Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/) para ameaça de conteúdo indireto/multimodal. Essas fontes apoiam o desenho de controles e não comprovam resistência da implementação futura.
