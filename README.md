# visual-opsec-preflight

Auditoria local de privacidade visual antes da postagem. Primeiro projeto de uma série de aprendizado público sobre cybersecurity e purple team.

> **Estado: arquitetura inicial, não uma ferramenta funcional.** Este repositório contém o desenho do MVP e os critérios para validar sua implementação. Nenhuma taxa de acerto, latência ou localização foi demonstrada.

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

Processamento local por padrão. Sem upload, telemetria, scraping, consulta geográfica ou identificação de pessoas no MVP. Modelos e pesos, quando necessários, terão download explícito e execução posterior offline.

## Arquitetura e próximos passos

- [Arquitetura e decisões](docs/architecture.md)
- [Ameaças, privacidade e avaliação](docs/evaluation.md)
- [Roteiro de demonstração](docs/video.md)
- [Contrato inicial de achados](schemas/finding.schema.json)

Primeiro marco: importar uma fixture sintética, normalizar orientação, exportar uma cópia sem metadados e verificar o resultado. OCR, interface, modelos e sanitização ainda **não estão implementados**.

## Uso responsável

Use apenas imagens próprias ou com consentimento específico. Não publique imagens, nomes, endereços, identificadores ou registros de consentimento de terceiros neste repositório. As demonstrações devem usar dados fictícios; consentimento para analisar não equivale a consentimento para publicar.

Não há geolocalização exata de pessoas, reconhecimento facial, inferência de residência/rotina ou busca de alvos. O sistema auxilia revisão humana e não certifica segurança. Texto encontrado na imagem é dado não confiável, nunca instrução para o agente.

## Verificação deste bootstrap

A sintaxe do contrato JSON foi validada. Ainda não existem código executável, testes de produto, CI, benchmark ou implantação. A ausência de licença escolhida não concede automaticamente direitos de reutilização.
