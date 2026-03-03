import { useState } from "react";
import type { KeyboardEvent } from "react";

interface Props {
  onSubmit: (question: string) => void;
  loading: boolean;
}

const EXAMPLES = [
  "What were my gross sales in January 2026?",
  "Show me total sales by customer for 2025",
  "Compare actual vs budget gross sales for 2026",
  "What are my top 5 products by sales in 2024?",
  "Show me sales by region for 2026",
];

export default function QueryInput({ onSubmit, loading }: Props) {
  const [question, setQuestion] = useState("");

  function submit() {
    if (question.trim() && !loading) {
      onSubmit(question.trim());
    }
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-gray-300">
          Ask a question about your planning data
        </label>

        <div className="flex gap-3 items-end">
          <textarea
            className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white
                       placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500
                       focus:border-transparent resize-none text-sm leading-relaxed"
            rows={3}
            placeholder="e.g. What were my gross sales in January 2026?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKey}
            disabled={loading}
          />
          <button
            onClick={submit}
            disabled={loading || !question.trim()}
            className="px-5 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700
                       disabled:cursor-not-allowed text-white font-semibold rounded-xl
                       transition-colors text-sm whitespace-nowrap flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Thinking…
              </>
            ) : (
              <>
                <span>Ask</span>
                <span className="text-blue-300">↵</span>
              </>
            )}
          </button>
        </div>
        <p className="text-xs text-gray-500">Press Enter to submit · Shift+Enter for new line</p>
      </div>

      {/* Example queries */}
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => { setQuestion(ex); }}
            className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700
                       rounded-full text-gray-300 hover:text-white transition-colors"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
