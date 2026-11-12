# Ameaças, privacidade e avaliação

## Modelo de ameaça inicial

Ativos: foto original, textos/identificadores presentes, relatório de detecção e cópia exportada. Adversários/cenários: observador de foto publicada, imagem malformada, prompt injection em texto visual e vazamento acidental por logs/telemetria. Não é um serviço de investigação de terceiros.

Controles propostos: local-first, limites de bytes/pixels, formatos restritos, dependências atualizadas, nenhum efeito externo disparado por conteúdo, revisão humana, ausência de logs de texto extraído e separação entre original/saída. Não prometer apagamento seguro no disco, anonimato nem proteção contra toda inferência visual.

## Dataset

Fixtures sintéticas com endereços, etiquetas e crachás fictícios; exemplos negativos sem dados sensíveis. Imagens reais apenas com consentimento para análise e autorização separada para demonstração. Nunca commitar originais pessoais. Conjunto de avaliação separado dos exemplos usados no desenvolvimento.

## Medidas a registrar, não resultados existentes

- Precision/recall de candidatos por categoria e tamanho de texto, com número de imagens e critério de correspondência de caixas.
- Falsos negativos e positivos, incluindo reflexos, texto pequeno, rotação e baixa iluminação.
- Grupos de metadados presentes antes/depois, formatos efetivamente cobertos e orientação preservada.
- Vazamento residual pós-exportação, rechecagem independente e revisão humana.
- Latência p50/p95 com versões, hardware, resolução, warm/cold start e tamanho da amostra.
- Preservação do original e nenhum acesso de rede durante processamento.

## Testes mínimos antes da primeira demo

JPEG com EXIF de orientação e GPS fictício; JPEG com comentário/thumbnail; PNG com texto/XMP sintético; imagem sem metadados; entrada corrompida; imagem excessiva; regiões fora dos limites; tentativa de sobrescrever original; texto visual que tenta instruir o agente; máscara que cobre integralmente texto fictício. Não chamar exportação verificada se o verificador falhar.

## Referências técnicas

- ExifTool: https://exiftool.org/ — a remoção não garante cobrir todos metadados em todos formatos.
- Pillow: https://pillow.readthedocs.io/en/stable/ — verificar documentação da versão adotada.
- Tesseract: https://tesseract-ocr.github.io/ — OCR não interpreta automaticamente risco de privacidade.

Essas referências orientam implementação; este bootstrap não constitui auditoria do produto.
