'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, ArrowRight, AudioLines, BookOpen, Check, CheckCircle2, ChevronRight, Clock3,
  ExternalLink, Headphones, Languages, ListChecks, Mic2, PenLine, RotateCcw, Sparkles,
  Target, type LucideIcon,
} from 'lucide-react';
import styles from './EnglishAcademy.module.css';
import { ENGLISH_SKILLS, type EnglishSkillId } from '@/lib/english/english-content';
import {
  ENGLISH_CURRICULUM, getDailyFocus, getStageLabel, getWeeklyChallenge,
  type EnglishActivity, type EnglishCurriculumLesson,
} from '@/lib/english/english-curriculum';
import { getIsoWeekKey, getLocalDayKey, type VocabularyGrade } from '@/lib/english/english-progress';
import { useEnglishProgress } from './useEnglishProgress';

const skillIcons: Record<EnglishSkillId, LucideIcon> = {
  listening: Headphones, speaking: Mic2, reading: BookOpen, writing: PenLine, vocabulary: Languages, grammar: ListChecks,
};

function useLocalDate() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    let timeout = 0;
    let active = true;
    const updateAtMidnight = () => {
      if (!active) return;
      const current = new Date();
      setNow(current);
      const next = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1, 0, 0, 1);
      timeout = window.setTimeout(updateAtMidnight, Math.max(1000, next.getTime() - current.getTime()));
    };
    updateAtMidnight();
    return () => { active = false; window.clearTimeout(timeout); };
  }, []);
  return now;
}

function persistenceMessage(state: ReturnType<typeof useEnglishProgress>['persistenceState']) {
  if (state === 'migrated') return 'Your V1 section and vocabulary records were carried into this browser’s new format. The original V1 record is preserved.';
  if (state === 'invalid') return 'Saved English Academy data has an unsupported or damaged format. It has not been overwritten.';
  if (state === 'unavailable') return 'This browser could not confirm a safe save. Activities work for this visit, but changes may not persist.';
  return 'Progress is stored in this browser only. It is separate from Supabase and Hunter XP.';
}

function dueVocabularyCount(now: Date | null, reviews: ReturnType<typeof useEnglishProgress>['progress']['vocabularyReviews']) {
  const instant = now?.getTime() ?? 0;
  const cards = ENGLISH_CURRICULUM.flatMap((lesson) => lesson.activity.type === 'vocabulary' ? lesson.activity.cards : []);
  return cards.filter((card) => !reviews[card.id] || Date.parse(reviews[card.id].dueAt) <= instant).length;
}

export function EnglishAcademyHome() {
  const { progress, persistenceState, resetProgress, setDailyPlanMinutes, completeStudyDay, completeWeeklyChallenge } = useEnglishProgress();
  const [confirmReset, setConfirmReset] = useState(false);
  const now = useLocalDate();
  const today = now ? getLocalDayKey(now) : '';
  const weekKey = now ? getIsoWeekKey(now) : '';
  const focus = getDailyFocus(now ?? new Date(0));
  const challenge = getWeeklyChallenge(weekKey || '2026-W01');
  const lessonCount = progress.completedLessonIds.length;
  const percent = Math.round((lessonCount / ENGLISH_CURRICULUM.length) * 100);
  const focusLessons = ENGLISH_CURRICULUM.filter((lesson) => lesson.skill === focus);
  const nextLesson = focusLessons.find((lesson) => !progress.completedLessonIds.includes(lesson.id)) ?? focusLessons[0];
  const reviewCount = dueVocabularyCount(now, progress.vocabularyReviews);
  const dayComplete = !!today && progress.completedStudyDays.includes(today);
  const challengeComplete = !!weekKey && progress.completedWeeklyChallenges.includes(weekKey);
  const planParts = [
    { title: 'Recall', minutes: 3, detail: reviewCount ? 'Review due vocabulary cards.' : 'No cards are due. Preview one new collocation.' },
    { title: ENGLISH_SKILLS.find((skill) => skill.id === focus)?.name ?? 'Practice', minutes: progress.dailyPlanMinutes - 7, detail: nextLesson.title },
    { title: 'Reflect', minutes: 4, detail: 'Name one strength and one next step. Your note is not saved.' },
  ];

  return <div className={styles.academy}>
    <section className={styles.overview} aria-labelledby="academy-overview-title">
      <div className={styles.overviewCopy}>
        <p className={styles.eyebrow}>A 12-WEEK PRACTICE ROUTE</p>
        <h2 id="academy-overview-title">From B2 foundations to C1 precision.</h2>
        <p>Build six connected skills through original lessons, deliberate practice and regular review. This is a learning record, not a CEFR assessment or certification.</p>
        <div className={styles.progressLine}>
          <span>Core lessons completed</span><strong>{lessonCount} / {ENGLISH_CURRICULUM.length}</strong>
          <div className={styles.progressTrack} role="progressbar" aria-label="English Academy core lessons completed" aria-valuemin={0} aria-valuemax={ENGLISH_CURRICULUM.length} aria-valuenow={lessonCount}>
            <span style={{ transform: 'scaleX(' + percent / 100 + ')' }} />
          </div>
        </div>
      </div>
      <div className={styles.levelPath} aria-label="Declared starting level B2, target level C1">
        <div><span>STARTING POINT</span><strong>B2</strong><small>Declared starting level</small></div>
        <ArrowRight aria-hidden="true" size={23} />
        <div><span>PERSONAL GOAL</span><strong>C1</strong><small>Practice target, not certification</small></div>
      </div>
    </section>

    <div className={styles.storageNotice + (persistenceState === 'invalid' || persistenceState === 'unavailable' ? ' ' + styles.storageWarning : '')} role={persistenceState === 'invalid' || persistenceState === 'unavailable' ? 'alert' : 'status'}>
      <span>{persistenceMessage(persistenceState)}</span>
      {persistenceState === 'invalid' && !confirmReset && <button type="button" onClick={() => setConfirmReset(true)}>Review reset options</button>}
    </div>
    {confirmReset && <div className={styles.resetConfirm} role="group" aria-label="Confirm English Academy reset">
      <span>This removes only the two English Academy progress keys in this browser. Continue?</span>
      <button type="button" onClick={() => { resetProgress(); setConfirmReset(false); }}>Reset Academy records</button>
      <button type="button" onClick={() => setConfirmReset(false)}>Cancel</button>
    </div>}

    <section className={styles.dailyPanel} aria-labelledby="daily-plan-title">
      <div className={styles.sectionHeading}>
        <div><p className={styles.eyebrow}>TODAY’S SESSION</p><h2 id="daily-plan-title">A small, focused expedition</h2></div>
        <label className={styles.durationSelect}>Daily time
          <select value={progress.dailyPlanMinutes} onChange={(event) => setDailyPlanMinutes(Number(event.target.value) as 20 | 25 | 30)} aria-label="Daily study session length">
            <option value={20}>20 minutes</option><option value={25}>25 minutes</option><option value={30}>30 minutes</option>
          </select>
        </label>
      </div>
      <div className={styles.dailyLayout}>
        <ol className={styles.dailySteps}>{planParts.map((part) => <li key={part.title}>
          <span className={styles.stepTime}><Clock3 size={14} />{part.minutes} min</span>
          <div><strong>{part.title}</strong><p>{part.detail}</p></div>
        </li>)}</ol>
        <div className={styles.dailyActions}>
          <p>{today ? new Date(today + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) : 'Preparing today’s plan'}</p>
          <Link href={focus === 'vocabulary' ? '/english/vocabulary' : '/english/' + focus} className={styles.primaryButton}>
            Open {ENGLISH_SKILLS.find((skill) => skill.id === focus)?.name} practice <ArrowRight size={16} />
          </Link>
          <button type="button" className={styles.secondaryButton} disabled={!today || dayComplete} onClick={() => completeStudyDay(today)}>
            <CheckCircle2 size={16} />{dayComplete ? 'Today recorded' : 'Record today’s session'}
          </button>
          <span>{dayComplete ? 'Recorded in this browser; no Hunter XP.' : 'Mark complete after the session. No XP is awarded.'}</span>
        </div>
      </div>
      <div className={styles.reviewLine}><Languages size={16} /><span><strong>{reviewCount}</strong> vocabulary {reviewCount === 1 ? 'card is' : 'cards are'} due</span><Link href="/english/vocabulary">Review vocabulary <ChevronRight size={15} /></Link></div>
    </section>

    <section className={styles.phaseSection} aria-labelledby="course-route-title">
      <div className={styles.sectionHeading}>
        <div><p className={styles.eyebrow}>COURSE MAP</p><h2 id="course-route-title">Twelve weeks, four stages</h2></div>
        <span>18 original core lessons</span>
      </div>
      <div className={styles.phaseGrid}>
        {[
          { name: 'B2 consolidation', weeks: 'Weeks 1–3', desc: 'Build reliable comprehension, clear answers and connected paragraphs.', stage: 'b2' },
          { name: 'B2+ bridge', weeks: 'Weeks 4–6', desc: 'Interpret viewpoints, qualify arguments and use language more precisely.', stage: 'b2-plus' },
          { name: 'C1 stretch', weeks: 'Weeks 7–9', desc: 'Work with implication, advanced structures and flexible register.', stage: 'c1' },
          { name: 'Transfer', weeks: 'Weeks 10–12', desc: 'Combine skills, evaluate evidence and edit for a real audience.', stage: 'transfer' },
        ].map((phase) => <div className={styles.phaseItem} key={phase.stage}>
          <span>{phase.weeks}</span><h3>{phase.name}</h3><p>{phase.desc}</p>
        </div>)}
      </div>
    </section>

    <section className={styles.challengePanel} aria-labelledby="weekly-challenge-title">
      <div className={styles.challengeHeading}>
        <div className={styles.challengeMark}><Target size={20} /></div>
        <div><p className={styles.eyebrow}>WEEKLY CHALLENGE · {weekKey || 'CURRENT WEEK'}</p><h2 id="weekly-challenge-title">{challenge.title}</h2><p>{challenge.focus}</p></div>
        {challengeComplete && <span className={styles.completePill}><CheckCircle2 size={15} /> Completed</span>}
      </div>
      <ul className={styles.challengeTasks}>{challenge.tasks.map((task) => <li key={task.skill}>
        <strong>{task.skill}</strong><span>{task.instruction}</span><Link href={'/english/' + task.skill} aria-label={'Open ' + task.skill + ' practice'}><ArrowRight size={16} /></Link>
      </li>)}</ul>
      <div className={styles.challengeFooter}>
        <p>{challenge.completionRule} Challenge completion is a self-report; it does not affect Hunter progression.</p>
        <button type="button" className={styles.primaryButton} disabled={!weekKey || challengeComplete} onClick={() => completeWeeklyChallenge(weekKey)}>
          <CheckCircle2 size={16} />{challengeComplete ? 'Challenge recorded' : 'Record challenge complete'}
        </button>
      </div>
    </section>

    <section className={styles.skillsSection} aria-labelledby="academy-skills-title">
      <div className={styles.sectionHeading}>
        <div><p className={styles.eyebrow}>PRACTICE BY SKILL</p><h2 id="academy-skills-title">Your learning route</h2></div>
        <span>{progress.legacyCompletedSkills.length} V1 sections retained as history · {progress.legacyKnownWords.length} V1 words retained</span>
      </div>
      <div className={styles.skillGrid}>{ENGLISH_SKILLS.map((skill) => {
        const Icon = skillIcons[skill.id];
        const skillLessons = ENGLISH_CURRICULUM.filter((lesson) => lesson.skill === skill.id);
        const complete = skillLessons.filter((lesson) => progress.completedLessonIds.includes(lesson.id)).length;
        const legacy = progress.legacyCompletedSkills.includes(skill.id);
        return <Link key={skill.id} href={'/english/' + skill.id} className={styles.skillCard} style={{ '--skill-accent': skill.accent } as CSSProperties}>
          <div className={styles.cardTop}><Icon size={21} strokeWidth={1.8} /><span>{complete} / {skillLessons.length} lessons {legacy ? '· V1 record kept' : ''}</span></div>
          <h3>{skill.name}</h3><p>{skill.shortDescription}</p>
          <div className={styles.cardBottom}><span>{skill.focus}</span><ArrowRight size={17} aria-hidden="true" /></div>
        </Link>;
      })}</div>
    </section>

    <footer className={styles.academyFooter}>
      <p>Records stay in this browser profile. Writing drafts and session notes are not saved. The app does not assess pronunciation or certify C1.</p>
      {!confirmReset && <button type="button" className={styles.resetButton} onClick={() => setConfirmReset(true)}><RotateCcw size={15} /> Reset Academy progress</button>}
    </footer>
  </div>;
}

function QuestionPractice({ lesson, activity }: { lesson: EnglishCurriculumLesson; activity: Extract<EnglishActivity, { type: 'reading' | 'grammar' }> }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const { progress, completeLesson } = useEnglishProgress();
  const allAnswered = activity.questions.every((question) => answers[question.id] !== undefined);
  const score = activity.questions.reduce((sum, question) => sum + (answers[question.id] === question.answer ? 1 : 0), 0);
  const needed = Math.ceil(activity.questions.length * activity.passPercent / 100);
  const passed = allAnswered && score >= needed;
  const completed = progress.completedLessonIds.includes(lesson.id);
  return <section className={styles.activityBlock} aria-labelledby={lesson.id + '-questions-title'}>
    <div className={styles.activityTitle}><div><p className={styles.eyebrow}>CHECK YOUR UNDERSTANDING</p><h3 id={lesson.id + '-questions-title'}>Practice questions</h3></div><span>{activity.questions.length} items · pass {needed}/{activity.questions.length}</span></div>
    {activity.type === 'reading' && <div className={styles.passage}><h4>{activity.passageTitle}</h4>{activity.passage.split('\n\n').map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>}
    <div className={styles.questions}>{activity.questions.map((question, index) => <fieldset className={styles.question} key={question.id}>
      <legend><span>{index + 1}</span>{question.prompt}</legend>
      <div className={styles.options}>{question.options.map((option, optionIndex) => {
        const selected = answers[question.id] === optionIndex;
        const correct = answers[question.id] !== undefined && question.answer === optionIndex;
        return <button type="button" key={option} className={styles.option + (selected ? ' ' + styles.optionSelected : '') + (correct ? ' ' + styles.optionCorrect : '')} aria-pressed={selected} onClick={() => setAnswers((current) => ({ ...current, [question.id]: optionIndex }))}>
          <span>{String.fromCharCode(65 + optionIndex)}</span>{option}{correct && <Check size={16} aria-hidden="true" />}
        </button>;
      })}</div>
      {answers[question.id] !== undefined && <p className={styles.explanation} role="status"><strong>{answers[question.id] === question.answer ? 'Correct.' : 'Review this point.'}</strong> {question.explanation}</p>}
    </fieldset>)}</div>
    <div className={styles.activityFooter}>
      {allAnswered && <p className={passed ? styles.successText : styles.hint} role="status">{score}/{activity.questions.length} correct. {passed ? 'You reached this lesson’s practice criterion.' : 'Review the explanations and retry to reach the criterion.'}</p>}
      {passed && !completed && <button type="button" className={styles.primaryButton} onClick={() => completeLesson(lesson.id)}><CheckCircle2 size={16} /> Record lesson complete</button>}
      {completed && <p className={styles.successText}><CheckCircle2 size={16} /> Lesson recorded in this browser.</p>}
      {allAnswered && !passed && <button type="button" className={styles.secondaryButton} onClick={() => setAnswers({})}><RotateCcw size={15} /> Retry questions</button>}
    </div>
  </section>;
}

function ListeningPractice({ lesson, activity }: { lesson: EnglishCurriculumLesson; activity: Extract<EnglishActivity, { type: 'listening' }> }) {
  const [notes, setNotes] = useState<string[]>(activity.listeningTasks.map(() => ''));
  const [checks, setChecks] = useState<string[]>([]);
  const { progress, completeLesson } = useEnglishProgress();
  const canComplete = notes.every((note) => note.trim().length >= 3) && checks.length === activity.selfCheck.length;
  const completed = progress.completedLessonIds.includes(lesson.id);
  return <div className={styles.activityStack}>
    <a className={styles.resourceLink} href={activity.resourceUrl} target="_blank" rel="noreferrer">
      <AudioLines size={18} /><span><strong>{activity.resourceLabel}</strong><small>Open the external resource in a new tab · audio and transcript remain on the provider’s site</small></span><ExternalLink size={16} />
    </a>
    <p className={styles.activityPrompt}>{activity.preparation}</p>
    <div className={styles.noteTasks}>{activity.listeningTasks.map((task, index) => <label key={task}>Listening note {index + 1}<span>{task}</span>
      <textarea value={notes[index]} onChange={(event) => setNotes((current) => current.map((note, noteIndex) => noteIndex === index ? event.target.value : note))} maxLength={500} rows={2} placeholder="Your note stays in memory only." />
    </label>)}</div>
    <Checklist title="Self-check" items={activity.selfCheck} checked={checks} onChange={setChecks} />
    <div className={styles.activityFooter}>
      <p className={styles.hint}>Completion is self-reported after the external listening task. No audio is copied or evaluated here.</p>
      {completed ? <p className={styles.successText}><CheckCircle2 size={16} /> Lesson recorded.</p> : <button type="button" className={styles.primaryButton} disabled={!canComplete} onClick={() => completeLesson(lesson.id)}><CheckCircle2 size={16} /> Record listening practice</button>}
    </div>
  </div>;
}

function SpeakingPractice({ lesson, activity }: { lesson: EnglishCurriculumLesson; activity: Extract<EnglishActivity, { type: 'speaking' }> }) {
  const [checks, setChecks] = useState<string[]>([]);
  const { progress, completeLesson } = useEnglishProgress();
  const completed = progress.completedLessonIds.includes(lesson.id);
  return <div className={styles.activityStack}>
    <p className={styles.promptCard}>{activity.prompt}</p>
    <div className={styles.speakingMeta}><span><Clock3 size={15} /> Target: {Math.floor(activity.targetSeconds / 60)}:{String(activity.targetSeconds % 60).padStart(2, '0')}</span><span><Mic2 size={15} /> Self-guided · no recording or pronunciation scoring</span></div>
    <div className={styles.prepGrid}><section><h4>Prepare</h4><ol className={styles.speakingSteps}>{activity.preparation.map((step) => <li key={step}>{step}</li>)}</ol></section>
      <Checklist title="Review your delivery" items={activity.selfCheck} checked={checks} onChange={setChecks} />
    </div>
    <div className={styles.activityFooter}>
      <p className={styles.hint}>Speak aloud, then use the checklist as a reflection guide. Notes are not saved.</p>
      {completed ? <p className={styles.successText}><CheckCircle2 size={16} /> Practice recorded.</p> : <button type="button" className={styles.primaryButton} disabled={checks.length !== activity.selfCheck.length} onClick={() => completeLesson(lesson.id)}><CheckCircle2 size={16} /> Record speaking practice</button>}
    </div>
  </div>;
}

function Checklist({ title, items, checked, onChange }: { title: string; items: string[]; checked: string[]; onChange: (items: string[]) => void }) {
  return <fieldset className={styles.selfReview}><legend>{title}</legend>{items.map((item) => <label key={item}>
    <input type="checkbox" checked={checked.includes(item)} onChange={(event) => onChange(event.target.checked ? [...checked, item] : checked.filter((value) => value !== item))} />
    <span>{item}</span>
  </label>)}</fieldset>;
}

function WritingPractice({ lesson, activity }: { lesson: EnglishCurriculumLesson; activity: Extract<EnglishActivity, { type: 'writing' }> }) {
  const [draft, setDraft] = useState('');
  const [scores, setScores] = useState<Record<string, number | ''>>({});
  const { progress, completeLesson } = useEnglishProgress();
  const wordCount = draft.trim() ? draft.trim().split(/\s+/).filter(Boolean).length : 0;
  const total = Object.values(scores).reduce<number>((sum, score) => sum + (typeof score === 'number' ? score : 0), 0);
  const allScored = activity.rubric.every((criterion) => typeof scores[criterion.id] === 'number');
  const inRange = wordCount >= activity.minimumWords && wordCount <= activity.maximumWords;
  const completed = progress.completedLessonIds.includes(lesson.id);
  return <div className={styles.activityStack}>
    <p className={styles.promptCard}>{activity.prompt}</p>
    <label className={styles.draftLabel} htmlFor={lesson.id + '-draft'}>Your draft <span>{wordCount} words · target {activity.minimumWords}–{activity.maximumWords}</span></label>
    <textarea id={lesson.id + '-draft'} className={styles.draft} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={12000} rows={10} placeholder="Write your response here. This draft is not saved." />
    <details className={styles.modelResponse}><summary>Open a model response</summary><p>{activity.modelResponse}</p></details>
    <fieldset className={styles.rubric}><legend>Self-assessment · {total}/10</legend>
      {activity.rubric.map((criterion) => <label className={styles.rubricRow} key={criterion.id}>
        <span><strong>{criterion.label}</strong><small>{criterion.anchors.map((anchor, index) => (index + 1) + ': ' + anchor).join(' · ')}</small></span>
        <select aria-label={criterion.label + ' self-assessment score'} value={scores[criterion.id] ?? ''} onChange={(event) => setScores((current) => ({ ...current, [criterion.id]: event.target.value === '' ? '' : Number(event.target.value) }))}>
          <option value="">Score</option><option value="0">0 · revise</option><option value="1">1 · developing</option><option value="2">2 · secure</option>
        </select>
      </label>)}
    </fieldset>
    <div className={styles.activityFooter}>
      <p className={styles.hint}>{!inRange ? 'Stay within the stated word range. The app does not grade or store your draft.' : !allScored ? 'Score all five criteria to finish the self-review.' : 'Your self-review is complete. Use the score to choose a next step, not as an official assessment.'}</p>
      {completed ? <p className={styles.successText}><CheckCircle2 size={16} /> Writing practice recorded; your draft remains unsaved.</p> : <button type="button" className={styles.primaryButton} disabled={!inRange || !allScored} onClick={() => completeLesson(lesson.id)}><CheckCircle2 size={16} /> Record writing practice</button>}
    </div>
  </div>;
}

function VocabularyPractice({ lesson, activity }: { lesson: EnglishCurriculumLesson; activity: Extract<EnglishActivity, { type: 'vocabulary' }> }) {
  const { progress, reviewVocabulary, completeLesson } = useEnglishProgress();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState<string[]>([]);
  const now = useLocalDate();
  const card = activity.cards[index];
  const allReviewed = activity.cards.every((item) => reviewed.includes(item.id));
  const completed = progress.completedLessonIds.includes(lesson.id);
  const review = progress.vocabularyReviews[card.id];
  const due = !review || !now || Date.parse(review.dueAt) <= now.getTime();
  const dueCount = activity.cards.filter((item) => !progress.vocabularyReviews[item.id] || !now || Date.parse(progress.vocabularyReviews[item.id].dueAt) <= now.getTime()).length;
  const gradeDescriptions: { grade: VocabularyGrade; label: string }[] = [
    { grade: 'again', label: 'Again · 10 min' }, { grade: 'hard', label: 'Hard · short interval' },
    { grade: 'good', label: 'Good · standard interval' }, { grade: 'easy', label: 'Easy · longer interval' },
  ];
  function rate(grade: VocabularyGrade) {
    reviewVocabulary(card.id, grade);
    setReviewed((current) => current.includes(card.id) ? current : [...current, card.id]);
    const nextIndex = activity.cards.findIndex((item, itemIndex) => itemIndex !== index && !reviewed.includes(item.id));
    if (nextIndex >= 0) setIndex(nextIndex);
    setRevealed(false);
  }
  return <div className={styles.activityStack}>
    <div className={styles.vocabularyMeta}><span>{index + 1} / {activity.cards.length} cards</span><span>{dueCount} due now</span></div>
    <div className={styles.flashcardFrame}>
      <button type="button" className={styles.flashcard} onClick={() => setRevealed((value) => !value)} aria-expanded={revealed} aria-label={revealed ? 'Show the word again' : 'Reveal word meaning and example'}>
        {revealed ? <><span className={styles.cardWord}>{card.word}</span><span className={styles.cardType}>{card.partOfSpeech}</span><strong>{card.meaning}</strong><span>Example: {card.example}</span><small>Common pattern: {card.collocation}</small></> : <><span className={styles.cardType}>{card.partOfSpeech}</span><strong className={styles.cardWord}>{card.word}</strong><span>Recall the meaning, then reveal</span></>}
      </button>
    </div>
    {revealed && <div className={styles.gradePanel}>
      <p>{due ? 'How well did you recall it before revealing?' : 'This card is scheduled for later. You can still practise it now.'}</p>
      <div>{gradeDescriptions.map(({ grade, label }) => <button key={grade} type="button" className={styles.secondaryButton} onClick={() => rate(grade)}>{label}</button>)}</div>
    </div>}
    {review && <p className={styles.hint}>Last review: {review.lastReviewedAt ? new Date(review.lastReviewedAt).toLocaleDateString() : 'carried from V1'} · next due {new Date(review.dueAt).toLocaleString()}</p>}
    {allReviewed && <div className={styles.activityFooter}><p className={styles.successText}><CheckCircle2 size={16} /> All four cards reviewed. The next intervals are scheduled locally.</p>
      {!completed && <button type="button" className={styles.primaryButton} onClick={() => completeLesson(lesson.id)}><CheckCircle2 size={16} /> Complete vocabulary lesson</button>}
      {completed && <p className={styles.successText}>Lesson already recorded. Review cards again when they are due.</p>}
    </div>}
    <p className={styles.hint}>Scheduling is deterministic: Again 10 minutes; otherwise the interval grows with successful recalls. Your rating and due date stay in this browser.</p>
  </div>;
}

function LessonActivity({ lesson }: { lesson: EnglishCurriculumLesson }) {
  const activity = lesson.activity;
  if (activity.type === 'listening') return <ListeningPractice lesson={lesson} activity={activity} />;
  if (activity.type === 'speaking') return <SpeakingPractice lesson={lesson} activity={activity} />;
  if (activity.type === 'reading' || activity.type === 'grammar') return <QuestionPractice lesson={lesson} activity={activity} />;
  if (activity.type === 'writing') return <WritingPractice lesson={lesson} activity={activity} />;
  return <VocabularyPractice lesson={lesson} activity={activity} />;
}

export function EnglishSkillLesson({ skillId }: { skillId: EnglishSkillId }) {
  const skill = ENGLISH_SKILLS.find((item) => item.id === skillId)!;
  const lessons = useMemo(() => ENGLISH_CURRICULUM.filter((lesson) => lesson.skill === skillId), [skillId]);
  const { progress } = useEnglishProgress();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeLesson = lessons.find((lesson) => lesson.id === selectedId)
    ?? lessons.find((lesson) => !progress.completedLessonIds.includes(lesson.id))
    ?? lessons[0];
  const Icon = skillIcons[skillId];
  const completedCount = lessons.filter((lesson) => progress.completedLessonIds.includes(lesson.id)).length;
  return <div className={styles.lessonPage} style={{ '--skill-accent': skill.accent } as CSSProperties}>
    <Link href="/english" className={styles.backLink}><ArrowLeft size={16} /> English Academy</Link>
    <section className={styles.lessonIntro}>
      <div className={styles.lessonMark}><Icon size={24} strokeWidth={1.7} /></div>
      <div><p className={styles.eyebrow}>B2 FOUNDATION · C1 PRACTICE TARGET</p><h2>{skill.name}</h2><p>{skill.focus}</p></div>
      <span className={styles.completePill}>{completedCount}/{lessons.length} lessons</span>
    </section>
    <section className={styles.lessonChooser} aria-label={skill.name + ' course lessons'}>
      {lessons.map((lesson) => {
        const done = progress.completedLessonIds.includes(lesson.id);
        const selected = activeLesson.id === lesson.id;
        return <button key={lesson.id} type="button" className={styles.lessonChoice + (selected ? ' ' + styles.lessonChoiceSelected : '')} aria-pressed={selected} onClick={() => setSelectedId(lesson.id)}>
          <span>{done ? <CheckCircle2 size={16} /> : <Sparkles size={16} />}</span>
          <span><strong>{lesson.title}</strong><small>Week {lesson.week} · {getStageLabel(lesson.stage)} · {lesson.minutes} min</small></span>
          {done && <span className={styles.lessonDoneLabel}>Complete</span>}
        </button>;
      })}
    </section>
    <article className={styles.lessonWorkspace} style={{ '--skill-accent': skill.accent } as CSSProperties}>
      <header className={styles.lessonHeader}>
        <div><p className={styles.eyebrow}>WEEK {activeLesson.week} · {getStageLabel(activeLesson.stage)}</p><h3>{activeLesson.title}</h3></div>
        <span><Clock3 size={15} /> {activeLesson.minutes} min</span>
      </header>
      <p className={styles.objective}><strong>Goal:</strong> {activeLesson.objective}</p>
      <div className={styles.lessonColumns}>
        <section className={styles.lessonPanel} aria-label="Lesson content">
          <h4>Learn</h4><p className={styles.lessonText}>{activeLesson.teaching}</p>
          <h4>Takeaways</h4><ul className={styles.keyPoints}>{activeLesson.takeaways.map((item) => <li key={item}><Check size={15} /><span>{item}</span></li>)}</ul>
          <p className={styles.successCriterion}><Target size={16} /><span><strong>Completion criterion</strong>{activeLesson.successCriterion}</span></p>
        </section>
        <section className={styles.practicePanel} aria-label={activeLesson.title + ' activity'}>
          <LessonActivity key={activeLesson.id} lesson={activeLesson} />
        </section>
      </div>
    </article>
    <nav className={styles.skillNavigation} aria-label="Other English skills"><span>Continue with</span>
      {ENGLISH_SKILLS.filter((item) => item.id !== skillId).map((item) => <Link href={'/english/' + item.id} key={item.id}>{item.name}<ArrowRight size={14} /></Link>)}
    </nav>
    <Link href="/english" className={styles.bottomBack}><ArrowLeft size={16} /> Return to the 12-week route</Link>
  </div>;
}
