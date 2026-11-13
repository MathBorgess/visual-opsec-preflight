# visual-opsec-preflight

Uma foto como ponto de entrada para uma curadoria educativa de exposição virtual: o que aparece nos pixels, o que o arquivo registra e o que fontes públicas permitem correlacionar.

> **Estado: aplicação implementada e verificada localmente.** Integração com Agents API implementada e testada com SDK real sobre transporte controlado. Deployment, secrets e validação ao vivo ficam para a etapa final; não há qualidade/latência real demonstrada.

## Executar localmente sem chave

Node.js 24 e npm:

```bash
npm ci
npm run dev:demo
```

Abra http://127.0.0.1:3000 e use a imagem sintética da interface. **A simulação não analisa os pixels da foto enviada.** Validação, metadados, orientação e recortes são reais; observações, fonte web e síntese seguem cenário fictício fixo. Não há chamadas OpenAI. Sessões de demonstração ficam somente na memória do processo; o modo demo é bloqueado na Vercel.

```bash
npm run check
OPSEC_E2E_PRODUCTION=1 npm run test:e2e
```

O segundo comando usa o build gerado pelo primeiro e Chromium em `/usr/bin/chromium`. Para outro caminho, use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Alternativamente, execute `npx playwright install chromium` e defina `PLAYWRIGHT_USE_BUNDLED_CHROMIUM=true`. Sem a variável de produção, o teste inicia o servidor de desenvolvimento. A CI está preparada; sua execução remota não foi verificada nesta entrega.

Veja o [guia de operação e secrets](docs/local-operation.md) e a [rastreabilidade da implementação](docs/implementation-status.md).

## Primeira versão

Aplicação web na Vercel, com backend em Vercel Functions e integração direta com **OpenAI Agents API + web search nativo**. A capacidade multimodal do modelo faz a análise da foto; GPT Image não é necessário para isso.

O produto ajuda o autor a entender quanto uma foto pode revelar sobre seu ambiente e contexto. Cada conclusão distingue observação, correlação sustentada, hipótese e desconhecido. “Todo o conteúdo disponível” é uma direção de exploração, sem promessa de exaustividade.

Premissa de desenho: primeira versão privada para uso do autor e preparação de demonstrações. Abrir a outras pessoas exige identidade, isolamento de casos e cotas persistentes.

## Jornada implementada

1. Selecionar uma única foto JPEG/PNG própria ou autorizada e revisar o envio para processamento remoto.
2. Inventariar metadados antes de criar uma derivada orientada, sem metadados embutidos.
3. Analisar a foto pela Agents API e explorar até três regiões da mesma imagem.
4. Revisar os sinais públicos liberados à pesquisa; consultas compatíveis avançam sem confirmação repetida.
5. Enriquecer os achados por web search em sessão separada, sem foto ou inventário privado.
6. Ler o documento de exposição virtual com evidências, fontes, contradições, limites e recomendações.
7. Exportar o documento e encerrar o caso, com estado explícito da exclusão das sessões remotas.

A chave `OPENAI_API_KEY` será uma variável **Secret** do projeto Vercel, acessível ao backend. Nenhum valor será colocado no repositório, navegador ou contexto do agente.

## Documentos do desenho

- [Spec to-spec: 46 histórias e 12 atividades](docs/TO-SPEC.md)
- [Entrega local e evidências por atividade/requisito](docs/implementation-status.md)
- [Operação local e configuração final pendente](docs/local-operation.md)

- [Arquitetura e implantação proposta](docs/architecture.md)
- [Requisitos funcionais e critérios de aceite](docs/requirements.md)
- [Agente, exploração e pesquisa web](docs/agent-research.md)
- [Loop de exploração e critérios de parada](docs/exploration-loop.md)
- [Catálogo inicial de fontes](docs/source-catalog.md)
- [OpenAI e armazenamento da secret](docs/openai-integration.md)
- [Contrato do documento de exposição virtual](docs/exposure-report.md)
- [Exemplo sintético do documento](docs/examples/exposure-report.synthetic.md)
- [Plano de avaliação](docs/evaluation.md)
- [Roteiro educativo](docs/video.md)

## Escopo e histórico

O desenho de 2026-11-13 substitui a proposta anterior de CLI offline em Python/Tesseract e a lista ampla de integrações OpenAI. A V1 usa Next.js/TypeScript, Sharp/exifr e SDK OpenAI 7.56.0. Sanitização/exportação de uma nova foto ficam para evolução posterior. O [schema inicial de candidatos visuais](schemas/finding.schema.json) permanece como referência histórica; os contratos executáveis estão em [src/lib/contracts.ts](src/lib/contracts.ts).

Fotos e documentos de terceiros exigem autorização. O projeto não faz reconhecimento facial, identificação de desconhecidos, inferência de residência/rotina ou classificação de atributos pessoais sensíveis. As demonstrações usam dados fictícios; o dossiê não certifica segurança nem constitui prova de identidade, presença ou localização atual.

Nenhum segredo, foto pessoal ou dossiê privado deve ser versionado. Licença de reutilização ainda não foi escolhida.
