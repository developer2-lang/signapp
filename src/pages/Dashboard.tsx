import { DashboardStats } from '../components/dashboard/DashboardStats';
import { SigningPerformance } from '../components/dashboard/SigningPerformance';
import { PendingEnvelopes } from '../components/dashboard/PendingEnvelopes';
import { RecentActivity } from '../components/dashboard/RecentActivity';

export function Dashboard({ onOpenEnvelope }: { onOpenEnvelope: (id: string) => void }) {
  return (
    <>
      <DashboardStats />
      <SigningPerformance />
      <div className="section-title">
        <h2>Needs your action</h2>
      </div>
      <div className="card">
        <PendingEnvelopes onOpenEnvelope={onOpenEnvelope} />
      </div>
      <div className="section-title">
        <h2>Recent activity</h2>
      </div>
      <div className="card">
        <RecentActivity />
      </div>
    </>
  );
}
