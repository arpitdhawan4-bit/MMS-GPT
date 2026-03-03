interface Props {
  message: string;
}

export default function ErrorBanner({ message }: Props) {
  return (
    <div className="rounded-xl border border-red-700 bg-red-950/40 px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="text-red-400 text-lg leading-none">⚠</span>
        <div>
          <p className="text-sm font-semibold text-red-400">Error</p>
          <pre className="mt-1 text-xs text-red-300 whitespace-pre-wrap font-mono leading-relaxed">
            {message}
          </pre>
        </div>
      </div>
    </div>
  );
}
