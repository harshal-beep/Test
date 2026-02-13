import { useState } from "react";
import { PuchoCard, PuchoButton, PuchoEmpty, StatusBadge } from "../components";
import { useWebhookManager } from "../lib/webhooks";

export default function ConnectionsPage() {
  const { connections, addConnection, removeConnection } =
    useWebhookManager();

  const [sourceName, setSourceName] = useState("");
  const [workflowName, setWorkflowName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!sourceName.trim()) newErrors.sourceName = "Source name is required";
    if (!workflowName.trim())
      newErrors.workflowName = "Workflow name is required";
    if (!webhookUrl.trim()) {
      newErrors.webhookUrl = "Webhook URL is required";
    } else if (
      !webhookUrl.startsWith("http://") &&
      !webhookUrl.startsWith("https://")
    ) {
      newErrors.webhookUrl = "URL must start with http:// or https://";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    addConnection(sourceName.trim(), workflowName.trim(), webhookUrl.trim());
    setSourceName("");
    setWorkflowName("");
    setWebhookUrl("");
    setErrors({});
  }

  const inputClass =
    "w-full px-3 py-2 text-sm font-body border border-[#e0d8f0] focus:outline-none focus:ring-2 focus:ring-pucho-violet/30 focus:border-pucho-violet";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Connections</h1>
        <p className="text-violet-blossom font-heading font-semibold mt-1">
          Pucho Toh Sahi!
        </p>
      </div>

      {/* Add Connection Form */}
      <PuchoCard>
        <h3 className="text-lg mb-4">Add Connection</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-body text-black/70 mb-1">
                Source Name
              </label>
              <input
                type="text"
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                className={inputClass}
                style={{ borderRadius: "6px" }}
                placeholder="e.g. KPI Dashboard"
              />
              {errors.sourceName && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.sourceName}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-body text-black/70 mb-1">
                Workflow Name
              </label>
              <input
                type="text"
                value={workflowName}
                onChange={(e) => setWorkflowName(e.target.value)}
                className={inputClass}
                style={{ borderRadius: "6px" }}
                placeholder="e.g. Daily Report Workflow"
              />
              {errors.workflowName && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.workflowName}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-body text-black/70 mb-1">
                Webhook URL
              </label>
              <input
                type="text"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className={inputClass}
                style={{ borderRadius: "6px" }}
                placeholder="https://api.pucho.ai/webhook/..."
              />
              {errors.webhookUrl && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.webhookUrl}
                </p>
              )}
            </div>
          </div>
          <PuchoButton type="submit">Add Connection</PuchoButton>
        </form>
      </PuchoCard>

      {/* Connection List */}
      {connections.length === 0 ? (
        <PuchoEmpty />
      ) : (
        <div className="space-y-4">
          {connections.map((conn) => (
            <PuchoCard key={conn.id}>
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-heading font-semibold text-pucho-violet">
                      {conn.sourceName}
                    </span>
                    <span className="text-black/40">&rarr;</span>
                    <span className="font-heading font-semibold text-pucho-violet">
                      {conn.workflowName}
                    </span>
                    <StatusBadge status={conn.status} />
                  </div>
                  <p className="font-mono text-xs text-black/50 truncate">
                    {conn.webhookUrl}
                  </p>
                </div>
                <PuchoButton
                  variant="secondary"
                  className="ml-4 text-xs"
                  onClick={() => removeConnection(conn.id)}
                >
                  Remove
                </PuchoButton>
              </div>
            </PuchoCard>
          ))}
        </div>
      )}
    </div>
  );
}
