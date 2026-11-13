'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppError,
  IDENTITY_LIMITS,
  isIdentitySeed,
  type CaseView,
  type PendingCaseView,
  type Diagnostic,
  type Report,
} from '@/lib/contracts';
import { preflightImage } from '@/lib/upload';
import { minimizeReport, reportMarkdown } from '@/lib/report';
import { safeUrl } from '@/lib/policy';
import {
  breadthLabels,
  categoryLabels,
  dataClassLabels,
  parseIdentityForm,
  relationLabels,
} from '@/lib/identity';

const AUTONOMOUS_SEARCH_SECONDS = 5;
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
      { code: data.error?.code, diagnostic: data.diagnostic },
    );
  return data;
}
function uploadCase(
  form: FormData,
  requestId: string,
  onProgress: (text: string) => void,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const started = Date.now();
    xhr.open('POST', '/api/cases');
    xhr.setRequestHeader('x-opsec-request-id', requestId);
    xhr.timeout = 60_000;
    const failure = (message: string) =>
      reject(
        Object.assign(new Error(message), {
          diagnostic: {
            requestId,
            stage: 'upload_or_server',
            elapsedMs: Date.now() - started,
            providerInvoked: null,
            code: 'CONNECTION_UNCONFIRMED',
          },
        }),
      );
    xhr.upload.onprogress = (event) =>
      onProgress(
        event.lengthComputable
          ? `Enviando foto: ${Math.round((event.loaded * 100) / event.total)}%`
          : 'Enviando foto…',
      );
    xhr.upload.onload = () =>
      onProgress('Envio concluído. Aguardando validação, metadados e preparação no servidor…');
    xhr.onerror = () => failure('A conexão falhou. Consulte o estado antes de reenviar a foto.');
    xhr.ontimeout = () =>
      failure('O servidor não confirmou o envio no prazo. Consulte o estado antes de reenviar.');
    xhr.onload = () => {
      let data;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = {};
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        const diagnostic = data.diagnostic ?? {
          requestId,
          stage: 'upload_or_server',
          elapsedMs: Date.now() - started,
          providerInvoked: xhr.status === 413 ? false : null,
          code: `HTTP_${xhr.status}`,
        };
        reject(
          Object.assign(
            new Error(
              data.error?.message ??
                (xhr.status === 413
                  ? 'O servidor recusou o tamanho do envio. Use uma foto de até 3 MiB.'
                  : 'O envio não foi confirmado. Copie o diagnóstico.'),
            ),
            { code: data.error?.code, diagnostic },
          ),
        );
      } else resolve(data);
    };
    xhr.send(form);
  });
}
function download(report: Report, format: 'json' | 'md') {
  const safeReport = minimizeReport(report);
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
  const [pendingCase, setPendingCase] = useState<{ phase: string } | null>(null);
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
  const [uploadStage, setUploadStage] = useState(''),
    [elapsed, setElapsed] = useState(0),
    [agentEvent, setAgentEvent] = useState('');
  const [config, setConfig] = useState<{ mode: string; available: boolean } | null>(null);
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(''),
    [context, setContext] = useState(''),
    [consent, setConsent] = useState(false);
  const [identityName, setIdentityName] = useState(''),
    [identityProfession, setIdentityProfession] = useState(''),
    [identityActivities, setIdentityActivities] = useState(''),
    [identityRelation, setIdentityRelation] = useState<'self' | 'authorized'>('self'),
    [identityConsent, setIdentityConsent] = useState(false);
  const identityDeclared = identityName.trim().length > 0;
  const authorized = consent && identityConsent;
  const [view, setView] = useState<CaseView | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [seeds, setSeeds] = useState<string[]>([]),
    [domains, setDomains] = useState(''),
    [auto, setAuto] = useState(true),
    [manual, setManual] = useState('0.1, 0.1, 0.6, 0.3');
  // With a face present and both authorizations granted, the search starts on
  // its own after a short countdown; the author can hold it to review first.
  const [holdSearch, setHoldSearch] = useState(false),
    [countdown, setCountdown] = useState(0);
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
      setDiagnostic((e as { diagnostic?: Diagnostic }).diagnostic ?? null);
      setAuto(false);
    } finally {
      setUploadStage('');
      setBusy(false);
      inFlight.current = false;
    }
  }, []);
  const apply = useCallback((v: CaseView | PendingCaseView) => {
    if ('pending' in v) {
      setPendingCase({ phase: v.phase });
      if (v.diagnostic) setDiagnostic(v.diagnostic);
      return;
    }
    setPendingCase(null);
    setView(v);
    if (v.diagnostic) setDiagnostic(v.diagnostic);
    if (v.caseId !== selectedCase.current) {
      selectedCase.current = v.caseId;
      setHoldSearch(false);
      setSeeds(v.analysis.seeds.filter((s) => !isIdentitySeed(s)).map((s) => s.id));
    } else {
      const available = new Set(
        v.analysis.seeds.filter((s) => !isIdentitySeed(s)).map((s) => s.id),
      );
      setSeeds((selected) => selected.filter((id) => available.has(id)));
    }
    if (v.report && reviewedKey.current !== v.caseId + v.phase) {
      setReviewed(v.report);
      reviewedKey.current = v.caseId + v.phase;
    }
  }, []);
  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(timer);
  }, [busy]);
  useEffect(() => {
    if (
      (!view && !pendingCase) ||
      closed ||
      (view?.mode ?? config?.mode) !== 'openai' ||
      !['analyzing', 'researching', 'synthesizing'].includes(
        pendingCase?.phase ?? view?.phase ?? '',
      )
    )
      return;
    const observer = new EventSource('/api/case/events');
    observer.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        const labels: Record<string, string> = {
          'agent.session.turn.created': 'Turno criado',
          'agent.session.turn.in_progress': 'Agente em execução',
          'agent.session.turn.item.added': 'Nova atividade registrada pelo agente',
          'agent.session.turn.completed': 'Turno concluído; recuperando resultado',
          'agent.session.turn.failed': 'O agente relatou falha; recuperando diagnóstico',
          'agent.session.idle': 'Sessão aguardando próxima etapa',
          observer_unavailable: 'Eventos indisponíveis; acompanhamento por consultas continua',
        };
        setAgentEvent(labels[event.type] ?? 'Atualização recebida do agente');
      } catch {
        /* Only server-filtered lifecycle events are displayed. */
      }
    };
    observer.onerror = () =>
      setAgentEvent('Reconectando eventos; acompanhamento por consultas continua.');
    return () => {
      observer.close();
      setAgentEvent('');
    };
  }, [view?.caseId, view?.phase, view?.mode, pendingCase?.phase, config?.mode, closed]);
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
      (!view && !pendingCase) ||
      closed ||
      (!pendingCase &&
        !['analyzing', 'researching', 'synthesizing', 'uncertain'].includes(view!.phase))
    )
      return;
    const timer = setTimeout(
      () => {
        if (!inFlight.current)
          poll().catch((e) => {
            setError(e.message);
            setDiagnostic(e.diagnostic ?? null);
            setPendingCase(null);
          });
      },
      (view?.mode ?? config?.mode) === 'openai' ? 2500 : 1200,
    );
    return () => clearTimeout(timer);
  }, [view, pendingCase, config?.mode, closed, busy, poll]);
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
  const facesVisible = view?.analysis.subjects?.facesVisible ?? 0;
  const autonomousSearch =
    !!view &&
    auto &&
    !holdSearch &&
    !closed &&
    view.phase === 'awaiting_search_review' &&
    !!view.identity &&
    facesVisible > 0;
  const search = useCallback(
    () =>
      advance('search', {
        seedIds: seeds,
        domains: domains
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    [advance, seeds, domains],
  );
  useEffect(() => {
    if (!autonomousSearch || busy) {
      setCountdown(0);
      return;
    }
    // Editing the selection or domains restarts the countdown.
    let left = AUTONOMOUS_SEARCH_SECONDS;
    setCountdown(left);
    const timer = setInterval(() => {
      left -= 1;
      setCountdown(left);
      if (left <= 0) {
        clearInterval(timer);
        void act(search);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [autonomousSearch, busy, act, search]);
  async function start() {
    if (!file) throw new Error('Selecione uma foto.');
    const requestId = crypto.randomUUID();
    const started = Date.now();
    setUploadStage('Validando tamanho, formato e dimensões no dispositivo…');
    setDiagnostic(null);
    try {
      await preflightImage(file);
    } catch (e) {
      const error =
        e instanceof AppError
          ? e
          : new AppError('IMAGE_READ', 'Não foi possível ler a foto no dispositivo.');
      throw Object.assign(error, {
        diagnostic: {
          requestId,
          stage: 'client_validation',
          elapsedMs: Date.now() - started,
          providerInvoked: false,
          code: error.code,
          ...error.details,
        },
      });
    }
    const form = new FormData();
    form.set('image', file);
    form.set('context', context);
    form.set('consent', consent ? 'yes' : 'no');
    const fields = {
      name: identityName,
      profession: identityProfession,
      activities: identityActivities,
      relation: identityRelation,
      consent: identityConsent ? 'yes' : 'no',
    };
    // Same validation as the server, before any upload.
    parseIdentityForm(fields, new Date().toISOString());
    form.set('identityName', fields.name);
    form.set('identityProfession', fields.profession);
    form.set('identityActivities', fields.activities);
    form.set('identityRelation', fields.relation);
    form.set('identityConsent', fields.consent);
    setUploadStage('Enviando foto…');
    await uploadCase(form, requestId, setUploadStage);
    setPendingCase({ phase: 'analyzing' });
    setUploadStage('Sessão aceita. Aguardando os registros iniciais do agente…');
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
      setPendingCase(null);
      setView(null);
      setReviewed(null);
      setRecovery(false);
      setConsent(false);
      setIdentityConsent(false);
      selectedCase.current = '';
    }
  }
  const progressPhase = pendingCase?.phase ?? view?.phase;
  const currentStep =
    !progressPhase || closed
      ? 0
      : ['analyzing', 'exploring'].includes(progressPhase)
        ? 1
        : progressPhase === 'awaiting_search_review'
          ? 2
          : ['researching', 'research_ready'].includes(progressPhase)
            ? 3
            : 4;
  const steps = [
    'Foto, identidade e autorizações',
    'Observar e explorar',
    'Revisar sinais públicos',
    'Pesquisar contexto e identidade',
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
            Descubra o que uma foto e a identidade de quem aparece nela revelam juntas na internet:
            o ambiente observável, o que fontes públicas associam ao nome e o que continua sendo
            hipótese.
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
        {uploadStage && (
          <div className="notice" role="status" aria-live="polite">
            {uploadStage} · {elapsed}s
          </div>
        )}
        {pendingCase && !uploadStage && (
          <div className="notice" role="status" aria-live="polite">
            Sessão aceita. Aguardando registros iniciais do agente; acompanhamento automático ativo.
            {agentEvent && <span> {agentEvent}.</span>}
            <button className="text-button" onClick={() => act(closeCase)} disabled={busy}>
              Encerrar e excluir sessão pendente
            </button>
          </div>
        )}
        {view?.verificationPending && (
          <div className="notice" role="status">
            As fontes citadas aguardam verificação. O agente pode usar a rodada autorizada restante
            para conferir os endereços antes de incluir os achados no dossiê.
          </div>
        )}
        {view?.diagnostic?.code === 'UNVERIFIED_SOURCE' &&
          !view.verificationPending &&
          !!view.research?.sources.length && (
            <div className="notice" role="status">
              Citações sem comprovação e os achados dependentes foram descartados. A síntese
              preserva somente fontes verificadas e registra a cobertura parcial.
            </div>
          )}
        {diagnostic && (
          <details className="panel">
            <summary>Diagnóstico técnico · {diagnostic.requestId.slice(0, 8)}</summary>
            <p>
              Etapa: {diagnostic.stage} · {diagnostic.elapsedMs}ms · Provedor:{' '}
              {diagnostic.providerInvoked === null
                ? 'estado não confirmado'
                : diagnostic.providerInvoked
                  ? 'chamado'
                  : 'não chamado'}
            </p>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {JSON.stringify(diagnostic, null, 2)}
            </pre>
            <button
              className="secondary"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(diagnostic, null, 2)], { type: 'application/json' }),
                );
                const a = document.createElement('a');
                a.href = url;
                a.download = `diagnostico-${diagnostic.requestId}.json`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              Baixar diagnóstico
            </button>
          </details>
        )}
        {pendingCase && !view ? null : !view || closed ? (
          <div className="entry-grid">
            <section className="panel upload-panel">
              <div className="panel-heading">
                <span className="eyebrow">01 / PONTO DE PARTIDA</span>
                <span className="muted">JPEG ou PNG · até 3 MiB · 16 MP</span>
              </div>
              <h2>Comece com uma foto e quem aparece nela</h2>
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
              <fieldset className="identity-fieldset">
                <legend>Quem aparece na foto</legend>
                <p className="muted">
                  A análise mede quanto foto e identidade revelam juntas. Use somente a sua
                  identidade ou a de alguém que autorizou expressamente. Nada é identificado pelo
                  rosto: a busca parte apenas do que você declarar.
                </p>
                <fieldset className="radio-row">
                  <legend className="sr-only">De quem é a identidade</legend>
                  <label className="check compact">
                    <input
                      type="radio"
                      name="identity-relation"
                      value="self"
                      checked={identityRelation === 'self'}
                      onChange={() => setIdentityRelation('self')}
                    />
                    Sou eu
                  </label>
                  <label className="check compact">
                    <input
                      type="radio"
                      name="identity-relation"
                      value="authorized"
                      checked={identityRelation === 'authorized'}
                      onChange={() => setIdentityRelation('authorized')}
                    />
                    Pessoa que me autorizou
                  </label>
                </fieldset>
                <label className="field">
                  Nome usado publicamente
                  <input
                    required
                    maxLength={IDENTITY_LIMITS.name}
                    autoComplete="off"
                    placeholder="Ex.: Ana Exemplo"
                    value={identityName}
                    onChange={(e) => setIdentityName(e.target.value)}
                  />
                </label>
                <label className="field">
                  Profissão
                  <input
                    maxLength={IDENTITY_LIMITS.qualifier}
                    autoComplete="off"
                    placeholder="Ex.: professora de física"
                    value={identityProfession}
                    onChange={(e) => setIdentityProfession(e.target.value)}
                  />
                </label>
                <label className="field">
                  Atividades, até {IDENTITY_LIMITS.activities}, uma por linha
                  <textarea
                    maxLength={IDENTITY_LIMITS.activities * (IDENTITY_LIMITS.qualifier + 1)}
                    placeholder={'Ex.: palestrante em eventos de tecnologia\ncorrida de rua'}
                    value={identityActivities}
                    onChange={(e) => setIdentityActivities(e.target.value)}
                  />
                </label>
              </fieldset>
              <fieldset className="authorizations">
                <legend>Autorizações do caso</legend>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    <strong>Ambiente.</strong> Esta foto é própria ou autorizada. Autorizo analisar
                    a imagem, o ambiente e os metadados do arquivo, com envio de uma derivada à
                    OpenAI, e pesquisar sinais públicos do ambiente (eventos, organizações, locais,
                    produtos) sem enviar a foto, conforme o processamento descrito ao lado.
                  </span>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={identityConsent}
                    onChange={(e) => setIdentityConsent(e.target.checked)}
                  />
                  <span>
                    <strong>Identificação.</strong> A identidade informada é minha ou de quem
                    autorizou expressamente esta pesquisa educativa. Autorizo pesquisar nome,
                    profissão e atividades em fontes públicas (LinkedIn, redes sociais, Escavador e
                    Jusbrasil), sem enviar a foto, e cruzá-los com os sinais públicos da imagem. Com
                    rosto presente, a busca segue de forma autônoma e cobre só esta pessoa, nunca
                    familiares ou colegas.
                  </span>
                </label>
              </fieldset>
              <button
                className="primary"
                onClick={() => act(start)}
                disabled={
                  recovery ||
                  !!pendingCase ||
                  !file ||
                  !identityDeclared ||
                  !authorized ||
                  busy ||
                  !config?.available
                }
              >
                {busy
                  ? 'Preparando o caso…'
                  : config?.mode === 'demo'
                    ? 'Iniciar simulação →'
                    : 'Analisar exposição →'}
              </button>
              <p className="muted">
                O dossiê inclui textos legíveis e valores de GPS, autoria e data presentes no
                arquivo, com suas limitações. Revise esses dados antes de compartilhar.
              </p>
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
                    Recebe somente os sinais selecionados, automaticamente quando há rosto na foto.
                    A foto e o inventário privado não acompanham a busca.
                  </p>
                </li>
                <li>
                  <strong>Identidade declarada</strong>
                  <p>
                    Nome, profissão e atividades viram buscas em LinkedIn, redes sociais, Escavador
                    e Jusbrasil, sem a foto. Só a pessoa autorizada; buscadores de pessoas, busca
                    facial e vazamentos ficam fora.
                  </p>
                </li>
              </ol>
              <div className="small-card">
                <strong>Uma pista não é uma certeza.</strong>
                <p>
                  O dossiê mostra fontes, alternativas e limites. Ele não identifica pessoas pelo
                  rosto nem certifica uma foto como segura; a identidade vem da sua declaração e das
                  duas autorizações do caso.
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
            {(agentEvent || view.execution) && (
              <div className="notice" role="status" aria-live="polite">
                {agentEvent || 'Estado confirmado pelo servidor'}
                {view.execution && (
                  <span>
                    {' '}
                    · Sessão: {view.execution.sessionStatus} · Turno: {view.execution.turnStatus} ·
                    Chamadas web: {view.execution.toolCalls}
                  </span>
                )}
              </div>
            )}
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
            {view.identity && (
              <section className="panel identity-card" aria-labelledby="identity-heading">
                <p className="eyebrow">
                  IDENTIDADE AUTORIZADA · {relationLabels[view.identity.relation].toUpperCase()}
                </p>
                <h3 id="identity-heading">{view.identity.name}</h3>
                <p>
                  {[view.identity.profession, ...view.identity.activities]
                    .filter(Boolean)
                    .join(' · ') || 'Sem profissão ou atividades declaradas.'}
                </p>
                <p className="muted">
                  Declarada por você, não reconhecida pelo rosto. A pesquisa mede o que fontes
                  públicas associam a este nome
                  {view.research
                    ? `: ${view.research.sources.filter((s) => s.exposure?.match === 'declared_identity').length} fonte(s) atribuída(s) até agora.`
                    : '.'}
                </p>
                {view.analysis.subjects && (
                  <p className="muted">
                    Rostos visíveis: {view.analysis.subjects.facesVisible}. Só a pessoa autorizada é
                    pesquisada; outras pessoas da foto, familiares e colegas ficam fora.
                  </p>
                )}
              </section>
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
                    {e.verbatimText && (
                      <p>
                        <strong>Texto legível fornecido:</strong> {e.verbatimText}. Leitura do
                        modelo; não confirma identidade.
                      </p>
                    )}
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
                      {m.providedValue && (
                        <p>
                          <strong>Valor no arquivo:</strong> {m.providedValue}
                        </p>
                      )}
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
                {autonomousSearch && countdown > 0 && (
                  <div className="notice autonomous" role="status" aria-live="polite">
                    Rosto presente e autorizações concedidas: a pesquisa começa automaticamente em{' '}
                    {countdown}s com os sinais marcados e a identidade autorizada.{' '}
                    <button className="text-button" onClick={() => setHoldSearch(true)}>
                      Revisar antes de pesquisar
                    </button>
                  </div>
                )}
                {view.identity && holdSearch && (
                  <p className="muted">Busca autônoma pausada. Revise e pesquise quando quiser.</p>
                )}
                {view.identity && view.analysis.subjects && facesVisible === 0 && (
                  <p className="muted">
                    Nenhum rosto visível na foto: a pesquisa aguarda a sua revisão.
                  </p>
                )}
                {view.identity && <h3 className="seed-group">Sinais públicos da foto</h3>}
                {view.identity && !view.analysis.seeds.some((s) => !isIdentitySeed(s)) && (
                  <p className="muted">A análise não propôs sinais públicos da foto.</p>
                )}
                {view.analysis.seeds
                  .filter((s) => !isIdentitySeed(s))
                  .map((s) => (
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
                {view.identity && (
                  <>
                    <h3 className="seed-group">Identidade autorizada</h3>
                    <p>
                      Incluídas pela autorização de identificação dada ao abrir o caso. Partem do
                      nome declarado, combinado à profissão e às atividades, e cruzam a identidade
                      com os sinais da foto selecionados acima: mostram o que um desconhecido
                      encontraria com a foto e o nome. Incluem LinkedIn, redes sociais, Escavador e
                      Jusbrasil. Somente esta pessoa: familiares, colegas e outras pessoas da foto
                      ficam fora, assim como buscadores de pessoas, busca facial, vazamentos, número
                      de processo, endereço, telefone pessoal e rotina.
                    </p>
                    <ul className="seed-list" aria-label="Buscas da identidade autorizada">
                      {view.analysis.seeds.filter(isIdentitySeed).map((s) => (
                        <li className="seed identity" key={s.id}>
                          <strong>{s.text}</strong>
                          <small>
                            {s.classification === 'declared_identity'
                              ? 'Nome e profissão declarados'
                              : 'Nome e atividade declarados'}{' '}
                            · evidências: {s.evidenceIds.join(', ')} · incluída pela autorização
                          </small>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <label className="field">
                  Restringir a domínios públicos, opcional
                  <input
                    placeholder="fabricante.com, evento.org"
                    value={domains}
                    onChange={(e) => setDomains(e.target.value)}
                  />
                </label>
                <button className="primary" disabled={busy} onClick={() => act(search)}>
                  {seeds.length || view.identity
                    ? 'Autorizar sinais e pesquisar →'
                    : 'Gerar dossiê sem pesquisa →'}
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
                    {s.exposure && (
                      <p className="muted">
                        <span className="tag exposure">
                          {categoryLabels[s.exposure.category]} ·{' '}
                          {s.exposure.match === 'declared_identity'
                            ? 'atribuída à identidade'
                            : 'possível homônimo'}
                        </span>{' '}
                        Dados visíveis:{' '}
                        {s.exposure.dataClasses.map((d) => dataClassLabels[d]).join(', ') ||
                          'não registrados'}
                      </p>
                    )}
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
      {report.scope.facesVisible !== null && (
        <p className="muted">
          Rostos visíveis: {report.scope.facesVisible}. Somente a pessoa autorizada é pesquisada;
          nenhum rosto é usado para identificar.
        </p>
      )}
      <h3>2. Resumo de exposição</h3>
      <p>{report.summary}</p>
      {report.scope.identity && report.identity.state === 'executed' && (
        <p className="identity-callout">
          Partindo da foto e da identidade autorizada de{' '}
          <strong>{report.scope.identity.name}</strong>, a busca limitada encontrou{' '}
          {report.identity.attributedSources.length} fonte(s) atribuída(s) em{' '}
          {report.identity.categories.length} categoria(s). Amplitude observada:{' '}
          <strong>{breadthLabels[report.identity.breadth]}</strong>. Detalhes na seção 5.1.
        </p>
      )}
      <p className="muted">
        Este documento inclui valores presentes na foto e no arquivo. Revise antes de compartilhar.
        Nomes transcritos não identificam pessoas pelo rosto; GPS e datas não comprovam localização
        atual ou rotina.
      </p>
      <h3>3. O que a foto mostra</h3>
      {report.visual.map((e) => (
        <div key={e.id}>
          <p>
            <strong>{e.id}</strong> {e.description} <small>{e.limitation}</small>
          </p>
          {e.verbatimText && (
            <p>
              <strong>Texto legível fornecido:</strong> {e.verbatimText}. Leitura do modelo; não
              confirma identidade.
            </p>
          )}
        </div>
      ))}
      <h3>4. O que o arquivo registra</h3>
      {report.metadata.map((m) => (
        <p key={m.id}>
          <strong>{m.field}:</strong> {m.value} <span className="tag">{m.state}</span>
          {m.providedValue && (
            <>
              <br />
              <strong>Valor no arquivo:</strong> {m.providedValue}
            </>
          )}
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
      <IdentitySection report={report} />
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
          <li>
            Escavador, Jusbrasil e outros agregadores: confira os canais de remoção ou desindexação
            de cada serviço. Buscadores de pessoas além desses não são consultados pela aplicação.
          </li>
        </ul>
      </details>
    </section>
  );
}

function IdentitySection({ report }: { report: Report }) {
  const identity = report.scope.identity;
  const x = report.identity;
  const seedText = (id: string) => report.research.seeds.find((s) => s.id === id)?.text ?? id;
  const traced = report.research.sources.filter((s) => s.exposure);
  return (
    <>
      <h4 className="subsection">5.1 Exposição da identidade autorizada</h4>
      {!identity ? (
        <p className="muted">{x.breadthReason}</p>
      ) : (
        <>
          <p>
            <strong>{identity.name}</strong> ({relationLabels[identity.relation]})
            {identity.profession && ` · ${identity.profession}`}
            {identity.activities.length > 0 && ` · ${identity.activities.join('; ')}`}. Declarada
            pelo autor; não identificada pelo rosto. Estado: {x.state}.
          </p>
          <div className={'breadth breadth-' + x.breadth}>
            <span>AMPLITUDE OBSERVADA</span>
            <strong>{breadthLabels[x.breadth]}</strong>
          </div>
          <p>{x.breadthReason}</p>
          {x.categories.length > 0 && (
            <>
              <p>
                <strong>Onde a identidade aparece</strong>
              </p>
              <ul className="chips" aria-label="Categorias de exposição">
                {x.categories.map((c) => (
                  <li key={c.category}>
                    {categoryLabels[c.category]} · {c.sourceIds.join(', ')}
                  </li>
                ))}
              </ul>
            </>
          )}
          {x.dataClasses.length > 0 && (
            <>
              <p>
                <strong>Dados alcançáveis a partir da foto e da identidade</strong>
              </p>
              <ul className="chips" aria-label="Classes de dados expostos">
                {x.dataClasses.map((d) => (
                  <li key={d.dataClass}>
                    {dataClassLabels[d.dataClass]} · {d.sourceIds.join(', ')}
                  </li>
                ))}
              </ul>
            </>
          )}
          {traced.length > 0 && (
            <>
              <p>
                <strong>Do ponto de partida aos dados</strong>
              </p>
              <ol className="trail">
                {traced.map((s) => (
                  <li key={s.id}>
                    <span className="tag">{s.id}</span> {seedText(s.seedId)}
                    <span className="arrow" aria-hidden="true">
                      →
                    </span>
                    {s.title}
                    <span className="arrow" aria-hidden="true">
                      →
                    </span>
                    {s.exposure!.dataClasses.map((d) => dataClassLabels[d]).join(', ') ||
                      'sem classes registradas'}
                    {s.exposure!.match === 'possible_homonym' && (
                      <small>Possível homônimo; fora da contagem.</small>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
          <ul>
            {x.limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
