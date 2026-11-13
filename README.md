# visual-opsec-preflight

Uma foto como ponto de entrada para uma curadoria educativa de exposição virtual: o que aparece nos pixels, o que o arquivo registra e o que fontes públicas permitem correlacionar.

> **Estado: desenho de produto e arquitetura, sem implementação.** Não há aplicação, deploy, credencial provisionada, análise executada ou resultado de qualidade/latência demonstrado.

## Direção da primeira versão

Aplicação web na Vercel, com backend em Vercel Functions e integração direta com **OpenAI Agents API + web search nativo**. A capacidade multimodal do modelo faz a análise da foto; GPT Image não é necessário para isso.

O produto ajuda o autor a entender quanto uma foto pode revelar sobre seu ambiente e contexto. Cada conclusão distingue observação, correlação sustentada, hipótese e desconhecido. “Todo o conteúdo disponível” é uma direção de exploração, sem promessa de exaustividade.

Premissa de desenho: primeira versão privada para uso do autor e preparação de demonstrações. Abrir a outras pessoas exige identidade, isolamento de casos e cotas persistentes.

## Jornada proposta

1. Selecionar uma única foto JPEG/PNG própria ou autorizada e revisar o envio para processamento remoto.
2. Inventariar metadados antes de criar uma derivada orientada, sem metadados embutidos.
3. Analisar a foto pela Agents API e explorar até três regiões da mesma imagem.
4. Revisar os sinais públicos liberados à pesquisa; consultas compatíveis avançam sem confirmação repetida.
5. Enriquecer os achados por web search em sessão separada, sem foto ou inventário privado.
6. Ler o documento de exposição virtual com evidências, fontes, contradições, limites e recomendações.
7. Exportar o documento e encerrar o caso, com estado explícito da exclusão das sessões remotas.

A chave `OPENAI_API_KEY` será uma variável **Secret** do projeto Vercel, acessível ao backend. Nenhum valor será colocado no repositório, navegador ou contexto do agente.

## Documentos do desenho

- [Arquitetura e implantação proposta](docs/architecture.md)
- [Requisitos funcionais e critérios de aceite](docs/requirements.md)
- [Agente, exploração e pesquisa web](docs/agent-research.md)
- [OpenAI e armazenamento da secret](docs/openai-integration.md)
- [Contrato do documento de exposição virtual](docs/exposure-report.md)
- [Exemplo sintético do documento](docs/examples/exposure-report.synthetic.md)
- [Plano de avaliação](docs/evaluation.md)
- [Roteiro educativo](docs/video.md)

## Escopo e histórico

O desenho de 2026-11-13 substitui a proposta anterior de CLI offline em Python/Tesseract e a lista ampla de integrações OpenAI. A V1 prioriza análise e dossiê; sanitização/exportação de uma nova foto ficam para evolução posterior. O [schema inicial de candidatos visuais](schemas/finding.schema.json) permanece como referência histórica e não é o contrato completo do novo dossiê.

Fotos e documentos de terceiros exigem autorização. O projeto não faz reconhecimento facial, identificação de desconhecidos, inferência de residência/rotina ou classificação de atributos pessoais sensíveis. As demonstrações usam dados fictícios; o dossiê não certifica segurança nem constitui prova de identidade, presença ou localização atual.

Nenhum segredo, foto pessoal ou dossiê privado deve ser versionado. Licença de reutilização ainda não foi escolhida.
