/*
# Formation commerciale — quiz sécurisés

Les questions et leurs corrections ne sont jamais lisibles directement par
le navigateur. Toutes les tables sont privées et les RPC SECURITY DEFINER ne
renvoient la bonne réponse qu'après l'enregistrement d'une réponse.
*/

create table if not exists public.training_quizzes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null,
  description text,
  pass_score integer not null check (pass_score >= 0),
  sections jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.training_quizzes(id) on delete cascade,
  question_code text not null,
  section_name text not null,
  prompt text not null,
  choices jsonb not null check (
    jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) = 4
  ),
  correct_index integer not null check (correct_index between 0 and 3),
  explanation text not null,
  sort_order integer not null check (sort_order > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quiz_id, question_code),
  unique (quiz_id, sort_order)
);

create table if not exists public.training_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_id uuid not null references public.training_quizzes(id) on delete restrict,
  quiz_code text not null,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'abandoned')),
  score integer,
  total integer not null check (total > 0),
  passed boolean,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  check (
    (status = 'completed' and score is not null and passed is not null and completed_at is not null)
    or status <> 'completed'
  )
);

create index if not exists training_quiz_attempts_user_idx
  on public.training_quiz_attempts(workspace_id, user_id, started_at desc);
create index if not exists training_quiz_attempts_quiz_idx
  on public.training_quiz_attempts(quiz_id, started_at desc);
create unique index if not exists training_quiz_one_active_attempt_idx
  on public.training_quiz_attempts(workspace_id, user_id, quiz_id)
  where status = 'in_progress';

create table if not exists public.training_quiz_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.training_quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.training_quiz_questions(id) on delete restrict,
  question_code text not null,
  section_name text not null,
  prompt_snapshot text not null,
  choices_snapshot jsonb not null check (
    jsonb_typeof(choices_snapshot) = 'array' and jsonb_array_length(choices_snapshot) = 4
  ),
  correct_index_snapshot integer not null check (correct_index_snapshot between 0 and 3),
  explanation_snapshot text not null,
  question_order integer not null,
  choice_order integer[] not null check (
    array_length(choice_order, 1) = 4
    and choice_order <@ array[0, 1, 2, 3]
    and array[0, 1, 2, 3] <@ choice_order
  ),
  selected_display_index integer check (selected_display_index between 0 and 3),
  selected_original_index integer check (selected_original_index between 0 and 3),
  is_correct boolean,
  answered_at timestamptz,
  unique (attempt_id, question_id),
  unique (attempt_id, question_order),
  check (
    (answered_at is null and selected_original_index is null and is_correct is null)
    or (answered_at is not null and selected_original_index is not null and is_correct is not null)
  )
);

create index if not exists training_quiz_answers_attempt_idx
  on public.training_quiz_answers(attempt_id, question_order);

alter table public.training_quizzes enable row level security;
alter table public.training_quiz_questions enable row level security;
alter table public.training_quiz_attempts enable row level security;
alter table public.training_quiz_answers enable row level security;

-- Aucune lecture directe, même authentifiée : une requête réseau ne doit pas
-- permettre de découvrir correct_index avant d'avoir répondu.
revoke all on table public.training_quizzes from public, anon, authenticated;
revoke all on table public.training_quiz_questions from public, anon, authenticated;
revoke all on table public.training_quiz_attempts from public, anon, authenticated;
revoke all on table public.training_quiz_answers from public, anon, authenticated;


-- ============ CATALOGUE ============

create or replace function public.training_quiz_catalog()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_result jsonb;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null or v_profile.role not in ('admin', 'advisor') then
    raise exception 'FORMATION_INTERDITE';
  end if;
  if public.utilisateur_effectif() is distinct from auth.uid() then
    raise exception 'QUIZ_IMPERSONATION_INTERDITE';
  end if;

  select coalesce(jsonb_agg(item order by item->>'title'), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'code', quiz.code,
      'title', quiz.title,
      'description', quiz.description,
      'pass_score', quiz.pass_score,
      'sections', quiz.sections,
      'total', (select count(*) from public.training_quiz_questions question
                where question.quiz_id = quiz.id),
      'latest_attempt', (
        select jsonb_build_object(
          'id', attempt.id,
          'status', attempt.status,
          'score', attempt.score,
          'total', attempt.total,
          'passed', attempt.passed,
          'started_at', attempt.started_at,
          'completed_at', attempt.completed_at
        )
        from public.training_quiz_attempts attempt
        where attempt.quiz_id = quiz.id
          and attempt.workspace_id = v_profile.workspace_id
          and attempt.user_id = auth.uid()
        order by attempt.started_at desc
        limit 1
      )
    ) as item
    from public.training_quizzes quiz
    where quiz.active
  ) catalogue;

  return v_result;
end;
$$;


-- ============ ÉTAT D'UNE TENTATIVE ============

create or replace function public.training_quiz_attempt_state(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_attempt public.training_quiz_attempts%rowtype;
  v_quiz public.training_quizzes%rowtype;
  v_answered integer;
  v_question jsonb;
  v_sections jsonb;
  v_review jsonb := '[]'::jsonb;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null or v_profile.role not in ('admin', 'advisor') then
    raise exception 'FORMATION_INTERDITE';
  end if;
  if public.utilisateur_effectif() is distinct from auth.uid() then
    raise exception 'QUIZ_IMPERSONATION_INTERDITE';
  end if;

  select * into v_attempt
  from public.training_quiz_attempts
  where id = p_attempt_id
    and workspace_id = v_profile.workspace_id
    and user_id = auth.uid();
  if v_attempt.id is null then raise exception 'TENTATIVE_INTROUVABLE'; end if;

  select * into v_quiz from public.training_quizzes where id = v_attempt.quiz_id;

  select count(*) into v_answered
  from public.training_quiz_answers answer
  where answer.attempt_id = v_attempt.id and answer.answered_at is not null;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'name', section.value,
      'total', (select count(*) from public.training_quiz_answers answer
                where answer.attempt_id = v_attempt.id
                  and answer.section_name = section.value),
      'answered', (select count(*) from public.training_quiz_answers answer
                   where answer.attempt_id = v_attempt.id
                     and answer.section_name = section.value
                     and answer.answered_at is not null),
      'correct', case when v_attempt.status = 'completed' then
        (select count(*) from public.training_quiz_answers answer
         where answer.attempt_id = v_attempt.id
           and answer.section_name = section.value
           and answer.is_correct)
        else null end
    ) order by section.ordinality
  ), '[]'::jsonb)
  into v_sections
  from jsonb_array_elements_text(v_quiz.sections)
    with ordinality as section(value, ordinality);

  if v_attempt.status = 'in_progress' then
    select jsonb_build_object(
      'id', answer.question_code,
      'section', answer.section_name,
      'prompt', answer.prompt_snapshot,
      'choices', (
        select jsonb_agg(answer.choices_snapshot -> choice.original_index order by choice.position)
        from unnest(answer.choice_order) with ordinality
          as choice(original_index, position)
      ),
      'position', answer.question_order,
      'section_position', (
        select count(*) from public.training_quiz_answers previous
        where previous.attempt_id = answer.attempt_id
          and previous.section_name = answer.section_name
          and previous.question_order <= answer.question_order
      ),
      'section_total', (
        select count(*) from public.training_quiz_answers same_section
        where same_section.attempt_id = answer.attempt_id
          and same_section.section_name = answer.section_name
      )
    )
    into v_question
    from public.training_quiz_answers answer
    where answer.attempt_id = v_attempt.id
      and answer.answered_at is null
    order by answer.question_order
    limit 1;
  else
    v_question := null;
  end if;

  if v_attempt.status = 'completed' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', answer.question_code,
      'section', answer.section_name,
      'prompt', answer.prompt_snapshot,
      'selected_choice', answer.choices_snapshot ->> answer.selected_original_index,
      'correct_choice', answer.choices_snapshot ->> answer.correct_index_snapshot,
      'explanation', answer.explanation_snapshot
    ) order by answer.question_order) filter (where not answer.is_correct), '[]'::jsonb)
    into v_review
    from public.training_quiz_answers answer
    where answer.attempt_id = v_attempt.id;
  end if;

  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'quiz_code', v_attempt.quiz_code,
    'title', v_quiz.title,
    'pass_score', v_quiz.pass_score,
    'status', v_attempt.status,
    'score', v_attempt.score,
    'total', v_attempt.total,
    'passed', v_attempt.passed,
    'started_at', v_attempt.started_at,
    'completed_at', v_attempt.completed_at,
    'answered', v_answered,
    'sections', v_sections,
    'question', v_question,
    'review', v_review
  );
end;
$$;


-- ============ DÉMARRER / REPRENDRE ============

create or replace function public.start_training_quiz(
  p_quiz_code text,
  p_force_new boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_quiz public.training_quizzes%rowtype;
  v_attempt_id uuid;
  v_total integer;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null or v_profile.role not in ('admin', 'advisor') then
    raise exception 'FORMATION_INTERDITE';
  end if;

  -- Un administrateur en mode « Voir comme » ne doit jamais pouvoir créer un
  -- résultat au nom de la personne évaluée.
  if public.utilisateur_effectif() is distinct from auth.uid() then
    raise exception 'QUIZ_IMPERSONATION_INTERDITE';
  end if;

  select * into v_quiz
  from public.training_quizzes
  where code = p_quiz_code and active;
  if v_quiz.id is null then raise exception 'QUIZ_INTROUVABLE'; end if;

  -- Deux onglets ouverts au même instant reprennent la même tentative au
  -- lieu d'en créer deux. L'index partiel ci-dessus reste le dernier filet.
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text || ':' || v_quiz.id::text));

  if not p_force_new then
    select attempt.id into v_attempt_id
    from public.training_quiz_attempts attempt
    where attempt.workspace_id = v_profile.workspace_id
      and attempt.user_id = auth.uid()
      and attempt.quiz_id = v_quiz.id
      and attempt.status = 'in_progress'
    order by attempt.started_at desc
    limit 1;

    if v_attempt_id is not null then
      return public.training_quiz_attempt_state(v_attempt_id);
    end if;
  else
    update public.training_quiz_attempts
    set status = 'abandoned', completed_at = now()
    where workspace_id = v_profile.workspace_id
      and user_id = auth.uid()
      and quiz_id = v_quiz.id
      and status = 'in_progress';
  end if;

  select count(*) into v_total
  from public.training_quiz_questions question
  where question.quiz_id = v_quiz.id;
  if v_total = 0 then raise exception 'QUIZ_SANS_QUESTION'; end if;

  insert into public.training_quiz_attempts (
    workspace_id, user_id, quiz_id, quiz_code, total
  ) values (
    v_profile.workspace_id, auth.uid(), v_quiz.id, v_quiz.code, v_total
  ) returning id into v_attempt_id;

  insert into public.training_quiz_answers (
    attempt_id,
    question_id,
    question_code,
    section_name,
    prompt_snapshot,
    choices_snapshot,
    correct_index_snapshot,
    explanation_snapshot,
    question_order,
    choice_order
  )
  select
    v_attempt_id,
    question.id,
    question.question_code,
    question.section_name,
    question.prompt,
    question.choices,
    question.correct_index,
    question.explanation,
    question.sort_order,
    array(
      select shuffled.value
      from generate_series(0, 3) as shuffled(value)
      order by random()
    )
  from public.training_quiz_questions question
  where question.quiz_id = v_quiz.id
  order by question.sort_order;

  return public.training_quiz_attempt_state(v_attempt_id);
end;
$$;


-- ============ RÉPONDRE ============

create or replace function public.answer_training_quiz(
  p_attempt_id uuid,
  p_question_code text,
  p_choice_position integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_attempt public.training_quiz_attempts%rowtype;
  v_answer public.training_quiz_answers%rowtype;
  v_selected_original integer;
  v_correct_position integer;
  v_correct boolean;
  v_score integer;
  v_answered integer;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null or v_profile.role not in ('admin', 'advisor') then
    raise exception 'FORMATION_INTERDITE';
  end if;
  if public.utilisateur_effectif() is distinct from auth.uid() then
    raise exception 'QUIZ_IMPERSONATION_INTERDITE';
  end if;
  if p_choice_position not between 0 and 3 then raise exception 'CHOIX_INVALIDE'; end if;

  select * into v_attempt
  from public.training_quiz_attempts
  where id = p_attempt_id
    and workspace_id = v_profile.workspace_id
    and user_id = auth.uid()
  for update;
  if v_attempt.id is null then raise exception 'TENTATIVE_INTROUVABLE'; end if;
  if v_attempt.status <> 'in_progress' then raise exception 'TENTATIVE_TERMINEE'; end if;

  select * into v_answer
  from public.training_quiz_answers answer
  where answer.attempt_id = v_attempt.id
    and answer.answered_at is null
  order by answer.question_order
  limit 1
  for update;

  if v_answer.id is null then raise exception 'QUESTION_INTROUVABLE'; end if;
  if v_answer.question_code <> p_question_code then raise exception 'QUESTION_HORS_ORDRE'; end if;

  v_selected_original := v_answer.choice_order[p_choice_position + 1];
  v_correct_position := array_position(v_answer.choice_order, v_answer.correct_index_snapshot) - 1;
  v_correct := v_selected_original = v_answer.correct_index_snapshot;

  update public.training_quiz_answers
  set selected_display_index = p_choice_position,
      selected_original_index = v_selected_original,
      is_correct = v_correct,
      answered_at = now()
  where id = v_answer.id;

  select count(*), count(*) filter (where is_correct)
  into v_answered, v_score
  from public.training_quiz_answers
  where attempt_id = v_attempt.id and answered_at is not null;

  if v_answered = v_attempt.total then
    update public.training_quiz_attempts attempt
    set status = 'completed',
        score = v_score,
        passed = v_score >= quiz.pass_score,
        completed_at = now()
    from public.training_quizzes quiz
    where attempt.id = v_attempt.id and quiz.id = attempt.quiz_id;
  end if;

  return jsonb_build_object(
    'correct', v_correct,
    'selected_position', p_choice_position,
    'correct_position', v_correct_position,
    'selected_choice', v_answer.choices_snapshot ->> v_selected_original,
    'correct_choice', v_answer.choices_snapshot ->> v_answer.correct_index_snapshot,
    'explanation', v_answer.explanation_snapshot,
    'finished', v_answered = v_attempt.total
  );
end;
$$;


-- ============ DÉTAIL ET VUE ADMIN ============

create or replace function public.training_quiz_attempt_detail(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_attempt public.training_quiz_attempts%rowtype;
  v_quiz public.training_quizzes%rowtype;
  v_owner public.profiles%rowtype;
  v_sections jsonb;
  v_answers jsonb;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null or v_profile.role not in ('admin', 'advisor') then
    raise exception 'FORMATION_INTERDITE';
  end if;

  select * into v_attempt
  from public.training_quiz_attempts
  where id = p_attempt_id and workspace_id = v_profile.workspace_id;
  if v_attempt.id is null then raise exception 'TENTATIVE_INTROUVABLE'; end if;
  if v_profile.role <> 'admin' and v_attempt.user_id <> auth.uid() then
    raise exception 'TENTATIVE_INTERDITE';
  end if;
  if v_attempt.status <> 'completed' then raise exception 'TENTATIVE_NON_TERMINEE'; end if;

  select * into v_quiz from public.training_quizzes where id = v_attempt.quiz_id;
  select * into v_owner from public.profiles where id = v_attempt.user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', section.value,
    'score', (select count(*) from public.training_quiz_answers answer
              where answer.attempt_id = v_attempt.id
                and answer.section_name = section.value and answer.is_correct),
    'total', (select count(*) from public.training_quiz_answers answer
              where answer.attempt_id = v_attempt.id
                and answer.section_name = section.value)
  ) order by section.ordinality), '[]'::jsonb)
  into v_sections
  from jsonb_array_elements_text(v_quiz.sections)
    with ordinality as section(value, ordinality);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', answer.question_code,
    'section', answer.section_name,
    'prompt', answer.prompt_snapshot,
    'selected_choice', answer.choices_snapshot ->> answer.selected_original_index,
    'correct_choice', answer.choices_snapshot ->> answer.correct_index_snapshot,
    'correct', answer.is_correct,
    'explanation', answer.explanation_snapshot
  ) order by answer.question_order), '[]'::jsonb)
  into v_answers
  from public.training_quiz_answers answer
  where answer.attempt_id = v_attempt.id;

  return jsonb_build_object(
    'id', v_attempt.id,
    'quiz_code', v_attempt.quiz_code,
    'title', v_quiz.title,
    'user_id', v_attempt.user_id,
    'user_name', nullif(trim(coalesce(v_owner.first_name, '') || ' ' || coalesce(v_owner.last_name, '')), ''),
    'score', v_attempt.score,
    'total', v_attempt.total,
    'passed', v_attempt.passed,
    'started_at', v_attempt.started_at,
    'completed_at', v_attempt.completed_at,
    'sections', v_sections,
    'answers', v_answers
  );
end;
$$;


create or replace function public.training_quiz_results(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_result jsonb;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null or v_profile.role <> 'admin' then
    raise exception 'RESULTATS_FORMATION_INTERDITS';
  end if;

  select coalesce(jsonb_agg(row_data order by row_data->>'started_at' desc), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id', attempt.id,
      'quiz_code', attempt.quiz_code,
      'quiz_title', quiz.title,
      'user_id', attempt.user_id,
      'user_name', nullif(trim(coalesce(profile.first_name, '') || ' ' || coalesce(profile.last_name, '')), ''),
      'status', attempt.status,
      'score', attempt.score,
      'total', attempt.total,
      'passed', attempt.passed,
      'started_at', attempt.started_at,
      'completed_at', attempt.completed_at
    ) as row_data
    from public.training_quiz_attempts attempt
    join public.training_quizzes quiz on quiz.id = attempt.quiz_id
    left join public.profiles profile on profile.id = attempt.user_id
    where attempt.workspace_id = v_profile.workspace_id
    order by attempt.started_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) rows_limited;

  return v_result;
end;
$$;


revoke all on function public.training_quiz_catalog() from public, anon;
revoke all on function public.training_quiz_attempt_state(uuid) from public, anon;
revoke all on function public.start_training_quiz(text, boolean) from public, anon;
revoke all on function public.answer_training_quiz(uuid, text, integer) from public, anon;
revoke all on function public.training_quiz_attempt_detail(uuid) from public, anon;
revoke all on function public.training_quiz_results(integer) from public, anon;

grant execute on function public.training_quiz_catalog() to authenticated;
grant execute on function public.training_quiz_attempt_state(uuid) to authenticated;
grant execute on function public.start_training_quiz(text, boolean) to authenticated;
grant execute on function public.answer_training_quiz(uuid, text, integer) to authenticated;
grant execute on function public.training_quiz_attempt_detail(uuid) to authenticated;
grant execute on function public.training_quiz_results(integer) to authenticated;


-- ============ QUIZ VALIDATION 1 ============

insert into public.training_quizzes (
  code, title, description, pass_score, sections, active
) values (
  'validation-1',
  'Quiz validation 1 – Formation commerciale',
  'Évalue les bases du rôle commercial, du vitrage, de SONCAS et de la conduite d’appel.',
  16,
  '["Rôle et offre", "Le produit", "SONCAS", "L''appel", "Répondre au client"]'::jsonb,
  true
)
on conflict (code) do update set
  title = excluded.title,
  description = excluded.description,
  pass_score = excluded.pass_score,
  sections = excluded.sections,
  active = excluded.active,
  updated_at = now();

with quiz as (
  select id from public.training_quizzes where code = 'validation-1'
), data(question_code, section_name, prompt, choices, correct_index, explanation, sort_order) as (
  values
  ('q01', 'Rôle et offre', 'Un lead arrive par Facebook. Dans quel délai le rappelles-tu ?',
   '["Dans les 2 à 3 minutes", "Dans la demi-heure", "Avant la fin de la journée", "Le lendemain matin"]'::jsonb,
   0, 'Au-delà de 3 minutes, le client appelle un concurrent.', 1),
  ('q02', 'Rôle et offre', 'Pour toi, qu''est-ce qu''un appel réussi ?',
   '["Le SMS avec le lien des documents est envoyé", "Le client a choisi son cadeau", "La date du rendez-vous est fixée pendant l''appel", "Le client a donné son RIB"]'::jsonb,
   0, 'Le SMS envoyé, c''est l''appel réussi. La date se fixe seulement après l''accord de l''assureur.', 2),
  ('q03', 'Rôle et offre', 'Quelle est l''offre du moment ?',
   '["Virement jusqu''à 300 €, iPhone 14, PlayStation 5, trottinette électrique ou franchise offerte", "Virement de 300 € pour tout le monde, ou un iPhone 15", "Bon d''achat de 150 € ou franchise offerte", "Virement jusqu''à 500 € ou une PlayStation 5"]'::jsonb,
   0, 'Sous conditions, franchise éventuelle à déduire. Le cadeau est remis le jour du rendez-vous.', 3),
  ('q04', 'Le produit', 'Quelle est la différence entre un déflecteur et une custode ?',
   '["Le déflecteur est sur la portière et s''ouvre avec elle ; la custode est sur la carrosserie", "Le déflecteur est à l''avant, la custode à l''arrière", "La custode est sur la portière, le déflecteur sur le toit", "C''est la même vitre, avec deux noms"]'::jsonb,
   0, 'La question à poser : « Quand vous ouvrez la portière, la petite vitre part avec elle ? »', 4),
  ('q05', 'Le produit', 'Vu de biais, le pare-brise du client a des reflets violets ou bleus qui changent avec l''angle. C''est sans doute un pare-brise…',
   '["athermique", "teinté vert", "chauffant", "avec capteur de pluie"]'::jsonb,
   0, 'Une couche métallique entre les deux verres renvoie la chaleur. Le badge télépéage va dans la zone prévue derrière le rétroviseur.', 5),
  ('q06', 'Le produit', 'Quelle est la différence entre un pare-brise absorbant et un pare-brise athermique ?',
   '["L''absorbant garde la chaleur dans le verre, l''athermique la renvoie comme un miroir", "Aucune, ce sont deux noms pour le même pare-brise", "L''absorbant absorbe le bruit, l''athermique la chaleur", "L''athermique est réservé aux voitures électriques"]'::jsonb,
   0, 'L''absorbant est un verre surteinté dans la masse. L''athermique a une couche métallique invisible.', 6),
  ('q07', 'Le produit', 'Le client dit : « Mes essuie-glaces se déclenchent tout seuls quand il pleut. » Qu''en déduis-tu ?',
   '["Il a un capteur de pluie : c''est une autre référence de pare-brise, donc un autre prix", "Il a un pare-brise chauffant", "Ça ne change rien au pare-brise", "Il a un affichage tête haute"]'::jsonb,
   0, 'Le client ne connaît pas le nom des options : pose des questions sur ce qu''il voit.', 7),
  ('q08', 'Le produit', 'La voiture a une caméra derrière le rétroviseur (ADAS). Que dis-tu au client ?',
   '["La caméra sera recalibrée après la pose, et tu conseilles l''atelier", "Rien, ça ne change rien", "Que l''intervention à domicile est obligatoire", "Qu''il doit faire retirer la caméra avant le rendez-vous"]'::jsonb,
   0, 'Règle d''or n° 7 : caméra ou capteurs, conseille l''atelier. Levier : Sécurité.', 8),
  ('q09', 'Le produit', 'Quelle garantie de pose annonces-tu ?',
   '["1 an sur la main-d''œuvre, étanchéité à vie", "6 mois sur tout", "2 ans sur la main-d''œuvre, 5 ans sur l''étanchéité", "À vie sur le pare-brise"]'::jsonb,
   0, 'Et on pose des grandes marques : Saint-Gobain, Pilkington, AGC, Guardian, VSF.', 9),
  ('q10', 'SONCAS', 'Que veut dire SONCAS ?',
   '["Sécurité, Orgueil, Nouveauté, Confort, Argent, Sympathie", "Service, Offre, Négociation, Conclusion, Accord, Suivi", "Sécurité, Organisation, Nouveauté, Calme, Avance, Sourire", "Simplicité, Orgueil, Nombre, Confort, Achat, Satisfaction"]'::jsonb,
   0, 'Un client a souvent deux ou trois leviers, mais un seul décide.', 10),
  ('q11', 'SONCAS', '« Combien je vais sortir de ma poche ? » Quel levier entends-tu ?',
   '["Argent", "Sécurité", "Orgueil", "Sympathie"]'::jsonb,
   0, 'Réponds par un montant net clair : offre moins franchise.', 11),
  ('q12', 'SONCAS', '« Vous êtes le quatrième que j''appelle. » Quel levier, et que réponds-tu ?',
   '["Orgueil : « Vous avez bien fait de comparer. »", "Argent : tu baisses ton montant", "Sympathie : tu proposes de le rappeler plus tard", "Nouveauté : tu parles de la trottinette"]'::jsonb,
   0, 'C''est lui qui choisit son réparateur et son cadeau : traite-le en connaisseur.', 12),
  ('q13', 'SONCAS', 'Le client dit : « Je viens de faire un accident. » Que fais-tu d''abord ?',
   '["Tu demandes si tout le monde va bien", "Tu demandes le nom de son assureur", "Tu annonces le montant de l''offre", "Tu demandes l''immatriculation"]'::jsonb,
   0, 'Levier Sympathie : la personne d''abord, la vitre et l''assurance ensuite.', 13),
  ('q14', 'L''appel', 'Dans quel ordre se déroulent les 4 étapes de ton appel ?',
   '["Accueil, qualifier, offre, conclure", "Offre, accueil, qualifier, conclure", "Accueil, offre, conclure, qualifier", "Qualifier, accueil, conclure, offre"]'::jsonb,
   0, 'Après l''appel : documents, sinistre en conférence à trois, accord, intervention.', 14),
  ('q15', 'L''appel', 'Pendant l''étape « Qualifier », le client demande combien il va recevoir. Que réponds-tu ?',
   '["Tu dis « jusqu''à » : pas de montant avant le calcul", "Tu annonces 300 € pour le rassurer", "Tu donnes une moyenne de 200 €", "Tu refuses de répondre"]'::jsonb,
   0, 'Règle d''or n° 2 : jamais de montant avant le calcul.', 15),
  ('q16', 'L''appel', 'Le client veut un rendez-vous ce soir. Que fais-tu ?',
   '["Il faut d''abord l''accord de l''assurance : tu proposes un créneau le lendemain", "Tu fixes ce soir pour ne pas le perdre", "Tu l''envoies vers un autre réparateur", "Tu lui dis de rappeler dans une semaine"]'::jsonb,
   0, 'Règle d''or n° 3 : rendez-vous confirmé seulement après l''accord de l''assureur.', 16),
  ('q17', 'L''appel', 'Qui déclare le sinistre à l''assurance ?',
   '["Ta collègue, en conférence à trois avec le client et l''assureur", "Le client, seul, avant de nous appeler", "Le technicien, le jour de la pose", "Toi, pendant ton appel, sans le client"]'::jsonb,
   0, 'Et règle d''or n° 1 : ne souffle jamais au client quoi déclarer.', 17),
  ('q18', 'Répondre au client', 'Offre calculée : 200 €. Franchise du client : 79 €. Combien reçoit-il ?',
   '["121 €", "200 €", "279 €", "79 €"]'::jsonb,
   0, 'Offre − franchise = virement, fait le jour du rendez-vous. Le client n''avance rien.', 18),
  ('q19', 'Répondre au client', '« Vous êtes partenaire de mon assurance ? » Que réponds-tu ?',
   '["« Non, on est indépendants : depuis la loi Hamon de 2014, vous choisissez librement votre réparateur. »", "« Oui, on travaille avec toutes les assurances. »", "« Non, donc il faudra avancer les frais. »", "« Je ne sais pas, je vérifie. »"]'::jsonb,
   0, 'Règle d''or n° 4 : libre choix, jamais « partenariat ». L''assurance paye directement.', 19),
  ('q20', 'Répondre au client', '« Ma cotisation va augmenter ? » Que réponds-tu ?',
   '["« Un bris de glace seul ne compte pas dans votre bonus-malus. Vos tarifs, c''est votre assureur qui les fixe. »", "« Non, jamais, c''est garanti. »", "« Oui, d''environ 10 %. »", "« Ça dépend de nous. »"]'::jsonb,
   0, 'Ne promets jamais que la cotisation ne bougera pas.', 20)
)
insert into public.training_quiz_questions (
  quiz_id, question_code, section_name, prompt, choices,
  correct_index, explanation, sort_order
)
select quiz.id, data.question_code, data.section_name, data.prompt, data.choices,
       data.correct_index, data.explanation, data.sort_order
from quiz cross join data
on conflict (quiz_id, question_code) do update set
  section_name = excluded.section_name,
  prompt = excluded.prompt,
  choices = excluded.choices,
  correct_index = excluded.correct_index,
  explanation = excluded.explanation,
  sort_order = excluded.sort_order,
  updated_at = now();

-- Rollback manuel :
-- drop function if exists public.training_quiz_results(integer);
-- drop function if exists public.training_quiz_attempt_detail(uuid);
-- drop function if exists public.answer_training_quiz(uuid, text, integer);
-- drop function if exists public.start_training_quiz(text, boolean);
-- drop function if exists public.training_quiz_attempt_state(uuid);
-- drop function if exists public.training_quiz_catalog();
-- drop table if exists public.training_quiz_answers;
-- drop table if exists public.training_quiz_attempts;
-- drop table if exists public.training_quiz_questions;
-- drop table if exists public.training_quizzes;
