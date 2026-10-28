"use client";

import { RotateCcw } from "lucide-react";
import { Empty, errorMessage } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="page page-narrow">
      <Empty title="This page couldn't load" body={errorMessage(error)}>
        <button type="button" className="btn" onClick={reset}>
          <RotateCcw size={16} aria-hidden="true" /> Try again
        </button>
      </Empty>
    </div>
  );
}
