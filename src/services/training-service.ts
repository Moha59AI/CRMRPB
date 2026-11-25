import { supabase } from '@/lib/supabase';

export type TrainingAttemptStatus = 'in_progress' | 'completed' | 'abandoned';

export interface TrainingAttemptSummary {
  id: string;
  quiz_code?: string;
  quiz_title?: string;
  user_id?: string;
  user_name?: string | null;
  status: TrainingAttemptStatus;
  score: number | null;
  total: number;
  passed: boolean | null;
  started_at: string;
  completed_at: string | null;
}

export interface TrainingQuizCatalogItem {
  code: string;
  title: string;
  description: string | null;
  pass_score: number;
  sections: string[];
  total: number;
  latest_attempt: TrainingAttemptSummary | null;
}

export interface TrainingSectionProgress {
  name: string;
  total: number;
  answered: number;
  correct: number | null;
}

export interface TrainingQuestion {
  id: string;
  section: string;
  prompt: string;
  choices: string[];
  position: number;
  section_position: number;
  section_total: number;
}

export interface TrainingMissedAnswer {
  id: string;
  section: string;
  prompt: string;
  selected_choice: string;
  correct_choice: string;
  explanation: string;
}

export interface TrainingAttemptState {
  attempt_id: string;
  quiz_code: string;
  title: string;
  pass_score: number;
  status: TrainingAttemptStatus;
  score: number | null;
  total: number;
  passed: boolean | null;
  started_at: string;
  completed_at: string | null;
  answered: number;
  sections: TrainingSectionProgress[];
  question: TrainingQuestion | null;
  review: TrainingMissedAnswer[];
}

export interface TrainingCorrection {
  correct: boolean;
  selected_position: number;
  correct_position: number;
  selected_choice: string;
  correct_choice: string;
  explanation: string;
  finished: boolean;
}

export interface TrainingAnswerDetail extends TrainingMissedAnswer {
  correct: boolean;
}

export interface TrainingAttemptDetail {
  id: string;
  quiz_code: string;
  title: string;
  user_id: string;
  user_name: string | null;
  score: number;
  total: number;
  passed: boolean;
  started_at: string;
  completed_at: string;
  sections: Array<{ name: string; score: number; total: number }>;
  answers: TrainingAnswerDetail[];
}

const MESSAGES: Array<[string, string]> = [
  ['QUIZ_IMPERSONATION_INTERDITE', 'Quittez le mode « Voir comme » pour passer le quiz avec votre propre compte.'],
  ['FORMATION_INTERDITE', 'Ce module est réservé aux conseillers et aux administrateurs.'],
  ['RESULTATS_FORMATION_INTERDITS', 'Seul un administrateur peut consulter les résultats de l’équipe.'],
  ['TENTATIVE_INTERDITE', 'Vous ne pouvez pas consulter cette tentative.'],
  ['TENTATIVE_INTROUVABLE', 'Cette tentative est introuvable.'],
  ['TENTATIVE_NON_TERMINEE', 'Cette tentative n’est pas encore terminée.'],
  ['TENTATIVE_TERMINEE', 'Cette tentative est déjà terminée.'],
  ['QUESTION_HORS_ORDRE', 'Cette question n’est plus active. Rechargez le quiz pour continuer.'],
  ['QUIZ_INTROUVABLE', 'Ce quiz est introuvable ou n’est plus disponible.'],
  ['QUIZ_SANS_QUESTION', 'Ce quiz ne contient aucune question.'],
  ['CHOIX_INVALIDE', 'La réponse choisie n’est pas valide.'],
];

function erreurLisible(message: string): Error {
  const traduction = MESSAGES.find(([code]) => message.includes(code));
  return new Error(traduction?.[1] ?? message);
}

function resultat<T>(data: unknown, error: { message: string } | null): T {
  if (error) throw erreurLisible(error.message);
  if (data == null) throw new Error('Le serveur n’a renvoyé aucune donnée.');
  return data as T;
}

export async function fetchTrainingCatalog(): Promise<TrainingQuizCatalogItem[]> {
  const { data, error } = await supabase.rpc('training_quiz_catalog');
  return resultat<TrainingQuizCatalogItem[]>(data, error);
}

export async function startTrainingQuiz(
  quizCode: string,
  forceNew = false,
): Promise<TrainingAttemptState> {
  const { data, error } = await supabase.rpc('start_training_quiz', {
    p_quiz_code: quizCode,
    p_force_new: forceNew,
  });
  return resultat<TrainingAttemptState>(data, error);
}

export async function fetchTrainingAttemptState(
  attemptId: string,
): Promise<TrainingAttemptState> {
  const { data, error } = await supabase.rpc('training_quiz_attempt_state', {
    p_attempt_id: attemptId,
  });
  return resultat<TrainingAttemptState>(data, error);
}

export async function answerTrainingQuiz(
  attemptId: string,
  questionCode: string,
  choicePosition: number,
): Promise<TrainingCorrection> {
  const { data, error } = await supabase.rpc('answer_training_quiz', {
    p_attempt_id: attemptId,
    p_question_code: questionCode,
    p_choice_position: choicePosition,
  });
  return resultat<TrainingCorrection>(data, error);
}

export async function fetchTrainingResults(limit = 100): Promise<TrainingAttemptSummary[]> {
  const { data, error } = await supabase.rpc('training_quiz_results', { p_limit: limit });
  return resultat<TrainingAttemptSummary[]>(data, error);
}

export async function fetchTrainingAttemptDetail(
  attemptId: string,
): Promise<TrainingAttemptDetail> {
  const { data, error } = await supabase.rpc('training_quiz_attempt_detail', {
    p_attempt_id: attemptId,
  });
  return resultat<TrainingAttemptDetail>(data, error);
}
