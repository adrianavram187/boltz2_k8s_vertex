import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";

interface Chain {
  id: string;
  entityType: string;
  label: string;
  sequence: string;
  smiles: string;
  ccd: string;
  msa: string;
  cyclic: boolean;
}

interface Modification {
  modId: string;
  position: string;
  ccd: string;
}

interface BondConstraint {
  id: string;
  chainA: string;
  resA: string;
  atomA: string;
  chainB: string;
  resB: string;
  atomB: string;
}

interface ContactConstraint {
  id: string;
  chain1: string;
  token1: string;
  chain2: string;
  token2: string;
  maxDistance: string;
  force: boolean;
}

interface PocketConstraint {
  id: string;
  binder: string;
  contacts: string;
  maxDistance: string;
  force: boolean;
}

interface Template {
  id: string;
  templateType: string;
  path: string;
  chainId: string;
  templateId: string;
  force: boolean;
  threshold: string;
}

interface YamlConfigFormProps {
  onSubmit: (yamlString: string) => void;
  isUploading: boolean;
}

const ENTITY_TYPES = ["protein", "dna", "rna", "ligand"];
const CONSTRAINT_TABS = ["bond", "contact", "pocket"] as const;

export default function YamlConfigForm({ onSubmit, isUploading }: YamlConfigFormProps) {
  const [chains, setChains] = useState<Chain[]>([
    { id: crypto.randomUUID(), entityType: "protein", label: "", sequence: "", smiles: "", ccd: "", msa: "", cyclic: false },
  ]);
  const [modifications, setModifications] = useState<Record<string, Modification[]>>({});
  const [bonds, setBonds] = useState<BondConstraint[]>([]);
  const [contacts, setContacts] = useState<ContactConstraint[]>([]);
  const [pockets, setPockets] = useState<PocketConstraint[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [affinityBinder, setAffinityBinder] = useState("");

  const [showConstraints, setShowConstraints] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAffinity, setShowAffinity] = useState(false);
  const [constraintTab, setConstraintTab] = useState<string>("bond");

  const addChain = () => {
    setChains((prev) => [...prev, { id: crypto.randomUUID(), entityType: "protein", label: "", sequence: "", smiles: "", ccd: "", msa: "", cyclic: false }]);
  };

  const removeChain = (id: string) => {
    setChains((prev) => (prev.length > 1 ? prev.filter((c) => c.id !== id) : prev));
  };

  const updateChain = (id: string, field: keyof Chain, value: string | boolean) => {
    setChains((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  };

  const addMod = (chainId: string) => {
    setModifications((prev) => ({
      ...prev,
      [chainId]: [...(prev[chainId] || []), { modId: crypto.randomUUID(), position: "", ccd: "" }],
    }));
  };

  const removeMod = (chainId: string, modId: string) => {
    setModifications((prev) => ({
      ...prev,
      [chainId]: (prev[chainId] || []).filter((m) => m.modId !== modId),
    }));
  };

  const updateMod = (chainId: string, modId: string, field: keyof Modification, value: string) => {
    setModifications((prev) => ({
      ...prev,
      [chainId]: (prev[chainId] || []).map((m) =>
        m.modId === modId ? { ...m, [field]: value } : m
      ),
    }));
  };

  const chainLabels = chains.map((c) => (c.label.trim() || `Chain${chains.indexOf(c) + 1}`));

  const buildYamlConfig = (): string => {
    const lines: string[] = [];

    lines.push(`version: 1`);

    // sequences
    if (chains.some((c) => c.sequence.trim() || c.smiles.trim() || c.ccd.trim())) {
      lines.push(`sequences:`);
      chains.forEach((c) => {
        const hasInput = c.entityType === "ligand"
          ? (c.smiles.trim() || c.ccd.trim())
          : c.sequence.trim();
        if (!hasInput) return;
        lines.push(`  - ${c.entityType}:`);
        if (c.label.trim()) {
          lines.push(`      id: ${c.label}`);
        }
        if (c.entityType === "ligand") {
          if (c.smiles.trim()) lines.push(`      smiles: '${c.smiles}'`);
          if (c.ccd.trim()) lines.push(`      ccd: ${c.ccd}`);
        } else {
          lines.push(`      sequence: ${c.sequence}`);
          if (c.msa.trim()) lines.push(`      msa: ${c.msa}`);
        }
        const mods = modifications[c.id] || [];
        if (mods.length > 0) {
          lines.push(`      modifications:`);
          mods.forEach((m) => {
            if (m.position.trim() && m.ccd.trim()) {
              lines.push(`        - position: ${m.position}`);
              lines.push(`          ccd: ${m.ccd}`);
            }
          });
        }
        if (c.cyclic) {
          lines.push(`      cyclic: true`);
        }
      });
    }

    // constraints
    const hasConstraints = bonds.length > 0 || contacts.length > 0 || pockets.length > 0;
    if (hasConstraints) {
      lines.push(`constraints:`);
      bonds.forEach((b) => {
        if (b.chainA && b.chainB) {
          lines.push(`  - bond:`);
          lines.push(`      atom1: [${b.chainA}, ${b.resA || 1}, ${b.atomA || "CA"}]`);
          lines.push(`      atom2: [${b.chainB}, ${b.resB || 1}, ${b.atomB || "CA"}]`);
        }
      });
      contacts.forEach((c) => {
        if (c.chain1 && c.chain2) {
          lines.push(`  - contact:`);
          lines.push(`      token1: [${c.chain1}, ${c.token1 || "1"}]`);
          lines.push(`      token2: [${c.chain2}, ${c.token2 || "1"}]`);
          if (c.maxDistance.trim()) lines.push(`      max_distance: ${c.maxDistance}`);
          if (c.force) lines.push(`      force: true`);
        }
      });
      pockets.forEach((p) => {
        if (p.binder) {
          lines.push(`  - pocket:`);
          lines.push(`      binder: ${p.binder}`);
          if (p.contacts.trim()) {
            const contactPairs = p.contacts.split(",").map((pair) => {
              const parts = pair.trim().split(/\s+/);
              return `[${parts.join(", ")}]`;
            });
            lines.push(`      contacts: [${contactPairs.join(", ")}]`);
          }
          if (p.maxDistance.trim()) lines.push(`      max_distance: ${p.maxDistance}`);
          if (p.force) lines.push(`      force: true`);
        }
      });
    }

    // templates
    if (templates.length > 0) {
      lines.push(`templates:`);
      templates.forEach((t) => {
        if (t.path.trim()) {
          lines.push(`  - ${t.templateType}: ${t.path}`);
          if (t.chainId.trim()) {
            const ids = t.chainId.split(",").map((s) => s.trim()).filter(Boolean);
            if (ids.length > 1) {
              lines.push(`    chain_id: [${ids.join(", ")}]`);
            } else {
              lines.push(`    chain_id: ${ids[0]}`);
            }
          }
          if (t.templateId.trim()) {
            const ids = t.templateId.split(",").map((s) => s.trim()).filter(Boolean);
            if (ids.length > 1) {
              lines.push(`    template_id: [${ids.join(", ")}]`);
            } else {
              lines.push(`    template_id: ${ids[0]}`);
            }
          }
          if (t.force) lines.push(`    force: true`);
          if (t.threshold.trim()) lines.push(`    threshold: ${t.threshold}`);
        }
      });
    }

    // affinity
    if (affinityBinder.trim()) {
      lines.push(`properties:`);
      lines.push(`  - affinity:`);
      lines.push(`      binder: ${affinityBinder}`);
    }

    return lines.join("\n");
  };

  const handleSubmit = () => {
    const yaml = buildYamlConfig();
    onSubmit(yaml);
  };

  return (
    <div className="space-y-5">
      {/* Sequences */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">Sequences</label>
          <button type="button" onClick={addChain} className="flex items-center gap-1 text-xs text-gsk-orange hover:text-gsk-orange-dark font-medium">
            <Plus className="w-3.5 h-3.5" /> Add Entity
          </button>
        </div>
        {chains.map((chain, idx) => {
          const isLigand = chain.entityType === "ligand";
          return (
            <div key={chain.id} className="flex flex-col gap-2 mb-3 p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-gray-400">#{idx + 1}</span>
                <select
                  value={chain.entityType}
                  onChange={(e) => updateChain(chain.id, "entityType", e.target.value)}
                  className="px-2 py-1 text-xs border border-gray-200 rounded-md bg-white"
                >
                  {ENTITY_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Chain ID (e.g., A, B)"
                  value={chain.label}
                  onChange={(e) => updateChain(chain.id, "label", e.target.value)}
                  className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-gsk-orange"
                />
                {chains.length > 1 && (
                  <button type="button" onClick={() => removeChain(chain.id)} className="text-gray-400 hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {isLigand ? (
                <>
                  <textarea
                    placeholder="SMILES string"
                    value={chain.smiles}
                    onChange={(e) => updateChain(chain.id, "smiles", e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 text-xs font-mono border border-gray-200 rounded-md focus:outline-none focus:border-gsk-orange resize-y"
                  />
                  <input
                    type="text"
                    placeholder="CCD code (optional)"
                    value={chain.ccd}
                    onChange={(e) => updateChain(chain.id, "ccd", e.target.value)}
                    className="w-full px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-gsk-orange"
                  />
                </>
              ) : (
                <>
                  <textarea
                    placeholder={`Enter ${chain.entityType} sequence...`}
                    value={chain.sequence}
                    onChange={(e) => updateChain(chain.id, "sequence", e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 text-xs font-mono border border-gray-200 rounded-md focus:outline-none focus:border-gsk-orange resize-y"
                  />
                  {chain.entityType === "protein" && (
                    <input
                      type="text"
                      placeholder="MSA path (optional)"
                      value={chain.msa}
                      onChange={(e) => updateChain(chain.id, "msa", e.target.value)}
                      className="w-full px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-gsk-orange"
                    />
                  )}
                </>
              )}

              {/* Modifications (protein only) */}
              {!isLigand && (
                <div className="mt-1">
                  <button type="button" onClick={() => addMod(chain.id)} className="flex items-center gap-1 text-xs text-gsk-orange hover:text-gsk-orange-dark font-medium">
                    <Plus className="w-3 h-3" /> Add Modification
                  </button>
                  {(modifications[chain.id] || []).map((m) => (
                    <div key={m.modId} className="flex items-center gap-2 mt-1">
                      <input
                        type="number"
                        placeholder="Position"
                        value={m.position}
                        onChange={(e) => updateMod(chain.id, m.modId, "position", e.target.value)}
                        className="w-20 px-2 py-1 text-xs border border-gray-200 rounded-md"
                      />
                      <input
                        type="text"
                        placeholder="CCD code"
                        value={m.ccd}
                        onChange={(e) => updateMod(chain.id, m.modId, "ccd", e.target.value)}
                        className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-gsk-orange"
                      />
                      <button type="button" onClick={() => removeMod(chain.id, m.modId)} className="text-gray-400 hover:text-red-500">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Cyclic toggle */}
              <label className="flex items-center gap-2 text-xs text-gray-500">
                <input
                  type="checkbox"
                  checked={chain.cyclic}
                  onChange={(e) => updateChain(chain.id, "cyclic", e.target.checked)}
                  className="rounded border-gray-300"
                />
                Cyclic
              </label>
            </div>
          );
        })}
      </div>

      {/* Constraints */}
      <div>
        <button type="button" onClick={() => setShowConstraints(!showConstraints)} className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900">
          {showConstraints ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          Constraints
        </button>
        {showConstraints && (
          <div className="mt-2 space-y-3">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {CONSTRAINT_TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setConstraintTab(tab)}
                  className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-md transition-colors ${
                    constraintTab === tab ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Bond constraints */}
            {constraintTab === "bond" && (
              <div className="space-y-2">
                {bonds.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg flex-wrap">
                    <select value={b.chainA} onChange={(e) => setBonds((prev) => prev.map((x) => x.id === b.id ? { ...x, chainA: e.target.value } : x))} className="px-2 py-1 text-xs border border-gray-200 rounded-md bg-white">
                      <option value="">Chain A</option>
                      {chainLabels.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <input type="number" placeholder="Res" value={b.resA} onChange={(e) => setBonds((prev) => prev.map((x) => x.id === b.id ? { ...x, resA: e.target.value } : x))} className="w-16 px-2 py-1 text-xs border border-gray-200 rounded-md" />
                    <input type="text" placeholder="Atom" value={b.atomA} onChange={(e) => setBonds((prev) => prev.map((x) => x.id === b.id ? { ...x, atomA: e.target.value } : x))} className="w-14 px-2 py-1 text-xs border border-gray-200 rounded-md" />
                    <span className="text-xs text-gray-400">—</span>
                    <select value={b.chainB} onChange={(e) => setBonds((prev) => prev.map((x) => x.id === b.id ? { ...x, chainB: e.target.value } : x))} className="px-2 py-1 text-xs border border-gray-200 rounded-md bg-white">
                      <option value="">Chain B</option>
                      {chainLabels.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <input type="number" placeholder="Res" value={b.resB} onChange={(e) => setBonds((prev) => prev.map((x) => x.id === b.id ? { ...x, resB: e.target.value } : x))} className="w-16 px-2 py-1 text-xs border border-gray-200 rounded-md" />
                    <input type="text" placeholder="Atom" value={b.atomB} onChange={(e) => setBonds((prev) => prev.map((x) => x.id === b.id ? { ...x, atomB: e.target.value } : x))} className="w-14 px-2 py-1 text-xs border border-gray-200 rounded-md" />
                    <button type="button" onClick={() => setBonds((prev) => prev.filter((x) => x.id !== b.id))} className="text-gray-400 hover:text-red-500 ml-auto"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                <button type="button" onClick={() => setBonds((prev) => [...prev, { id: crypto.randomUUID(), chainA: "", resA: "", atomA: "CA", chainB: "", resB: "", atomB: "CA" }])} className="flex items-center gap-1 text-xs text-gsk-orange hover:text-gsk-orange-dark font-medium">
                  <Plus className="w-3.5 h-3.5" /> Add Bond
                </button>
              </div>
            )}

            {/* Contact constraints */}
            {constraintTab === "contact" && (
              <div className="space-y-2">
                {contacts.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg flex-wrap">
                    <select value={c.chain1} onChange={(e) => setContacts((prev) => prev.map((x) => x.id === c.id ? { ...x, chain1: e.target.value } : x))} className="px-2 py-1 text-xs border border-gray-200 rounded-md bg-white">
                      <option value="">Chain 1</option>
                      {chainLabels.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <input type="text" placeholder="Res/Atom" value={c.token1} onChange={(e) => setContacts((prev) => prev.map((x) => x.id === c.id ? { ...x, token1: e.target.value } : x))} className="w-20 px-2 py-1 text-xs border border-gray-200 rounded-md" />
                    <span className="text-xs text-gray-400">—</span>
                    <select value={c.chain2} onChange={(e) => setContacts((prev) => prev.map((x) => x.id === c.id ? { ...x, chain2: e.target.value } : x))} className="px-2 py-1 text-xs border border-gray-200 rounded-md bg-white">
                      <option value="">Chain 2</option>
                      {chainLabels.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <input type="text" placeholder="Res/Atom" value={c.token2} onChange={(e) => setContacts((prev) => prev.map((x) => x.id === c.id ? { ...x, token2: e.target.value } : x))} className="w-20 px-2 py-1 text-xs border border-gray-200 rounded-md" />
                    <input type="number" placeholder="Max dist" value={c.maxDistance} onChange={(e) => setContacts((prev) => prev.map((x) => x.id === c.id ? { ...x, maxDistance: e.target.value } : x))} className="w-20 px-2 py-1 text-xs border border-gray-200 rounded-md" />
                    <label className="flex items-center gap-1 text-xs text-gray-500">
                      <input type="checkbox" checked={c.force} onChange={(e) => setContacts((prev) => prev.map((x) => x.id === c.id ? { ...x, force: e.target.checked } : x))} className="rounded" />
                      Force
                    </label>
                    <button type="button" onClick={() => setContacts((prev) => prev.filter((x) => x.id !== c.id))} className="text-gray-400 hover:text-red-500 ml-auto"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                <button type="button" onClick={() => setContacts((prev) => [...prev, { id: crypto.randomUUID(), chain1: "", token1: "", chain2: "", token2: "", maxDistance: "", force: false }])} className="flex items-center gap-1 text-xs text-gsk-orange hover:text-gsk-orange-dark font-medium">
                  <Plus className="w-3.5 h-3.5" /> Add Contact
                </button>
              </div>
            )}

            {/* Pocket constraints */}
            {constraintTab === "pocket" && (
              <div className="space-y-2">
                {pockets.map((p) => (
                  <div key={p.id} className="flex flex-col gap-2 p-2 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Binder:</span>
                      <select value={p.binder} onChange={(e) => setPockets((prev) => prev.map((x) => x.id === p.id ? { ...x, binder: e.target.value } : x))} className="px-2 py-1 text-xs border border-gray-200 rounded-md bg-white">
                        <option value="">Select chain</option>
                        {chainLabels.map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                    <input type="text" placeholder="Contacts (e.g., A 10 CA, B 25 CB)" value={p.contacts} onChange={(e) => setPockets((prev) => prev.map((x) => x.id === p.id ? { ...x, contacts: e.target.value } : x))} className="w-full px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-gsk-orange" />
                    <div className="flex items-center gap-2">
                      <input type="number" placeholder="Max distance (Å)" value={p.maxDistance} onChange={(e) => setPockets((prev) => prev.map((x) => x.id === p.id ? { ...x, maxDistance: e.target.value } : x))} className="w-32 px-2 py-1 text-xs border border-gray-200 rounded-md" />
                      <label className="flex items-center gap-1 text-xs text-gray-500">
                        <input type="checkbox" checked={p.force} onChange={(e) => setPockets((prev) => prev.map((x) => x.id === p.id ? { ...x, force: e.target.checked } : x))} className="rounded" />
                        Force
                      </label>
                      <button type="button" onClick={() => setPockets((prev) => prev.filter((x) => x.id !== p.id))} className="text-gray-400 hover:text-red-500 ml-auto"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => setPockets((prev) => [...prev, { id: crypto.randomUUID(), binder: "", contacts: "", maxDistance: "", force: false }])} className="flex items-center gap-1 text-xs text-gsk-orange hover:text-gsk-orange-dark font-medium">
                  <Plus className="w-3.5 h-3.5" /> Add Pocket
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Templates */}
      <div>
        <button type="button" onClick={() => setShowTemplates(!showTemplates)} className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900">
          {showTemplates ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          Templates
        </button>
        {showTemplates && (
          <div className="mt-2 space-y-2">
            {templates.map((t) => (
              <div key={t.id} className="flex flex-col gap-2 p-2 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <select value={t.templateType} onChange={(e) => setTemplates((prev) => prev.map((x) => x.id === t.id ? { ...x, templateType: e.target.value } : x))} className="px-2 py-1 text-xs border border-gray-200 rounded-md bg-white">
                    <option value="cif">cif</option>
                    <option value="pdb">pdb</option>
                  </select>
                  <input type="text" placeholder="CIF/PDB path" value={t.path} onChange={(e) => setTemplates((prev) => prev.map((x) => x.id === t.id ? { ...x, path: e.target.value } : x))} className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-gsk-orange" />
                </div>
                <div className="flex items-center gap-2">
                  <input type="text" placeholder="Chain ID(s)" value={t.chainId} onChange={(e) => setTemplates((prev) => prev.map((x) => x.id === t.id ? { ...x, chainId: e.target.value } : x))} className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-gsk-orange" />
                  <input type="text" placeholder="Template ID(s)" value={t.templateId} onChange={(e) => setTemplates((prev) => prev.map((x) => x.id === t.id ? { ...x, templateId: e.target.value } : x))} className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded-md focus:outline-none focus:border-gsk-orange" />
                  <input type="number" placeholder="Threshold (Å)" value={t.threshold} onChange={(e) => setTemplates((prev) => prev.map((x) => x.id === t.id ? { ...x, threshold: e.target.value } : x))} className="w-24 px-2 py-1 text-xs border border-gray-200 rounded-md" />
                  <label className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap">
                    <input type="checkbox" checked={t.force} onChange={(e) => setTemplates((prev) => prev.map((x) => x.id === t.id ? { ...x, force: e.target.checked } : x))} className="rounded" />
                    Force
                  </label>
                  <button type="button" onClick={() => setTemplates((prev) => prev.filter((x) => x.id !== t.id))} className="text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setTemplates((prev) => [...prev, { id: crypto.randomUUID(), templateType: "cif", path: "", chainId: "", templateId: "", force: false, threshold: "" }])} className="flex items-center gap-1 text-xs text-gsk-orange hover:text-gsk-orange-dark font-medium">
              <Plus className="w-3.5 h-3.5" /> Add Template
            </button>
          </div>
        )}
      </div>

      {/* Affinity */}
      <div>
        <button type="button" onClick={() => setShowAffinity(!showAffinity)} className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900">
          {showAffinity ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          Affinity Binding
        </button>
        {showAffinity && (
          <div className="mt-2">
            {chains.filter((c) => c.entityType === "ligand" && (c.smiles.trim() || c.ccd.trim())).length === 0 ? (
              <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-md">
                Affinity requires at least one ligand chain (entity type "ligand" with SMILES or CCD). Add a ligand entity above.
              </p>
            ) : (
              <select value={affinityBinder} onChange={(e) => setAffinityBinder(e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:border-gsk-orange">
                <option value="">Select binder chain</option>
                {chains.filter((c) => c.entityType === "ligand" && (c.smiles.trim() || c.ccd.trim())).map((c) => {
                  const label = c.label.trim() || `Chain${chains.indexOf(c) + 1}`;
                  return <option key={c.id} value={label}>{label} (ligand)</option>;
                })}
              </select>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isUploading || !chains.some((c) => {
          if (c.entityType === "ligand") return c.smiles.trim() || c.ccd.trim();
          return c.sequence.trim();
        })}
        className="mt-6 w-full bg-gsk-orange hover:bg-gsk-orange-dark text-white font-semibold py-3 px-4 rounded-xl shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {isUploading ? "Processing..." : "Run Boltz-2 Inference"}
      </button>
    </div>
  );
}
