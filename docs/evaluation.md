# Avaliação e critérios de verificação

Plano de 2026-11-13, alinhado à V1 web na Vercel. Substitui o plano centrado em Tesseract e sanitização local. Nenhuma avaliação de produto foi executada; estas são verificações futuras.

## Conjunto de avaliação

Fotos encenadas/sintéticas com textos e metadados fictícios; negativos sem sinais sensíveis; variações de rotação, iluminação, reflexo e texto pequeno. Separar desenvolvimento e avaliação. Quando houver imagem real, exigir autorização específica para análise e, separadamente, para demonstração.

O gabarito lista observações diretamente sustentáveis, correlações possíveis, hipóteses não sustentadas e perguntas sem resposta. GPT Image não integra a V1; fixtures de teste e metadados devem ter valores conhecidos, inseridos por método determinístico.

## Critérios por camada

| Camada | Verificação necessária |
| --- | --- |
| Ingestão | JPEG/PNG válidos, orientação, limites reais de bytes/pixels, falha de parser e preservação do original |
| Análise visual | Acertos/omissões por categoria e tamanho; texto ilegível não vira identificador; caixas dentro da imagem |
| Exploração | Pedido útil, mesmo original por hash, transformação correta e limite de três recortes |
| Pesquisa | Sementes autorizadas, duas rodadas máximas, payload sem foto/inventário privado e fontes reais |
| Dossiê | Oito seções, referências válidas, citações pertinentes, contradições e desconhecidos explícitos |
| Secrets | Chave fora de bundle, respostas, cookies, prompts, relatórios e logs; falha sanitizada quando indisponível |
| Acesso | UI e todas as APIs protegidas, referências de sessão não arbitrárias, origem e cookie validadas |
| Ciclo de vida | Poll/reconexão sem replay cego, cancelamento, fechamento da página e exclusão com resultado confirmado |
| Interface | Keyboard, labels/estados acessíveis, revisão humana e download coerente com JSON canônico |

## Casos negativos mínimos

1. Imagem corrompida, animação, excesso de pixels/bytes, extensão enganosa e corpo multipart acima do limite.
2. EXIF de orientação e GPS fictício; PNG com campos de texto; parser não suporta campo ou falha: distinguir de ausência.
3. Foto com nome público e segredo sintético adjacente: somente semente liberada entra na sessão web.
4. Instrução maliciosa em imagem/metadado/página: não muda política, ferramentas ou destino de dados.
5. Homônimos, edições diferentes, página duplicada, snippet sem página acessível e ausência de resultados.
6. Região inválida, arquivo trocado e quarto recorte: rejeitar antes de chamada paga.
7. Referência de evidência inexistente, fonte inventada e hipótese promovida a fato: não aceitar dossiê final.
8. HTML/script em texto de achado/fonte: não executar na interface nem no arquivo exportado.
9. Timeout/rate limit, resposta de configuração, queda de conexão e resultado desconhecido de operação: manter erro parcial e reconciliar.
10. Cancelamento com turno remoto ainda ativo; exclusão recusada/pendente; cookie expirada e sessão órfã: não alegar limpeza realizada.
11. Request sem acesso, cookie adulterada, origem incorreta ou sessão não vinculada: negar sem expor IDs ou conteúdo.
12. Deployment antigo após rotação: não reutilizar como rollback com chave revogada.

## Medidas e limites

Medir observações corretas, omissões, correlações indevidas e pertinência de citações. Comparar análise sem web com análise enriquecida nas mesmas fixtures; ganho significa conclusão útil sustentada, não quantidade de páginas.

Registrar versões/configuração, tamanho da amostra, resolução, repetição/variabilidade, latências p50/p95 e uso/custo disponível. Objetivo de 180s e limites de recorte/rodada são hipóteses de produto, não resultados. Não prometer contagem de buscas internas ou teto financeiro rígido sem controle correspondente do provedor.

## Etapas futuras de validação

Primeiro validar contratos/fixtures e comportamento simulado. Depois, quando a implementação for solicitada, confirmar acesso de API e executar uma análise real limitada/autorizada. Conferir payloads, fontes e artefatos reais; mocks não provam acesso ou qualidade da busca.

Por fim, build/checks do app e teste de navegador sobre preview privado na Vercel: upload → análise → exploração → revisão de sementes → pesquisa → documento → download → encerramento. Conferir proteção e ausência de segredo no cliente antes de produção privada. Nesta etapa documental, verificar somente consistência, referências e exemplos.
