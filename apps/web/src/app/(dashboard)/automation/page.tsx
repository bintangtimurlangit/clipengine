import { AutomationOverview } from "@/components/automation/automation-overview";
import { serverApiBase } from "@/lib/api";
import { serverFetchJsonInit } from "@/lib/server-fetch";
import type { PipelineRun } from "@/types/run";

type AutomationApiResponse = {
  mode?: string;
  message?: string;
  youtube?: {
    hasCredentials?: boolean;
    connected?: boolean;
    uploadReady?: boolean;
    accountCount?: number;
    connectedAccountCount?: number;
  };
  automatedRuns?: PipelineRun[];
};

export default async function AutomationPage() {
  const base = serverApiBase();
  let message = "";
  let mode = "none";
  let youtube: AutomationApiResponse["youtube"];
  let automatedRuns: PipelineRun[] = [];
  let apiReachable = false;

  try {
    const res = await fetch(`${base}/api/automation`, serverFetchJsonInit());
    apiReachable = res.ok;
    if (res.ok) {
      const j = (await res.json()) as AutomationApiResponse;
      mode = j.mode ?? mode;
      message = j.message ?? "";
      youtube = j.youtube;
      automatedRuns = Array.isArray(j.automatedRuns) ? j.automatedRuns : [];
    } else {
      message = `API returned ${res.status}.`;
    }
  } catch {
    message = "Could not reach the API automation endpoint.";
    apiReachable = false;
  }

  return (
    <AutomationOverview
      mode={mode}
      message={message}
      youtube={youtube}
      apiReachable={apiReachable}
      automatedRuns={automatedRuns}
    />
  );
}
