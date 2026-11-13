# Entrega local e evidências

2026-11-13. A implementação local e a fronteira principal de testes da [spec](TO-SPEC.md) foram autorizadas pelo autor. Implantação Vercel, inclusão da chave OpenAI e validação ao vivo ficaram para a etapa final. Nenhum ticket ou label de rastreador é declarado criado por este documento.

## Atividades

| Atividade | Estado local e evidência | Pendência externa |
| --- | --- | --- |
| AT-01 Contratos | `contracts.ts`, `policy.ts`, `report.ts`; referências, perguntas e oito seções validadas | Avaliação semântica real |
| AT-02 Base e secrets | Next.js, `.env.example`, módulos `server-only`, HMAC e guarda de origem/acesso | Secrets e proteção Vercel |
| AT-03 Ingestão | Sharp/exifr reais; JPEG/PNG, orientação, metadados minimizados, limites e recortes | Nenhuma integração adicional |
| AT-04 Caso/Agents API | SDK 7.56.0, duas sessões, polling, eventos, idempotência e paginação | Modelo e contrato na conta real |
| AT-05 Loop | Perguntas, até três recortes, tentativa adicional, saturação e prazo | Calibrar ganho/qualidade |
| AT-06 Pesquisa | Sementes/domínios, projeção pública isolada, duas rodadas, URLs vinculadas à ferramenta | Busca real e pertinência |
| AT-07 Dossiê | Oito seções, proveniência, prioridade, parcial e limitações | Qualidade das conclusões reais |
| AT-08 Revisão/exportação | Aceitar/descartar/corrigir; original preservado; Markdown/JSON; teclado e móvel | Avaliação ampla de acessibilidade |
| AT-09 Retenção/falhas | Cancelamento pendente/confirmado, exclusão com retry e criação sem ID explícitas | Retenção/comportamento real |
| AT-10 Testes | API, imagem, SDK/HTTP e jornada de navegador; CI preparada | CI remota e avaliação do modelo |
| AT-11 Preview privado | Guia/configuração preparados | Deployment protegido e checagem ao vivo |
| AT-12 Produção/demonstração | Cenário sintético local disponível | Produção, secrets e demonstração revisada |

“Implementado localmente” não significa que o serviço externo, autenticação Vercel ou qualidade do modelo tenham sido verificados ao vivo.

## Requisitos e verificações

| Requisitos | Implementação e evidência local |
| --- | --- |
| RF-01–04, RNF-03/04 | Parser real; JPEG com orientação/GPS fictícios, PNG estático, animação, corrupção, bytes/pixels excessivos; derivada sem EXIF/XMP |
| RF-05/12, RNF-08 | SDK com transporte controlado; schemas, sessão sem sandbox, turno principal, paginação, retomada sem reenvio |
| RF-06/17/18, RNF-05 | Hash do original, caixas, perguntas preservadas, limites, saturação, ramo inconclusivo e prazo |
| RF-07–09, RNF-02/11 | Payload web sem foto/contexto privado; termos sensíveis/domínios internos recusados; fonte aponta à semente/rodada e URL aberta pela ferramenta |
| RF-10/15/19, RNF-10 | Oito seções e estados epistemológicos; falha de busca/saída malformada gera parcial; referências inventadas descartadas |
| RF-11, RNF-07/09 | Revisão separada do original e downloads coerentes; navegador verifica teclado, fluxo completo e ausência de overflow móvel |
| RF-13/14, RNF-03/08 | Cancelamento pendente permanece pendente; exclusão recusada mantém referência; criação sem ID não anuncia exclusão remota |
| RF-16, RNF-01/04/07 | Origem, acesso loopback local, HMAC, expiração, erros sanitizados e no-store; proteção Vercel/secret real pendentes |
| RNF-06 | Schemas rejeitam ferramentas injetadas na saída; configuração não é montada a partir do conteúdo; React escapa texto e Markdown escapa marcação |

## Limites conhecidos

O SDK é exercitado de verdade; o HTTP remoto é controlado. Isso comprova formato/payload do cliente instalado, isolamento e recuperação da aplicação. Não comprova aceitação pelo servidor OpenAI, disponibilidade do modelo, latência, custo, sucesso de pesquisa ou resistência geral a prompt injection.

A heurística de ganho compara evidências/perguntas e conteúdo/estados da pesquisa. Não prova novidade semântica: paráfrases e evidências incorretas precisam de avaliação/revisão. Profundidade declarada tem limite estrutural de dois; o sentido real dos elos e identificação indevida dependem também do modelo e da revisão. Não há bloqueio individual das consultas internas do web search.

O limite de 180s considera turnos concluídos e tempo pendente observado por polling. A espera do autor na revisão não conta. O controlador para novas explorações e pode iniciar síntese; exclusão é separada. Sem banco, concorrência/replay não oferecem orçamento global rígido.

Verificação local: TypeScript sem erros, 29 testes passando e seis cenários Playwright sobre o build de produção. As regressões cobrem caixas decimais e números preservados em dossiês completos/parciais, minimização de textos nos downloads, escolha de perguntas elegíveis e reconciliação das sementes após recortes/atualizações. Os testes de seleção controlam as respostas do caso; a jornada usa a API real no modo demo e injeta uma caixa decimal no relatório retornado para verificar também a exportação do navegador. Inspeção do bundle estático não encontrou os nomes das secrets do servidor, a credencial fictícia do teste ou o marcador de contexto privado das fixtures. Isso não substitui a verificação com a configuração real.

Para reproduzir: `npm run check` e, após o build, `OPSEC_E2E_PRODUCTION=1 npm run test:e2e`. Capturas sintéticas ficam em `artifacts/` e traces em `test-results/`, ambos ignorados pelo Git.
