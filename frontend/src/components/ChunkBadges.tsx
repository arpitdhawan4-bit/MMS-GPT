interface Props {
  chunks: string[];
}

export default function ChunkBadges({ chunks }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-gray-500">RAG context used:</span>
      {chunks.map((c) => (
        <span
          key={c}
          className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-900/60 border border-indigo-700
                     text-indigo-300 font-mono"
        >
          {c}
        </span>
      ))}
    </div>
  );
}
