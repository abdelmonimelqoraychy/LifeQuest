'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronLeft, ChevronRight, Headphones, Languages, ListChecks, Mic2, PenLine, RotateCcw, type LucideIcon } from 'lucide-react';
import styles from './EnglishAcademy.module.css';
import { ENGLISH_LESSONS, ENGLISH_SKILLS, type EnglishQuestion, type EnglishSkillId } from '@/lib/english/english-content';
import { useEnglishProgress } from './useEnglishProgress';

const skillIcons: Record<EnglishSkillId, LucideIcon> = {
  listening: Headphones,
  speaking: Mic2,
  reading: BookOpen,
  writing: PenLine,
  vocabulary: Languages,
  grammar: ListChecks,
};

function persistenceMessage(state: ReturnType<typeof useEnglishProgress>['persistenceState']) {
  if (state === 'invalid') return 'Saved English Academy progress has an unsupported or damaged format. It has not been overwritten.';
  if (state === 'unavailable') return 'This browser cannot save progress right now. Exercises still work, but changes may not persist.';
  return 'Progress saved on this browser only. It is separate from Hunter XP and Supabase.';
}

export function EnglishAcademyHome() {
  const { progress, persistenceState, resetProgress } = useEnglishProgress();
  const [confirmReset, setConfirmReset] = useState(false);
  const percent = Math.round((progress.completedSkills.length / ENGLISH_SKILLS.length) * 100);

  return <div className={styles.academy}>
    <section className={styles.overview} aria-labelledby="academy-overview-title">
      <div className={styles.overviewCopy}>
        <p className={styles.eyebrow}>YOUR PERSONAL LEARNING SPACE</p>
        <h2 id="academy-overview-title">From B2 foundations to C1 precision.</h2>
        <p>Build stronger English through focused practice in six skills. Each lesson is self-paced, with clear explanations and progress kept outside the Hunter system.</p>
        <div className={styles.progressLine}>
          <span>Learning sessions completed</span>
          <strong>{progress.completedSkills.length} / {ENGLISH_SKILLS.length}</strong>
          <div className={styles.progressTrack} role="progressbar" aria-label="English Academy sections completed" aria-valuemin={0} aria-valuemax={ENGLISH_SKILLS.length} aria-valuenow={progress.completedSkills.length}>
            <span style={{ transform: `scaleX(${percent / 100})` }} />
          </div>
        </div>
      </div>
      <div className={styles.levelPath} aria-label="Declared starting level B2, target level C1">
        <div><span>STARTING LEVEL</span><strong>B2</strong><small>Declared starting point</small></div>
        <ArrowRight aria-hidden="true" size={23}/>
        <div><span>YOUR TARGET</span><strong>C1</strong><small>Advanced proficiency</small></div>
      </div>
    </section>

    <div className={`${styles.storageNotice} ${persistenceState === 'invalid' || persistenceState === 'unavailable' ? styles.storageWarning : ''}`} role={persistenceState === 'invalid' || persistenceState === 'unavailable' ? 'alert' : 'status'}>
      <span>{persistenceMessage(persistenceState)}</span>
      {persistenceState === 'invalid' && <button type="button" onClick={() => setConfirmReset(true)}>Reset English Academy progress</button>}
    </div>

    <section className={styles.skillsSection} aria-labelledby="academy-skills-title">
      <div className={styles.sectionHeading}>
        <div><p className={styles.eyebrow}>CHOOSE A SKILL</p><h2 id="academy-skills-title">Your learning route</h2></div>
        <span>{progress.knownWords.length} vocabulary cards learned</span>
      </div>
      <div className={styles.skillGrid}>
        {ENGLISH_SKILLS.map((skill) => {
          const Icon = skillIcons[skill.id];
          const complete = progress.completedSkills.includes(skill.id);
          return <Link key={skill.id} href={`/english/${skill.id}`} className={styles.skillCard} style={{ '--skill-accent': skill.accent } as CSSProperties} aria-label={`Open ${skill.name} practice`}>
            <div className={styles.cardTop}><Icon size={21} strokeWidth={1.8}/><span>{complete ? <><CheckCircle2 size={15}/> Completed</> : 'B2 PRACTICE'}</span></div>
            <h3>{skill.name}</h3>
            <p>{skill.shortDescription}</p>
            <div className={styles.cardBottom}><span>{skill.focus}</span><ArrowRight size={17} aria-hidden="true"/></div>
          </Link>;
        })}
      </div>
    </section>

    <footer className={styles.academyFooter}>
      <p>Learning records stay in this browser profile. No Hunter XP is awarded, and no writing draft is saved.</p>
      {confirmReset ? <div className={styles.resetConfirm} role="group" aria-label="Confirm English progress reset"><span>Reset only English Academy progress?</span><button type="button" onClick={() => { resetProgress(); setConfirmReset(false); }}>Confirm reset</button><button type="button" onClick={() => setConfirmReset(false)}>Cancel</button></div> : <button type="button" className={styles.resetButton} onClick={() => setConfirmReset(true)}><RotateCcw size={15}/> Reset academy progress</button>}
    </footer>
  </div>;
}

function QuestionPractice({ skillId, questions }: { skillId: EnglishSkillId; questions: EnglishQuestion[] }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [completed, setCompleted] = useState(false);
  const { progress, markSkillComplete } = useEnglishProgress();
  const allAnswered = questions.every((_, index) => answers[index] !== undefined);
  const score = questions.reduce((sum, question, index) => sum + (answers[index] === question.answer ? 1 : 0), 0);
  const alreadyComplete = progress.completedSkills.includes(skillId);

  return <section className={styles.exercise} aria-labelledby="exercise-title">
    <div className={styles.exerciseHeading}><div><p className={styles.eyebrow}>CHECK YOUR UNDERSTANDING</p><h2 id="exercise-title">Practice</h2></div><span>{questions.length} questions</span></div>
    <div className={styles.questions}>
      {questions.map((question, questionIndex) => {
        const selected = answers[questionIndex];
        return <fieldset className={styles.question} key={question.prompt}>
          <legend><span>{questionIndex + 1}</span>{question.prompt}</legend>
          <div className={styles.options}>
            {question.options.map((option, optionIndex) => {
              const isSelected = selected === optionIndex;
              const isCorrect = selected !== undefined && optionIndex === question.answer;
              return <button type="button" key={option} className={`${styles.option} ${isSelected ? styles.optionSelected : ''} ${isCorrect ? styles.optionCorrect : ''}`} aria-pressed={isSelected} onClick={() => setAnswers((current) => ({ ...current, [questionIndex]: optionIndex }))}>
                <span>{String.fromCharCode(65 + optionIndex)}</span>{option}{isCorrect && <Check size={16} aria-label="Correct answer"/>}
              </button>;
            })}
          </div>
          {selected !== undefined && <p className={styles.explanation} role="status"><strong>{selected === question.answer ? 'Correct.' : 'Review this point.'}</strong> {question.explanation}</p>}
        </fieldset>;
      })}
    </div>
    <div className={styles.exerciseFooter}>
      {completed || alreadyComplete ? <p className={styles.completedMessage} role="status"><CheckCircle2 size={17}/> Practice completed{completed ? ` · ${score}/${questions.length} correct` : ''}. This is a learning record, not a proficiency assessment.</p> : <button type="button" className={styles.primaryButton} disabled={!allAnswered} onClick={() => { markSkillComplete(skillId); setCompleted(true); }}><CheckCircle2 size={17}/> Mark practice complete</button>}
      {!allAnswered && <span>Answer each question to record this practice.</span>}
    </div>
  </section>;
}

export function EnglishSkillLesson({ skillId }: { skillId: EnglishSkillId }) {
  const skill = ENGLISH_SKILLS.find((item) => item.id === skillId)!;
  const lesson = ENGLISH_LESSONS[skillId];
  const { progress, markSkillComplete, toggleWordKnown } = useEnglishProgress();
  const [promptIndex, setPromptIndex] = useState(0);
  const [draft, setDraft] = useState('');
  const [checkedItems, setCheckedItems] = useState<string[]>([]);
  const [cardIndex, setCardIndex] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);
  const Icon = skillIcons[skillId];
  const completed = progress.completedSkills.includes(skillId);

  const wordCount = draft.trim() ? draft.trim().split(/\s+/).filter(Boolean).length : 0;
  const allWritingChecks = !!lesson.writingChecklist?.every((item) => checkedItems.includes(item));
  const vocabulary = lesson.vocabulary || [];
  const currentCard = vocabulary[cardIndex];
  const knownVocabularyCount = vocabulary.filter((card) => progress.knownWords.includes(card.id)).length;
  const allVocabularyKnown = vocabulary.length > 0 && knownVocabularyCount === vocabulary.length;

  return <div className={styles.lessonPage} style={{ '--skill-accent': skill.accent } as CSSProperties}>
    <Link href="/english" className={styles.backLink}><ArrowLeft size={16}/> All English skills</Link>
    <section className={styles.lessonIntro}>
      <div className={styles.lessonMark}><Icon size={24} strokeWidth={1.7}/></div>
      <div><p className={styles.eyebrow}>B2 FOUNDATION · C1 TARGET</p><h2>{skill.name}</h2><p>{skill.focus}</p></div>
      {completed && <span className={styles.completePill}><CheckCircle2 size={15}/> Completed</span>}
    </section>

    <div className={styles.lessonColumns}>
      <section className={styles.lessonPanel} aria-labelledby="lesson-title">
        <p className={styles.eyebrow}>LESSON</p>
        <h3 id="lesson-title">{lesson.lessonTitle}</h3>
        <p className={styles.objective}>{lesson.objective}</p>
        <p className={styles.lessonText}>{lesson.lesson}</p>
        <h4>Keep in mind</h4>
        <ul className={styles.keyPoints}>{lesson.keyPoints.map((point) => <li key={point}><Check size={15}/><span>{point}</span></li>)}</ul>
        {lesson.note && <p className={styles.limitNote}>{lesson.note}</p>}
      </section>

      {skillId === 'listening' && lesson.transcript && <section className={styles.practicePanel} aria-labelledby="transcript-title">
        <div className={styles.exerciseHeading}><div><p className={styles.eyebrow}>TEXT-BASED LISTENING PRACTICE</p><h2 id="transcript-title">Dialogue</h2></div><Headphones size={20}/></div>
        <p className={styles.practicePrompt}>Read once for the main idea, then answer the questions below.</p>
        <blockquote className={styles.transcript}>{lesson.transcript}</blockquote>
        {lesson.questions && <QuestionPractice skillId={skillId} questions={lesson.questions}/>}
      </section>}

      {skillId === 'speaking' && lesson.speakingPrompts && <section className={styles.practicePanel} aria-labelledby="speaking-title">
        <div className={styles.exerciseHeading}><div><p className={styles.eyebrow}>SPEAKING PROMPT</p><h2 id="speaking-title">Develop your answer</h2></div><Mic2 size={20}/></div>
        <p className={styles.promptCard}>{lesson.speakingPrompts[promptIndex]}</p>
        <div className={styles.promptActions}><button type="button" className={styles.secondaryButton} onClick={() => setPromptIndex((index) => (index + 1) % lesson.speakingPrompts!.length)}><RotateCcw size={16}/> Choose another prompt</button><span>Suggested practice: 60–90 seconds</span></div>
        <ol className={styles.speakingSteps}><li>State your position.</li><li>Give one reason and a concrete example.</li><li>Add a qualification or a short conclusion.</li></ol>
        <button type="button" className={styles.primaryButton} onClick={() => markSkillComplete(skillId)}><CheckCircle2 size={17}/> I practised this prompt aloud</button>
        {completed && <p className={styles.completedMessage} role="status"><CheckCircle2 size={17}/> Practice recorded on this browser.</p>}
      </section>}

      {skillId === 'reading' && lesson.passage && <section className={styles.practicePanel} aria-labelledby="reading-title">
        <div className={styles.exerciseHeading}><div><p className={styles.eyebrow}>READING PASSAGE</p><h2 id="reading-title">Urban trees, long-term thinking</h2></div><BookOpen size={20}/></div>
        <div className={styles.passage}>{lesson.passage.split('\n\n').map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
        {lesson.questions && <QuestionPractice skillId={skillId} questions={lesson.questions}/>}
      </section>}

      {skillId === 'writing' && lesson.writingPrompt && lesson.writingChecklist && <section className={styles.practicePanel} aria-labelledby="writing-title">
        <div className={styles.exerciseHeading}><div><p className={styles.eyebrow}>WRITING TASK</p><h2 id="writing-title">Make your case clearly</h2></div><PenLine size={20}/></div>
        <p className={styles.promptCard}>{lesson.writingPrompt}</p>
        <label className={styles.draftLabel} htmlFor="english-writing-draft">Your draft <span>{wordCount} words · aim for at least 80</span></label>
        <textarea id="english-writing-draft" className={styles.draft} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={5000} rows={8} placeholder="Write your email here. This draft is not saved." />
        <fieldset className={styles.selfReview}><legend>Self-review</legend>{lesson.writingChecklist.map((item) => <label key={item}><input type="checkbox" checked={checkedItems.includes(item)} onChange={(event) => setCheckedItems((current) => event.target.checked ? [...current, item] : current.filter((entry) => entry !== item))}/><span>{item}</span></label>)}</fieldset>
        <button type="button" className={styles.primaryButton} disabled={wordCount < 80 || !allWritingChecks} onClick={() => markSkillComplete(skillId)}><CheckCircle2 size={17}/> Record this writing practice</button>
        {completed && <p className={styles.completedMessage} role="status"><CheckCircle2 size={17}/> Practice recorded. Your draft remains unsaved.</p>}
        {(wordCount < 80 || !allWritingChecks) && <p className={styles.hint}>Reach 80 words and complete the three self-review checks to record the exercise.</p>}
      </section>}

      {skillId === 'vocabulary' && currentCard && <section className={styles.practicePanel} aria-labelledby="vocabulary-title">
        <div className={styles.exerciseHeading}><div><p className={styles.eyebrow}>B2 / C1 FLASHCARDS</p><h2 id="vocabulary-title">Use the word in context</h2></div><Languages size={20}/></div>
        <div className={styles.flashcardPosition}>CARD {cardIndex + 1} OF {vocabulary.length}<span>{knownVocabularyCount} learned</span></div>
        <button type="button" className={`${styles.flashcard} ${cardFlipped ? styles.flashcardFlipped : ''}`} onClick={() => setCardFlipped((flipped) => !flipped)} aria-label={cardFlipped ? `Definition and example for ${currentCard.word}` : `Reveal definition for ${currentCard.word}`} aria-expanded={cardFlipped}>
          {cardFlipped ? <><strong>{currentCard.meaning}</strong><span>{currentCard.example}</span></> : <><strong>{currentCard.word}</strong><span>{currentCard.partOfSpeech}</span><small>Select to reveal</small></>}
        </button>
        <div className={styles.flashcardActions}>
          <button type="button" className={styles.secondaryButton} onClick={() => { setCardIndex((index) => (index + vocabulary.length - 1) % vocabulary.length); setCardFlipped(false); }}><ChevronLeft size={17}/> Previous</button>
          <button type="button" className={progress.knownWords.includes(currentCard.id) ? styles.learnedButton : styles.primaryButton} aria-pressed={progress.knownWords.includes(currentCard.id)} onClick={() => toggleWordKnown(currentCard.id)}><CheckCircle2 size={16}/>{progress.knownWords.includes(currentCard.id) ? 'Learned · review again' : 'I know this word'}</button>
          <button type="button" className={styles.secondaryButton} onClick={() => { setCardIndex((index) => (index + 1) % vocabulary.length); setCardFlipped(false); }}>Next <ChevronRight size={17}/></button>
        </div>
        {allVocabularyKnown && <div className={styles.completeVocabulary}><p>All six words are marked learned. Try using each in a new sentence.</p><button type="button" className={styles.primaryButton} onClick={() => markSkillComplete(skillId)}><CheckCircle2 size={17}/> Complete vocabulary review</button></div>}
      </section>}

      {skillId === 'grammar' && lesson.questions && <section className={styles.practicePanel} aria-labelledby="grammar-title">
        <div className={styles.exerciseHeading}><div><p className={styles.eyebrow}>GRAMMAR PRACTICE</p><h2 id="grammar-title">Choose the precise form</h2></div><ListChecks size={20}/></div>
        {lesson.questions && <QuestionPractice skillId={skillId} questions={lesson.questions}/>}
      </section>}
    </div>

    <nav className={styles.skillNavigation} aria-label="Other English skills">
      <span>Continue with</span>
      {ENGLISH_SKILLS.filter((item) => item.id !== skillId).map((item) => <Link href={`/english/${item.id}`} key={item.id}>{item.name}<ArrowRight size={14}/></Link>)}
    </nav>
    <Link href="/english" className={styles.bottomBack}><ArrowLeft size={16}/> Return to English Academy</Link>
  </div>;
}
