export enum Level {
  A1 = 'A1',
  A2 = 'A2',
  B1 = 'B1',
  B2 = 'B2',
  C1 = 'C1'
}

export enum ExerciseType {
  MULTIPLE_CHOICE = 'multiple_choice',
  LISTEN_AND_SELECT = 'listen_and_select',
  SAY_ALOUD = 'say_aloud',
  TRANSLATE = 'translate',
  FILL_GAP = 'fill_gap',
  MATCHING = 'matching'
}

export interface Vocabulary {
  fr: string;
  tr: string;
  pos: string;
  audio_tts: string; // Text to be spoken
}

export interface DialogLine {
  role: string;
  fr: string;
  tr: string;
  audio_tts: string;
}

export interface TutorFeedback {
  on_incorrect: string;
  on_correct: string;
}

export interface Exercise {
  id: string;
  type: ExerciseType;
  prompt_fr: string;
  prompt_tr: string; // Turkish translation of the prompt
  options?: string[];
  correct_answers: string[];
  hints: string[];
  tutor_feedback: TutorFeedback;
  scoring: {
    max: number;
  };
  // Specific for pronunciation
  pronunciation_check?: {
    expected_text: string;
    ipa: string;
    scoring_rules: string;
  };
}

export interface Game {
  id: string;
  type: string;
  rules: string;
  reward_xp: number;
}

export interface SRSRecommendation {
  next_review_days: number[];
}

export interface CulturalNote {
  text_tr: string;
}

export interface UIPrompts {
  start_button_tr: string;
  hint_button_tr: string;
}

export interface Lesson {
  lesson_id: string;
  level: Level;
  topic: string;
  duration_minutes: number;
  learning_objectives: string[];
  vocabulary: Vocabulary[];
  dialogs: DialogLine[];
  exercises: Exercise[];
  games: Game[];
  srs_recommendation: SRSRecommendation;
  cultural_note: CulturalNote;
  ui_prompts: UIPrompts;
}

export interface UserState {
  xp: number;
  streak: number;
  level: Level;
  history: string[]; // Lesson IDs
  weakAreas: string[]; // Topics or phrases user struggled with (SRS)
  learnedVocabulary: Vocabulary[]; // Persisted list of learned words
}