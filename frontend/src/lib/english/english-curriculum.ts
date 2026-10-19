import type { EnglishSkillId } from './english-content';

export type EnglishStage = 'b2' | 'b2-plus' | 'c1' | 'transfer';
export type EnglishQuestion = {
  id: string;
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
};
export type EnglishWordCard = {
  id: string;
  word: string;
  partOfSpeech: string;
  meaning: string;
  example: string;
  collocation: string;
};
export type EnglishRubricCriterion = {
  id: string;
  label: string;
  anchors: [string, string, string];
};

type LessonBase = {
  id: string;
  skill: EnglishSkillId;
  week: number;
  stage: EnglishStage;
  title: string;
  objective: string;
  minutes: number;
  teaching: string;
  takeaways: string[];
  successCriterion: string;
};

export type ListeningActivity = {
  type: 'listening';
  resourceUrl: string;
  resourceLabel: string;
  preparation: string;
  listeningTasks: string[];
  selfCheck: string[];
};
export type SpeakingActivity = {
  type: 'speaking';
  prompt: string;
  targetSeconds: number;
  preparation: string[];
  selfCheck: string[];
};
export type ReadingActivity = {
  type: 'reading';
  passageTitle: string;
  passage: string;
  questions: EnglishQuestion[];
  passPercent: number;
};
export type WritingActivity = {
  type: 'writing';
  prompt: string;
  minimumWords: number;
  maximumWords: number;
  modelResponse: string;
  rubric: EnglishRubricCriterion[];
};
export type VocabularyActivity = {
  type: 'vocabulary';
  cards: EnglishWordCard[];
};
export type GrammarActivity = {
  type: 'grammar';
  questions: EnglishQuestion[];
  passPercent: number;
};
export type EnglishActivity =
  | ListeningActivity
  | SpeakingActivity
  | ReadingActivity
  | WritingActivity
  | VocabularyActivity
  | GrammarActivity;

export type EnglishCurriculumLesson = LessonBase & {
  activity: EnglishActivity;
};

const B2_AUDIO = 'https://learnenglish.britishcouncil.org/free-resources/listening/b2';
const C1_AUDIO = 'https://learnenglish.britishcouncil.org/free-resources/listening/c1';
const COMMON_RUBRIC: EnglishRubricCriterion[] = [
  { id: 'task', label: 'Task and purpose', anchors: ['Purpose or key requirements are missing.', 'Most requirements are covered; purpose is mostly clear.', 'Every requirement is answered directly and purpose is clear throughout.'] },
  { id: 'organization', label: 'Organization and cohesion', anchors: ['Ideas are difficult to follow or disconnected.', 'There is a clear order, with some uneven linking.', 'Paragraphs have clear roles and ideas connect naturally.'] },
  { id: 'lexis', label: 'Vocabulary and precision', anchors: ['Word choice is often vague or repetitive.', 'Vocabulary is generally appropriate with some range.', 'Precise words and natural collocations express nuanced meaning.'] },
  { id: 'grammar', label: 'Grammar and control', anchors: ['Frequent errors make meaning difficult to follow.', 'Errors occur, but meaning remains clear.', 'Complex forms are controlled; errors are minor and rare.'] },
  { id: 'register', label: 'Register and tone', anchors: ['Tone does not suit the reader or purpose.', 'Tone is mostly suitable, with occasional inconsistency.', 'Tone is consistently appropriate and professional.'] },
];

export const ENGLISH_CURRICULUM: EnglishCurriculumLesson[] = [
  {
    id: 'b2-listening-signposts', skill: 'listening', week: 1, stage: 'b2', title: 'Follow the shape of a discussion', minutes: 22,
    objective: 'Identify a main position, one supporting reason and a qualification in extended speech.',
    teaching: 'Speakers often build a point in stages: claim, reason, example, then qualification. Signposts such as “the main issue”, “for instance” and “that said” reveal this structure. Do not treat a qualification as a complete rejection of the claim.',
    takeaways: ['Write the main point in a short phrase before taking details.', 'Separate a speaker’s example from the point it supports.', 'Listen for contrast and qualification markers.'],
    successCriterion: 'Complete one external B2 recording and make a four-part note: topic, claim, reason and qualification.',
    activity: {
      type: 'listening', resourceUrl: B2_AUDIO, resourceLabel: 'British Council · B2 listening library',
      preparation: 'Choose one recording on the linked B2 page. Read its task instructions, then listen once without pausing.',
      listeningTasks: ['Name the topic in no more than six words.', 'Write the speaker’s main position and one reason.', 'Note one qualification, contrast or change of emphasis.'],
      selfCheck: ['I listened to a complete recording before checking its tasks.', 'My note distinguishes the main claim from an example.', 'I recorded a qualification or confirmed that I heard none.'],
    },
  },
  {
    id: 'b2plus-listening-qualifications', skill: 'listening', week: 5, stage: 'b2-plus', title: 'Track agreement and qualification', minutes: 24,
    objective: 'Distinguish full agreement from partial agreement and explain the difference.',
    teaching: 'In meetings and interviews, agreement is often qualified: “I take your point, although…” accepts part of an idea while introducing a limit. Listen for what the speaker accepts and what they modify. A pause or a softer phrase may signal caution, but use the words as your main evidence.',
    takeaways: ['Record each speaker’s position separately.', 'Mark a contrast word before deciding whether views differ.', 'Support an interpretation with a phrase you actually heard.'],
    successCriterion: 'Identify two positions and cite one spoken signal that shows partial agreement or disagreement.',
    activity: {
      type: 'listening', resourceUrl: B2_AUDIO, resourceLabel: 'British Council · B2 listening library',
      preparation: 'Choose an interview or discussion. Listen for how a speaker responds to another person’s point.',
      listeningTasks: ['Summarise the first speaker’s view in one sentence.', 'Summarise the response without labelling it simply “agree” or “disagree”.', 'Record the words that show a concession or qualification.'],
      selfCheck: ['I identified both positions separately.', 'I found verbal evidence for the relationship between them.', 'My conclusion allows for partial agreement.'],
    },
  },
  {
    id: 'c1-listening-stance', skill: 'listening', week: 8, stage: 'c1', title: 'Infer a speaker’s stance', minutes: 26,
    objective: 'Infer attitude and emphasis in unfamiliar or abstract speech while taking selective notes.',
    teaching: 'At an advanced level, the purpose of a talk may be more important than any single fact. Notice repeated contrasts, examples selected by the speaker and language that signals certainty or reservation. Your notes should capture relationships between ideas, not attempt to transcribe every sentence.',
    takeaways: ['Use headings for claim, evidence and reservation.', 'Separate an inference from the words that support it.', 'Review your notes after listening and identify one uncertainty.'],
    successCriterion: 'Give one defensible inference about stance and support it with two details from a C1 recording.',
    activity: {
      type: 'listening', resourceUrl: C1_AUDIO, resourceLabel: 'British Council · C1 listening library',
      preparation: 'Select a talk, interview or lecture from the C1 library. Listen without pausing and take selective notes.',
      listeningTasks: ['State the central claim and the speaker’s level of certainty.', 'Identify one example and explain what claim it supports.', 'Infer one attitude or implication and cite two details as evidence.'],
      selfCheck: ['I kept notes selective rather than transcribing.', 'I labelled my inference as an inference.', 'I can point to two details that support it.'],
    },
  },
  {
    id: 'b2-speaking-structured-answer', skill: 'speaking', week: 2, stage: 'b2', title: 'Build a clear one-minute answer', minutes: 20,
    objective: 'Present a direct view, develop one reason and support it with a specific example.',
    teaching: 'A useful spoken answer can follow four moves: answer, reason, example, conclusion. This structure gives the listener a clear route without forcing you to memorise a script. Prefer one developed reason to several unsupported points.',
    takeaways: ['Answer the question in your first sentence.', 'Use a concrete personal or hypothetical example.', 'Finish by linking the example back to your view.'],
    successCriterion: 'Speak for 60–90 seconds and complete all four moves without reading a full script.',
    activity: {
      type: 'speaking', prompt: 'Should public libraries provide more quiet study space, even if that means reducing some other services? Give your view and explain it.',
      targetSeconds: 75, preparation: ['Take three keywords, not full sentences.', 'Plan one reason and one example.', 'Allow a final sentence for your conclusion.'],
      selfCheck: ['I answered the question directly.', 'I developed one reason with a specific example.', 'My conclusion followed from what I said.', 'I spoke clearly enough to follow without reading a script.'],
    },
  },
  {
    id: 'b2plus-speaking-counterargument', skill: 'speaking', week: 6, stage: 'b2-plus', title: 'Acknowledge a counterargument', minutes: 24,
    objective: 'Respond to an opposing view fairly, then qualify or defend your position.',
    teaching: 'Strong argument is not the same as absolute certainty. Acknowledge a reasonable concern, explain when it matters, then show why your position still holds or needs a limit. Phrases such as “That concern is valid when…” make the response more precise.',
    takeaways: ['State the opposing view fairly before answering it.', 'Use a condition or limitation rather than dismissing the concern.', 'Make your final position more precise than your opening one.'],
    successCriterion: 'Deliver a 90–120 second response with a clear view, counterargument and reasoned reply.',
    activity: {
      type: 'speaking', prompt: 'Remote work can improve focus, but it may make collaboration harder. Which factor should an organisation prioritise, and under what conditions?',
      targetSeconds: 105, preparation: ['State your initial position.', 'Give the strongest fair version of the other view.', 'Explain a condition that would change or qualify your answer.'],
      selfCheck: ['I represented the opposing view fairly.', 'I used a concrete example or condition.', 'I refined my position instead of repeating it.', 'My signposts made the argument easy to follow.'],
    },
  },
  {
    id: 'c1-speaking-register', skill: 'speaking', week: 9, stage: 'c1', title: 'Adapt register and nuance', minutes: 27,
    objective: 'Develop a nuanced response and adjust formality for a professional discussion.',
    teaching: 'A C1-style contribution is not simply longer or more formal. It chooses a suitable register, signals how strong a claim is and responds to the context. Replace sweeping claims with accurate scope: “in some settings”, “the evidence suggests” or “this may depend on”.',
    takeaways: ['Distinguish evidence from personal judgement.', 'Use qualification to make a claim accurate, not vague.', 'Conclude with an implication or practical next step.'],
    successCriterion: 'Speak for two to three minutes with a position, evidence, qualification and practical implication.',
    activity: {
      type: 'speaking', prompt: 'A city is considering restricting private cars in its central area. Present a recommendation to a public consultation, including benefits, trade-offs and a condition for success.',
      targetSeconds: 150, preparation: ['Choose a professional audience and formal but natural tone.', 'Plan one benefit, one trade-off and one condition.', 'Use cautious language when your evidence is limited.'],
      selfCheck: ['My register suited a public consultation.', 'I supported claims and acknowledged a trade-off.', 'I used precise qualifications rather than absolutes.', 'I ended with a practical condition or recommendation.'],
    },
  },
  {
    id: 'b2-reading-claims-evidence', skill: 'reading', week: 1, stage: 'b2', title: 'Separate a claim from its evidence', minutes: 22,
    objective: 'Identify an author’s central claim, supporting evidence and stated limitation.',
    teaching: 'A text can mention many details while advancing one central claim. Ask what the writer wants the reader to accept; then decide which details provide evidence and which set limits. Contrast words often reveal a qualification.',
    takeaways: ['Summarise the claim in your own words.', 'Connect each example to the claim it supports.', 'Notice when the writer limits a recommendation.'],
    successCriterion: 'Answer all three questions and score at least 2/3; explain one claim-evidence relationship.',
    activity: {
      type: 'reading', passageTitle: 'Shade that lasts', passage: 'A city recently planted trees along several busy streets. The first photographs showed a visible change: pavements were shadier, bus stops felt cooler and residents spent more time outdoors. Yet a planting total from the first year says little about whether those benefits will last. Young trees need room for roots, water through dry periods and protection during road work.\n\nFor that reason, the council now publishes survival rates after three summers as well as the number of trees planted. The planting target still matters: it has helped secure funding and made progress visible. However, a target works best when it is paired with a maintenance budget and a public account of which trees need attention.',
      questions: [
        { id: 'b2-reading-claims-q1', prompt: 'What does the writer present as the better measure of lasting benefit?', options: ['The number of first-year photographs.', 'Tree survival after several summers.', 'The speed of the planting programme.'], answer: 1, explanation: 'The text contrasts early planting totals with survival after three summers, which better reflects whether benefits last.' },
        { id: 'b2-reading-claims-q2', prompt: 'What role does the planting target still play?', options: ['It helps secure funding and make progress visible.', 'It removes the need for maintenance.', 'It proves each neighbourhood has enough shade.'], answer: 0, explanation: 'The final paragraph says the target helped secure funding and made progress visible, while still needing maintenance support.' },
        { id: 'b2-reading-claims-q3', prompt: 'Which detail is evidence for the writer’s concern about long-term success?', options: ['The city published photographs.', 'Young trees need care and protection.', 'Residents spent time outdoors.'], answer: 1, explanation: 'The practical needs of young trees explain why planting totals alone cannot show lasting success.' },
      ], passPercent: 67,
    },
  },
  {
    id: 'b2plus-reading-inference', skill: 'reading', week: 4, stage: 'b2-plus', title: 'Read between the lines', minutes: 24,
    objective: 'Infer a writer’s attitude and work out a phrase’s meaning from context.',
    teaching: 'An inference must be supported by clues in the text. Look at contrast, word choice and what the writer treats as an exception. For vocabulary, test a possible meaning against the whole sentence rather than translating one word in isolation.',
    takeaways: ['Quote or identify the clue behind an inference.', 'Use contrast to interpret a writer’s attitude.', 'Check whether a guessed word meaning fits the surrounding argument.'],
    successCriterion: 'Answer the inference and context questions correctly and cite one textual clue.',
    activity: {
      type: 'reading', passageTitle: 'The quiet cost of convenience', passage: 'A new delivery service promised to make grocery shopping almost effortless. For many residents, it did: older customers and parents with small children especially valued being able to choose a delivery window. The service also reduced some individual car trips.\n\nStill, the launch campaign made the result sound simpler than it was. At busy times, vans circled for legal stopping places, and a missed slot often meant another journey the next day. The operator has since introduced shared collection points near public transport. The change is less convenient for some customers, but it appears to reduce repeated trips and makes the environmental claim more credible.\n\nConvenience, then, is not a fixed feature of a service. It depends on who uses it, where they live and what happens after the first transaction.',
      questions: [
        { id: 'b2plus-reading-inference-q1', prompt: 'What can be inferred about the launch campaign?', options: ['It presented a more straightforward success than later evidence supported.', 'It focused only on older customers.', 'It proved the service eliminated traffic.'], answer: 0, explanation: 'The writer says the campaign made the result sound simpler, then describes costs and trade-offs discovered later.' },
        { id: 'b2plus-reading-inference-q2', prompt: 'In context, “credible” most nearly means…', options: ['easy to advertise.', 'believable and supported by evidence.', 'popular with every customer.'], answer: 1, explanation: 'The shared points reduce repeated trips, giving the environmental claim stronger support and making it more believable.' },
        { id: 'b2plus-reading-inference-q3', prompt: 'Why does the writer call convenience “not a fixed feature”?', options: ['Its value changes with users, location and consequences.', 'The service has stopped offering delivery.', 'Customers prefer the same option in every area.'], answer: 0, explanation: 'The final sentence names user, location and what follows the transaction as conditions that shape convenience.' },
      ], passPercent: 67,
    },
  },
  {
    id: 'c1-reading-synthesis', skill: 'reading', week: 8, stage: 'c1', title: 'Evaluate tone and synthesize evidence', minutes: 28,
    objective: 'Interpret a writer’s cautious stance and distinguish a measured proposal from a simple endorsement.',
    teaching: 'Advanced reading depends on how claims are framed. Concessions, carefully chosen examples and limits on certainty can make a proposal measured rather than enthusiastic or dismissive. Synthesis means connecting details to the writer’s overall position.',
    takeaways: ['Notice where the writer grants a point before narrowing it.', 'Distinguish a recommendation from a claim of certainty.', 'Support a tone label with more than one textual clue.'],
    successCriterion: 'Score at least 2/3 and justify the author’s tone with two details.',
    activity: {
      type: 'reading', passageTitle: 'When a pilot becomes policy', passage: 'A short trial of four-day opening hours at the regional advice centre drew an unexpectedly positive response. Staff reported fewer interruptions, and visitors who booked appointments said they had more time to prepare. These results merit attention, though they do not settle the question of wider adoption.\n\nThe trial took place in a quiet season, at one site, with additional cover for urgent cases. Those conditions are not minor details: they may have contributed to the reported benefits. A second pilot, run during a busier period and at a smaller branch, would reveal more about whether the model is robust across settings.\n\nIt would be premature to treat one encouraging result as a policy blueprint. Equally, dismissing the trial because it was small would waste useful evidence. The sensible conclusion is provisional: expand the test, publish its limits and decide after comparing the results.',
      questions: [
        { id: 'c1-reading-synthesis-q1', prompt: 'Which description best fits the author’s stance?', options: ['Cautiously supportive of further testing.', 'Opposed to any change in opening hours.', 'Certain that the trial should become policy.'], answer: 0, explanation: 'The author values the results but calls for a broader test and a later decision.' },
        { id: 'c1-reading-synthesis-q2', prompt: 'Why are the trial conditions described as “not minor details”?', options: ['They may help explain the positive outcome and limit generalisation.', 'They show the trial was deliberately unsuccessful.', 'They prove every branch has the same workload.'], answer: 0, explanation: 'Season, site and extra urgent cover may have shaped the results, so they matter when judging wider use.' },
        { id: 'c1-reading-synthesis-q3', prompt: 'What does “provisional” signal in the conclusion?', options: ['The recommendation is temporary and depends on more evidence.', 'The decision has already been made.', 'The evidence should be ignored.'], answer: 0, explanation: 'The proposal is to expand testing and decide after comparing results, so the current conclusion is tentative.' },
      ], passPercent: 67,
    },
  },
  {
    id: 'b2-writing-formal-email', skill: 'writing', week: 2, stage: 'b2', title: 'Write a purposeful formal email', minutes: 25,
    objective: 'Make a clear request, support it with relevant reasons and use a suitable professional tone.',
    teaching: 'A concise formal email usually states its purpose early, gives enough context for the reader to decide and makes a specific request. Politeness does not require indirect or confusing sentences. A practical option can make the request easier to act on.',
    takeaways: ['Put the purpose in the opening paragraph.', 'Use one paragraph for the reasons and one for the request.', 'Choose a polite closing that matches the relationship.'],
    successCriterion: 'Write 120–170 words, address both reasons and the practical arrangement, then self-score all five criteria.',
    activity: {
      type: 'writing', prompt: 'Write to a library manager asking for a quiet study room to remain open one hour later during exam periods. Give two reasons and suggest a practical arrangement.',
      minimumWords: 120, maximumWords: 170,
      modelResponse: 'Dear Ms Rahman,\n\nI am writing on behalf of several students who use the north study room during the examination period. Would it be possible to keep the room open until 8 p.m. on weekdays for the next six weeks?\n\nMany students finish classes late, and the current closing time leaves little opportunity for quiet study before travelling home. In addition, the room is usually calm and well used between 6 and 7 p.m. A one-hour extension would therefore make the existing space more useful without requiring a new facility.\n\nIf staffing is a concern, the extension could be limited to weekdays and reviewed after the six-week trial. I would be happy to collect feedback from regular users.\n\nThank you for considering this request. I look forward to hearing from you.\n\nYours sincerely,\nA student representative',
      rubric: COMMON_RUBRIC,
    },
  },
  {
    id: 'b2plus-writing-opinion-essay', skill: 'writing', week: 6, stage: 'b2-plus', title: 'Develop a balanced opinion essay', minutes: 28,
    objective: 'Present a qualified position, develop two connected reasons and address a counterargument.',
    teaching: 'A balanced essay is not a list of equal pros and cons. Make your position visible, develop reasons with examples and explain why a counterargument does or does not change your conclusion. Use paragraph openings to show the relationship between ideas.',
    takeaways: ['State a qualified thesis in the introduction.', 'Develop each reason rather than listing it.', 'Answer a counterargument before the conclusion.'],
    successCriterion: 'Write 180–230 words with a thesis, two developed points and a fair counterargument.',
    activity: {
      type: 'writing', prompt: 'Essay: “Online learning is as effective as classroom learning.” Discuss both views and give your own position. Use examples and address one limitation.',
      minimumWords: 180, maximumWords: 230,
      modelResponse: 'Online courses can make education more accessible, but their effectiveness depends on the learner and the subject. They are not simply a replacement for classrooms; each format supports different kinds of learning.\n\nA major advantage is flexibility. A learner who works irregular hours can revisit a recorded explanation and study when concentration is best. Online courses can also connect students to specialist teachers who are not available locally. These benefits are particularly useful for independent research and knowledge-based subjects.\n\nHowever, access to information is not the same as effective practice. In a laboratory or language class, immediate feedback and interaction can reveal misunderstandings that a recording cannot. Online discussion can provide this interaction, although it requires careful facilitation and reliable access to technology.\n\nOverall, online learning can be equally effective when the course includes feedback, interaction and accessible materials. Where practical collaboration is central, a blended format is often a stronger choice than relying on either mode alone.',
      rubric: COMMON_RUBRIC,
    },
  },
  {
    id: 'c1-writing-policy-report', skill: 'writing', week: 10, stage: 'transfer', title: 'Write a concise recommendation report', minutes: 30,
    objective: 'Synthesize evidence, acknowledge uncertainty and present a clear recommendation for a defined audience.',
    teaching: 'A report helps a busy reader make a decision. Use headings or clear paragraph roles, distinguish findings from recommendations and state the limits of the evidence. Concision comes from removing repetition, not removing necessary qualifications.',
    takeaways: ['Lead with the decision the report supports.', 'Connect each recommendation to a finding.', 'State one limitation and how to address it.'],
    successCriterion: 'Write 220–280 words with a summary, evidence-based recommendation, limitation and next step.',
    activity: {
      type: 'writing', prompt: 'Prepare a short report for a community centre deciding whether to extend evening opening hours. Recommend a six-week trial, explain how to measure it and identify one risk.',
      minimumWords: 220, maximumWords: 280,
      modelResponse: 'Evening opening: recommendation\n\nSummary\nA six-week weekday trial of later opening is recommended. It would test demand and staffing requirements before the centre makes a permanent commitment.\n\nFindings and proposal\nInformal feedback suggests that students and shift workers have difficulty attending before 6 p.m. This feedback indicates a potential need, but it does not show how many people would use the service regularly. The centre should therefore extend opening by one hour on weekdays while keeping other services unchanged.\n\nDuring the trial, staff should record visitor numbers by time slot and collect a short anonymous survey. Results should be compared with the same weekdays before the trial. This would help separate the effect of later access from normal week-to-week variation.\n\nRisk and next step\nThe main risk is additional staffing cost. A rota using existing staff hours should be costed in advance, and the trial should be paused if safe cover cannot be maintained. At the end of six weeks, the manager should review attendance, survey responses and cost together. A permanent change should be considered only if the benefits are sustained and the service remains viable.',
      rubric: COMMON_RUBRIC,
    },
  },
  {
    id: 'b2-vocabulary-collocations', skill: 'vocabulary', week: 3, stage: 'b2', title: 'Learn words with their partners', minutes: 20,
    objective: 'Recall a word, its common collocation and an original sentence rather than memorising a translation alone.',
    teaching: 'Vocabulary becomes useful when you can retrieve it and combine it naturally. Learn a word with its part of speech, a frequent partner and a sentence. After revealing a card, rate how confidently you could recall it before looking.',
    takeaways: ['Say the word before revealing its meaning.', 'Notice its grammatical form and collocation.', 'Choose the review rating honestly; it controls the next interval.'],
    successCriterion: 'Review all four cards and produce one new sentence using a studied collocation.',
    activity: {
      type: 'vocabulary',
      cards: [
        { id: 'coherent', word: 'coherent', partOfSpeech: 'adjective · B2', meaning: 'clear and logically connected', example: 'She presented a coherent argument supported by relevant evidence.', collocation: 'a coherent argument' },
        { id: 'sustainable', word: 'sustainable', partOfSpeech: 'adjective · B2', meaning: 'able to continue over time without causing unacceptable harm or cost', example: 'The council is looking for a sustainable way to reduce traffic.', collocation: 'a sustainable approach' },
        { id: 'tackle', word: 'to tackle', partOfSpeech: 'verb · B2', meaning: 'to make a serious effort to deal with a problem', example: 'The report proposes several ways to tackle food waste.', collocation: 'tackle a problem' },
        { id: 'drawback', word: 'drawback', partOfSpeech: 'noun · B2', meaning: 'a disadvantage or feature that makes something less useful', example: 'The main drawback of the plan is its high initial cost.', collocation: 'a major drawback' },
      ],
    },
  },
  {
    id: 'c1-vocabulary-precision', skill: 'vocabulary', week: 7, stage: 'c1', title: 'Choose precise evaluative language', minutes: 22,
    objective: 'Use evaluative adjectives and verbs accurately when comparing benefits, feasibility and tone.',
    teaching: 'A precise word makes your judgement clearer. “Outweigh” compares the relative importance of two things; “feasible” describes whether a plan can realistically be carried out. “Nuanced” describes an account that recognises meaningful distinctions.',
    takeaways: ['Check whether a word describes evidence, judgement or possibility.', 'Learn the grammatical pattern with the word.', 'Use a new sentence to prove that you can retrieve it.'],
    successCriterion: 'Review all four cards and use two accurately in a short comparison.',
    activity: {
      type: 'vocabulary',
      cards: [
        { id: 'outweigh', word: 'to outweigh', partOfSpeech: 'verb · C1', meaning: 'to be more important or valuable than something else', example: 'For many residents, the long-term benefits outweigh the initial cost.', collocation: 'benefits outweigh costs' },
        { id: 'articulate', word: 'to articulate', partOfSpeech: 'verb · C1', meaning: 'to express an idea or feeling clearly', example: 'The chair articulated the concerns shared by several team members.', collocation: 'articulate a concern' },
        { id: 'nuanced', word: 'nuanced', partOfSpeech: 'adjective · C1', meaning: 'showing awareness of subtle differences or complexity', example: 'A nuanced answer can recognise benefits as well as drawbacks.', collocation: 'a nuanced view' },
        { id: 'feasible', word: 'feasible', partOfSpeech: 'adjective · B2+', meaning: 'possible and practical to do successfully', example: 'A weekday trial is more feasible than a permanent late opening.', collocation: 'a feasible option' },
      ],
    },
  },
  {
    id: 'c1-vocabulary-register', skill: 'vocabulary', week: 11, stage: 'transfer', title: 'Make claims precise and well supported', minutes: 24,
    objective: 'Use advanced vocabulary to describe evidence, scope and persuasive force accurately.',
    teaching: 'Advanced vocabulary should sharpen meaning, not decorate a sentence. “Substantiate” asks for evidence supporting a claim; “compelling” describes evidence or a reason that strongly persuades. A claim can be widespread without being universal.',
    takeaways: ['Match the word to the claim you want to make.', 'Avoid treating frequency as proof of universality.', 'Use a collocation and a new example during review.'],
    successCriterion: 'Review all four cards and produce two evidence-based sentences with accurate scope.',
    activity: {
      type: 'vocabulary',
      cards: [
        { id: 'substantiate', word: 'to substantiate', partOfSpeech: 'verb · C1', meaning: 'to support a claim with evidence', example: 'The team needs more data to substantiate the proposed savings.', collocation: 'substantiate a claim' },
        { id: 'compelling', word: 'compelling', partOfSpeech: 'adjective · C1', meaning: 'very convincing or persuasive', example: 'The report offers compelling evidence for a limited trial.', collocation: 'compelling evidence' },
        { id: 'evidence-based', word: 'evidence-based', partOfSpeech: 'adjective · C1', meaning: 'informed by relevant evidence rather than assumption alone', example: 'An evidence-based review considered both attendance and cost.', collocation: 'an evidence-based decision' },
        { id: 'widespread', word: 'widespread', partOfSpeech: 'adjective · B2+', meaning: 'existing or happening in many places or among many people', example: 'There was widespread support, although some groups raised concerns.', collocation: 'widespread support' },
      ],
    },
  },
  {
    id: 'b2-grammar-conditionals', skill: 'grammar', week: 3, stage: 'b2', title: 'Use conditionals to show possibility and distance', minutes: 22,
    objective: 'Choose first, second and third conditional forms to match real, hypothetical and past-unreal meaning.',
    teaching: 'The conditional form signals how the speaker views a situation. Use if + present with will for a realistic future possibility, if + past with would for a hypothetical present or future, and if + past perfect with would have for an unreal past result.',
    takeaways: ['Choose the time and reality meaning before choosing the verb form.', 'Do not normally put “will” in the if-clause of a basic first conditional.', 'Use would have + past participle for an unreal past result.'],
    successCriterion: 'Answer at least two of three items correctly and explain the time meaning of one choice.',
    activity: {
      type: 'grammar', passPercent: 67,
      questions: [
        { id: 'b2-grammar-conditionals-q1', prompt: 'If the library ___ later next week, I will use the study room.', options: ['opens', 'opened', 'would open'], answer: 0, explanation: 'This is a realistic future possibility: if + present simple, followed by will + base verb.' },
        { id: 'b2-grammar-conditionals-q2', prompt: 'If I ___ more time, I would take an advanced writing course.', options: ['have', 'had', 'will have'], answer: 1, explanation: 'The second conditional uses a past form in the if-clause for a hypothetical present or future.' },
        { id: 'b2-grammar-conditionals-q3', prompt: 'If we had booked earlier, we ___ a lower fare.', options: ['would find', 'will have found', 'would have found'], answer: 2, explanation: 'The third conditional describes an unreal past condition and its imagined past result: would have + past participle.' },
      ],
    },
  },
  {
    id: 'c1-grammar-inversion', skill: 'grammar', week: 7, stage: 'c1', title: 'Use inversion for emphasis', minutes: 24,
    objective: 'Form inversion after negative or restrictive expressions and use it for deliberate emphasis.',
    teaching: 'When a negative or restrictive expression begins a formal sentence, the auxiliary moves before the subject: “Rarely have we seen…”. With no auxiliary in the original clause, add do/does/did. The structure is emphatic and should be used selectively.',
    takeaways: ['Place the auxiliary before the subject after the fronted expression.', 'Use the correct auxiliary for the tense.', 'Choose the pattern for emphasis, not simply to make a sentence sound formal.'],
    successCriterion: 'Answer at least two of three items correctly and identify the auxiliary movement.',
    activity: {
      type: 'grammar', passPercent: 67,
      questions: [
        { id: 'b2plus-grammar-inversion-q1', prompt: 'Rarely ___ such a clear explanation of the decision.', options: ['we have heard', 'have we heard', 'we heard'], answer: 1, explanation: 'After fronted “rarely”, the auxiliary “have” precedes the subject: Rarely have we heard…' },
        { id: 'b2plus-grammar-inversion-q2', prompt: 'Not until the final review ___ the team understand the risk.', options: ['did', 'the team did', 'had'], answer: 0, explanation: 'The negative phrase is fronted, so “did” precedes the subject and the main verb stays in its base form.' },
        { id: 'b2plus-grammar-inversion-q3', prompt: 'Hardly ___ the meeting started when the alarm rang.', options: ['had', 'did', 'has'], answer: 0, explanation: 'The pattern is Hardly had + subject + past participle + when…' },
      ],
    },
  },
  {
    id: 'c1-grammar-participles', skill: 'grammar', week: 12, stage: 'transfer', title: 'Compress ideas with participle clauses', minutes: 25,
    objective: 'Use participle clauses to connect actions concisely while keeping the subject relationship clear.',
    teaching: 'Participle clauses can reduce repetition when two clauses share a subject or when a clear relationship is implied. A present participle often shows an action happening at the same time or a reason; a past participle can express a passive meaning. The implied subject must match the main clause.',
    takeaways: ['Check that the understood subject matches the main clause.', 'Use a past participle when the meaning is passive.', 'Prefer a full clause when the relationship could be misunderstood.'],
    successCriterion: 'Answer at least two of three items correctly and explain the subject relationship in one.',
    activity: {
      type: 'grammar', passPercent: 67,
      questions: [
        { id: 'c1-grammar-participles-q1', prompt: '___ the final figures, the committee approved the revised budget.', options: ['Reviewing', 'Having reviewed', 'To review'], answer: 1, explanation: 'The review was completed before approval, so the perfect participle “Having reviewed” makes the sequence clear.' },
        { id: 'c1-grammar-participles-q2', prompt: '___ by local volunteers, the survey reached several groups.', options: ['Conducting', 'Conducted', 'Having conduct'], answer: 1, explanation: 'The survey received the action, so the past participle “Conducted” gives the passive meaning.' },
        { id: 'c1-grammar-participles-q3', prompt: 'Which sentence has a clear subject relationship?', options: ['Walking to work, the rain began.', 'Walking to work, I noticed the new signs.', 'Walking to work, the new signs were noticed.'], answer: 1, explanation: 'In the correct sentence, “I” is the person walking. The other options make the rain or signs appear to do the walking.' },
      ],
    },
  },
];

export type WeeklyChallenge = {
  id: string;
  title: string;
  focus: string;
  tasks: { skill: EnglishSkillId; instruction: string }[];
  completionRule: string;
};

export const WEEKLY_CHALLENGES: WeeklyChallenge[] = [
  {
    id: 'evidence-and-opinion',
    title: 'Evidence and opinion',
    focus: 'Support a view with evidence and qualify it honestly.',
    tasks: [
      { skill: 'reading', instruction: 'Read a short article and note its claim, evidence and one limitation.' },
      { skill: 'speaking', instruction: 'Give a 90-second response that refers to the evidence and acknowledges a limitation.' },
      { skill: 'vocabulary', instruction: 'Review three due cards and use one collocation in a new sentence.' },
    ],
    completionRule: 'Complete all three tasks and write one sentence about what you would improve next time.',
  },
  {
    id: 'clear-professional-message',
    title: 'A clear professional message',
    focus: 'Adapt tone and organization to a real reader.',
    tasks: [
      { skill: 'listening', instruction: 'Listen to a short interview and record the speaker’s purpose and one qualification.' },
      { skill: 'writing', instruction: 'Draft a concise email with a visible purpose, two reasons and a practical request.' },
      { skill: 'grammar', instruction: 'Retry one grammar question you previously missed and explain the pattern.' },
    ],
    completionRule: 'Complete each task and self-score the email with the five-point-pair writing rubric.',
  },
  {
    id: 'nuance-under-pressure',
    title: 'Nuance under pressure',
    focus: 'Recognize implied meaning and respond without overclaiming.',
    tasks: [
      { skill: 'reading', instruction: 'Infer a writer’s attitude and underline two clues that support your inference.' },
      { skill: 'speaking', instruction: 'Present a view, a counterargument and a condition that could change your conclusion.' },
      { skill: 'vocabulary', instruction: 'Review due words, then compare two options using precise vocabulary.' },
    ],
    completionRule: 'Complete the three tasks and identify one place where you used qualification effectively.',
  },
  {
    id: 'synthesis-and-transfer',
    title: 'Synthesis and transfer',
    focus: 'Bring listening, writing and language control together.',
    tasks: [
      { skill: 'listening', instruction: 'Take selective notes from a C1 recording: claim, evidence and reservation.' },
      { skill: 'writing', instruction: 'Write a short recommendation that links evidence to a practical next step.' },
      { skill: 'grammar', instruction: 'Review an advanced structure and create one original sentence with it.' },
    ],
    completionRule: 'Finish each task and identify one skill to prioritize during the next week.',
  },
];

export function getStageLabel(stage: EnglishStage): string {
  return { b2: 'B2 consolidation', 'b2-plus': 'B2+ bridge', c1: 'C1 stretch', transfer: 'Transfer' }[stage];
}

export function getDailyFocus(day: Date): EnglishSkillId {
  const rotation: EnglishSkillId[] = ['listening', 'reading', 'vocabulary', 'speaking', 'grammar', 'writing'];
  const offset = Math.floor(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) / 86400000);
  return rotation[((offset % rotation.length) + rotation.length) % rotation.length];
}

export function getWeeklyChallenge(weekKey: string): WeeklyChallenge {
  const week = Number(weekKey.slice(6)) || 1;
  return WEEKLY_CHALLENGES[(week - 1) % WEEKLY_CHALLENGES.length];
}
