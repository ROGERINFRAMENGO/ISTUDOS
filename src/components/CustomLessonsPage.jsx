// ============================================================
// FASE D — MINHAS AULAS
// ============================================================
//
// Duas coisas na mesma tela:
//   1. o formulario ("crie uma aula personalizada");
//   2. a biblioteca ("minhas aulas"), que vem do Supabase.
//
// Nao ha renderer duplicado: o estudo e o quiz usam o LessonPage
// que ja existe, com as mesmas props das aulas do cronograma.
//
// Isolamento do curriculo oficial: nada nesta tela escreve em
// completedLessonIds, XP, streak ou no contador de questoes. Abrir
// uma aula personalizada nao marca progresso, e isso e o esperado —
// a aluna pediu um tema extra, nao cumpriu item do cronograma.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import {
  createCustomLesson,
  listCustomLessons,
  deleteCustomLesson,
  CUSTOM_REQUEST_MAX,
} from '../services/ai.js';

const MATERIAS = ['', 'Matemática', 'Português', 'Ciências', 'História', 'Geografia', 'Inglês', 'Física', 'Química', 'Biologia'];
const NIVEIS = ['', 'Fundamentar II', 'Ensino Médio', 'Revisão de prova'];
const DIFICULDADES = ['', 'Fácil', 'Médio', 'Difícil'];
const ESTILOS = ['', 'Explicação devagar, passo a passo', 'Mais exemplos práticos', 'Com imagens e analogias', 'Direto ao ponto'];

function dataCurta(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function CustomLessonsPage({ onOpenLesson, onBack }) {
  const [request, setRequest] = useState('');
  const [subject, setSubject] = useState('');
  const [level, setLevel] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [style, setStyle] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lessons, setLessons] = useState([]);
  const [listando, setListando] = useState(true);
  const [excluindo, setExcluindo] = useState('');
  const [confirmando, setConfirmando] = useState('');

  const carregar = useCallback(async () => {
    setListando(true);
    const rows = await listCustomLessons();
    setLessons(rows);
    setListando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const tamanho = request.trim().length;
  const estourou = tamanho > CUSTOM_REQUEST_MAX;
  const podeGerar = !loading && !estourou && tamanho >= 10;

  async function gerar(event) {
    event.preventDefault();
    // Trava contra clique repetido: sem isso, dois toques disparam
    // duas geracoes e gastam cota duas vezes.
    if (loading) return;
    if (estourou) { setError(`Seu pedido tem ${tamanho} caracteres e o limite e ${CUSTOM_REQUEST_MAX}.`); return; }
    if (tamanho < 10) { setError('Escreva um pouco mais sobre o que quer aprender.'); return; }

    setError('');
    setLoading(true);
    try {
      const { lesson, id } = await createCustomLesson({ request, subject, level, difficulty, style });
      // O texto NAO e limpo: se ela quiser ajustar e gerar outra vez,
      // nao perde o pedido.
      setRequest('');
      await carregar();
      onOpenLesson?.({ lesson, lessonId: id });
    } catch (e) {
      setError(e?.message ?? 'Nao consegui gerar sua aula agora.');
    } finally {
      setLoading(false);
    }
  }

  async function excluir(id) {
    if (excluindo) return;
    setExcluindo(id);
    setError('');
    try {
      await deleteCustomLesson(id);
      await carregar();
    } catch (e) {
      setError(e?.message ?? 'Nao consegui excluir essa aula.');
    } finally {
      setExcluindo('');
      setConfirmando('');
    }
  }

  return (
    <div className="custom-page">
      <div className="custom-head">
        <button type="button" className="ghost-button" onClick={onBack}>Voltar</button>
        <h2>Minhas aulas</h2>
        <p className="custom-sub">
          Escreva o que voce quer aprender do seu jeito. A IA monta a aula, os exemplos, os exercicios e o quiz.
          Nada aqui conta como materia do cronograma nem muda seu progresso.
        </p>
      </div>

      <form className="custom-form" onSubmit={gerar}>
        <label htmlFor="custom-request">O que voce quer aprender?</label>
        <textarea
          id="custom-request"
          value={request}
          onChange={(e) => { setRequest(e.target.value.slice(0, CUSTOM_REQUEST_MAX + 400)); if (error) setError(''); }}
          placeholder={'Exemplo: Quero aprender equacoes do primeiro grau do zero. Tenho muita dificuldade com matematica, entao explica devagar, mostra as contas passo a passo e termina com exercicios faceis antes de aumentar a dificuldade.'}
          rows={6}
          maxLength={CUSTOM_REQUEST_MAX + 400}
        />
        <div className={`custom-counter ${estourou ? 'over' : ''}`}>
          {tamanho} / {CUSTOM_REQUEST_MAX} caracteres
          {estourou && ' - encurte para gerar'}
        </div>

        <details className="custom-opcionais">
          <summary>Preferencias (opcional)</summary>
          <div className="custom-grid">
            <label>
              Materia
              <select value={subject} onChange={(e) => setSubject(e.target.value)}>
                {MATERIAS.map((m) => <option key={m} value={m}>{m || 'Deixa a IA escolher'}</option>)}
              </select>
            </label>
            <label>
              Nivel
              <select value={level} onChange={(e) => setLevel(e.target.value)}>
                {NIVEIS.map((n) => <option key={n} value={n}>{n || 'Deixa a IA decidir'}</option>)}
              </select>
            </label>
            <label>
              Dificuldade
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                {DIFICULDADES.map((d) => <option key={d} value={d}>{d || 'Deixa a IA decidir'}</option>)}
              </select>
            </label>
            <label>
              Como prefere aprender
              <select value={style} onChange={(e) => setStyle(e.target.value)}>
                {ESTILOS.map((s) => <option key={s} value={s}>{s || 'Deixa a IA escolher'}</option>)}
              </select>
            </label>
          </div>
          <p className="custom-hint">Tudo aqui e opcional: se voce ja escreveu no pedido, a IA usa o que voce disse.</p>
        </details>

        {error && <p className="custom-error" role="alert">{error}</p>}

        <button type="submit" className="primary-button" disabled={!podeGerar}>
          {loading ? 'Montando sua aula com IA...' : 'Criar aula personalizada'}
        </button>
        {loading && <p className="custom-loading">Isso costuma levar de 20 a 60 segundos. Nao feche a pagina.</p>}
      </form>

      <section className="custom-library">
        <h3>Suas aulas</h3>
        {listando && <p className="custom-hint">Carregando...</p>}
        {!listando && lessons.length === 0 && (
          <p className="custom-hint">Voce ainda nao criou nenhuma aula. Escreva um pedido acima para comecar.</p>
        )}
        <ul className="custom-list">
          {lessons.map((row) => {
            const aula = row.lesson_data ?? {};
            const titulo = aula.title || row.topic || 'Aula personalizada';
            const pedido = String(row.custom_prompt ?? '');
            return (
              <li key={row.id} className="custom-item">
                <div className="custom-item-info">
                  <strong>{titulo}</strong>
                  <span className="custom-item-meta">
                    {[row.custom_subject || row.subject, dataCurta(row.created_at)].filter(Boolean).join(' - ')}
                  </span>
                  {pedido && <span className="custom-item-prompt">{pedido.slice(0, 110)}{pedido.length > 110 ? '...' : ''}</span>}
                </div>
                <div className="custom-item-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => onOpenLesson?.({ lesson: aula, lessonId: row.id })}
                  >
                    Abrir
                  </button>
                  {confirmando === row.id ? (
                    <>
                      <button type="button" className="danger-button" onClick={() => excluir(row.id)} disabled={excluindo === row.id}>
                        {excluindo === row.id ? 'Excluindo...' : 'Confirmar exclusao'}
                      </button>
                      <button type="button" className="ghost-button" onClick={() => setConfirmando('')}>Cancelar</button>
                    </>
                  ) : (
                    <button type="button" className="ghost-button" onClick={() => setConfirmando(row.id)}>Excluir</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}