export const ENGLISH_SKILL_IDS = [
  'listening',
  'speaking',
  'reading',
  'writing',
  'vocabulary',
  'grammar',
] as const;

export type EnglishSkillId = (typeof ENGLISH_SKILL_IDS)[number];

export type EnglishQuestion = {
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
};

export type EnglishVocabularyCard = {
  id: string;
  word: string;
  partOfSpeech: string;
  meaning: string;
  example: string;
};

export type EnglishSkill = {
  id: EnglishSkillId;
  name: string;
  shortDescription: string;
  focus: string;
  accent: string;
};

export type EnglishLesson = {
  objective: string;
  lessonTitle: string;
  lesson: string;
  keyPoints: string[];
  note?: string;
  transcript?: string;
  passage?: string;
  questions?: EnglishQuestion[];
  speakingPrompts?: string[];
  writingPrompt?: string;
  writingChecklist?: string[];
  vocabulary?: EnglishVocabularyCard[];
};

export const ENGLISH_SKILLS: EnglishSkill[] = [
  { id: 'listening', name: 'Listening', shortDescription: 'Catch meaning, tone and implied detail.', focus: 'Understand the speaker’s purpose, not only individual words.', accent: '#72d8ff' },
  { id: 'speaking', name: 'Speaking', shortDescription: 'Build clear, confident spoken answers.', focus: 'Organise an answer, support it and respond naturally.', accent: '#a6a0ff' },
  { id: 'reading', name: 'Reading', shortDescription: 'Read for argument, evidence and nuance.', focus: 'Separate a writer’s position from supporting examples.', accent: '#6ee0bd' },
  { id: 'writing', name: 'Writing', shortDescription: 'Shape accurate, connected paragraphs.', focus: 'Make your purpose clear and connect ideas precisely.', accent: '#ffc979' },
  { id: 'vocabulary', name: 'Vocabulary', shortDescription: 'Move beyond familiar B2 wording.', focus: 'Choose precise words and use them in context.', accent: '#ff9da9' },
  { id: 'grammar', name: 'Grammar', shortDescription: 'Make complex structures reliable.', focus: 'Use advanced forms to express time, contrast and emphasis.', accent: '#89b6ff' },
];

export const ENGLISH_LESSONS: Record<EnglishSkillId, EnglishLesson> = {
  listening: {
    objective: 'Identify a proposal, its reason and a speaker’s degree of certainty.',
    lessonTitle: 'Listen for the shape of an idea',
    lesson: 'In a discussion, the main point is often followed by a reason, an example and a qualification. Notice signposts such as “the main concern is…”, “for instance” and “that said”. A qualification narrows a claim; it does not necessarily cancel it.',
    keyPoints: ['First identify the topic and the speakers’ positions.', 'Listen for contrast markers such as although, however and whereas.', 'Treat examples as evidence for a point, not as the point itself.'],
    note: 'This V1 lesson uses a written dialogue for comprehension practice. No audio track or speech-recognition service is included.',
    transcript: 'Maya: The new flexible schedule has made it easier to focus, especially on tasks that need uninterrupted time.\n\nLeo: I agree, although coordinating across the team can take longer. We used to solve small questions immediately at someone’s desk.\n\nMaya: That is why we introduced a short daily check-in. It is not another meeting for its own sake; it gives everyone a chance to raise blockers early.\n\nLeo: It has helped. I would not say the system is perfect, but the quieter afternoons have made a noticeable difference. The main thing is to keep the schedule flexible rather than treating it as a fixed rule.',
    questions: [
      { prompt: 'What is the main benefit Maya notices?', options: ['Fewer tasks are assigned to the team.', 'She can focus more easily on demanding work.', 'The team no longer needs to communicate.'], answer: 1, explanation: 'Maya says the flexible schedule helps her focus, particularly on work requiring uninterrupted time.' },
      { prompt: 'What does Leo suggest about the new system?', options: ['It works well, although it still needs flexibility.', 'It has made every task faster.', 'The daily check-in should be removed.'], answer: 0, explanation: 'Leo recognises a benefit but qualifies his view: coordination takes longer and the schedule should not become a fixed rule.' },
    ],
  },
  speaking: {
    objective: 'Give a clear, developed answer with an example and a considered conclusion.',
    lessonTitle: 'Build a 60-second answer',
    lesson: 'A strong spoken response does not need complicated words. State your position, explain why, give a specific example and add a qualification or conclusion. Useful signposts include “From my perspective…”, “A good example would be…” and “That said…”.',
    keyPoints: ['Answer the question in your first sentence.', 'Develop one reason instead of listing several unsupported ideas.', 'Use a real or clearly hypothetical example, then conclude.'],
    note: 'Practice is self-guided: this page does not access your microphone, record audio or assess pronunciation.',
    speakingPrompts: [
      'Some people learn more effectively alone, while others prefer working with a group. Which approach suits you, and why?',
      'Should cities prioritise public transport over private cars? Explain your view and acknowledge one counterargument.',
      'Describe a skill you learned through practice. What was difficult at first, and what helped you improve?',
    ],
  },
  reading: {
    objective: 'Distinguish the author’s central claim from examples and limitations.',
    lessonTitle: 'Read the argument, not just the topic',
    lesson: 'A paragraph may mention a topic without making it the main claim. Look for the sentence that controls the paragraph, then ask what each example is doing. Words such as “yet”, “while” and “provided that” often reveal the writer’s qualification.',
    keyPoints: ['Summarise the author’s position in one sentence.', 'Separate evidence from the conclusion drawn from it.', 'Notice when the writer limits a recommendation.'],
    passage: 'When a city plants trees along its busiest streets, the benefits are easy to photograph: shaded pavements, cooler bus stops and more inviting public spaces. Less visible is the planning that determines whether those benefits last. Young trees need room for their roots, reliable water during dry periods and protection from construction work.\n\nFor this reason, the success of an urban planting programme should not be measured by the number of trees installed in its first year. Survival rates over several summers offer a more useful measure. This does not mean that planting targets are irrelevant; ambitious targets can focus attention and funding. However, targets work best when they are paired with maintenance budgets and public reporting.\n\nA neighbourhood survey can also reveal where shade is most needed. Yet local preference alone cannot settle every decision: underground utilities, accessibility and future building plans all matter. The strongest programmes combine local knowledge with long-term technical planning.',
    questions: [
      { prompt: 'According to the passage, what is a more useful measure than first-year planting totals?', options: ['How many photographs residents share.', 'How many trees survive over several summers.', 'How quickly a planting target is reached.'], answer: 1, explanation: 'The author explicitly recommends survival rates over several summers as a more useful measure of lasting success.' },
      { prompt: 'What is the author’s view of planting targets?', options: ['They are useful when paired with maintenance and reporting.', 'They should be avoided because they cost too much.', 'They are more reliable than survival rates.'], answer: 0, explanation: 'Targets can focus funding and attention, but the passage says they work best with maintenance budgets and public reporting.' },
      { prompt: 'Why is local preference not enough on its own?', options: ['Residents rarely know where shade is needed.', 'Technical and accessibility constraints also affect decisions.', 'Surveys cannot be used in urban planning.'], answer: 1, explanation: 'The final paragraph names utilities, accessibility and future plans as additional constraints.' },
    ],
  },
  writing: {
    objective: 'Write a concise formal request with a clear purpose and well-linked support.',
    lessonTitle: 'Make every paragraph do a job',
    lesson: 'For a formal request, open with the reason for writing. Use one paragraph for the context and evidence, then state the action you want. Linking phrases such as “In addition”, “As a result” and “I would therefore be grateful if…” help the reader follow your reasoning.',
    keyPoints: ['Keep the purpose visible from the opening.', 'Support a request with specific, relevant details.', 'Use a polite closing and check sentence boundaries.'],
    note: 'Your draft stays in this page’s memory only and is not saved to localStorage or sent for AI correction.',
    writingPrompt: 'Write a formal email to a local library manager asking for a quiet study area to remain open later during exam periods. Give two reasons and suggest a practical arrangement.',
    writingChecklist: ['My opening states the reason for writing.', 'I give two relevant reasons and a practical suggestion.', 'I use a polite request and check verb forms and punctuation.'],
  },
  vocabulary: {
    objective: 'Learn useful B2/C1 words and choose them accurately in a sentence.',
    lessonTitle: 'Precision comes from context',
    lesson: 'Advanced vocabulary is useful when it makes a distinction clearer. Learn a word with its grammatical form, common partners and an example sentence. A near-synonym may sound more formal but still change the meaning.',
    keyPoints: ['Learn the phrase around a word, not only its translation.', 'Check whether a word is a verb, noun or adjective.', 'Return to marked words and use them in a new sentence.'],
    note: 'Mark a card as learned only when you can explain the word and use it in a new example. Your card list is saved on this browser.',
    vocabulary: [
      { id: 'coherent', word: 'coherent', partOfSpeech: 'adjective · B2', meaning: 'cohérent ; clair et logique', example: 'She presented a coherent argument supported by relevant evidence.' },
      { id: 'sustainable', word: 'sustainable', partOfSpeech: 'adjective · B2', meaning: 'durable ; capable de se maintenir à long terme', example: 'The council is looking for a sustainable way to reduce traffic.' },
      { id: 'tackle', word: 'to tackle', partOfSpeech: 'verb · B2', meaning: 's’attaquer à ; prendre en charge un problème', example: 'The report proposes several ways to tackle food waste.' },
      { id: 'outweigh', word: 'to outweigh', partOfSpeech: 'verb · C1', meaning: 'l’emporter sur ; être plus important que', example: 'For many residents, the long-term benefits outweigh the initial cost.' },
      { id: 'articulate', word: 'to articulate', partOfSpeech: 'verb · C1', meaning: 'exprimer clairement une idée', example: 'He was able to articulate the concerns shared by the whole team.' },
      { id: 'nuanced', word: 'nuanced', partOfSpeech: 'adjective · C1', meaning: 'nuancé ; qui tient compte de distinctions fines', example: 'A nuanced answer can recognise benefits as well as drawbacks.' },
    ],
  },
  grammar: {
    objective: 'Choose accurate structures for hypothetical meaning, duration and emphasis.',
    lessonTitle: 'Control the relationship between ideas',
    lesson: 'Complex grammar helps show how ideas relate. The second conditional describes an unreal or unlikely situation; future perfect looks back from a future point; a gerund can follow a preposition; and negative adverbials such as “hardly” trigger subject–auxiliary inversion.',
    keyPoints: ['If + past form, would + base verb describes a hypothetical present or future.', 'Use will have + past participle for an action completed by a future point.', 'After a preposition, use a noun or gerund.', 'After “hardly” at the beginning, invert the subject and auxiliary.'],
    questions: [
      { prompt: 'If I ___ more time, I would take an advanced writing course.', options: ['have', 'had', 'will have'], answer: 1, explanation: 'The second conditional uses if + past form (“had”) for a hypothetical situation, followed by would + base verb.' },
      { prompt: 'By next June, she ___ at the organisation for five years.', options: ['will work', 'will have worked', 'has worked'], answer: 1, explanation: 'Future perfect (“will have worked”) describes duration completed by a stated future point.' },
      { prompt: 'Despite ___ tired, Amir finished the report.', options: ['he was', 'being', 'be'], answer: 1, explanation: '“Despite” is a preposition, so it is followed here by the gerund “being”.' },
      { prompt: 'Hardly ___ the meeting started when the fire alarm rang.', options: ['had', 'did', 'has'], answer: 0, explanation: 'The pattern is “Hardly had + subject + past participle + when…”; the opening negative adverbial triggers inversion.' },
    ],
  },
};

export function isEnglishSkillId(value: string): value is EnglishSkillId {
  return ENGLISH_SKILL_IDS.includes(value as EnglishSkillId);
}

export function getEnglishSkill(id: EnglishSkillId): EnglishSkill {
  return ENGLISH_SKILLS.find((skill) => skill.id === id)!;
}
