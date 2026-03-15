import GrowthCommandCenter from "@/components/ui/GrowthCommandCenter";
import AIOpportunityFeed from "@/components/ui/AIOpportunityFeed";
import GrowthExperiments from "@/components/ui/GrowthExperiments";
import AutomationSchedule from "@/components/ui/AutomationSchedule";
import PredictiveScaling from "@/components/ui/PredictiveScaling";

export default function DashboardPage() {
  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-1">Dashboard</h1>
        <p className="text-gray-400 mb-10">Your AI-powered marketing command center.</p>

        <GrowthCommandCenter />
        <AIOpportunityFeed />
        <GrowthExperiments />
        <AutomationSchedule />
        <PredictiveScaling />
      </div>
    </div>
  );
}
