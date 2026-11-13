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

Functions usam Node.js. O SDK tem timeout de 25s por chamada; a UI acompanha turnos por polling. Histórico pode exigir múltiplas chamadas. Não se presume que o prazo ativo de 180s cancele instantaneamente o trabalho remoto: o backend tenta cancelar ao observar o limite. Fechar a aba interrompe o controlador local, sem garantir interrupção no provedor.

Não habilitar logs de payloads, cabeçalhos, cookie ou imagem. APIs têm `Cache-Control: no-store` e erros sanitizados. A visão pode ler dados pessoais dos pixels; remover EXIF não anonimiza uma foto.

Referências: [Vercel environment variables](https://vercel.com/docs/environment-variables), [Secret/Config](https://vercel.com/changelog/environment-variables-now-use-config-and-secret-types), [Agents API](https://developers.openai.com/api/docs/guides/agents-api/overview).
