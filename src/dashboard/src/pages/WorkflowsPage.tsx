import { useState } from "react";
import { PuchoCard } from "../components";
import { workflowTemplates } from "../lib/templates";
import type { PuchoWorkflow } from "../lib/workflow";

export default function WorkflowsPage() {
  const [selectedWorkflow, setSelectedWorkflow] =
    useState<PuchoWorkflow | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function handleSelect(templateId: string) {
    if (selectedId === templateId) {
      setSelectedId(null);
      setSelectedWorkflow(null);
      return;
    }
    const template = workflowTemplates.find((t) => t.id === templateId);
    if (template) {
      setSelectedId(templateId);
      setSelectedWorkflow(template.generate());
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl">Workflows</h1>

      {/* Template Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {workflowTemplates.map((template) => (
          <PuchoCard
            key={template.id}
            className={`cursor-pointer transition-all ${
              selectedId === template.id
                ? "ring-2 ring-pucho-violet"
                : "hover:shadow-md"
            }`}
          >
            <button
              type="button"
              className="w-full text-left"
              onClick={() => handleSelect(template.id)}
            >
              <div className="text-3xl mb-3">{template.icon}</div>
              <h3 className="font-heading font-semibold text-pucho-violet text-base mb-2">
                {template.name}
              </h3>
              <p className="font-body text-sm text-black/70">
                {template.description}
              </p>
            </button>
          </PuchoCard>
        ))}
      </div>

      {/* JSON Viewer */}
      {selectedWorkflow && (
        <PuchoCard>
          <h3 className="text-lg mb-3">Generated Workflow JSON</h3>
          <pre
            className="font-mono text-sm text-pucho-violet p-4 overflow-x-auto"
            style={{
              backgroundColor: "#f8f5ff",
              borderRadius: "12px",
            }}
          >
            {JSON.stringify(selectedWorkflow, null, 2)}
          </pre>
        </PuchoCard>
      )}
    </div>
  );
}
