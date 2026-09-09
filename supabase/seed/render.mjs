// Renders daily_content.mjs into supabase/migrations/0007_seed_daily_content.sql.
// Run: node supabase/seed/render.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TOPICS, QUIZ } from './daily_content.mjs';

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const START = '2026-09-10'; // first dated day; everything after rotates by day-of-epoch

function dateFor(i) {
  const d = new Date(`${START}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
}

let sql = `-- ============================================================================
-- 0007 — Seeded daily content (GENERATED from supabase/seed/daily_content.mjs;
-- edit that file and re-run \`node supabase/seed/render.mjs\` instead of editing here).
-- ${TOPICS.length} topics and ${QUIZ.length} quiz questions, dated from ${START}.
-- Rows are keyed by day, so re-running updates copy without duplicating.
-- ============================================================================
insert into public.vm_daily_topics (day, theme, title, prompt, sort_order) values
`;
sql += TOPICS.map(([theme, title, prompt], i) => `  (${q(dateFor(i))}, ${q(theme)}, ${q(title)}, ${q(prompt)}, ${i + 1})`).join(',\n');
sql += `
on conflict (day) do update set theme = excluded.theme, title = excluded.title, prompt = excluded.prompt, sort_order = excluded.sort_order;

insert into public.vm_quiz_questions (day, theme, question, options, answer_index, explanation, sort_order) values
`;
sql += QUIZ.map(([theme, question, options, answer, explanation], i) =>
  `  (${q(dateFor(i))}, ${q(theme)}, ${q(question)}, ${q(JSON.stringify(options))}::jsonb, ${answer}, ${q(explanation)}, ${i + 1})`).join(',\n');
sql += `
on conflict (day) do update set theme = excluded.theme, question = excluded.question, options = excluded.options,
  answer_index = excluded.answer_index, explanation = excluded.explanation, sort_order = excluded.sort_order;
`;

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '0007_seed_daily_content.sql');
writeFileSync(out, sql);
console.log(`wrote ${out}: ${TOPICS.length} topics, ${QUIZ.length} questions`);
