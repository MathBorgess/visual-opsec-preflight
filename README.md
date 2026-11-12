# visual-opsec-preflight

Auditoria de privacidade visual antes da postagem, com núcleo local e pesquisa web agêntica opcional. Primeiro projeto de uma série de aprendizado público sobre cybersecurity e purple team.

> **Estado: arquitetura inicial, não uma ferramenta funcional.** Este repositório contém o desenho do MVP, a extensão de pesquisa agêntica e os critérios para validar sua implementação. Nenhuma taxa de acerto, latência ou localização foi demonstrada.

## Problema

Uma foto pode expor textos, telas, crachás e metadados que passam despercebidos. A proposta é ajudar seu autor a revisar esses sinais e exportar uma cópia com menor exposição, sem prometer anonimato ou uma “foto segura”.

## MVP proposto

1. Importar uma imagem JPEG/PNG própria ou autorizada, com limites de tamanho e pixels.
2. Inventariar metadados sem registrá-los em logs.
3. Executar OCR local para sugerir regiões de revisão; VLM é extensão futura e opcional.
4. Apresentar evidência, caixa delimitadora e incerteza de cada candidato.
5. Permitir aprovação, descarte ou criação manual de regiões.
6. Exportar nova imagem com redação opaca/corte e sem copiar metadados do original.
7. Verificar novamente o arquivo exportado, mostrando limites e risco residual.

Processamento local por padrão. O MVP offline não faz upload, telemetria, scraping, consulta geográfica ou identificação de pessoas. Modelos e pesos locais, quando necessários, terão download explícito e execução posterior offline.

## Extensão proposta: agente de pesquisa de exposição

O ponto de entrada continua sendo uma imagem própria ou autorizada e seus metadados. Um agente colhe observações iniciais com ferramentas locais, pede explorações adicionais de regiões e usa principalmente web search para contextualizar sinais em fontes públicas. O resultado é um documento de exposição com evidências, fontes, contradições, recomendações e lacunas.

O modo conectado é opcional e separado do offline. Uma política por caso define quais dados podem ir à OpenAI e quais termos podem chegar à busca web, além do orçamento de pesquisa. Dentro desse escopo, o agente avança sem pedir autorização a cada consulta; mudanças de escopo exigem revisão. A imagem original e valores sensíveis não são enviados por padrão. Pesquisa textual a partir de sinais extraídos não equivale a busca reversa da imagem.

Integrações OpenAI propostas: Agents API para o agente; Responses API com web search no adaptador de pesquisa; visão para explorar recortes autorizados; chat para revisão; GPT-Live para conversa por voz durante a investigação; GPT Image para material sintético e ilustrações claramente identificadas. Serviços remotos não são processamento offline. Ainda não há integração implementada ou acesso de API verificado.

## Arquitetura e próximos passos

- [Arquitetura e decisões](docs/architecture.md)
- [Agente de pesquisa e documento de exposição](docs/agent-research.md)
- [Integrações OpenAI e fronteiras de dados](docs/openai-integration.md)
- [Ameaças, privacidade e avaliação](docs/evaluation.md)
- [Roteiro de demonstração](docs/video.md)
- [Contrato inicial de achados](schemas/finding.schema.json)

Primeiro marco: importar uma fixture sintética, normalizar orientação, exportar uma cópia sem metadados e verificar o resultado. OCR, interface, modelos, sanitização e pesquisa agêntica ainda **não estão implementados**.

## Uso responsável

Use apenas imagens próprias ou com consentimento específico. Não publique imagens, nomes, endereços, identificadores ou registros de consentimento de terceiros neste repositório. As demonstrações devem usar dados fictícios; consentimento para analisar não equivale a consentimento para publicar.

Não há geolocalização exata de pessoas, reconhecimento facial, inferência de residência/rotina ou busca de alvos. O sistema auxilia revisão humana e não certifica segurança. Texto encontrado na imagem, metadados e conteúdo web são dados não confiáveis, nunca instruções para o agente. Contextualizar um evento ou organização em fontes públicas não comprova vínculo de uma pessoa com eles.

## Verificação deste bootstrap

A sintaxe do contrato JSON foi validada. Ainda não existem código executável, testes de produto, CI, benchmark ou implantação. A ausência de licença escolhida não concede automaticamente direitos de reutilização.
