# Ameaças, privacidade e avaliação

## Modelo de ameaça inicial

Ativos: foto original, textos/identificadores presentes, relatório de detecção e cópia exportada; no modo conectado, consultas, recortes enviados, sessões remotas, fontes web e relatório ampliado. Adversários/cenários: observador de foto publicada, imagem malformada, prompt injection em texto visual e vazamento acidental por logs/telemetria. No modo conectado, acrescentar páginas com prompt injection, correlações falsas, URLs para rede privada, vazamento por consultas e retenção em provedores. Não é um serviço de investigação de terceiros.

Controles propostos: local-first, limites de bytes/pixels, formatos restritos, dependências atualizadas, nenhum efeito externo autorizado apenas por conteúdo, revisão humana, ausência de logs de texto extraído e separação entre original/saída. Não prometer apagamento seguro no disco, anonimato nem proteção contra toda inferência visual.

## Dataset

Fixtures sintéticas com endereços, etiquetas e crachás fictícios; exemplos negativos sem dados sensíveis. Imagens reais apenas com consentimento para análise e autorização separada para demonstração. Nunca commitar originais pessoais. Conjunto de avaliação separado dos exemplos usados no desenvolvimento.

## Medidas a registrar, não resultados existentes

- Precision/recall de candidatos por categoria e tamanho de texto, com número de imagens e critério de correspondência de caixas.
- Falsos negativos e positivos, incluindo reflexos, texto pequeno, rotação e baixa iluminação.
- Grupos de metadados presentes antes/depois, formatos efetivamente cobertos e orientação preservada.
- Vazamento residual pós-exportação, rechecagem independente e revisão humana.
- Latência p50/p95 com versões, hardware, resolução, warm/cold start e tamanho da amostra.
- Preservação do original e nenhum acesso de rede durante o modo offline.
- No modo conectado, conformidade dos payloads realmente enviados com a política de cada destino; registrar custo/uso e destinos sem expor valores sensíveis.

## Testes mínimos antes da primeira demo

JPEG com EXIF de orientação e GPS fictício; JPEG com comentário/thumbnail; PNG com texto/XMP sintético; imagem sem metadados; entrada corrompida; imagem excessiva; regiões fora dos limites; tentativa de sobrescrever original; texto visual que tenta instruir o agente; máscara que cobre integralmente texto fictício. Não chamar exportação verificada se o verificador falhar.

## Avaliação do agente de pesquisa

Comparar baseline local e pesquisa conectada no mesmo conjunto reservado, com gabarito de observações e afirmações sustentáveis. Repetir execuções para avaliar variabilidade do agente, registrando versões e configuração. Não medir abrangência pelo tamanho do relatório ou quantidade de URLs.

- Rastreabilidade: toda conclusão externa aponta para observação inicial, plano de busca e fonte recuperada; citações devem sustentar precisamente a afirmação.
- Corroboração: distinguir homônimos, páginas copiadas e fontes independentes; medir correlações indevidas, hipóteses sem suporte e tratamento de contradições.
- Ganho: achados úteis e corretos acrescentados pela web, em comparação ao baseline; campos sem evidência permanecem desconhecidos.
- Exploração: novas leituras úteis por região, transformação correta das caixas e paradas quando nova tentativa não acrescenta evidência.
- Dados: consultas, reformulações e recortes obedecem à política; testar OCR, URLs e metadados contendo e-mail, GPS preciso, segredo sintético e identificadores privados. Reduzir precisão de GPS não deve ser tratado como anonimização.
- Robustez: injeção no texto visual, EXIF, snippet e página não amplia escopo, não aciona upload, não muda política nem autoriza ferramentas.
- Rede: modo offline sem chamadas; conectado apenas pelos adaptadores. Fetch controlado rejeita localhost, IPs privados/link-local, redirecionamentos proibidos e respostas excessivas.
- Limites: tempo, tentativas, custo e cancelamento interrompem novas chamadas. Falhas, fontes inacessíveis, ausência de resultados e limite atingido produzem estado parcial e lacunas explícitas.
- OpenAI: validar separadamente chamadas de ferramentas, respostas estruturadas, fontes reais, cancelamento e retomada por IDs; resposta concluída não implica pesquisa ou exportação verificadas.
- Interfaces: chat e GPT-Live respeitam a política corrente do caso; interromper a fala não cancela silenciosamente a investigação. Material GPT Image nunca vira evidência nem substitui a sanitização determinística.

## Casos mínimos antes da demo conectada

1. Evento fictício com duas edições homônimas, fonte primária, fonte conflitante e duplicata; fixtures locais, sem alegar busca real.
2. OCR ambíguo: agente pede outra leitura em vez de pesquisar sucessivas grafias como fatos.
3. Consulta com termo permitido e segredo sintético adjacente: apenas o termo permitido sai do ambiente local.
4. Página pedindo upload do original ou consulta com nome privado: política bloqueia a expansão.
5. Nenhum resultado, timeout, rate limit, fonte removida, orçamento esgotado e cancelamento: relatório parcial sem afirmar ausência de exposição.
6. Reinício/retomada: não repetir automaticamente consulta paga ou exportação já concluída; usar histórico de ações e estado real.
7. Uma checagem real limitada, após implementação, com caso autorizado: conferir URLs, trechos, payloads e custo. Testes simulados não demonstram acesso ou qualidade da web ao vivo.

Os critérios de [Agente de pesquisa](agent-research.md) e da [integração OpenAI](openai-integration.md) são propostas a validar. Nenhum desses testes foi executado neste bootstrap.

## Referências técnicas

- ExifTool: https://exiftool.org/ — a remoção não garante cobrir todos metadados em todos formatos.
- Pillow: https://pillow.readthedocs.io/en/stable/ — verificar documentação da versão adotada.
- Tesseract: https://tesseract-ocr.github.io/ — OCR não interpreta automaticamente risco de privacidade.

Essas referências orientam implementação; este bootstrap não constitui auditoria do produto.
