-- Every video generation job in the studio was written without an episode_id:
-- the video route set project and shot but never the episode. The images route
-- set it only for shots, so character and asset art was unattributed too. Per
-- episode, that reported zero video spend for episodes whose clips were the
-- entire bill — one project had 77 of 77 video jobs unattributed, and the
-- episode panel showed a cost of zero against sixteen rendered shots.
--
-- The routes now set it. These rows are not unknowable — a job names its shot
-- or the chat session it came from, and both name an episode — so they are
-- recovered here rather than left permanently outside every episode total.

-- A job on a shot belongs to that shot's episode. This is the exact answer and
-- covers every video job and every storyboard keyframe.
update public.creator_generation_jobs as j
set episode_id = s.episode_id
from public.creator_shots as s
where j.shot_id = s.id
  and j.episode_id is null
  and s.episode_id is not null;

-- Character and asset art names no shot, but the chat session it was requested
-- in belongs to an episode, which is the episode the user was working on.
update public.creator_generation_jobs as j
set episode_id = c.episode_id
from public.creator_chat_sessions as c
where j.session_id = c.id
  and j.episode_id is null
  and c.episode_id is not null;

-- A workflow run records its episode directly, and a job started by the
-- Director carries the run it belongs to.
update public.creator_generation_jobs as j
set episode_id = r.episode_id
from public.creator_workflow_runs as r
where j.workflow_run_id = r.id
  and j.episode_id is null
  and r.episode_id is not null;

-- Last resort: a project with exactly one episode has only one answer.
update public.creator_generation_jobs as j
set episode_id = e.id
from public.creator_episodes as e
where j.project_id = e.project_id
  and j.episode_id is null
  and (select count(*) from public.creator_episodes x where x.project_id = j.project_id) = 1;

-- Anything still null belongs to a multi-episode project and names no shot,
-- session, or run. Those stay unattributed, and the cost panel says so rather
-- than guessing which episode paid.
