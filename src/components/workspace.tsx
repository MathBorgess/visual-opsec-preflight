'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaseView, Report } from '@/lib/contracts';
import { reportMarkdown } from '@/lib/report';
import { safeUrl, minimize } from '@/lib/policy';

const phaseNames: Record<string, string> = {
  analyzing: 'Analisando a imagem',
  exploring: 'Explorando uma pista',
  awaiting_search_review: 'Revise os sinais públicos',
  researching: 'Consultando fontes públicas',
  research_ready: 'Pesquisa disponível',
  synthesizing: 'Organizando o dossiê',
  completed: 'Dossiê disponível',
  partial: 'Resultado parcial',
  failed: 'Análise interrompida',
  cancelled: 'Caso cancelado',
  uncertain: 'Aguardando confirmação do provedor',
};
const labels: Record<string, string> = {
  observed: 'Observado',
  corroborated: 'Corroborado',
  hypothesis: 'Hipótese',
  contradicted: 'Conflito',
  unknown: 'Desconhecido',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
  undetermined: 'Indeterminada',
  pending: 'Pendente',
  accepted: 'Aceito',
  rejected: 'Descartado',
  corrected: 'Corrigido',
};
const stopNames: Record<string, string> = {
  sufficient_evidence: 'Evidência suficiente para as perguntas selecionadas',
  no_useful_action: 'Nenhuma outra ação útil autorizada',
  no_information_gain: 'Exploração sem novo ganho',
  scope_boundary: 'Fronteira do escopo',
  budget_exhausted: 'Orçamento de exploração alcançado',
  deadline_reached: 'Prazo de exploração alcançado',
  user_cancelled: 'Cancelamento solicitado pelo autor',
  provider_failure: 'Falha ou resposta não confirmada do provedor',
  policy_violation: 'Resultado fora do contrato',
};
async function request(path: string, options?: RequestInit) {
  const r = await fetch(path, { ...options, cache: 'no-store' });
  const data = await r.json();
  if (!r.ok)
    throw Object.assign(
      new Error(data.error?.message ?? data.message ?? 'A operação não foi confirmada.'),
      { code: data.error?.code },
    );
  return data;
}
function download(report: Report, format: 'json' | 'md') {
  const safeReport = JSON.parse(minimize(JSON.stringify(report))) as Report;
  const body = format === 'json' ? JSON.stringify(safeReport, null, 2) : reportMarkdown(safeReport);
  const url = URL.createObjectURL(
    new Blob([body], {
      type: format === 'json' ? 'application/json' : 'text/markdown;charset=utf-8',
    }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `exposicao-${report.caseId.slice(0, 8)}.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Workspace() {
  const [config, setConfig] = useState<{ mode: string; available: boolean } | null>(null);
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(''),
    [context, setContext] = useState(''),
    [consent, setConsent] = useState(false);
  const [view, setView] = useState<CaseView | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [seeds, setSeeds] = useState<string[]>([]),
    [domains, setDomains] = useState(''),
    [auto, setAuto] = useState(true),
    [manual, setManual] = useState('0.1, 0.1, 0.6, 0.3');
  const [reviewed, setReviewed] = useState<Report | null>(null),
    [closed, setClosed] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const inFlight = useRef(false),
    reviewedKey = useRef(''),
    selectedCase = useRef('');
  const act = useCallback(async (fn: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao executar a operação.');
      setAuto(false);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }, []);
  const apply = useCallback((v: CaseView) => {
    setView(v);
    if (v.caseId !== selectedCase.current) {
      selectedCase.current = v.caseId;
      setSeeds(v.analysis.seeds.map((s) => s.id));
    }
    if (v.report && reviewedKey.current !== v.caseId + v.phase) {
      setReviewed(v.report);
      reviewedKey.current = v.caseId + v.phase;
    }
  }, []);
  const poll = useCallback(async () => {
    const v = await request('/api/case');
    apply(v);
  }, [apply]);
  useEffect(() => {
    let alive = true;
    request('/api/config')
      .then((v) => {
        if (alive) setConfig(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    request('/api/case')
      .then((v) => {
        if (alive) apply(v);
      })
      .catch((e) => {
        if (alive && !['NO_CASE', 'NOT_CONFIGURED'].includes(e.code)) {
          setRecovery(true);
          setError(e.message);
        }
      });
    return () => {
      alive = false;
    };
  }, [apply]);
  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (
      !view ||
      closed ||
      !['analyzing', 'researching', 'synthesizing', 'uncertain'].includes(view.phase)
    )
      return;
    const timer = setTimeout(() => {
      if (!inFlight.current) poll().catch((e) => setError(e.message));
    }, 1200);
    return () => clearTimeout(timer);
  }, [view, closed, busy, poll]);
  const advance = useCallback(
    async (action: string, extra = {}) => {
      const v = await request('/api/case/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      apply(v);
    },
    [apply],
  );
  const region = useCallback(
    async (regionId?: string) => {
      if (!file || !view)
        throw new Error('Selecione novamente o mesmo arquivo original para explorar a região.');
      const data = new FormData();
      data.set('image', file);
      if (regionId) data.set('regionId', regionId);
      else {
        data.set('bbox', JSON.stringify(manual.split(',').map(Number)));
        data.set(
          'questionId',
          view.analysis.questions.find((q) => q.status === 'open' && q.attempts < 2)?.id ?? '',
        );
      }
      apply(await request('/api/case/region', { method: 'POST', body: data }));
    },
    [file, view, manual, apply],
  );
  useEffect(() => {
    if (!auto || !view || closed || busy || !file || view.phase !== 'exploring') return;
    const next = view.analysis.regions.find((r) =>
      view.analysis.questions.some(
        (q) => q.id === r.questionId && q.status === 'open' && q.attempts < 2,
      ),
    );
    if (next) {
      const timer = setTimeout(() => void act(() => region(next.id)), 500);
      return () => clearTimeout(timer);
    }
  }, [auto, view, closed, busy, file, act, region]);
  useEffect(() => {
    if (!auto || !view || closed || busy || view.phase !== 'research_ready') return;
    const timer = setTimeout(
      () =>
        void act(() =>
          advance(
            view.research?.followup &&
              view.budget.rounds < 2 &&
              view.budget.noGain < 2 &&
              view.budget.activeMs < view.limits.activeMs
              ? 'research_more'
              : 'synthesize',
          ),
        ),
      600,
    );
    return () => clearTimeout(timer);
  }, [auto, view, closed, busy, act, advance]);
  async function start() {
    if (!file) throw new Error('Selecione uma foto.');
    const form = new FormData();
    form.set('image', file);
    form.set('context', context);
    form.set('consent', consent ? 'yes' : 'no');
    await request('/api/cases', { method: 'POST', body: form });
    setClosed(false);
    reviewedKey.current = '';
    await poll();
  }
  async function sample() {
    const r = await fetch('/api/demo-image');
    if (!r.ok) throw new Error('Fixture indisponível.');
    setFile(new File([await r.blob()], 'cenario-sintetico.jpg', { type: 'image/jpeg' }));
  }
  async function closeCase() {
    const r = await request('/api/case', { method: 'DELETE' });
    setNotice(r.message);
    if (r.closed) {
      setClosed(true);
      setView(null);
      setReviewed(null);
      setRecovery(false);
      selectedCase.current = '';
    }
  }
  const currentStep =
    !view || closed
      ? 0
      : ['analyzing', 'exploring'].includes(view.phase)
        ? 1
        : view.phase === 'awaiting_search_review'
          ? 2
          : ['researching', 'research_ready'].includes(view.phase)
            ? 3
            : 4;
  const steps = [
    'Selecionar a foto',
    'Observar e explorar',
    'Revisar sinais públicos',
    'Pesquisar contexto',
    'Revisar o dossiê',
  ];
  return (
    <div className="shell">
      <a className="skip" href="#workspace">
        Pular para o conteúdo
      </a>
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">◈</span> visual<span>opsec</span>
        </a>
        <p className="side-caption">LABORATÓRIO DE EXPOSIÇÃO</p>
        <ol className="steps">
          {steps.map((step, i) => (
            <li
              key={step}
              className={i === currentStep ? 'active' : i < currentStep ? 'done' : ''}
              aria-current={i === currentStep ? 'step' : undefined}
            >
              <span>{i < currentStep ? '✓' : String(i + 1).padStart(2, '0')}</span>
              {step}
            </li>
          ))}
        </ol>
        <div className="side-foot">
          <span className="dot" />{' '}
          {config?.mode === 'demo' ? 'SIMULAÇÃO LOCAL' : 'EXECUÇÃO PRIVADA'}
          <p>
            Uma foto abre caminhos.
            <br />
            Cada conclusão precisa de evidência.
          </p>
        </div>
      </aside>
      <main id="workspace">
        <header className="topbar">
          <span>EDUCAÇÃO EM PRIVACIDADE</span>
          <span className="pill">
            {config?.mode === 'demo' ? 'SEM CHAMADAS EXTERNAS' : 'OPENAI AGENTS API'}
          </span>
        </header>
        <section className="hero">
          <p className="eyebrow">ANTES DE COMPARTILHAR, OBSERVE.</p>
          <h1>
            Uma foto.
            <br />
            <span>Muitas pistas.</span>
          </h1>
          <p className="lede">
            Descubra os caminhos que uma imagem abre sobre seu ambiente. Veja o que é observável, o
            que pode ser conectado e o que continua sendo hipótese.
          </p>
        </section>
        {config?.mode === 'demo' && (
          <div className="banner">
            <strong>Modo de simulação</strong>
            <span>
              O arquivo é validado e os metadados são extraídos. As observações visuais e fontes web
              usam um cenário fictício fixo, sem analisar o conteúdo real da foto.
            </span>
          </div>
        )}
        {error && (
          <div className="alert" role="alert">
            {error}
            <button className="text-button" onClick={() => act(poll)} disabled={busy}>
              Consultar estado existente
            </button>
            <button className="text-button" onClick={() => act(closeCase)} disabled={busy}>
              Recuperar encerramento do caso
            </button>
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
          </div>
        )}
        {!view || closed ? (
          <div className="entry-grid">
            <section className="panel upload-panel">
              <div className="panel-heading">
                <span className="eyebrow">01 / PONTO DE PARTIDA</span>
                <span className="muted">JPEG ou PNG · até 3 MiB</span>
              </div>
              <h2>Comece com uma única foto</h2>
              <label
                className={'dropzone ' + (file ? 'has-file' : '')}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  setFile(e.dataTransfer.files[0] ?? null);
                }}
              >
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  aria-label="Selecionar foto"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {preview ? (
                  <img src={preview} alt="Prévia da foto selecionada, preservada no dispositivo" />
                ) : (
                  <>
                    <span className="upload-icon">↑</span>
                    <strong>Selecione ou arraste uma foto</strong>
                    <span>Foto própria ou com autorização</span>
                  </>
                )}
              </label>
              <p className="file-note">
                {file
                  ? `${file.name} · ${(file.size / 1024).toFixed(0)} KiB`
                  : 'O original é preservado. A aplicação não mantém uma galeria.'}
              </p>
              {config?.mode === 'demo' && (
                <button className="secondary" onClick={() => act(sample)} disabled={busy}>
                  Usar imagem sintética de exemplo
                </button>
              )}
              <label className="field">
                Contexto opcional
                <textarea
                  maxLength={600}
                  placeholder="O que você pretendia mostrar nesta foto?"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  Esta foto é própria ou autorizada. Entendo o processamento descrito ao lado e
                  autorizo a análise.
                </span>
              </label>
              <button
                className="primary"
                onClick={() => act(start)}
                disabled={recovery || !file || !consent || busy || !config?.available}
              >
                {busy
                  ? 'Preparando o caso…'
                  : config?.mode === 'demo'
                    ? 'Iniciar simulação →'
                    : 'Analisar exposição →'}
              </button>
              {!config?.available && config && (
                <p className="muted">
                  Integração indisponível. A configuração da chave acontece somente no backend.
                </p>
              )}
            </section>
            <aside className="context-panel">
              <span className="eyebrow">TRANSPARÊNCIA POR PADRÃO</span>
              <h2>Onde sua foto chega</h2>
              <ol className="flow">
                <li>
                  <strong>Seu dispositivo</strong>
                  <p>O original permanece selecionado no navegador.</p>
                </li>
                <li>
                  <strong>Backend da aplicação</strong>
                  <p>Valida a foto, inventaria metadados e prepara a derivada orientada.</p>
                </li>
                <li>
                  <strong>OpenAI, na análise real</strong>
                  <p>
                    Recebe a derivada e o contexto autorizado. Os pixels também podem conter dados
                    pessoais.
                  </p>
                </li>
                <li>
                  <strong>Pesquisa pública separada</strong>
                  <p>
                    Recebe somente os sinais revisados. A foto e o inventário privado não acompanham
                    a busca.
                  </p>
                </li>
              </ol>
              <div className="small-card">
                <strong>Uma pista não é uma certeza.</strong>
                <p>
                  O dossiê mostra fontes, alternativas e limites. Ele não identifica pessoas nem
                  certifica uma foto como segura.
                </p>
              </div>
            </aside>
          </div>
        ) : (
          <>
            <section className="case-heading">
              <div>
                <p className="eyebrow">CASO {view.caseId.slice(0, 8).toUpperCase()}</p>
                <h2 aria-live="polite">{phaseNames[view.phase]}</h2>
              </div>
              <div className="inline-actions">
                <label className="check compact">
                  <input
                    type="checkbox"
                    checked={auto}
                    onChange={(e) => setAuto(e.target.checked)}
                  />
                  Exploração automática
                </label>
                <button className="secondary" onClick={() => act(poll)} disabled={busy}>
                  Atualizar
                </button>
              </div>
            </section>
            <div className="metrics">
              <div>
                <span>RECORTES</span>
                <strong>
                  {view.budget.crops}
                  <small>/ 3</small>
                </strong>
              </div>
              <div>
                <span>RODADAS WEB</span>
                <strong>
                  {view.budget.rounds}
                  <small>/ 2</small>
                </strong>
              </div>
              <div>
                <span>TEMPO ATIVO</span>
                <strong>
                  {(view.budget.activeMs / 1000).toFixed(1)}
                  <small>s</small>
                </strong>
              </div>
              <div>
                <span>EVIDÊNCIAS</span>
                <strong>{view.analysis.evidence.length}</strong>
              </div>
            </div>
            {view.error && (
              <p className="alert" role="alert">
                {view.error}
              </p>
            )}
            <div className="analysis-grid">
              <section className="panel">
                <div className="panel-heading">
                  <h3>Imagem e observações</h3>
                  <span className="tag">
                    {view.image.width} × {view.image.height}
                  </span>
                </div>
                {preview ? (
                  <div className="photo">
                    <img src={preview} alt="Foto do caso; caixas de regiões para revisão" />
                    {view.analysis.evidence
                      .filter((e) => e.bbox)
                      .map((e) => (
                        <div
                          key={e.id}
                          className="box"
                          style={{
                            left: e.bbox![0] * 100 + '%',
                            top: e.bbox![1] * 100 + '%',
                            width: e.bbox![2] * 100 + '%',
                            height: e.bbox![3] * 100 + '%',
                          }}
                        >
                          <span>{e.id}</span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <label className="field">
                    Selecione novamente o mesmo original para novos recortes
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                )}
                {view.analysis.evidence.map((e) => (
                  <div className="evidence" key={e.id}>
                    <span className="tag">
                      {e.id} · {e.kind}
                    </span>
                    <p>{e.description}</p>
                    <small>{e.limitation}</small>
                  </div>
                ))}
                {['exploring', 'awaiting_search_review'].includes(view.phase) && (
                  <>
                    <div className="inline-actions">
                      {view.analysis.regions
                        .filter((r) =>
                          view.analysis.questions.some(
                            (q) => q.id === r.questionId && q.status === 'open' && q.attempts < 2,
                          ),
                        )
                        .map((r) => (
                          <button
                            className="secondary"
                            key={r.id}
                            disabled={busy || !file || view.budget.crops >= 3}
                            onClick={() => act(() => region(r.id))}
                          >
                            Explorar região {r.id}
                          </button>
                        ))}
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => act(() => advance('finish_visual'))}
                      >
                        Ir para revisão de sementes
                      </button>
                    </div>
                    {view.analysis.regions.map((r) => (
                      <p className="muted" key={r.id}>
                        <strong>
                          {r.id} · {r.questionId}:
                        </strong>{' '}
                        {r.reason} Ganho esperado: {r.expectedGain} Envio: somente o recorte da
                        imagem.
                      </p>
                    ))}
                    <details>
                      <summary>Indicar uma região manualmente</summary>
                      <label className="field">
                        x, y, largura, altura entre 0 e 1
                        <input value={manual} onChange={(e) => setManual(e.target.value)} />
                      </label>
                      <button
                        className="secondary"
                        disabled={
                          busy ||
                          !file ||
                          view.budget.crops >= 3 ||
                          !view.analysis.questions.some(
                            (q) => q.status === 'open' && q.attempts < 2,
                          )
                        }
                        onClick={() => act(() => region())}
                      >
                        Explorar recorte manual
                      </button>
                    </details>
                  </>
                )}
              </section>
              <section className="panel">
                <span className="eyebrow">PERGUNTAS E PROVENIÊNCIA</span>
                <h3>O que vale aprofundar?</h3>
                {view.analysis.questions.map((q) => (
                  <div className="question" key={q.id}>
                    <span className="tag">
                      {q.id} · {q.status}
                    </span>
                    <h4>{q.text}</h4>
                    <p>
                      <strong>Basta saber:</strong> {q.sufficientWhen}
                    </p>
                    <p>
                      <strong>Alternativa:</strong> {q.alternative}
                    </p>
                  </div>
                ))}
                <details open>
                  <summary>Inventário do arquivo</summary>
                  {view.image.metadata.map((m) => (
                    <div className="meta-row" key={m.id}>
                      <strong>{m.field}</strong>
                      <span>{m.state}</span>
                      <p>{m.value}</p>
                    </div>
                  ))}
                </details>
              </section>
            </div>
            {view.phase === 'awaiting_search_review' && (
              <section className="panel search-review">
                <p className="eyebrow">SUA DECISÃO ANTES DA WEB</p>
                <h2>Quais sinais podem ser pesquisados?</h2>
                <p>
                  Selecione apenas termos públicos. Sua decisão vale para até duas rodadas dentro
                  deste escopo; sem confirmação repetida por reformulação.
                </p>
                {view.analysis.seeds.map((s) => (
                  <label className="seed check" key={s.id}>
                    <input
                      type="checkbox"
                      checked={seeds.includes(s.id)}
                      onChange={(e) =>
                        setSeeds((old) =>
                          e.target.checked ? [...old, s.id] : old.filter((id) => id !== s.id),
                        )
                      }
                    />
                    <span>
                      <strong>{s.text}</strong>
                      <small>
                        {s.purpose} · evidências: {s.evidenceIds.join(', ')}
                      </small>
                    </span>
                  </label>
                ))}
                <label className="field">
                  Restringir a domínios públicos, opcional
                  <input
                    placeholder="fabricante.com, evento.org"
                    value={domains}
                    onChange={(e) => setDomains(e.target.value)}
                  />
                </label>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    act(() =>
                      advance('search', {
                        seedIds: seeds,
                        domains: domains
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      }),
                    )
                  }
                >
                  {seeds.length ? 'Autorizar sinais e pesquisar →' : 'Gerar dossiê sem pesquisa →'}
                </button>
              </section>
            )}
            {view.research && (
              <section className="panel">
                <h3>Fontes da pesquisa</h3>
                {view.research.sources.map((s) => (
                  <div className="source" key={s.id}>
                    <span className="tag">
                      {s.id} · semente {s.seedId} · rodada {s.round} · {s.retrievalState}
                    </span>
                    <h4>{s.title}</h4>
                    <p>{s.excerpt}</p>
                    {s.retrievalState !== 'fixture' && safeUrl(s.url) ? (
                      <a href={s.url} target="_blank" rel="noreferrer noopener">
                        Abrir fonte →
                      </a>
                    ) : (
                      <small>{s.url} · fonte fictícia, sem consulta real</small>
                    )}
                    <p className="muted">{s.limitation}</p>
                  </div>
                ))}
                {view.phase === 'research_ready' && (
                  <div className="inline-actions">
                    <button
                      className="primary"
                      onClick={() => act(() => advance('synthesize'))}
                      disabled={busy}
                    >
                      Organizar dossiê →
                    </button>
                    {view.research.followup && (
                      <button
                        className="secondary"
                        onClick={() => act(() => advance('research_more'))}
                        disabled={busy || view.budget.rounds >= 2}
                      >
                        Explorar alternativa pendente
                      </button>
                    )}
                  </div>
                )}
              </section>
            )}
            {reviewed && <ReportPanel report={reviewed} onChange={setReviewed} />}
            <section className="case-controls">
              <p>
                Fechar a página não exclui sessões.{' '}
                {view.cancellation === 'pending' && (
                  <strong>Cancelamento remoto ainda não confirmado.</strong>
                )}
              </p>
              <div className="inline-actions">
                <button
                  className="secondary"
                  disabled={busy || view.phase === 'cancelled'}
                  onClick={() =>
                    act(async () => apply(await request('/api/case/cancel', { method: 'POST' })))
                  }
                >
                  Cancelar exploração
                </button>
                <button className="danger" disabled={busy} onClick={() => act(closeCase)}>
                  Encerrar e excluir sessões
                </button>
              </div>
              <small>
                Baixe o dossiê antes de encerrar. Exclusão confirmada não garante apagamento
                imediato de backups.
              </small>
            </section>
          </>
        )}
        <footer>
          VISUAL OPSEC <span>Observe. Questione. Proteja.</span>
          <a href="https://cartilha.cert.br/fasciculos/" target="_blank" rel="noreferrer">
            Orientações CERT.br →
          </a>
        </footer>
      </main>
    </div>
  );
}

function ReportPanel({ report, onChange }: { report: Report; onChange: (r: Report) => void }) {
  function review(id: string, patch: Partial<Report['findings'][number]>) {
    onChange({
      ...report,
      findings: report.findings.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    });
  }
  return (
    <section className="panel dossier" id="dossier">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">DOCUMENTO DE EXPOSIÇÃO VIRTUAL</p>
          <h2>Seu dossiê, com limites claros.</h2>
        </div>
        <span className="pill">{report.status}</span>
      </div>
      <div className="inline-actions">
        <button className="primary" onClick={() => download(report, 'md')}>
          Baixar Markdown ↓
        </button>
        <button className="secondary" onClick={() => download(report, 'json')}>
          Baixar JSON ↓
        </button>
      </div>
      <h3>1. Identificação e escopo</h3>
      <p>{report.scope.objective}</p>
      <p className="muted">
        Caso {report.caseId.slice(0, 8)} · {new Date(report.generatedAt).toLocaleString('pt-BR')} ·{' '}
        {report.mode === 'demo' ? 'SIMULAÇÃO SEM IA/BUSCA REAL' : 'Agents API'}
      </p>
      <h3>2. Resumo de exposição</h3>
      <p>{report.summary}</p>
      <h3>3. O que a foto mostra</h3>
      {report.visual.map((e) => (
        <p key={e.id}>
          <strong>{e.id}</strong> {e.description} <small>{e.limitation}</small>
        </p>
      ))}
      <h3>4. O que o arquivo registra</h3>
      {report.metadata.map((m) => (
        <p key={m.id}>
          <strong>{m.field}:</strong> {m.value} <span className="tag">{m.state}</span>
        </p>
      ))}
      <h3>5. O que a web acrescentou</h3>
      <p>Estado: {report.research.state}</p>
      {report.research.sources.length ? (
        report.research.sources.map((s) => (
          <p key={s.id}>
            <strong>
              {s.id} · {s.title}:
            </strong>{' '}
            {s.excerpt}{' '}
            <small>
              {s.retrievalState} · {s.url} · {s.limitation}
            </small>
          </p>
        ))
      ) : (
        <p className="muted">
          Nenhuma fonte executada/validada. Isso não demonstra ausência de exposição.
        </p>
      )}
      <h3>6. Achados e correlações</h3>
      {report.findings.map((f) => (
        <article className="finding" key={f.id}>
          <div className="inline-actions">
            <span className="tag status">{labels[f.status]}</span>
            <span className="tag">Revisão: {labels[f.review]}</span>
            <span className="tag">Prioridade {labels[f.priority]}</span>
          </div>
          <h4>{f.title}</h4>
          <p>{f.statement}</p>
          <p>{f.explanation}</p>
          <p>
            <strong>Evidências:</strong> {f.evidenceIds.join(', ')}
          </p>
          <p>
            <strong>Alternativas:</strong> {f.alternatives.join('; ') || 'Nenhuma registrada.'}
          </p>
          <p>
            <strong>Limites:</strong> {f.limitations.join('; ')}
          </p>
          <p>
            <strong>Critério de prioridade:</strong> {f.priorityReason}
          </p>
          <p>
            <strong>Ação recomendada:</strong> {f.recommendation}
          </p>
          <label className="field">
            Revisão do achado {f.id}
            <select
              aria-label={`Revisão do achado ${f.id}`}
              value={f.review}
              onChange={(e) => review(f.id, { review: e.target.value as typeof f.review })}
            >
              {['pending', 'accepted', 'rejected', 'corrected'].map((v) => (
                <option key={v} value={v}>
                  {labels[v]}
                </option>
              ))}
            </select>
          </label>
          {f.review === 'corrected' && (
            <label className="field">
              Correção do autor
              <textarea
                value={f.correction}
                maxLength={2000}
                onChange={(e) => review(f.id, { correction: e.target.value })}
              />
            </label>
          )}
        </article>
      ))}
      <h3>7. Redução de exposição</h3>
      <ul>
        {report.recommendations.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      <p className="muted">
        São recomendações. A aplicação não modificou nem exportou uma nova foto.
      </p>
      <h3>8. Cobertura e limites</h3>
      <p>
        <strong>Por que parou:</strong>{' '}
        {stopNames[report.coverage.stopReason ?? ''] ?? 'Sem motivo confirmado'}
      </p>
      <p>
        <strong>Perguntas pendentes:</strong>{' '}
        {report.coverage.unresolvedQuestions.join('; ') || 'Nenhuma das perguntas selecionadas.'}
      </p>
      <p>
        <strong>Ramos bloqueados:</strong>{' '}
        {report.coverage.blockedBranches.join('; ') || 'Nenhum registrado.'}
      </p>
      <p>
        <strong>Sinais não explorados:</strong>{' '}
        {report.coverage.unexploredSignals.join('; ') ||
          'Nenhum registrado; isso não é garantia de cobertura completa.'}
      </p>
      <p>
        <strong>Uso:</strong> {report.coverage.usageTokens ?? 'indisponível'} tokens · custo
        indisponível · estado remoto: {report.coverage.remoteStatus}
      </p>
      <ul>
        {report.coverage.limitations.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      <details>
        <summary>Como continuar sua autoavaliação</summary>
        <p>Estes caminhos são manuais e não foram consultados automaticamente.</p>
        <ul>
          <li>
            <a
              href="https://support.google.com/websearch/answer/12719076?hl=pt-BR"
              target="_blank"
              rel="noreferrer"
            >
              Google: informações pessoais nos resultados
            </a>
          </li>
          <li>
            <a href="https://haveibeenpwned.com/" target="_blank" rel="noreferrer">
              Have I Been Pwned: verificação pelo próprio titular
            </a>
          </li>
        </ul>
      </details>
    </section>
  );
}
