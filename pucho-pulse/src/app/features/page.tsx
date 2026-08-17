import { features } from '@/lib/metrics';
import { parseDays } from '@/lib/scope';
import { Card, Grid, Tile, Empty } from '@/components/ui';
import { HBars } from '@/components/charts';
import { inShort, pct, toNum } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** Feature Usage — Q11, Q12, Q13, Q24. */
export default async function FeaturesPage({ searchParams }: { searchParams: { days?: string } }) {
  const days = parseDays(searchParams.days);
  const d = await features(days);
  const f = d.flags;
  const total = toNum(f?.total_questions);
  const share = (v: unknown) => (total ? pct((toNum(v) / total) * 100, 0) : '—');
  const voiceMinutes = d.voice.reduce((s, r) => s + toNum(r.total_minutes), 0);

  return (
    <div className="flex flex-col gap-4">
      <Grid cols={4}>
        <Tile label="Questions" value={inShort(total)} hint={`Q12 · last ${days} days`} />
        <Tile label="Pro Search" value={inShort(f?.pro_search)} hint={`${share(f?.pro_search)} of questions`} />
        <Tile label="Deep Research" value={inShort(f?.deep_research)} hint={`${share(f?.deep_research)} of questions`} />
        <Tile label="From mobile" value={inShort(f?.from_mobile)} hint={`${share(f?.from_mobile)} of questions`} />
      </Grid>

      <Card title="Chat types" sub={`Q11 · Office signal is PUCHO_OFFICE* · last ${days} days`}>
        <HBars data={d.chatTypes} labelKey="chatType" valueKey="chats" valueLabel="Chats" />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Voice usage" sub={`Q13 · ${inShort(voiceMinutes)} minutes total (durationSec, never callDuration)`}>
          {d.voice.length === 0 ? (
            <Empty message="No calls in this range" />
          ) : (
            <HBars data={d.voice} labelKey="organization" valueKey="total_minutes" valueLabel="Minutes" suffix="m" />
          )}
        </Card>
        <Card title="Workflow leaderboard" sub={`Q24 · credits burned per flow, last ${days} days`}>
          <HBars data={d.workflows} labelKey="flowName" valueKey="credits" valueLabel="Credits" />
        </Card>
      </div>
    </div>
  );
}
