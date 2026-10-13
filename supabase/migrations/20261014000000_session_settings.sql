-- Per-session rules chosen by the teacher: timer, answer change, shuffle, leaderboard, show answer.
alter table game_sessions add column settings jsonb not null default '{}';
