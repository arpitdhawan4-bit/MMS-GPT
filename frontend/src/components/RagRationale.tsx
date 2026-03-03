import { useState } from "react";

interface ChunkDetail {
  key: string;
  similarity: number;
  excerpt: string;
  full_text: string;
}

interface Props {
  rationale: string;
  chunks: ChunkDetail[];
}

/** Colour the similarity bar green→yellow→red based on score */
function similarityColor(sim: number): string {
  if (sim >= 0.7) return "bg-emerald-500";
  if (sim >= 0.5) return "bg-yellow-500";
  return "bg-orange-400";
}

/** Human-readable category label from chunk key */
function chunkCategory(key: string): { label: string; color: string } {
  if (key.startsWith("join_pattern"))
    return { label: "Join Pattern", color: "bg-blue-900/60 text-blue-300 border-blue-700" };
  if (key.startsWith("dim_"))
    return { label: "Dimension", color: "bg-purple-900/60 text-purple-300 border-purple-700" };
  if (key.startsWith("attr_"))
    return { label: "Attribute", color: "bg-teal-900/60 text-teal-300 border-teal-700" };
  if (key === "fact_planning")
    return { label: "Fact Table", color: "bg-rose-900/60 text-rose-300 border-rose-700" };
  return { label: "Overview", color: "bg-gray-700/60 text-gray-300 border-gray-600" };
}

export default function RagRationale({ rationale, chunks }: Props) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-indigo-800/60 overflow-hidden">
      {/* Header */}
      <div className="bg-indigo-950/70 border-b border-indigo-800/60 px-4 py-2.5 flex items-center gap-2">
        <span className="text-indigo-400">🔍</span>
        <span className="text-sm font-semibold text-indigo-300">RAG Retrieval — Why these schema chunks?</span>
        <span className="ml-auto text-xs text-indigo-500">{chunks.length} chunks · pgvector cosine similarity</span>
      </div>

      <div className="bg-gray-900/60 px-5 py-4 flex flex-col gap-5">

        {/* GPT-generated rationale paragraph */}
        <div className="rounded-lg border border-indigo-700/40 bg-indigo-950/30 px-4 py-3">
          <p className="text-xs font-semibold text-indigo-400 mb-1.5 uppercase tracking-wider">
            Why these chunks were selected
          </p>
          <p className="text-sm text-gray-200 leading-relaxed">{rationale}</p>
        </div>

        {/* Chunk table */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Retrieved chunks (ranked by cosine similarity)
          </p>
          <div className="flex flex-col gap-2">
            {chunks.map((chunk, i) => {
              const cat = chunkCategory(chunk.key);
              const isExpanded = expandedKey === chunk.key;
              const pct = Math.round(chunk.similarity * 100);

              return (
                <div
                  key={chunk.key}
                  className="rounded-lg border border-gray-700 bg-gray-900 overflow-hidden"
                >
                  {/* Row header */}
                  <button
                    onClick={() => setExpandedKey(isExpanded ? null : chunk.key)}
                    className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-800 transition-colors"
                  >
                    {/* Rank */}
                    <span className="text-xs text-gray-500 w-4 shrink-0">#{i + 1}</span>

                    {/* Category badge */}
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${cat.color}`}>
                      {cat.label}
                    </span>

                    {/* Chunk key */}
                    <span className="text-sm font-mono text-gray-200 flex-1 truncate">{chunk.key}</span>

                    {/* Similarity bar */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-20 h-1.5 rounded-full bg-gray-700 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${similarityColor(chunk.similarity)} transition-all`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-gray-400 w-10 text-right">
                        {(chunk.similarity * 100).toFixed(1)}%
                      </span>
                    </div>

                    {/* Expand chevron */}
                    <span className="text-gray-500 text-xs ml-1">
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </button>

                  {/* Excerpt (always visible) */}
                  <div className="px-4 pb-2.5 border-t border-gray-800 pt-2">
                    <p className="text-xs text-gray-400 font-mono leading-relaxed">
                      {isExpanded ? chunk.full_text : chunk.excerpt}
                    </p>
                    {!isExpanded && chunk.full_text.length > 150 && (
                      <button
                        onClick={() => setExpandedKey(chunk.key)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 mt-1"
                      >
                        Show full chunk ↓
                      </button>
                    )}
                    {isExpanded && (
                      <button
                        onClick={() => setExpandedKey(null)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 mt-1"
                      >
                        Collapse ↑
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
