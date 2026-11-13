# Operação local e preparação da Vercel

Entrega local de 2026-11-13. Implantação e chave real ficaram para a etapa final solicitada pelo autor. Este documento não registra um deployment ou uma chamada ao vivo.

## Modos e variáveis

| Variável | Função | Tratamento |
| --- | --- | --- |
| `OPSEC_PROVIDER` | `demo` local ou `openai` explícito | Config; sem fallback automático para chamada paga |
| `OPENAI_MODEL` | Modelo com visão, Agents API e web search disponíveis no projeto | Config; validar o default do exemplo na conta |
| `OPENAI_API_KEY` | Autenticação direta do SDK no backend | Secret Vercel; nunca `NEXT_PUBLIC_` |
| `CASE_SIGNING_SECRET` | HMAC da referência de caso | Secret independente, aleatório, pelo menos 32 caracteres |
| `OPSEC_DEPLOYMENT_PROTECTED` | Bloqueia APIs Vercel até a proteção ser conferida | Config `true` somente após verificação externa |

No desenvolvimento sem chave, `npm run dev:demo` basta. A assinatura local é gerada em memória quando não configurada; reiniciar invalida referências anteriores. Para testar o build: `npm run build`, seguido de `OPSEC_PROVIDER=demo npm start`.

Para execução real local futura, `.env.local` é ignorado pelo Git. Usar credencial própria de desenvolvimento, sem copiar a de produção. Apenas o módulo servidor constrói o SDK com a chave; a credencial não entra em prompts, JSON do caso ou exports. Nenhum valor precisa ser enviado por chat.

## Configuração final pendente

1. Vincular o repositório ao projeto/time Vercel e confirmar Node.js 24, Next.js e build `npm run build`, sem banco/Blob.
2. Habilitar proteção de deployment para interface e APIs, incluindo produção, previews, aliases e URLs diretas utilizadas. A flag do app é uma trava de configuração; ela não instala nem comprova autenticação.
3. Cadastrar `OPENAI_API_KEY` e `CASE_SIGNING_SECRET` como **Secret** em Settings → Environment Variables. Cadastrar modo/modelo/proteção como Config. Separar produção de preview e desenvolvimento; preview não herda chave de produção.
4. Gerar uma nova versão após configurar variáveis. Verificar que uma requisição sem autenticação não chega à API, inclusive em `/api/cases` e `/api/case`.
5. Com foto sintética/autorizada, validar visão real, esquema JSON, rodada web, URLs acessadas, limites, uso e exports. Medir qualidade e latência sem anunciar o teste simulado como evidência ao vivo.
6. Encerrar o caso e verificar cancelamento/exclusão no provedor. Conferir que falhas e pendências aparecem honestamente.

Vercel Secret atende ao armazenamento desta chave na V1; não é necessário acrescentar um vault externo. Se a organização exigir KMS/vault próprio, isso muda o provisionamento. Secrets de produção/preview não são recuperadas por `vercel env pull`; um pull não substitui o provisionamento correto.

## Retenção e recuperação

A aplicação não grava original, derivada ou relatório em armazenamento durável. O navegador mantém o arquivo selecionado e a revisão em memória. Ao recarregar, o autor pode selecionar o mesmo original para recortes. A revisão humana deve ser exportada antes de sair; não é salva no provedor.

A cookie HttpOnly assinada guarda IDs/counters, sem imagem, inventário, texto privado ou chave. Ela é assinada, não criptografada; não deve ser compartilhada. Expira em 24h. Não há cron de limpeza remota: exporte e encerre explicitamente. Se a cookie desaparecer, a aplicação perde o vínculo e a limpeza depende da administração do projeto OpenAI.

Após perda de resposta, a aplicação consulta a sessão conhecida sem reenviar a ação. Se a criação não devolveu ID, não há confirmação segura de qual recurso excluir. O encerramento remove a referência local e informa exclusão remota não confirmada; confira sessões órfãs no projeto usando os controles disponíveis na conta. Falhas na exclusão de IDs conhecidos mantêm a referência para nova tentativa. Após reinício local, use “Recuperar encerramento do caso”. Encerre casos antes de rotacionar a assinatura quando possível.

Eventos levam chave de idempotência e o SDK não faz retries automáticos. Isso não promete exactly-once para criação, concorrência de abas, replay de cookies ou controle global de gastos. Sem estado durável, a V1 privada não oferece cotas globais rígidas. Configurações de orçamento no projeto OpenAI complementam os limites locais conforme capacidades da conta.

## Limites operacionais

Functions usam Node.js e `maxDuration=60s` (30s no observador SSE). O SDK tem timeout de 20s por chamada, sem retries automáticos, e o backend compartilha um prazo de 45s por requisição. A UI mostra bytes enviados/espera no upload e acompanha turnos por polling e eventos nativos filtrados da Agents API. Cada conexão SSE dura até 20s e pode reconectar; o polling reconcilia eventos perdidos. Histórico paginado pode exigir múltiplas chamadas, dentro do prazo compartilhado. Não se presume que o prazo ativo de 180s cancele instantaneamente o trabalho remoto: o backend tenta cancelar ao observar o limite. Fechar a aba interrompe o controlador local, sem garantir interrupção no provedor.

A foto original deve ter até 3 MiB e 16 milhões de pixels. O navegador verifica os cabeçalhos antes de enviar; o servidor repete a validação. A derivada JPEG passa por no máximo seis combinações de resolução/qualidade, de 2048px/82 a 512px/60, até caber em 700 KiB. Não se aumenta o limite inline da OpenAI: `image_url` admite no máximo 1.048.576 caracteres, incluindo o prefixo/base64. O inventário vem do original; a derivada enviada à visão não copia EXIF. Redução pode prejudicar texto pequeno e é declarada nas limitações.

## Investigar falhas

Abra **Diagnóstico técnico → Baixar diagnóstico**. O JSON contém ID da requisição, etapa, duração, se o provedor foi chamado e, quando disponíveis, código/status/campo e IDs OpenAI de requisição, sessão e turno. Limites incluem valor observado e máximo. Sem resposta do servidor, o diagnóstico marca o resultado remoto como desconhecido, sem reenviar a criação. Uma rejeição definitiva de criação pela OpenAI não deixa um caso incerto bloqueando uma tentativa manual.

No painel Vercel, filtre Runtime Logs pelo `requestId` do JSON: `opsec.stage` registra validação, metadados, normalização e aceitação remota; `opsec.failure` registra a causa sanitizada; `opsec.response` registra o status HTTP. Falhas de turno persistidas também aparecem no resultado parcial. Use os IDs no [painel Agents da OpenAI](https://platform.openai.com/logs?api=agents). Retenção de logs depende do plano; eventos ao vivo não têm replay e não substituem o estado persistido. Nenhum desses registros contém imagem, nome do arquivo, contexto, mensagem bruta do provedor ou secrets.

O [teste sintético de produção](../.github/workflows/production-smoke.yml) é explícito: execute manualmente ou publique uma tag `opsec-live-check-*` no SHA já implantado. Ele confere `/api/config.revision`, cria um único caso com foto fictícia detalhada, aprova somente Mozilla/Firefox com domínio `mozilla.org`, exige visão, busca web, dossiê e exclusão remota confirmada. Usa a integração do backend, sem chave OpenAI no runner. Não contorna autenticação de deployment; se a proteção impedir o runner, o teste relata o bloqueio. Não usa foto pessoal nem faz retry de criação. Há até três tentativas de limpeza, inclusive após falha.

Não habilitar logs de payloads, cabeçalhos, cookie ou imagem. APIs têm `Cache-Control: no-store` e erros sanitizados. A visão pode ler dados pessoais dos pixels; remover EXIF não anonimiza uma foto.

Referências: [Vercel environment variables](https://vercel.com/docs/environment-variables), [Secret/Config](https://vercel.com/changelog/environment-variables-now-use-config-and-secret-types), [Agents API](https://developers.openai.com/api/docs/guides/agents-api/overview).


O esquema de saída enviado à Agents API usa o helper de Structured Outputs do SDK e caixas como arrays homogêneos de quatro números. O contrato local continua com a tupla posicional e os limites geométricos; JSON Schema genérico de tuplas (`prefixItems`/`items: false`) não deve ser enviado como esquema estrito. Os testes do adaptador verificam o contrato transmitido, além do JSON retornado.

Em erros HTTP 400 sem `param`, `provider.summary` contém somente palavras de um vocabulário fixo de protocolo. Trechos entre aspas, termos desconhecidos, identificadores e números da mensagem são substituídos por `[valor]`. É uma pista técnica parcial; a mensagem original deve ser consultada no projeto OpenAI usando o ID da requisição. O resumo aparece somente na resposta ao solicitante autenticado; todas as rotinas de log o removem, inclusive quando um provedor ecoa texto sem aspas. Logs mantêm códigos e IDs estruturados.

A sonda administrativa `scripts/diagnose-agents.mjs` exige `OPSEC_SYNTHETIC_DIAGNOSTIC=1`. Executa somente entradas fixas, em etapas separadas de texto, imagem inline e esquema simples, com limpeza confirmada e tentativas limitadas. `OPSEC_PROBE_FULL_CASE=1` usa as rotas compiladas e a mesma foto fictícia do teste de produção para comparar o request real; requer build prévio. O diagnóstico de transporte desse processo isolado pode inspecionar erros da entrada sintética, mascarando a credencial e identificadores de conta, sem receber fotos ou contexto do usuário. Não é uma rota pública nem parte do build padrão. Os builds de investigação com `purpose=static-diagnostic-intentionally-no-publish` encerram com código 1 deliberadamente para não publicar a sonda; não representam nova falha de uma chamada do usuário.


A criação aceita pode anteceder em alguns segundos a persistência das mensagens iniciais. Histórico ainda vazio retorna HTTP 202 com `pending=true`, mantendo a mesma referência. A interface mostra a espera e continua o polling sem reenviar a foto. A mesma regra cobre a nova sessão de pesquisa; o prazo de trabalho ativo continua valendo e falhas de turno preservam o diagnóstico do provedor.

O próprio registro de mensagem pode aparecer antes de seu conteúdo estar completo. Isso também mantém HTTP 202 até existir um checkpoint JSON utilizável, dentro do prazo ativo. O diagnóstico informa contagens de itens/mensagens, quantidade de caracteres e falhas de parse, sem registrar texto ou imagem.

A validação consome apenas mensagens finais de turnos confirmados como concluídos e URLs de ações web concluídas. Se o turno concluir antes de sua mensagem final aparecer, o controlador aguarda na mesma fase, dentro do prazo ativo. Em falha de proveniência, `sourceAudit` mostra ao solicitante a URL declarada e URLs públicas registradas; esse campo é removido dos logs de runtime. Não se desativa a validação de fontes para concluir um dossiê.
